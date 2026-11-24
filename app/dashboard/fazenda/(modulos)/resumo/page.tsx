import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pctBp } from '@/lib/financas/dinheiro';
import { pode } from '@/lib/financas/perfis';
import type { ResultadoConciliacao } from '@/lib/financas/coleta/conciliacao';
import { carregarDivida, carregarExecucao, carregarPessoal, carregarReceita, carregarRPPagos, carregarRREO } from '@/lib/financas/painel/carregar';
import { caixaDoAno, coberturaCreditos, confiancaDados, confiancaRREO, equilibrioLOA, LRF_O_QUE_A_LEI_PREVE, nivelDoLRF, seloGeral, type Frase, type Nivel } from '@/lib/financas/painel/fiscal';
import { COR_NIVEL } from '@/app/dashboard/fazenda/_componentes/Medidor';
import BlocoRREO from '@/app/dashboard/fazenda/_componentes/BlocoRREO';
import MedidoresLimites from '@/app/dashboard/fazenda/_componentes/MedidoresLimites';
import { resumoPontos } from '@/lib/financas/auditoria/regras';
import { coletasInterrompidas, frescorFontes, STATUS_TERMINADA, textoDadosDe } from '@/lib/financas/coleta/frescor';
import { SELO_OFICIAL, selosDaExecucao } from '@/lib/financas/coleta/selos';
import SeloDado from '@/app/dashboard/fazenda/_componentes/SeloDado';
import { carregarPainel, resumirFolha } from '@/lib/financas/painel/compliance';
import { BarrasLinha, EvolucaoAno, MES_LONGO, Numero, QuadroVinculantes, SeletorMes, TabelaExecucao, textoSaldo } from '@/app/dashboard/fazenda/_componentes/BlocosFinancas';

const NOMES_MES = ['ano', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_EXTENSO = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ROTULO_NIVEL: Record<Nivel, string> = { ok: 'em dia', observacao: 'acompanhar', atencao: 'atenção' };
const pctNum = (bp: bigint) => Number(bp) / 100;

function Bola({ n }: { n: Nivel }) {
  return <span aria-label={ROTULO_NIVEL[n]} className="inline-block w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: COR_NIVEL[n].arco }} />;
}

export default async function Inicio({ searchParams }: { searchParams: { ate?: string } }) {
  const { s, db } = await exigir(null, 'Painel');
  if (s.perfil === 'secretaria') redirect('/dashboard/fazenda/minha-secretaria'); // a secretaria só vê os próprios pontos
  const hoje = new Date();
  const verFiscal = pode(s.perfil, 'orcamento');

  const coletas = await db.coleta.findMany({ orderBy: { id: 'desc' }, take: 5 });
  const ultimaOk = coletas.find((c) => STATUS_TERMINADA.includes(c.status));
  const rodando = coletas.find((c) => c.status === 'rodando') ?? null;
  const novos = await db.apontamento.count({ where: { status: 'para_analise' } });
  const regrasPropostas = await db.regra.count({ where: { estado: 'proposta' } });
  let conc: ResultadoConciliacao | undefined;
  try { conc = JSON.parse(ultimaOk?.resumo ?? '{}').conciliacao; } catch {}

  const [pes, exe, rec, rreo, divida] = verFiscal
    ? await Promise.all([carregarPessoal(db), carregarExecucao(db, hoje), carregarReceita(db, hoje, 6), carregarRREO(db), carregarDivida(db)])
    : [null, null, null, null, null];
  const folhaMeses = verFiscal || pode(s.perfil, 'folha') ? await db.folhaMes.findMany() : null;
  const fontes = await frescorFontes(db);
  const interrompidas = await coletasInterrompidas(db, hoje);
  const confianca = confiancaDados({
    hoje, fontes, interrompidas,
    ultimaColeta: ultimaOk ? { status: ultimaOk.status, fim: ultimaOk.fim } : null,
    coletaRodando: rodando ? { inicio: rodando.inicio } : null,
    rgf: !verFiscal ? undefined : pes ? { ano: pes.ano, quadrimestre: pes.quadrimestre } : null,
    folhaMeses,
  });
  if (verFiscal) confianca.splice(confianca.findIndex((c) => /RGF/.test(c.titulo)) + 1, 0, confiancaRREO(hoje, rreo ? { ano: rreo.ano, bimestre: rreo.bimestre } : null));

  // ---- frases do selo: só o que tem base na lei ou nos fatos; o resto aparece nos cartões, sem cor de alerta
  const frases: Frase[] = [];
  if (pes) {
    const alerta = pes.limites[0];
    frases.push({
      nivel: nivelDoLRF(pes.nivel), href: '/dashboard/fazenda/limites',
      texto: pes.nivel === 'abaixo'
        ? `Folha de pessoal em ${pctBp(pes.pctBp)} da receita corrente líquida; o alerta da lei começa em ${pctBp(alerta.pctBp)}. Cabem cerca de ${brlCurto(pes.folgaMensalAteAlerta)} por mês antes do alerta.`
        : `Folha de pessoal em ${pctBp(pes.pctBp)} da receita corrente líquida: ${pes.nivel === 'alerta' ? 'passou do limite de alerta' : pes.nivel === 'prudencial' ? 'passou do limite prudencial' : 'passou do limite máximo'}. ${LRF_O_QUE_A_LEI_PREVE[pes.nivel]}`,
    });
  }
  for (const m of rreo?.minimos ?? [])
    if (m.nivel !== 'ok')
      frases.push({ nivel: m.nivel, href: '#minimos', texto: `${m.nome}: ${pctBp(m.pctBp)} aplicado até o ${rreo!.bimestre}º bimestre; o mínimo do ano é ${pctBp(m.minimoBp, 0)} (${m.base}).` });
  if (rreo?.primario && rreo.primario.nivel !== 'ok')
    frases.push({ nivel: 'observacao', href: '#minimos', texto: `Resultado primário até o ${rreo.bimestre}º bimestre (${brlCurto(rreo.primario.apurado)}) abaixo da meta da LDO para o ano (${brlCurto(rreo.primario.meta)}). Pergunte à contabilidade se é preciso limitar empenhos (LRF art. 9º).` });
  if (divida && divida.nivel !== 'ok')
    frases.push({ nivel: divida.nivel, href: '#minimos', texto: `Dívida consolidada líquida em ${pctBp(divida.pctBp)} da RCL; o limite é ${pctBp(divida.limiteBp, 0)}.` });
  if (exe && rec && rec.ano === exe.ano) {
    // caixa do ano: o "pago" do portal não inclui restos a pagar de anos anteriores; quem paga restos gasta caixa do ano
    const rpPagos = await carregarRPPagos(db, exe.ano);
    const saldoAnt = rreo && rreo.ano === exe.ano ? rreo.saldoExerciciosAnteriores : null;
    const caixa = caixaDoAno(exe.ano, rec.liquida.arrecadado, exe.municipio.pago, rpPagos, saldoAnt);
    frases.push(caixa.diferenca > BigInt(0)
      ? { nivel: 'observacao', href: '/dashboard/fazenda/orcamento#caixa', texto: `Em ${exe.ano} saiu ${brlCurto(caixa.diferenca)} a mais do que entrou (receita líquida × despesa paga no ano, com ${brlCurto(caixa.rpPagos)} de restos a pagar de anos anteriores). Isso só é regular se houver caixa de anos anteriores para cobrir${saldoAnt ? ` (o RREO do ${rreo!.bimestre}º bimestre informa ${brlCurto(saldoAnt)} de saldos de anos anteriores usados)` : ''}: confirme o saldo em caixa e os recursos vinculados com a contabilidade.` }
      : { nivel: 'ok', href: '/dashboard/fazenda/orcamento#caixa', texto: `A receita arrecadada em ${exe.ano} cobre tudo o que saiu no ano, restos a pagar incluídos (sobra ${brlCurto(-caixa.diferenca)}).` });
    // LOA: a despesa autorizada subiu mais do que a receita prevista; de onde vem a cobertura
    const eq = equilibrioLOA(rec, exe.municipio);
    const cob = eq ? coberturaCreditos(exe.ano, eq, saldoAnt) : null;
    if (cob && cob.semReceitaNova > BigInt(0))
      frases.push({ nivel: 'observacao', href: '/dashboard/fazenda/orcamento#loa', texto: `A despesa autorizada de ${cob.ano} subiu ${brlCurto(cob.aumentoDespesa)} sobre a LOA e a receita prevista só ${brlCurto(cob.aumentoReceita)}: a diferença vem de saldo de anos anteriores e outras fontes de crédito adicional.${cob.semExplicacao && cob.semExplicacao > BigInt(0) ? ` ${brlCurto(cob.semExplicacao)} ainda sem cobertura identificada nos números publicados: peça os decretos à contabilidade.` : ''}` });
  }
  // trava de conferência: o que não bate com o RREO homologado aparece aqui, para quem decide
  const selos = verFiscal ? await selosDaExecucao(db, exe?.ano ?? hoje.getFullYear()) : null;
  if (selos?.divergencias.length) {
    const principais = selos.divergencias.filter((d) => ['receita', 'empenhado', 'liquidado', 'pago'].includes(d.item));
    const lista = (principais.length ? principais : selos.divergencias).map((d) => `${d.rotulo.toLowerCase()} (${brl(d.diferenca < BigInt(0) ? -d.diferenca : d.diferenca)})`).join('; ');
    frases.push({ nivel: 'observacao', href: '/dashboard/fazenda/coleta', texto: `Diferença entre o portal e o RREO homologado do ${selos.ultimoBimestre}º bimestre: ${lista}. Confirme com a Contabilidade.` });
  }
  const problemasDados = confianca.filter((c) => c.nivel !== 'ok');
  if (problemasDados.length)
    frases.push({ nivel: 'observacao', href: '#dados', texto: `Sobre a atualização dos dados: ${problemasDados.map((c) => (/^[A-Z][a-zà-ú]/.test(c.titulo) ? c.titulo.charAt(0).toLowerCase() + c.titulo.slice(1) : c.titulo)).join('; ')}.` });
  const aud = pode(s.perfil, 'auditoria')
    ? resumoPontos(await db.pontoAuditoria.findMany({ where: { status: { in: ['aberto', 'respondido'] } }, select: { status: true, prazo: true } }), hoje)
    : null;
  // documentos esperando a assinatura do prefeito
  const paraAssinar = pode(s.perfil, 'documentos_decidir')
    ? (await db.documentoAssinatura.findMany({ where: { status: 'para_assinatura' }, select: { parecer: true, checagens: true, prazo: true } }))
    : [];
  if (paraAssinar.length) {
    const vermelhos = paraAssinar.filter((d) => d.parecer === 'nao_assinar').length;
    const urgentes = paraAssinar.filter((d) => d.prazo && d.prazo.getTime() < hoje.getTime() + 86400000).length;
    frases.push({
      nivel: vermelhos || urgentes ? 'observacao' : 'ok', href: '/dashboard/fazenda/documentos?aba=assinar',
      texto: `${paraAssinar.length} documento(s) prontos para a sua assinatura${urgentes ? `, ${urgentes} com prazo hoje ou vencido` : ''}${vermelhos ? `, ${vermelhos} com parecer "não assinar sem ajuste"` : ''}.`,
    });
  }
  if (aud?.atrasados)
    frases.push({ nivel: 'observacao', href: '/dashboard/fazenda/auditoria', texto: `${aud.atrasados} cobrança(s) às secretarias com prazo vencido, sem resposta.` });
  if (novos) frases.push({ nivel: 'observacao', href: '/dashboard/fazenda/apontamentos', texto: `${novos} apontamento(s) aguardando análise do controlador ou do jurídico.` });
  const selo = seloGeral(frases);

  // visão do exercício: mesmos blocos do painel anterior, agora sobre a base única
  const painel = verFiscal ? await carregarPainel(db, exe?.ano ?? hoje.getFullYear(), Number(searchParams.ate) || undefined, hoje) : null;
  const ultimaFolha = painel ? await db.folhaMes.findFirst({ orderBy: { anoMes: 'desc' }, select: { anoMes: true } }) : null;
  const folha = ultimaFolha
    ? resumirFolha(await db.folhaLinha.findMany({ where: { anoMes: ultimaFolha.anoMes }, select: { matricula: true, lotacao: true, tipoVinculo: true, vencimentos: true, bruto: true, liquido: true } }))
    : null;
  const saldo = painel ? painel.acumulado.receita - painel.acumulado.pago : BigInt(0);
  const pctCamara = painel?.camara.teto ? (Number(painel.camara.empenhado) / Number(painel.camara.teto)) * 100 : null;
  const rpTotal = painel?.rreo?.rp ? { pagos: painel.rreo.rp.processados.pagos + painel.rreo.rp.naoProcessados.pagos, saldo: painel.rreo.rp.processados.saldo + painel.rreo.rp.naoProcessados.saldo } : null;
  const totalFuncoes = painel ? painel.funcoes.reduce((t, f) => t + f.valor, BigInt(0)) : BigInt(0);

  return (
    <div className="space-y-4">
      {/* ---------- situação geral ---------- */}
      <section className={`rounded-lg border-2 px-3.5 py-2.5 ${COR_NIVEL[selo.nivel].fundo} ${COR_NIVEL[selo.nivel].borda}`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
          <h1 className={`text-base font-bold ${COR_NIVEL[selo.nivel].texto}`}>{selo.titulo}</h1>
          <span className="text-[11px] text-slate-600">
            Situação em {hoje.toLocaleDateString('pt-BR')} · {textoDadosDe(fontes)}
          </span>
        </div>
        {frases.length ? (
          <ul className="space-y-1">
            {frases.map((f, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug">
                <Bola n={f.nivel} />
                {f.href ? <Link href={f.href} className="hover:underline">{f.texto}</Link> : <span>{f.texto}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-slate-600">Ainda não há dados suficientes para o resumo.</p>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">
          Indicadores para acompanhamento. O sistema não diz o que é irregular: os pontos de atenção vão para análise do controlador e do jurídico.
        </p>
      </section>

      {!verFiscal && (
        <p className="cartao text-sm text-slate-600">Seu perfil no Compliance não inclui os números financeiros. Quem administra o sistema pode definir o perfil em Configurações › Usuários.</p>
      )}

      {painel && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <h2 className="text-lg font-semibold mr-auto">Exercício de {painel.ano} · janeiro a {MES_LONGO[painel.ate]}</h2>
            <SeletorMes meses={painel.mesesDisponiveis} atual={painel.ate} ano={painel.ano} />
          </div>
          <MedidoresLimites pes={pes} rreo={rreo} camaraPct={pctCamara} camaraAte={painel.ate} camaraAno={painel.ano} />
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Numero titulo="Receita × despesa paga" valor={textoSaldo(saldo)} tom={saldo < BigInt(0) ? 'alerta' : 'bom'} href="/dashboard/fazenda/limites" detalhe={`Receita ${brlCurto(painel.acumulado.receita)} · pago ${brlCurto(painel.acumulado.pago)}`} />
            <Numero titulo="Contratos vencendo em 30 dias" valor={String(painel.contratos.em30)} tom={painel.contratos.em30 ? 'alerta' : 'bom'} href="/dashboard/fazenda/contratos" detalhe={`${brlCurto(painel.contratos.valor30)} · ${painel.contratos.em90} em até 90 dias`} />
            <Numero titulo="Repasse à Câmara" valor={pctCamara === null ? '—' : `${pctCamara.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} href="/dashboard/fazenda/limites" detalhe={pctCamara === null ? `aguardando a receita de ${painel.camara.anoBase}` : 'do teto do art. 29-A (estimativa)'} />
            <Numero titulo="Caixa disponível" valor={painel.rreo?.caixaLiquida != null ? brlCurto(painel.rreo.caixaLiquida) : '—'} selo={painel.rreo?.caixaLiquida != null ? <SeloDado selo={SELO_OFICIAL} /> : undefined} detalhe={painel.rreo ? `em ${painel.rreo.posicao}` : 'aguardando RREO'} />
            <Numero titulo="Saldos de anos anteriores usados" valor={painel.rreo?.saldoAnteriores != null ? brlCurto(painel.rreo.saldoAnteriores) : '—'} selo={painel.rreo?.saldoAnteriores != null ? <SeloDado selo={SELO_OFICIAL} /> : undefined} detalhe="para abrir créditos no ano" />
            <Numero titulo="Restos a pagar pagos" valor={rpTotal ? brlCurto(rpTotal.pagos) : '—'} selo={rpTotal ? <SeloDado selo={SELO_OFICIAL} /> : undefined} href="/dashboard/fazenda/limites" detalhe={rpTotal ? `ainda a pagar: ${brlCurto(rpTotal.saldo)}` : 'aguardando RREO'} />
          </div>
        </>
      )}

      {verFiscal && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* ---------- pessoal ---------- */}
          <section className="cartao flex flex-col">
            <h2 className="font-semibold">Folha de pessoal × limite da LRF {pes && <SeloDado selo={SELO_OFICIAL} />}</h2>
            {!pes ? <p className="text-sm text-slate-500 mt-2">Sem RGF coletado.</p> : (
              <>
                <p className="text-xs text-slate-500">Executivo · 12 meses até o {pes.quadrimestre}º quadrimestre de {pes.ano} · RGF (SICONFI)</p>
                <table className="w-full text-sm">
                  <tbody>
                    {pes.limites.map((l) => (
                      <tr key={l.nome} className="border-t border-slate-100" title={`${l.rotulo}: ${brl(l.valor)}`}>
                        <td className="py-1">Até o {l.rotulo.toLowerCase()} <span className="text-slate-500">({pctBp(l.pctBp)})</span></td>
                        <td className={`py-1 text-right tabular-nums font-semibold ${l.margem < BigInt(0) ? 'text-red-700' : ''}`}>
                          {l.margem >= BigInt(0) ? `cabem ${brlCurto(l.margem)}` : `passou ${brlCurto(-l.margem)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 mt-1">
                  Valores somados em 12 meses (folha atual: {brlCurto(pes.despesa)} sobre RCL de {brlCurto(pes.rcl)}).
                  {pes.folgaMensalAteAlerta !== null && <> Em média, cabem <b>{brlCurto(pes.folgaMensalAteAlerta)} por mês</b> a mais antes do alerta, se a receita não cair.</>}
                </p>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-emerald-700">O que a lei prevê em cada faixa</summary>
                  <ul className="mt-1 space-y-1 text-xs text-slate-700">
                    {(['alerta', 'prudencial', 'maximo'] as const).map((n) => <li key={n}>• {LRF_O_QUE_A_LEI_PREVE[n]}</li>)}
                  </ul>
                </details>
              </>
            )}
          </section>

          {/* ---------- execução do orçamento ---------- */}
          <section className="cartao flex flex-col">
            <h2 className="font-semibold">Orçamento executado</h2>
            {!exe ? <p className="text-sm text-slate-500 mt-2">Sem despesa coletada.</p> : (
              <>
                <p className="text-xs text-slate-500">{exe.ano} · Executivo (sem a Câmara) · portal da transparência</p>
                <div className="text-2xl font-bold mt-1.5">{pctBp(exe.empenhadoBp)}</div>
                <p className="text-sm text-slate-600">do orçamento atualizado já foi empenhado (comprometido).</p>
                <div className="relative h-3 rounded bg-slate-200 mt-3" title={`Empenhado ${pctBp(exe.empenhadoBp)} · ano decorrido ${pctBp(exe.tempoBp)}`}>
                  <div className="absolute inset-y-0 left-0 rounded bg-emerald-600" style={{ width: `${Math.min(pctNum(exe.empenhadoBp ?? BigInt(0)), 100)}%` }} />
                  <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900" style={{ left: `${pctNum(exe.tempoBp)}%` }} />
                </div>
                <p className="text-xs text-slate-500 mt-1">O traço preto marca quanto do ano já passou ({pctBp(exe.tempoBp)}).</p>
                <table className="w-full text-sm mt-3">
                  <tbody>
                    {([['Orçamento atualizado', exe.executivo.dotAtual, null], ['Empenhado', exe.executivo.empenhado, selos?.empenhado], ['Liquidado (entregue)', exe.executivo.liquidado, selos?.liquidado], ['Pago', exe.executivo.pago, selos?.pago]] as const).map(([r, v, selo]) => (
                      <tr key={r} className="border-t border-slate-100" title={brl(v)}><td className="py-1">{r} {selo && <SeloDado selo={selo} />}</td><td className="py-1 text-right tabular-nums">{brlCurto(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-600 mt-2">
                  O orçamento {exe.variacaoDotacao >= BigInt(0) ? 'cresceu' : 'diminuiu'} <b>{brlCurto(exe.variacaoDotacao >= BigInt(0) ? exe.variacaoDotacao : -exe.variacaoDotacao)}</b> ({pctBp(exe.variacaoDotacaoBp)}) em relação à LOA ({brlCurto(exe.executivo.dotInicial)}), somando créditos abertos e anulações.
                </p>
                <Link href="/dashboard/fazenda/despesas" className="text-xs text-emerald-700 hover:underline mt-auto pt-2">ver por secretaria →</Link>
              </>
            )}
          </section>

          {/* ---------- receita ---------- */}
          <section className="cartao flex flex-col">
            <h2 className="font-semibold">Receita do ano {selos && rec && <SeloDado selo={selos.receita} />}</h2>
            {!rec ? <p className="text-sm text-slate-500 mt-2">Sem receita coletada.</p> : (
              <>
                <p className="text-xs text-slate-500">{rec.ano} · até {MES_EXTENSO[rec.mes]} · receita líquida (correntes + capital − deduções)</p>
                <p className="mt-1.5 leading-tight"><span className="text-2xl font-bold">{brlCurto(rec.liquida.arrecadado)}</span> <span className="text-[13px] text-slate-600">arrecadados, {pctBp(rec.liquida.arrecadadoBp)} dos {brlCurto(rec.liquida.previstoAtual)} previstos.</span></p>
                {exe && exe.ano === rec.ano && (
                  <p className="text-[13px] mt-1">
                    Pago no ano: <b>{brlCurto(exe.municipio.pago)}</b>{' '}
                    <span className={exe.municipio.pago > rec.liquida.arrecadado ? 'text-amber-800' : 'text-emerald-800'}>
                      ({exe.municipio.pago > rec.liquida.arrecadado ? `${brlCurto(exe.municipio.pago - rec.liquida.arrecadado)} acima` : `${brlCurto(rec.liquida.arrecadado - exe.municipio.pago)} abaixo`} da receita)
                    </span>
                  </p>
                )}
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-2 mb-0.5">De onde vem o dinheiro</h3>
                <BarrasLinha linhasVisiveis={8} itens={rec.fontes.map((f) => ({ nome: f.nome, valor: f.arrecadado, pctTexto: f.partBp !== null && f.partBp !== undefined ? pctBp(f.partBp) : undefined }))} formato={brlCurto} />
                <Link href="/dashboard/fazenda/receita" className="text-xs text-emerald-700 hover:underline mt-auto pt-1.5">ver previsto × arrecadado por origem →</Link>
              </>
            )}
          </section>
        </div>
      )}

      {verFiscal && <div id="minimos"><BlocoRREO r={rreo} divida={divida} /></div>}

      {painel && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="cartao"><h2 className="font-semibold mb-2">Evolução no ano</h2><EvolucaoAno meses={painel.meses} /></section>
            <section className="cartao overflow-x-auto"><h2 className="font-semibold mb-2">Execução do orçamento</h2><TabelaExecucao p={painel} /></section>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="cartao"><h2 className="font-semibold mb-2">Receitas vinculantes</h2><QuadroVinculantes v={painel.vinculantes} /></section>
            <div className="space-y-4">
              <section className="cartao">
                <h2 className="font-semibold mb-2">Para onde vai o dinheiro</h2>
                {painel.funcoes.length
                  ? <BarrasLinha itens={painel.funcoes.map((f) => ({ nome: f.nome.charAt(0) + f.nome.slice(1).toLowerCase(), valor: f.valor, href: '/dashboard/fazenda/despesas' }))} />
                  : <p className="text-sm text-slate-500">Aguardando a primeira coleta do relatório por função.</p>}
                <p className="text-xs text-slate-500 mt-2">Empenhado por função de governo no período.</p>
              </section>
              {folha && (
                <section className="cartao">
                  <h2 className="font-semibold mb-2">Vínculo dos servidores · {ultimaFolha!.anoMes}</h2>
                  <BarrasLinha formato={(v) => Number(v).toLocaleString('pt-BR')} itens={folha.porVinculo.map((v) => ({ nome: v.nome, valor: BigInt(v.servidores) }))} />
                  <p className="text-xs text-slate-500 mt-2">{folha.servidores.toLocaleString('pt-BR')} matrículas na folha.</p>
                </section>
              )}
            </div>
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {/* ---------- confiança dos dados ---------- */}
        <section id="dados" className="cartao md:col-span-2">
          <h2 className="font-semibold mb-2">Confiança dos dados</h2>
          <ul className="space-y-1.5">
            {confianca.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm"><Bola n={c.nivel} /><span><b>{c.titulo}.</b> <span className="text-slate-600">{c.detalhe}</span></span></li>
            ))}
          </ul>
        </section>
        <section className="cartao">
          <h2 className="font-semibold mb-2">Pendências</h2>
          <p className="text-sm"><b className="text-lg">{novos}</b> apontamento(s) para análise{pode(s.perfil, 'apontamentos') && <> · <Link href="/dashboard/fazenda/apontamentos" className="text-emerald-700 hover:underline">ver</Link></>}</p>
          <p className="text-sm mt-1"><b className="text-lg">{regrasPropostas}</b> regra(s) aguardando aprovação{pode(s.perfil, 'apontamentos') && <> · <Link href="/dashboard/fazenda/regras" className="text-emerald-700 hover:underline">ver</Link></>}</p>
          <p className="text-xs text-slate-500 mt-1">Sem aprovação, a regra não gera apontamento.</p>
          {pode(s.perfil, 'documentos_decidir') && (
            <p className="text-sm mt-2 border-t border-slate-100 pt-2"><b className="text-lg">{paraAssinar.length}</b> documento(s) para assinar · <Link href="/dashboard/fazenda/documentos?aba=assinar" className="text-emerald-700 hover:underline">ver</Link></p>
          )}
          {aud && (
            <p className="text-sm mt-2 border-t border-slate-100 pt-2">
              <b className="text-lg">{aud.abertos}</b> cobrança(s) às secretarias aguardando{aud.atrasados ? <>, <b className="text-red-700">{aud.atrasados} atrasada(s)</b></> : ''}
              {aud.respondidos ? <>, {aud.respondidos} respondida(s) para validar</> : ''} · <Link href="/dashboard/fazenda/auditoria" className="text-emerald-700 hover:underline">ver</Link>
            </p>
          )}
        </section>
      </div>

      {/* ---------- detalhes técnicos (para o controlador) ---------- */}
      <details className="cartao">
        <summary className="cursor-pointer font-semibold">Detalhes técnicos da coleta</summary>
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Conferência com o portal (última coleta)</h3>
            {!conc ? <p className="text-sm text-slate-500">Sem conferência registrada.</p> : (
              <>
                <p className="text-sm mb-2">
                  {conc.divergencias === 0
                    ? <span className="selo bg-emerald-100 text-emerald-900">sem divergências</span>
                    : <span className="selo bg-amber-100 text-amber-900">{conc.divergencias} divergência(s)</span>}
                  <span className="text-slate-500 ml-2">Totais do mês do portal (aba Órgão) × soma dos eventos coletados empenho por empenho.</span>
                </p>
                <div className="overflow-x-auto">
                  <table className="tabela">
                    <thead><tr><th>Mês</th><th>Item</th><th className="n">Portal</th><th className="n">Calculado</th><th className="n">Diferença</th><th>Confere</th><th>Observação</th></tr></thead>
                    <tbody>
                      {conc.linhas.map((l, i) => (
                        <tr key={i}>
                          <td>{NOMES_MES[l.mes]}</td><td>{l.item}</td>
                          <td className="n">{brl(BigInt(l.portal))}</td><td className="n">{brl(BigInt(l.calculado))}</td>
                          <td className="n">{brl(BigInt(l.diferenca))}</td>
                          <td>{l.confere ? '✔' : l.observacao.endsWith('(informativo)') ? '—' : '✘'}</td>
                          <td className="text-xs text-slate-500">{l.observacao}</td>
                        </tr>
                      ))}
                      {conc.folha.map((f) => (
                        <tr key={f.anoMes}><td>{f.anoMes}</td><td>linhas da folha</td><td className="n">{f.portal}</td><td className="n">{f.coletadas}</td><td className="n">{f.portal - f.coletadas}</td><td>{f.confere ? '✔' : '✘'}</td><td className="text-xs text-slate-500">linhas informadas pela tela × coletadas</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <h3 className="font-semibold mb-2">Últimas coletas</h3>
            <table className="tabela">
              <thead><tr><th>#</th><th>Início</th><th>Fim</th><th>Situação</th><th>Fonte atualizada em</th><th>Erros</th></tr></thead>
              <tbody>
                {coletas.map((c) => (
                  <tr key={c.id}><td>{c.id}</td><td>{c.inicio.toLocaleString('pt-BR')}</td><td>{c.fim?.toLocaleString('pt-BR') ?? '—'}</td><td>{c.status}</td><td>{c.portalAtualizadoEm}</td><td className="text-xs text-red-700 whitespace-pre-wrap">{c.erros}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
