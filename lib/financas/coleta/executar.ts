import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { dbDa, prismaSistema, type DbPrefeitura } from '@/lib/financas/db';
import { ConectorAbaco } from '@/lib/financas/conectores/abaco';
import { ConectorArquivo } from '@/lib/financas/conectores/arquivo';
import { contratoCitado, situacaoResumida } from '@/lib/financas/conectores/abaco/leitores';
import { entregasHomologadas, rgf, rreoCompleto, type IndicadorC } from '@/lib/financas/conectores/siconfi';
import type { ArquivoBaixado, Conector, EmpenhoC } from '@/lib/financas/conectores/tipos';
import { ligarContratosEmpenhos } from './ligacoes';
import { conciliar, type ResultadoConciliacao } from './conciliacao';
import { conferirComOficial, conferirVisoes } from './conferenciaOficial';
import { conferirListaContratos, conferirSomaReceita, conferirVolumeFolha } from './travas';
import { executarRegras } from '@/lib/financas/regras/motor';
import { chaveLigada } from '@/lib/financas/chaves';

export interface OpcoesColeta {
  ano: number;
  meses: number[]; // meses de despesa/receita a coletar (0 = ano inteiro)
  /** meses dos relatórios consolidados de natureza e função (0 = ano inteiro) */
  mesesVisoes?: number[];
  folha: string[]; // "2026/10"
  /** meses fechados da folha a verificar: só relê o mês se o portal informar outro número de registros */
  folhaVerificar?: string[];
  empenhos: boolean;
  contratos: boolean;
  siconfi: boolean;
  /** restos a pagar do exercício + empenhos de origem (datas dos pagamentos) */
  restos?: boolean;
  /** descontos retidos de cada pagamento do ano ainda não lido */
  retencoes?: boolean;
  /** relistar todos os meses (carga inicial e domingos) */
  completa?: boolean;
  log?: (m: string) => void;
  /** esperas entre as tentativas de abrir o navegador (padrão 30 s e 90 s) */
  esperasAbrirMs?: number[];
}

export function criarConector(pref: { id: string; conector: string; conectorConfig: string }): Conector {
  const cfg = JSON.parse(pref.conectorConfig || '{}');
  if (pref.conector === 'abaco') return new ConectorAbaco(cfg);
  if (pref.conector === 'arquivo') return new ConectorArquivo(cfg.pasta);
  throw new Error(`conector desconhecido: ${pref.conector}`);
}

/** Pasta dos arquivos baixados, anexos e logs (no servidor: dados-financas/, montada nos contêineres). */
export const dadosDir = () => process.env.FIN_DADOS_DIR || path.resolve('dados-financas');
const json = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
/** Troca de dados é tudo ou nada: se a gravação cair no meio, o dado anterior continua inteiro. */
const TROCA = { timeout: 180_000, maxWait: 30_000 };

async function guardarBrutos(db: DbPrefeitura, prefeituraId: string, coletaId: number, fonte: string, arqs: ArquivoBaixado[]) {
  const dia = new Date().toISOString().slice(0, 10);
  const pasta = path.join(dadosDir(), prefeituraId, 'bruto', dia);
  fs.mkdirSync(pasta, { recursive: true });
  for (const a of arqs) {
    const caminho = path.join(pasta, a.nomeSugerido);
    fs.writeFileSync(caminho, a.conteudo);
    await db.arquivoBruto.create({
      data: {
        prefeituraId, coletaId, fonte, tipo: a.tipo, referencia: a.referencia, caminho,
        sha256: crypto.createHash('sha256').update(a.conteudo).digest('hex'), bytes: a.conteudo.length,
      },
    });
  }
}

async function gravarEmpenho(db: DbPrefeitura, prefeituraId: string, e: EmpenhoC) {
  const base = {
    numero: e.numero, data: e.data, ano: e.data.getUTCFullYear(), tipo: e.tipo, orgao: e.orgao, unidade: e.unidade,
    credorDoc: e.credorDoc, credorNome: e.credorNome, processo: e.processo, natureza: e.natureza,
    contaDespesa: e.contaDespesa, fonte: e.fonte, funcao: e.funcao, subfuncao: e.subfuncao, programa: e.programa,
    projeto: e.projeto, descricao: e.descricao, contratoCitado: contratoCitado(e.descricao),
    valor: e.valor, anulado: e.anulado, aLiquidar: e.aLiquidar, aPagar: e.aPagar,
    inconsistencia: e.inconsistencia ?? null, atualizadoEm: new Date(),
  };
  const emp = await db.empenho.upsert({
    where: { prefeituraId_idOrigem: { prefeituraId, idOrigem: e.idOrigem } },
    create: { ...base, prefeituraId, idOrigem: e.idOrigem },
    update: base,
  });
  await db.$transaction(async (tx) => {
    await tx.liquidacao.deleteMany({ where: { empenhoId: emp.id } });
    await tx.pagamento.deleteMany({ where: { empenhoId: emp.id } });
    if (e.liquidacoes.length)
      await tx.liquidacao.createMany({ data: e.liquidacoes.map((x) => ({ prefeituraId, empenhoId: emp.id, idOrigem: x.idOrigem, numero: x.numero, data: x.data, valor: x.valor })) });
    if (e.pagamentos.length)
      await tx.pagamento.createMany({ data: e.pagamentos.map((x) => ({ prefeituraId, empenhoId: emp.id, idOrigem: x.idOrigem, numero: x.numero, data: x.data, valor: x.valor })) });
  }, TROCA);
}

export async function executarColeta(prefeituraId: string, op: OpcoesColeta) {
  const log = op.log ?? ((m: string) => console.log(`[${new Date().toISOString()}] ${m}`));
  const pref = await prismaSistema.prefeitura.findUniqueOrThrow({ where: { id: prefeituraId } });
  const db = dbDa(prefeituraId);

  if (!(await chaveLigada(prefeituraId, 'coleta_automatica'))) {
    log('chave "coleta_automatica" desligada: nada a fazer');
    return null;
  }

  // trava: uma coleta por prefeitura de cada vez (ex.: carga inicial longa × agendamento da madrugada).
  // No servidor cada coleta roda num contêiner novo (o pid se repete entre contêineres): a trava guarda
  // máquina + pid e só vale na mesma máquina. Entre contêineres, quem segura é o flock do scripts/financas/coletar.sh.
  const trava = path.join(dadosDir(), prefeituraId, 'coleta.lock');
  fs.mkdirSync(path.dirname(trava), { recursive: true });
  if (fs.existsSync(trava)) {
    const [maquina, pidTxt] = fs.readFileSync(trava, 'utf-8').split(':');
    let viva = false;
    if (maquina === os.hostname()) try { process.kill(Number(pidTxt), 0); viva = true; } catch {}
    if (viva) {
      log(`outra coleta de ${prefeituraId} está rodando (pid ${pidTxt}): esta foi ignorada`);
      return null;
    }
  }
  fs.writeFileSync(trava, `${os.hostname()}:${process.pid}`);
  try {
    // com a trava na mão, nenhuma outra coleta desta prefeitura está viva: "rodando" que sobrou é processo que morreu
    // no meio (notebook fora da tomada, limite de tempo do agendador, janela fechada) e passa a "interrompida"
    const orfas = await db.coleta.updateMany({
      where: { status: 'rodando' },
      data: { status: 'interrompida', fim: new Date(), erros: 'O processo da coleta terminou sem concluir (marcado na coleta seguinte).' },
    });
    if (orfas.count) log(`${orfas.count} coleta(s) anterior(es) não terminaram: marcadas como interrompidas`);
    return await coletarComTrava(prefeituraId, op, pref, db, log);
  } catch (e: any) {
    // erro fora das etapas (ex.: o navegador não abriu): registra a falha em vez de deixar "rodando" para sempre
    const msg = `coleta parou: ${e?.message ?? e}`.slice(0, 2000);
    log(`✗ ${msg}`);
    await db.coleta.updateMany({ where: { status: 'rodando' }, data: { status: 'falha', fim: new Date(), erros: msg } });
    throw e;
  } finally {
    fs.rmSync(trava, { force: true });
  }
}

/** Abre o conector tentando de novo: o navegador às vezes fecha sozinho ao abrir (ex.: atualização do Edge em andamento). */
export async function abrirComTentativas(con: { abrir(): Promise<void>; fechar(): Promise<void> }, log: (m: string) => void, esperasMs = [30_000, 90_000]) {
  for (let i = 0; ; i++) {
    try {
      await con.abrir();
      if (i) log(`navegador aberto na tentativa ${i + 1}`);
      return;
    } catch (e: any) {
      await con.fechar().catch(() => {});
      const linha = String(e?.message ?? e).split(/\r?\n/)[0];
      if (i >= esperasMs.length) throw new Error(`não consegui abrir o navegador depois de ${i + 1} tentativas: ${linha}`);
      log(`navegador não abriu (${linha}); nova tentativa em ${Math.round(esperasMs[i] / 1000)}s`);
      await new Promise((r) => setTimeout(r, esperasMs[i]));
    }
  }
}

async function coletarComTrava(
  prefeituraId: string,
  op: OpcoesColeta,
  pref: { id: string; ibge: number; conector: string; conectorConfig: string },
  db: DbPrefeitura,
  log: (m: string) => void,
) {
  const coleta = await db.coleta.create({ data: { prefeituraId, status: 'rodando' } });
  const resumo: Record<string, unknown> = {};
  const erros: string[] = [];
  // percentual geral, informado a cada 20% (pesos ≈ minutos de cada etapa no portal)
  const pesoDe = (nome: string) =>
    nome.startsWith('despesa') ? 0.4 : nome.startsWith('receitas') ? 1 : nome === 'contratos' ? 0.5
      : nome.startsWith('empenhos') ? (op.completa ? 45 : 8) : nome.startsWith('retencoes') ? 5 : nome.startsWith('restos') ? (op.completa ? 12 : 2) : nome.startsWith('folha') ? 20 : nome.startsWith('siconfi') ? 0.2 : 0.5;
  const pesoTotal =
    op.meses.length * 0.4 + op.meses.filter((m) => m > 0).length * 1 + (op.mesesVisoes?.length ?? 0) * 0.8 + (op.contratos ? 0.5 : 0) +
    (op.empenhos ? pesoDe('empenhos') : 0) + (op.restos ? pesoDe('restos') : 0) + (op.retencoes ? pesoDe('retencoes') : 0) + op.folha.length * 20 + (op.siconfi ? 0.4 : 0) + 3 * 0.5;
  let pesoFeito = 0;
  let faixaInformada = 0;
  const informar = (feito: number) => {
    const p = Math.min(100, Math.floor((feito / pesoTotal) * 100));
    const faixa = Math.floor(p / 20) * 20;
    if (faixa > faixaInformada) {
      faixaInformada = faixa;
      log(`▶ progresso: ${p}%`);
    }
  };
  const passo = async (nome: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    log(`→ ${nome}`);
    try {
      resumo[nome] = await fn();
      log(`✓ ${nome} (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e: any) {
      const msg = `${nome}: ${e?.message ?? e}`;
      erros.push(msg);
      log(`✗ ${msg}`);
    }
    pesoFeito += pesoDe(nome);
    informar(pesoFeito);
  };
  /** progresso dentro de uma etapa longa (ex.: "empenhos: 3000/13632") */
  const progressoParcial = (nome: string) => (m: string) => {
    log(m);
    const x = m.match(/(\d+)\/(\d+)/);
    if (x) informar(pesoFeito + pesoDe(nome) * (Number(x[1]) / Number(x[2])));
  };

  let divergenciasVisoes = 0;
  const con = criarConector(pref);
  await abrirComTentativas(con, log, op.esperasAbrirMs);
  let portal = '';
  try {
    portal = await con.ultimaAtualizacao().catch(() => '');
    log(`fonte "${con.nome}", última atualização informada: ${portal || '?'}`);

    for (const mes of op.meses) {
      await passo(`despesa_orgao ${op.ano}-${mes}`, async () => {
        const r = await con.despesaOrgaoMes(op.ano, mes);
        await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
        await db.$transaction(async (tx) => {
          await tx.despesaOrgaoMes.deleteMany({ where: { ano: op.ano, mes } });
          await tx.despesaOrgaoMes.createMany({ data: r.dados.map((d) => ({ ...d, prefeituraId, coletaId: coleta.id })) });
        }, TROCA);
        return { orgaos: r.dados.length };
      });
      if (mes > 0)
        await passo(`receitas ${op.ano}-${mes}`, async () => {
          const r = await con.receitasMes(op.ano, mes);
          await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
          conferirSomaReceita(r.dados); // soma que não fecha: recusa e mantém o que já estava gravado
          await db.$transaction(async (tx) => {
            await tx.receitaContaMes.deleteMany({ where: { ano: op.ano, mes } });
            await tx.receitaContaMes.createMany({ data: r.dados.map((d) => ({ ...d, prefeituraId })) });
          }, TROCA);
          return { contas: r.dados.length };
        });
    }

    // relatórios consolidados: o total por natureza e por função vem daqui, nunca da soma de empenhos
    for (const mes of op.mesesVisoes ?? []) {
      await passo(`despesa_natureza ${op.ano}-${mes}`, async () => {
        const r = await con.despesaNaturezaMes(op.ano, mes);
        if (!r.dados.length) return { naturezas: 0 };
        await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
        await db.$transaction(async (tx) => {
          await tx.despesaNaturezaMes.deleteMany({ where: { ano: op.ano, mes } });
          await tx.despesaNaturezaMes.createMany({ data: r.dados.map((d) => ({ ...d, prefeituraId, coletaId: coleta.id })) });
        }, TROCA);
        return { naturezas: r.dados.length };
      });
      await passo(`despesa_funcao ${op.ano}-${mes}`, async () => {
        const r = await con.despesaFuncaoMes(op.ano, mes);
        if (!r.dados.length) return { funcoes: 0 };
        await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
        await db.$transaction(async (tx) => {
          await tx.despesaFuncaoMes.deleteMany({ where: { ano: op.ano, mes } });
          await tx.despesaFuncaoMes.createMany({ data: r.dados.map((d) => ({ ...d, prefeituraId, coletaId: coleta.id })) });
        }, TROCA);
        return { funcoes: r.dados.length };
      });
    }
    // órgão, natureza e função são três visões do mesmo gasto: baixados na mesma coleta, têm de somar igual
    const mesmosMeses = (op.mesesVisoes ?? []).filter((m) => op.meses.includes(m));
    if (mesmosMeses.length)
      await passo('conferencia das visoes', async () => {
        const dif = await conferirVisoes(db, op.ano, mesmosMeses);
        divergenciasVisoes = dif.length;
        dif.forEach((d) => log(`atenção: ${d}`));
        return { meses: mesmosMeses.length, divergencias: dif };
      });

    if (op.contratos)
      await passo('contratos', async () => {
        const r = await con.contratos();
        await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
        conferirListaContratos(r.dados.length, await db.contrato.count());
        for (const c of r.dados) {
          await db.contrato.upsert({
            where: { prefeituraId_idOrigem: { prefeituraId, idOrigem: c.idOrigem } },
            create: { ...c, prefeituraId },
            update: c,
          });
        }
        return { contratos: r.dados.length };
      });

    // a folha vem antes das etapas longas (empenhos, restos, retenções): a do mês mais recente não pode ficar para o fim de uma coleta que pode estourar o limite de tempo
    // o portal altera meses fechados da folha: relê só o mês cujo número de registros mudou
    const folhas = [...op.folha];
    if (op.folhaVerificar?.length && con.contagemFolha && (await chaveLigada(prefeituraId, 'folha')))
      await passo('folha verificar meses fechados', async () => {
        const mudaram: string[] = [];
        for (const anoMes of op.folhaVerificar!) {
          if (folhas.includes(anoMes)) continue;
          const hoje = await con.contagemFolha!(anoMes);
          const gravado = await db.folhaMes.findFirst({ where: { anoMes }, select: { linhasPortal: true } });
          if (gravado?.linhasPortal !== hoje) mudaram.push(anoMes);
        }
        if (mudaram.length) log(`folha: ${mudaram.join(', ')} mudou no portal e será lida de novo`);
        folhas.push(...mudaram);
        return { verificados: op.folhaVerificar!.length, mudaram };
      });

    for (const anoMes of folhas) {
      if (!(await chaveLigada(prefeituraId, 'folha'))) {
        log('chave "folha" desligada: folha não coletada');
        break;
      }
      await passo(`folha ${anoMes}`, async () => {
        const r = await con.folhaMes(anoMes);
        const f = r.dados;
        // o portal ainda não publicou este mês (ou devolveu vazio): não apaga o que já está guardado nem cria mês zerado
        if (f.linhasInformadasPelaFonte === 0 && f.linhas.length === 0) {
          log(`folha ${anoMes}: o portal não tem linhas neste mês; nada gravado`);
          return { linhas: 0, publicado: false };
        }
        // a tela da folha traz nomes: guardamos o HTML bruto como prova, no mesmo disco local
        await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
        if (f.linhas.length !== f.linhasInformadasPelaFonte)
          throw new Error(`folha ${anoMes}: coletadas ${f.linhas.length} de ${f.linhasInformadasPelaFonte} linhas`);
        conferirVolumeFolha(anoMes, f.linhas.length, await db.folhaLinha.count({ where: { anoMes } }));
        await db.$transaction(async (tx) => {
          await tx.folhaLinha.deleteMany({ where: { anoMes } });
          for (let i = 0; i < f.linhas.length; i += 500) {
            await tx.folhaLinha.createMany({
              data: f.linhas.slice(i, i + 500).map(({ situacaoOriginal, ...l }) => ({ ...l, situacao: situacaoResumida(situacaoOriginal), prefeituraId })),
            });
          }
        }, TROCA);
        await db.folhaMes.upsert({
          where: { prefeituraId_anoMes: { prefeituraId, anoMes } },
          create: { prefeituraId, anoMes, linhasPortal: f.linhasInformadasPelaFonte, linhasColetadas: f.linhas.length, coletaId: coleta.id },
          update: { linhasPortal: f.linhasInformadasPelaFonte, linhasColetadas: f.linhas.length, coletaId: coleta.id },
        });
        return { linhas: f.linhas.length };
      });
    }

    if (op.empenhos)
      await passo(`empenhos ${op.ano}`, async () => {
        const doAno = await db.empenho.findMany({ where: { ano: op.ano }, select: { idOrigem: true, aLiquidar: true, aPagar: true, inconsistencia: true } });
        // relê também os incoerentes: o cabeçalho costuma zerar o "a pagar" antes de o pagamento aparecer na lista
        const reler = doAno.filter((e) => e.aLiquidar !== BigInt(0) || e.aPagar !== BigInt(0) || e.inconsistencia !== null).map((e) => e.idOrigem);
        const r = await con.empenhosDoAno({
          ano: op.ano, idsConhecidos: doAno.map((e) => e.idOrigem), relistarAnoTodo: !!op.completa, idsParaReler: reler,
          aoReceber: (e) => gravarEmpenho(db, prefeituraId, e), progresso: progressoParcial(`empenhos ${op.ano}`),
        });
        const incoerentes = await db.empenho.count({ where: { ano: op.ano, inconsistencia: { not: null } } });
        if (incoerentes) log(`atenção: ${incoerentes} empenho(s) com valores que não fecham na própria fonte (gravados e marcados)`);
        return { ...r, jaConhecidos: doAno.length, relidos: reler.length, incoerentesNaFonte: incoerentes };
      });

    if (op.restos)
      await passo(`restos a pagar ${op.ano}`, async () => {
        const r = await con.restosAPagar(op.ano);
        await guardarBrutos(db, prefeituraId, coleta.id, con.nome, r.brutos);
        // o que mudou desde a última coleta indica quais empenhos de origem reler
        const antes = new Map((await db.restoPagar.findMany({ where: { exercicio: op.ano } })).map((x) => [x.idOrigem, `${x.liquidado}|${x.pago}|${x.anulado}`]));
        await db.$transaction(async (tx) => {
          await tx.restoPagar.deleteMany({ where: { exercicio: op.ano } });
          for (let i = 0; i < r.dados.length; i += 500)
            await tx.restoPagar.createMany({ data: r.dados.slice(i, i + 500).map((x) => ({ ...x, prefeituraId })) });
        }, TROCA);
        const origens = [...new Set(r.dados.map((x) => x.empenhoIdOrigem).filter((x) => x > 0))];
        const conhecidos = new Set((await db.empenho.findMany({ where: { idOrigem: { in: origens } }, select: { idOrigem: true } })).map((e) => e.idOrigem));
        const mudaram = new Set(r.dados.filter((x) => antes.get(x.idOrigem) !== `${x.liquidado}|${x.pago}|${x.anulado}`).map((x) => x.empenhoIdOrigem));
        const fila = origens.filter((id) => op.completa || !conhecidos.has(id) || mudaram.has(id));
        const avisar = progressoParcial(`restos a pagar ${op.ano}`);
        avisar(`restos a pagar: ${r.dados.length} na lista; empenhos de origem a ler: ${fila.length} de ${origens.length}`);
        let pos = 0, feitos = 0;
        const falhas: number[] = [];
        const trabalhador = async () => {
          while (pos < fila.length) {
            const id = fila[pos++];
            try {
              const e = await con.empenho(id);
              if (e) await gravarEmpenho(db, prefeituraId, e);
            } catch { falhas.push(id); }
            feitos++;
            if (feitos % 500 === 0) avisar(`restos: ${feitos}/${fila.length}`);
            await new Promise((ok) => setTimeout(ok, 150));
          }
        };
        await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
        // confere: pago de cada RP (lista) = pagamentos do empenho de origem com data no exercício
        const ini = new Date(Date.UTC(op.ano, 0, 1)), fim = new Date(Date.UTC(op.ano + 1, 0, 1));
        const pagos = await db.pagamento.groupBy({ by: ['empenhoId'], where: { data: { gte: ini, lt: fim }, empenho: { idOrigem: { in: origens }, ano: { lt: op.ano } } }, _sum: { valor: true } });
        const idInterno = new Map((await db.empenho.findMany({ where: { idOrigem: { in: origens } }, select: { id: true, idOrigem: true } })).map((e) => [e.id, e.idOrigem]));
        const datado = new Map(pagos.map((g) => [idInterno.get(g.empenhoId)!, g._sum.valor ?? BigInt(0)]));
        const naLista = new Map<number, bigint>();
        for (const x of r.dados) naLista.set(x.empenhoIdOrigem, (naLista.get(x.empenhoIdOrigem) ?? BigInt(0)) + x.pago);
        const naoBatem = [...naLista].filter(([id, v]) => (datado.get(id) ?? BigInt(0)) !== v).map(([id]) => id);
        if (naoBatem.length) log(`atenção: ${naoBatem.length} empenho(s) de origem cujo pago no RP difere dos pagamentos datados (ex.: ${naoBatem.slice(0, 5).join(', ')})`);
        if (falhas.length) throw new Error(`${falhas.length} empenho(s) de origem não puderam ser lidos: ${falhas.slice(0, 10).join(', ')}`);
        const soma = (k: 'inscrito' | 'pago') => r.dados.reduce((a, x) => a + x[k], BigInt(0)).toString();
        return { restos: r.dados.length, origens: origens.length, lidos: fila.length, inscrito: soma('inscrito'), pago: soma('pago'), pagoNaoConfere: naoBatem.length };
      });

    if (op.retencoes)
      await passo(`retencoes ${op.ano}`, async () => {
        const ini = new Date(Date.UTC(op.ano, 0, 1)), fim = new Date(Date.UTC(op.ano + 1, 0, 1));
        const pags = await db.pagamento.findMany({ where: { data: { gte: ini, lt: fim } }, select: { idOrigem: true } });
        const lidas = new Set((await db.retencaoLeitura.findMany({ select: { pagamentoIdOrigem: true } })).map((x) => x.pagamentoIdOrigem));
        const fila = [...new Set(pags.map((p) => p.idOrigem))].filter((id) => !lidas.has(id));
        const avisar = progressoParcial(`retencoes ${op.ano}`);
        avisar(`retenções a ler: ${fila.length} pagamento(s) de ${pags.length}`);
        let pos = 0, feitos = 0, total = BigInt(0);
        const falhas: string[] = [];
        const trabalhador = async () => {
          while (pos < fila.length) {
            const id = fila[pos++];
            try {
              const itens = await con.retencoesDoPagamento(id);
              const soma = itens.reduce((s, x) => s + x.valor, BigInt(0));
              total += soma;
              await db.retencao.deleteMany({ where: { pagamentoIdOrigem: id } });
              if (itens.length) await db.retencao.createMany({ data: itens.map((x) => ({ ...x, prefeituraId })) });
              await db.retencaoLeitura.create({ data: { prefeituraId, pagamentoIdOrigem: id, total: soma, itens: itens.length } });
            } catch (e: any) { falhas.push(`${id}: ${e?.message ?? e}`); }
            feitos++;
            if (feitos % 500 === 0) avisar(`retencoes: ${feitos}/${fila.length}`);
            await new Promise((ok) => setTimeout(ok, 150));
          }
        };
        await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
        if (falhas.length) throw new Error(`${falhas.length} pagamento(s) sem retenções lidas (ficam para a próxima coleta): ${falhas.slice(0, 5).join(' | ')}`);
        return { lidos: fila.length, retido: total.toString() };
      });

  } finally {
    await con.fechar();
  }

  if (op.siconfi) {
    const gravar = async (inds: IndicadorC[]) => {
      for (const i of inds)
        await db.indicadorFiscal.upsert({
          where: { prefeituraId_ano_periodo_relatorio_chave: { prefeituraId, ano: i.ano, periodo: i.periodo, relatorio: i.relatorio, chave: i.chave } },
          create: { ...i, prefeituraId, coletaId: coleta.id },
          update: { valor: i.valor, coletaId: coleta.id },
        });
    };
    // só o relatório HOMOLOGADO vale como oficial; se a homologação cair (retificação), a marca sai
    const marcarHomologado = async (relatorio: 'RGF' | 'RREO', periodo: number, homologado: boolean) => {
      if (homologado) await gravar([{ ano: op.ano, periodo, relatorio, chave: 'homologado', valor: '1' }]);
      else await db.indicadorFiscal.deleteMany({ where: { ano: op.ano, periodo, relatorio, chave: 'homologado' } });
    };
    let homologados: Awaited<ReturnType<typeof entregasHomologadas>> | null = null;
    await passo('siconfi entregas', async () => {
      homologados = await entregasHomologadas(pref.ibge, op.ano);
      return { rreo: [...homologados.rreo], rgf: [...homologados.rgf] };
    });
    const hom = () => homologados as Awaited<ReturnType<typeof entregasHomologadas>> | null;
    await passo('siconfi rgf', async () => {
      const achados = [];
      for (const q of [1, 2, 3]) {
        const r = await rgf(pref.ibge, op.ano, q);
        if (!r.indicadores.length) continue;
        await guardarBrutos(db, prefeituraId, coleta.id, 'siconfi', [{ tipo: 'rgf', referencia: `${op.ano}-Q${q}`, nomeSugerido: `siconfi_rgf_${op.ano}_q${q}.json`, conteudo: r.bruto }]);
        await gravar(r.indicadores);
        if (hom()) await marcarHomologado('RGF', q, hom()!.rgf.has(q));
        achados.push(`Q${q}`);
      }
      return { quadrimestres: achados };
    });
    // RREO: mínimos, metas fiscais e restos (Anexo 14), grupos (01), funções (02), caixa (06), restos detalhados (07) e população
    await passo('siconfi rreo', async () => {
      const achados = [];
      const avisos: string[] = [];
      for (let b = 1; b <= 6; b++) {
        const r = await rreoCompleto(pref.ibge, op.ano, b);
        if (!r.indicadores.length) continue;
        await guardarBrutos(db, prefeituraId, coleta.id, 'siconfi', r.brutos.map((x) => ({ tipo: 'rreo', referencia: `${op.ano}-B${b}-A${x.anexo}`, nomeSugerido: `siconfi_rreo${x.anexo}_${op.ano}_b${b}.json`, conteudo: x.bruto })));
        await gravar(r.indicadores);
        if (hom()) await marcarHomologado('RREO', b, hom()!.rreo.has(b));
        avisos.push(...r.avisos);
        achados.push(`B${b}`);
      }
      avisos.forEach((a) => log(`atenção: ${a}`));
      return { bimestres: achados, avisos };
    });
  }

  // trava de conferência: portal × RREO homologado, bimestre a bimestre
  let divergenciasOficiais = 0;
  await passo('conferencia oficial', async () => {
    const r = await conferirComOficial(db, prefeituraId, op.ano, coleta.id);
    divergenciasOficiais = r.divergencias;
    if (r.divergencias) log(`atenção: ${r.divergencias} item(ns) diferentes do RREO homologado`);
    return r;
  });

  await passo('ligacoes contrato-empenho', () => ligarContratosEmpenhos(db, prefeituraId));
  let conc: ResultadoConciliacao | null = null;
  await passo('conciliacao', async () => (conc = await conciliar(db, op.ano)));
  await passo('regras', () => executarRegras(prefeituraId));

  const divergente = (conc !== null && (conc as ResultadoConciliacao).divergencias > 0) || divergenciasOficiais > 0 || divergenciasVisoes > 0;
  const status = erros.length ? 'falha' : divergente ? 'divergencia' : 'ok';
  await db.coleta.update({
    where: { id: coleta.id },
    data: { fim: new Date(), status, portalAtualizadoEm: portal, resumo: json(resumo), erros: erros.join('\n') },
  });

  const pastaLog = path.join(dadosDir(), 'logs');
  fs.mkdirSync(pastaLog, { recursive: true });
  fs.writeFileSync(path.join(pastaLog, `coleta-${prefeituraId}-${coleta.id}.json`), json({ coleta: coleta.id, status, portal, resumo, erros }));
  log(`coleta ${coleta.id} terminou: ${status}`);
  return { id: coleta.id, status, resumo, erros };
}
