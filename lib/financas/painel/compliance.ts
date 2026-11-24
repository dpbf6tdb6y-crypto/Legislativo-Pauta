// Dados das telas do Compliance (Painel, Receita, Despesas, Limites legais e Pessoal).
// Tudo sai das tabelas do robô único. Dinheiro em centavos; as contas ficam aqui, as telas só mostram.
import { secretariaDaLotacao } from '@/lib/financas/painel/folhaServidores';
import type { DbPrefeitura } from '@/lib/financas/db';
import { centavos, somar } from '@/lib/financas/dinheiro';
import { resumoReceita, type ContaReceita, type ResumoReceita } from './fiscal';
import { classificaNatureza, classificaReceita, CODIGOS_ART29A, percentual29A, tipoDaConta, type TipoNatureza } from './vinculacao';

const Z = BigInt(0);

export interface MesExecucao { mes: number; receita: bigint; empenhado: bigint; liquidado: bigint; pago: bigint }

export interface AreaVinculante { area: string; recebido: bigint; leis: string[]; gastoFuncao: bigint | null }
export interface ResumoVinculantes { bruta: bigint; vinculante: bigint; livre: bigint; semRegra: bigint; areas: AreaVinculante[] }

const FUNCAO_DA_AREA: Record<string, string> = { 'Educação': 'EDUCAÇÃO', 'Saúde': 'SAÚDE', 'Assistência social': 'ASSISTÊNCIA SOCIAL' };

/** Contas de UM mês (acumulado até o mês). `gastoPorFuncao` = empenhado por função no mesmo período. */
export function receitasVinculantes(contas: ContaReceita[], gastoPorFuncao: Map<string, bigint> = new Map()): ResumoVinculantes {
  const pais = new Set(contas.map((c) => c.contaPai));
  const nomes = new Map(contas.map((c) => [c.contaCod, c.nome]));
  const r: ResumoVinculantes = { bruta: Z, vinculante: Z, livre: Z, semRegra: Z, areas: [] };
  const areas = new Map<string, AreaVinculante>();
  for (const c of contas) {
    if (pais.has(c.contaCod) || !/^[12]/.test(c.contaCod)) continue; // só contas analíticas de receita corrente e de capital
    const k = classificaReceita(c.contaCod, tipoDaConta(c.contaCod, nomes), c.nome);
    r.bruta += c.arrecAteMes;
    if (k.pct === 0) r.livre += c.arrecAteMes;
    else if (k.pct === null) r.semRegra += c.arrecAteMes;
    else {
      r.vinculante += c.arrecAteMes;
      const nome = k.area || 'Outras';
      const f = FUNCAO_DA_AREA[nome];
      const a = areas.get(nome) ?? { area: nome, recebido: Z, leis: [], gastoFuncao: f ? gastoPorFuncao.get(f) ?? Z : null };
      a.recebido += c.arrecAteMes;
      if (k.lei && !a.leis.includes(k.lei)) a.leis.push(k.lei);
      areas.set(nome, a);
    }
  }
  r.areas = [...areas.values()].sort((a, b) => (b.recebido > a.recebido ? 1 : b.recebido < a.recebido ? -1 : 0));
  return r;
}

export interface LinhaNatureza {
  cod: string; nome: string; tipo: TipoNatureza; grupo: string; lei: string;
  dotInicial: bigint; dotAtual: bigint; empenhado: bigint; liquidado: bigint; pago: bigint;
}

/** Soma os meses pedidos; a dotação vem da visão do ano inteiro (mês 0), quando coletada. */
export function agruparNaturezas(linhas: { mes: number; naturezaCod: string; naturezaNome: string; dotInicial: bigint; dotAtual: bigint; empenhado: bigint; liquidado: bigint; pago: bigint }[]): LinhaNatureza[] {
  const m = new Map<string, LinhaNatureza>();
  const ordenadas = [...linhas].sort((a, b) => a.mes - b.mes);
  for (const l of ordenadas.filter((x) => x.mes > 0)) {
    const c = classificaNatureza(l.naturezaNome);
    const x = m.get(l.naturezaCod) ?? { cod: l.naturezaCod, nome: l.naturezaNome, ...c, dotInicial: l.dotInicial, dotAtual: l.dotAtual, empenhado: Z, liquidado: Z, pago: Z };
    x.empenhado += l.empenhado; x.liquidado += l.liquidado; x.pago += l.pago;
    x.dotInicial = l.dotInicial; x.dotAtual = l.dotAtual;
    m.set(l.naturezaCod, x);
  }
  for (const l of linhas.filter((x) => x.mes === 0)) {
    const x = m.get(l.naturezaCod);
    if (x) { x.dotInicial = l.dotInicial; x.dotAtual = l.dotAtual; }
  }
  return [...m.values()].sort((a, b) => (b.empenhado > a.empenhado ? 1 : b.empenhado < a.empenhado ? -1 : 0));
}

export interface PartesObrigatorias { nome: string; valor: bigint }

/** Empenhado por categoria: grupos obrigatórios, discricionárias e o que falta classificar. */
export function partesObrigatorias(linhas: LinhaNatureza[]): PartesObrigatorias[] {
  const soma = (f: (l: LinhaNatureza) => boolean) => somar(linhas.filter(f).map((l) => l.empenhado));
  return [
    { nome: 'Pessoal e encargos', valor: soma((l) => l.tipo === 'Obrigatória' && l.grupo === 'Pessoal e encargos') },
    { nome: 'Dívida e sentenças', valor: soma((l) => l.tipo === 'Obrigatória' && l.grupo === 'Dívida e sentenças') },
    { nome: 'Outras obrigações', valor: soma((l) => l.tipo === 'Obrigatória' && l.grupo === 'Outras obrigações') },
    { nome: 'Discricionárias', valor: soma((l) => l.tipo === 'Discricionária') },
    { nome: 'A classificar', valor: soma((l) => l.tipo === null) },
  ];
}

export interface ResumoFolha {
  servidores: number; comVencimento: number; vencimentos: bigint; bruto: bigint; liquido: bigint; mediaVencimento: bigint;
  porLotacao: { nome: string; valor: bigint }[]; // por secretaria (o setor depois do " - " é descartado), todas, da maior para a menor
  porVinculo: { nome: string; servidores: number }[];
}

/** Totais de um mês da folha. "Servidores" = matrículas; a mesma matrícula pode ter mais de uma linha no mês. */
export function resumirFolha(linhas: { matricula: string; lotacao: string; tipoVinculo: string; vencimentos: bigint; bruto: bigint; liquido: bigint }[]): ResumoFolha {
  const venc = new Map<string, bigint>(), lot = new Map<string, bigint>(), vin = new Map<string, Set<string>>();
  let bruto = Z, liquido = Z, vencimentos = Z;
  for (const l of linhas) {
    venc.set(l.matricula, (venc.get(l.matricula) ?? Z) + l.vencimentos);
    const secretaria = secretariaDaLotacao(l.lotacao);
    lot.set(secretaria, (lot.get(secretaria) ?? Z) + l.vencimentos);
    const nomeVinculo = l.tipoVinculo || 'Não informado';
    vin.set(nomeVinculo, (vin.get(nomeVinculo) ?? new Set()).add(l.matricula));
    bruto += l.bruto; liquido += l.liquido; vencimentos += l.vencimentos;
  }
  const comVencimento = [...venc.values()].filter((v) => v > Z).length;
  return {
    servidores: venc.size, comVencimento, vencimentos, bruto, liquido,
    mediaVencimento: comVencimento ? vencimentos / BigInt(comVencimento) : Z,
    porLotacao: [...lot].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => (b.valor > a.valor ? 1 : b.valor < a.valor ? -1 : 0)),
    porVinculo: [...vin].map(([nome, s]) => ({ nome, servidores: s.size })).sort((a, b) => b.servidores - a.servidores),
  };
}

export async function anoMaisRecente(db: DbPrefeitura, hoje: Date) {
  const r = await db.despesaOrgaoMes.findFirst({ where: { mes: 0 }, orderBy: { ano: 'desc' }, select: { ano: true } });
  return r?.ano ?? hoje.getFullYear();
}

/** Receita líquida, empenhado, liquidado e pago de cada mês coletado (valores do próprio mês). */
export async function execucaoMensal(db: DbPrefeitura, ano: number): Promise<MesExecucao[]> {
  const [org, rec] = await Promise.all([
    db.despesaOrgaoMes.findMany({ where: { ano, mes: { gt: 0 } }, select: { mes: true, empenhado: true, liquidado: true, pago: true } }),
    db.receitaContaMes.findMany({ where: { ano }, select: { mes: true, contaCod: true, contaPai: true, arrecMes: true } }),
  ]);
  const meses = new Map<number, MesExecucao>();
  const mes = (m: number) => { const x = meses.get(m) ?? { mes: m, receita: Z, empenhado: Z, liquidado: Z, pago: Z }; meses.set(m, x); return x; };
  for (const o of org) { const x = mes(o.mes); x.empenhado += o.empenhado; x.liquidado += o.liquidado; x.pago += o.pago; }
  const cods = new Set(rec.map((r) => `${r.mes}:${r.contaCod}`));
  for (const r of rec) {
    if (r.contaPai && cods.has(`${r.mes}:${r.contaPai}`)) continue; // só as raízes: correntes + capital − deduções
    mes(r.mes).receita += r.contaCod.startsWith('9') ? -r.arrecMes : r.arrecMes;
  }
  return [...meses.values()].sort((a, b) => a.mes - b.mes);
}

export interface DadosPainel {
  ano: number; ate: number; meses: MesExecucao[]; mesesDisponiveis: number[];
  acumulado: { receita: bigint; empenhado: bigint; liquidado: bigint; pago: bigint };
  orcamento: { dotInicial: bigint; dotAtual: bigint };
  receita: ResumoReceita | null;
  vinculantes: ResumoVinculantes | null;
  funcoes: { nome: string; valor: bigint }[];
  naturezas: LinhaNatureza[];
  contratos: { vigentes: number; em30: number; em90: number; valor30: bigint };
  camara: { empenhado: bigint; pago: bigint; loa: bigint; base: bigint | null; pct: number | null; teto: bigint | null; anoBase: number; populacao: number | null };
  rreo: {
    bimestre: number; posicao: string;
    caixaLiquida: bigint | null; caixaLiquidaAnterior: bigint | null; saldoAnteriores: bigint | null;
    rp: { processados: PartesRP; naoProcessados: PartesRP } | null;
    valor: (chave: string) => bigint | null;
  } | null;
}
export interface PartesRP { inscrito: bigint; pagos: bigint; cancelados: bigint; saldo: bigint }

const FIM_BIM = ['', '28/02', '30/04', '30/06', '31/08', '31/10', '31/12'];

export async function carregarPainel(db: DbPrefeitura, ano: number, ateMes: number | undefined, hoje: Date): Promise<DadosPainel> {
  const todos = await execucaoMensal(db, ano);
  const mesesDisponiveis = todos.filter((m) => m.empenhado !== Z || m.receita !== Z || m.pago !== Z).map((m) => m.mes);
  const ultimo = mesesDisponiveis.at(-1) ?? 0;
  const ate = ateMes && mesesDisponiveis.includes(ateMes) ? ateMes : ultimo;
  const meses = todos.filter((m) => m.mes <= ate);
  const acumulado = {
    receita: somar(meses.map((m) => m.receita)), empenhado: somar(meses.map((m) => m.empenhado)),
    liquidado: somar(meses.map((m) => m.liquidado)), pago: somar(meses.map((m) => m.pago)),
  };

  const [orgAno, contas, funcoes, nat, contratos, ind, base] = await Promise.all([
    db.despesaOrgaoMes.findMany({ where: { ano, mes: 0 } }),
    db.receitaContaMes.findMany({ where: { ano, mes: ate } }),
    db.despesaFuncaoMes.findMany({ where: { ano, mes: { gt: 0, lte: ate } }, select: { funcaoNome: true, empenhado: true } }),
    db.despesaNaturezaMes.findMany({ where: { ano, mes: { lte: ate } } }),
    db.contrato.findMany({ where: { situacao: { startsWith: 'Contrato Vigente' } }, select: { fim: true, valorAtual: true } }),
    db.indicadorFiscal.findMany({ where: { relatorio: 'RREO', ano: { in: [ano, ano - 1] } } }),
    db.receitaContaMes.findMany({ where: { ano: ano - 1, mes: 12, contaCod: { in: CODIGOS_ART29A } }, select: { arrecAteMes: true } }),
  ]);

  const porFuncao = new Map<string, bigint>();
  for (const f of funcoes) porFuncao.set(f.funcaoNome, (porFuncao.get(f.funcaoNome) ?? Z) + f.empenhado);

  const dia = 86400000, agora = hoje.getTime();
  const vigentes = contratos.filter((c) => c.fim && c.fim.getTime() >= agora - dia);
  const emDias = (n: number) => vigentes.filter((c) => c.fim!.getTime() <= agora + n * dia);

  const doAno = ind.filter((i) => i.ano === ano);
  const bim = Math.max(0, ...doAno.filter((i) => i.chave === 'rec_realizada').map((i) => i.periodo));
  const v = (k: string) => { const x = doAno.find((i) => i.periodo === bim && i.chave === k)?.valor; return x === undefined ? null : centavos(x); };
  const n = (k: string) => v(k) ?? Z;
  const pop = Number([...doAno, ...ind].find((i) => i.chave === 'populacao')?.valor ?? NaN);
  const populacao = Number.isFinite(pop) ? pop : null;
  const camara = orgAno.filter((o) => /^C.MARA/i.test(o.orgaoNome));
  const baseCamara = base.length ? somar(base.map((b) => b.arrecAteMes)) : null;
  const pct = populacao ? percentual29A(populacao) : null;

  return {
    ano, ate, meses, mesesDisponiveis, acumulado,
    orcamento: { dotInicial: somar(orgAno.map((o) => o.dotInicial)), dotAtual: somar(orgAno.map((o) => o.dotAtual)) },
    receita: resumoReceita(ano, ate, contas, 8),
    vinculantes: contas.length ? receitasVinculantes(contas, porFuncao) : null,
    funcoes: [...porFuncao].filter(([, x]) => x > Z).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => (b.valor > a.valor ? 1 : b.valor < a.valor ? -1 : 0)),
    naturezas: agruparNaturezas(nat),
    contratos: { vigentes: vigentes.length, em30: emDias(30).length, em90: emDias(90).length, valor30: somar(emDias(30).map((c) => c.valorAtual)) },
    camara: {
      empenhado: somar(camara.map((o) => o.empenhado)), pago: somar(camara.map((o) => o.pago)), loa: somar(camara.map((o) => o.dotInicial)),
      base: baseCamara, pct, teto: baseCamara !== null && pct !== null ? (baseCamara * BigInt(Math.round(pct * 10))) / BigInt(1000) : null, anoBase: ano - 1, populacao,
    },
    rreo: bim ? {
      bimestre: bim, posicao: `${FIM_BIM[bim]}/${ano}`,
      caixaLiquida: v('caixa_liquida_ate'), caixaLiquidaAnterior: v('caixa_liquida_ant'), saldoAnteriores: v('saldo_exercicios_anteriores'),
      rp: v('rp7_saldo_total') === null ? null : {
        processados: { inscrito: n('rp7_ant_proc') + n('rp7_insc_proc'), pagos: n('rp7_pagos_proc'), cancelados: n('rp7_canc_proc'), saldo: n('rp7_saldo_proc') },
        naoProcessados: { inscrito: n('rp7_ant_nproc') + n('rp7_insc_nproc'), pagos: n('rp7_pagos_nproc'), cancelados: n('rp7_canc_nproc'), saldo: n('rp7_saldo_nproc') },
      },
      valor: v,
    } : null,
  };
}
