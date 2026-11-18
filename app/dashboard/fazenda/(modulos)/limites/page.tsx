import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pct } from '@/lib/financas/dinheiro';
import { anoMaisRecente, carregarPainel, partesObrigatorias } from '@/lib/financas/painel/compliance';
import { SELO_OFICIAL, selosDaExecucao } from '@/lib/financas/coleta/selos';
import SeloDado from '@/app/dashboard/fazenda/_componentes/SeloDado';
import { GraficoColunas } from '@/app/dashboard/fazenda/_componentes/Graficos';
import { BarraPartes, EvolucaoAno, MES_CURTO, MES_LONGO, Numero, QuadroRestos, reais, SeletorMes, textoSaldo } from '@/app/dashboard/fazenda/_componentes/BlocosFinancas';

const Z = BigInt(0);
const num = (v: string | undefined) => (v === undefined ? null : Number(v));
const pc = (v: number | null, c = 2) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`);
const din = (v: string | undefined) => (v === undefined ? '—' : brl(BigInt(Math.round(Number(v) * 100))));

export default async function Limites({ searchParams }: { searchParams: { ano?: string; ate?: string } }) {
  const hoje = new Date();
  const { db } = await exigir('orcamento', 'Limites legais', { detalhe: JSON.stringify(searchParams), modulo: 'orcamento' });
  const ano = Number(searchParams.ano) || await anoMaisRecente(db, hoje);
  const [p, selos, ind] = await Promise.all([
    carregarPainel(db, ano, Number(searchParams.ate) || undefined, hoje),
    selosDaExecucao(db, ano),
    db.indicadorFiscal.findMany({ where: { ano }, orderBy: { periodo: 'asc' } }),
  ]);
  const rgf = ind.filter((i) => i.relatorio === 'RGF'), rreo = ind.filter((i) => i.relatorio === 'RREO');
  const quads = [...new Set(rgf.filter((i) => i.chave === 'dtp_pct').map((i) => i.periodo))];
  const bims = [...new Set(rreo.filter((i) => i.chave === 'rec_realizada').map((i) => i.periodo))];
  const q = quads.at(-1), b = bims.at(-1);
  const g = (k: string, per = q) => rgf.find((i) => i.periodo === per && i.chave === k)?.valor;
  const r = (k: string, per = b) => rreo.find((i) => i.periodo === per && i.chave === k)?.valor;

  const saldo = p.acumulado.receita - p.acumulado.pago;
  let acum = Z;
  const saldos = p.meses.map((m) => { acum += m.receita - m.pago; return { rotulo: MES_CURTO[m.mes], valor: reais(acum) }; });
  const camaraPct = p.camara.teto ? (Number(p.camara.empenhado) / Number(p.camara.teto)) * 100 : null;
  const limites: { nome: string; regra: string; valor: string; situacao: string; bom: boolean | null; origem: string }[] = [
    { nome: 'Despesa com pessoal (Executivo)', regra: `máximo ${pc(num(g('limite_max_pct')))} · prudencial ${pc(num(g('limite_prudencial_pct')))} · alerta ${pc(num(g('limite_alerta_pct')))} da RCL (LRF art. 20)`, valor: pc(num(g('dtp_pct'))), situacao: num(g('dtp_pct')) === null ? 'sem dado' : num(g('dtp_pct'))! < num(g('limite_alerta_pct'))! ? 'dentro do limite' : 'acima do alerta', bom: num(g('dtp_pct')) === null ? null : num(g('dtp_pct'))! < num(g('limite_alerta_pct'))!, origem: q ? `RGF ${q}º quadrimestre` : '' },
    { nome: 'Educação (MDE)', regra: 'mínimo de 25% no ano (CF art. 212)', valor: pc(num(r('mde_pct'))), situacao: num(r('mde_pct')) === null ? 'sem dado' : num(r('mde_pct'))! >= 25 ? 'acima do mínimo' : 'abaixo do mínimo até aqui', bom: num(r('mde_pct')) === null ? null : num(r('mde_pct'))! >= 25, origem: b ? `RREO ${b}º bimestre` : '' },
    { nome: 'Saúde (ASPS)', regra: 'mínimo de 15% no ano (LC 141/2012)', valor: pc(num(r('asps_pct'))), situacao: num(r('asps_pct')) === null ? 'sem dado' : num(r('asps_pct'))! >= 15 ? 'acima do mínimo' : 'abaixo do mínimo até aqui', bom: num(r('asps_pct')) === null ? null : num(r('asps_pct'))! >= 15, origem: b ? `RREO ${b}º bimestre` : '' },
    { nome: 'FUNDEB na remuneração', regra: 'mínimo de 70% no ano (Lei 14.113/2020)', valor: pc(num(r('fundeb_pct'))), situacao: num(r('fundeb_pct')) === null ? 'sem dado' : num(r('fundeb_pct'))! >= 70 ? 'acima do mínimo' : 'abaixo do mínimo até aqui', bom: num(r('fundeb_pct')) === null ? null : num(r('fundeb_pct'))! >= 70, origem: b ? `RREO ${b}º bimestre` : '' },
    { nome: 'Dívida consolidada líquida', regra: `limite de ${pc(num(g('dcl_limite_pct')), 0)} da RCL (Res. Senado 40/2001)`, valor: pc(num(g('dcl_pct'))), situacao: num(g('dcl_pct')) === null ? 'sem dado' : num(g('dcl_pct'))! < num(g('dcl_limite_pct'))! ? 'dentro do limite' : 'acima do limite', bom: num(g('dcl_pct')) === null ? null : num(g('dcl_pct'))! < num(g('dcl_limite_pct'))!, origem: q ? `RGF ${q}º quadrimestre` : '' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Limites legais · {ano}</h1>
          <p className="text-xs text-slate-500">Receita × despesa, limites da lei, metas fiscais e gastos obrigatórios, de janeiro a {MES_LONGO[p.ate]}.</p>
        </div>
        <SeletorMes meses={p.mesesDisponiveis} atual={p.ate} ano={ano} />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Numero titulo="Receita líquida" valor={brlCurto(p.acumulado.receita)} detalhe="corrente + capital − deduções" selo={<SeloDado selo={selos.receita} />} />
        <Numero titulo="Empenhado" valor={brlCurto(p.acumulado.empenhado)} detalhe="comprometido no período" selo={<SeloDado selo={selos.empenhado} />} />
        <Numero titulo="Pago" valor={brlCurto(p.acumulado.pago)} detalhe="só do exercício, sem restos a pagar" selo={<SeloDado selo={selos.pago} />} />
        <Numero titulo="Saldo do exercício" valor={textoSaldo(saldo)} tom={saldo < Z ? 'alerta' : 'bom'} detalhe={saldo < Z ? 'pago acima da receita arrecadada no período' : 'a receita cobriu o que foi pago'} />
      </div>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-2">Limites e mínimos da lei <SeloDado selo={SELO_OFICIAL} /></h2>
        <table className="tabela">
          <thead><tr><th>Exigência</th><th>Regra</th><th className="n">Apurado</th><th>Situação</th><th>Relatório</th></tr></thead>
          <tbody>
            {limites.map((l) => <tr key={l.nome}><td className="font-medium">{l.nome}</td><td className="text-xs text-slate-600">{l.regra}</td><td className="n font-semibold">{l.valor}</td><td className={`text-xs font-medium ${l.bom === null ? 'text-slate-500' : l.bom ? 'text-emerald-800' : 'text-amber-800'}`}>{l.bom === null ? '' : l.bom ? '✓ ' : '! '}{l.situacao}</td><td className="text-xs text-slate-500">{l.origem}</td></tr>)}
            <tr>
              <td className="font-medium">Repasse à Câmara (art. 29-A)</td>
              <td className="text-xs text-slate-600">{p.camara.pct === null || p.camara.teto === null ? `depende da receita de ${p.camara.anoBase} e da população` : `teto de ${pc(p.camara.pct, 1)} sobre ${brlCurto(p.camara.base)} de ${p.camara.anoBase} = ${brl(p.camara.teto)}`}</td>
              <td className="n font-semibold">{camaraPct === null ? '—' : `${pc(camaraPct, 1)} do teto`}</td>
              <td className={`text-xs font-medium ${camaraPct === null ? 'text-slate-500' : camaraPct <= 100 ? 'text-emerald-800' : 'text-amber-800'}`}>{camaraPct === null ? 'aguardando histórico' : camaraPct <= 100 ? '✓ dentro do teto' : '! acima do teto'}</td>
              <td className="text-xs text-slate-500">Estimativa do sistema, a conferir com o Jurídico</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao"><h2 className="font-semibold mb-2">Acumulado no ano</h2><EvolucaoAno meses={p.meses} /></section>
        <section className="cartao"><h2 className="font-semibold mb-2">Saldo acumulado · receita menos pago</h2><GraficoColunas titulo="Saldo acumulado" sinal itens={saldos} altura={240} /><p className="text-xs text-slate-500 mt-1">Só do exercício. Restos a pagar de anos anteriores ficam fora desta conta.</p></section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao"><h2 className="font-semibold mb-2">Restos a pagar <SeloDado selo={SELO_OFICIAL} /></h2>{p.rreo?.rp ? <QuadroRestos rp={p.rreo.rp} posicao={p.rreo.posicao} /> : <p className="text-sm text-slate-500">Aguardando a coleta do RREO, Anexo 07.</p>}</section>
        <section className="cartao">
          <h2 className="font-semibold mb-2">Gastos obrigatórios × discricionários</h2>
          <BarraPartes rotulo="Empenhado por categoria" partes={partesObrigatorias(p.naturezas).map((x) => ({ nome: x.nome, valor: x.valor }))} />
          <p className="text-xs text-slate-500 mt-2">Pelo empenhado. Obrigatória = pessoal, dívida, sentenças, exercícios anteriores e consórcios.</p>
        </section>
      </div>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-2">Metas fiscais, bimestre a bimestre <SeloDado selo={SELO_OFICIAL} /></h2>
        {!bims.length ? <p className="text-sm text-slate-500">Sem RREO de {ano} coletado.</p> : (
          <table className="tabela">
            <thead><tr><th>Bimestre</th><th className="n">Educação</th><th className="n">Saúde</th><th className="n">FUNDEB</th><th className="n">Resultado primário</th><th className="n">Meta primário (ano)</th><th className="n">Resultado nominal</th><th className="n">Resultado orçamentário</th><th className="n">Saldos anteriores usados</th></tr></thead>
            <tbody>{bims.map((x) => <tr key={x}><td>{x}º</td><td className="n">{pc(num(r('mde_pct', x)))}</td><td className="n">{pc(num(r('asps_pct', x)))}</td><td className="n">{pc(num(r('fundeb_pct', x)))}</td><td className="n">{din(r('primario_apurado', x))}</td><td className="n">{din(r('primario_meta', x))}</td><td className="n">{din(r('nominal_apurado', x))}</td><td className="n">{din(r('resultado_orcamentario', x))}</td><td className="n">{din(r('saldo_exercicios_anteriores', x))}</td></tr>)}</tbody>
          </table>
        )}
        <p className="text-xs text-slate-500 mt-2">Como a contabilidade publicou no SICONFI. Os mínimos e as metas valem para o ano inteiro. Resultado negativo é ponto para a Contabilidade explicar, não conclusão de irregularidade.</p>
      </section>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-2">Pessoal por quadrimestre <SeloDado selo={SELO_OFICIAL} /></h2>
        {!quads.length ? <p className="text-sm text-slate-500">Sem RGF de {ano} coletado.</p> : (
          <table className="tabela">
            <thead><tr><th>Quadrimestre</th><th className="n">RCL</th><th className="n">Despesa com pessoal</th><th className="n">% da RCL</th><th className="n">Dívida líquida</th><th className="n">% da RCL</th></tr></thead>
            <tbody>{quads.map((x) => <tr key={x}><td>{x}º</td><td className="n">{din(g('rcl', x))}</td><td className="n">{din(g('dtp', x))}</td><td className="n font-semibold">{pc(num(g('dtp_pct', x)))}</td><td className="n">{din(g('dcl', x))}</td><td className="n">{pc(num(g('dcl_pct', x)))}</td></tr>)}</tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-slate-500">Execução do orçamento de {pct(p.acumulado.empenhado, p.orcamento.dotAtual)} do orçamento atualizado até {MES_LONGO[p.ate]}.</p>
    </div>
  );
}
