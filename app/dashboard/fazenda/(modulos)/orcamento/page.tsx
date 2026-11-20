import { exigir } from '@/lib/financas/auth';
import { brl, pct, pctBp } from '@/lib/financas/dinheiro';
import { caixaDoAno, coberturaCreditos, equilibrioLOA, projecaoReceita, resumoReceita, tempoDecorridoBp, type Totais } from '@/lib/financas/painel/fiscal';
import { carregarDivida, carregarRPPagos, carregarRREO } from '@/lib/financas/painel/carregar';
import BlocoCaixaLOA from '@/app/dashboard/fazenda/_componentes/BlocoCaixaLOA';
import { selosDaExecucao } from '@/lib/financas/coleta/selos';
import SeloDado from '@/app/dashboard/fazenda/_componentes/SeloDado';

const MESES = ['Ano inteiro', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Orçamento e metas: a LOA, o equilíbrio e a projeção. Receita, Despesas e Limites legais têm cada um a sua aba em Finanças.
export default async function Orcamento({ searchParams }: { searchParams: { ano?: string } }) {
  const ano = Number(searchParams.ano ?? new Date().getFullYear());
  const { db } = await exigir('orcamento', 'Orçamento e metas', { detalhe: String(ano), modulo: 'orcamento' });

  const mesReceita = Math.max(0, ...(await db.receitaContaMes.findMany({ where: { ano }, distinct: ['mes'], select: { mes: true } })).map((m) => m.mes));
  const receitas = await db.receitaContaMes.findMany({ where: { ano, mes: mesReceita }, orderBy: { contaCod: 'asc' } });
  const resumo = resumoReceita(ano, mesReceita, receitas);

  // posição do ano inteiro (mês 0): base do equilíbrio da LOA e do quadro "fixada × executada"
  const orgaosAno = await db.despesaOrgaoMes.findMany({ where: { ano, mes: 0 } });
  const tAno: Totais = {
    dotInicial: orgaosAno.reduce((a, o) => a + o.dotInicial, BigInt(0)), dotAtual: orgaosAno.reduce((a, o) => a + o.dotAtual, BigInt(0)),
    empenhado: orgaosAno.reduce((a, o) => a + o.empenhado, BigInt(0)), liquidado: orgaosAno.reduce((a, o) => a + o.liquidado, BigInt(0)),
    pago: orgaosAno.reduce((a, o) => a + o.pago, BigInt(0)),
  };
  const equilibrio = equilibrioLOA(resumo, orgaosAno.length ? tAno : null);
  // projeção: usa a receita do ano anterior (até o mesmo mês e no ano todo)
  const recAnt = async (m: number) => resumoReceita(ano - 1, m, await db.receitaContaMes.findMany({ where: { ano: ano - 1, mes: m } }));
  const antAteMes = mesReceita ? await recAnt(mesReceita) : null;
  const antAno = mesReceita ? await recAnt(12) : null;
  const projecao = resumo && equilibrio && antAteMes && antAno
    ? projecaoReceita({ realizado: resumo.liquida.arrecadado, anteriorAteMes: antAteMes.liquida.arrecadado, anteriorAno: antAno.liquida.arrecadado, previstoAtual: resumo.liquida.previstoAtual, despAtual: equilibrio.despAtual })
    : null;
  const sinalBrl = (v: bigint) => `${v >= BigInt(0) ? '+' : '−'} ${brl(v < BigInt(0) ? -v : v)}`;
  const posicao = mesReceita ? (MESES[mesReceita] ?? '—').toLowerCase() : '—';
  const selos = await selosDaExecucao(db, ano);

  // LOA × receita (de onde veio o dinheiro do aumento) e caixa do ano (entrou × saiu, com restos a pagar). O saldo de anos anteriores vem do RREO do mesmo ano.
  const [rreo, divida, rpPagos] = await Promise.all([carregarRREO(db), carregarDivida(db), carregarRPPagos(db, ano)]);
  const saldoAnteriores = rreo && rreo.ano === ano ? rreo.saldoExerciciosAnteriores : null;
  const cobertura = equilibrio ? coberturaCreditos(ano, equilibrio, saldoAnteriores) : null;
  const caixa = resumo && orgaosAno.length ? caixaDoAno(ano, resumo.liquida.arrecadado, tAno.pago, rpPagos, saldoAnteriores) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Orçamento e metas · {ano}</h1>
        <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <span>Receita <SeloDado selo={selos.receita} /></span>
          <span>Empenhado <SeloDado selo={selos.empenhado} /></span>
          <span>Liquidado <SeloDado selo={selos.liquidado} /></span>
          <span>Pago <SeloDado selo={selos.pago} /></span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ---------- equilíbrio da LOA ---------- */}
        <div className="cartao">
          <h2 className="font-semibold mb-1">Equilíbrio da LOA · receita prevista × despesa autorizada</h2>
          <p className="text-xs text-slate-500 mb-2">Município inteiro (Câmara incluída) · {ano}</p>
          {!equilibrio ? <p className="text-sm text-slate-500">Sem receita e despesa coletadas.</p> : (
            <>
              <table className="tabela">
                <tbody>
                  <tr><td>Receita prevista na LOA (inicial)</td><td className="n">{brl(equilibrio.recIni)}</td></tr>
                  <tr><td>Despesa fixada na LOA (inicial)</td><td className="n">{brl(equilibrio.despIni)}</td></tr>
                  <tr><td>Receita prevista atualizada</td><td className="n">{brl(equilibrio.recAtual)}</td></tr>
                  <tr className="font-semibold"><td>Despesa autorizada (atualizada)</td><td className="n">{brl(equilibrio.despAtual)}</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-slate-600 mt-2">
                Na aprovação, a LOA {equilibrio.difIni === BigInt(0) ? <b>estava equilibrada</b> : <>tinha diferença de <b>{brl(equilibrio.difIni < BigInt(0) ? -equilibrio.difIni : equilibrio.difIni)}</b></>}.
              </p>
              {equilibrio.difAtual > BigInt(0) ? (
                <p className="text-sm mt-2 rounded border border-amber-300 bg-amber-50 text-amber-900 p-2">
                  <b>Atenção:</b> a despesa autorizada está <b>{brl(equilibrio.difAtual)}</b> ({pct(equilibrio.difAtual, equilibrio.recAtual)}) acima da receita prevista atualizada. Os créditos adicionais ({sinalBrl(equilibrio.creditos)} sobre a LOA) precisam de cobertura: superávit do ano anterior, excesso de arrecadação, anulação de outra dotação ou operação de crédito. O sistema não vê a fonte desses créditos; confirme com a contabilidade (decretos de abertura).
                </p>
              ) : (
                <p className="text-sm mt-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 p-2">A despesa autorizada está dentro da receita prevista atualizada.</p>
              )}
            </>
          )}
        </div>

        {/* ---------- projeção de fechamento ---------- */}
        <div className="cartao">
          <h2 className="font-semibold mb-1">Projeção de fechamento da receita · estimativa</h2>
          <p className="text-xs text-slate-500 mb-2">Receita líquida de {ano} até {posicao}, projetada para o ano</p>
          {!projecao ? <p className="text-sm text-slate-500">Sem a série completa de {ano - 1} para projetar.</p> : (
            <>
              <table className="tabela">
                <tbody>
                  <tr><td>Parte da receita de {ano - 1} que já tinha entrado até {posicao}</td><td className="n">{pctBp(projecao.fracaoBp)}</td></tr>
                  <tr><td>Receita líquida realizada em {ano}</td><td className="n">{brl(projecao.realizado)}</td></tr>
                  <tr className="font-semibold"><td>Receita líquida projetada para o ano</td><td className="n">{brl(projecao.projetada)}</td></tr>
                  <tr><td>Contra a previsão atualizada ({brl(resumo!.liquida.previstoAtual)})</td><td className={`n ${projecao.contraPrevisao < BigInt(0) ? 'text-red-700' : 'text-emerald-800'}`}>{sinalBrl(projecao.contraPrevisao)} ({pctBp(projecao.contraPrevisaoBp)} da previsão)</td></tr>
                  <tr><td>Contra a despesa autorizada ({brl(equilibrio!.despAtual)})</td><td className={`n ${projecao.contraDespesa < BigInt(0) ? 'text-red-700' : 'text-emerald-800'}`}>{sinalBrl(projecao.contraDespesa)}</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-slate-600 mt-2"><b>Isto é uma estimativa, não um dado.</b> Assume que {ano} repete a distribuição da arrecadação ao longo do ano de {ano - 1}. Mudança de alíquota, receita extraordinária e a sazonalidade das transferências podem alterar o resultado. Use como ordem de grandeza.</p>
            </>
          )}
        </div>
      </div>

      <BlocoCaixaLOA cobertura={cobertura} caixa={caixa} rreo={rreo && rreo.ano === ano ? rreo : null} divida={divida} />

      {/* ---------- despesa: fixada × executada ---------- */}
      <div className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Despesa · fixada × executada · acumulado de {ano}</h2>
        {!orgaosAno.length ? <p className="text-sm text-slate-500">Sem despesa coletada.</p> : (
          <>
            <table className="tabela">
              <thead><tr><th>Despesa</th><th className="n">Valor</th><th className="n">% da dotação atualizada</th></tr></thead>
              <tbody>
                <tr><td>Fixada na LOA (valor inicial)</td><td className="n">{brl(tAno.dotInicial)}</td><td className="n">—</td></tr>
                <tr className="font-semibold"><td>Atualizada (valor atual)</td><td className="n">{brl(tAno.dotAtual)}</td><td className="n">{tAno.dotAtual >= tAno.dotInicial ? '▲ +' : '▼ −'}{pct(tAno.dotAtual >= tAno.dotInicial ? tAno.dotAtual - tAno.dotInicial : tAno.dotInicial - tAno.dotAtual, tAno.dotInicial)} s/ LOA</td></tr>
                <tr><td>Empenhada</td><td className="n">{brl(tAno.empenhado)}</td><td className="n">{pct(tAno.empenhado, tAno.dotAtual)}</td></tr>
                <tr><td>Liquidada</td><td className="n">{brl(tAno.liquidado)}</td><td className="n">{pct(tAno.liquidado, tAno.dotAtual)}</td></tr>
                <tr><td>Paga</td><td className="n">{brl(tAno.pago)}</td><td className="n">{pct(tAno.pago, tAno.dotAtual)}</td></tr>
                <tr className="font-semibold"><td>Saldo de dotação (a empenhar)</td><td className={`n ${tAno.dotAtual - tAno.empenhado < BigInt(0) ? 'text-red-700' : ''}`}>{brl(tAno.dotAtual - tAno.empenhado)}</td><td className="n">{pct(tAno.dotAtual - tAno.empenhado, tAno.dotAtual)}</td></tr>
                <tr className="bg-slate-50"><td>Empenhado e ainda não liquidado</td><td className="n">{brl(tAno.empenhado - tAno.liquidado)}</td><td className="n">{pct(tAno.empenhado - tAno.liquidado, tAno.empenhado)} do empenhado</td></tr>
                <tr className="bg-slate-50"><td>Liquidado e ainda não pago</td><td className="n">{brl(tAno.liquidado - tAno.pago)}</td><td className="n">{pct(tAno.liquidado - tAno.pago, tAno.liquidado)} do liquidado</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">Município inteiro (Câmara incluída). Já passaram {pctBp(tempoDecorridoBp(ano, new Date()))} do ano; o empenhado representa {pct(tAno.empenhado, tAno.dotAtual)} da dotação atualizada. O detalhe por secretaria está na aba Despesas.</p>
          </>
        )}
      </div>
    </div>
  );
}
