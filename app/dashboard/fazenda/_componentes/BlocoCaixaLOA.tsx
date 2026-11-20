// Duas perguntas que o prefeito precisa saber responder para os secretários:
//  1) "A LOA foi atualizada e a receita não cresceu: de onde veio o dinheiro?"
//  2) "Por que se pagou mais do que se arrecadou no ano?"
// O bloco descreve os números e diz o que a lei admite; NÃO diz que algo é irregular.
// O que não tem explicação nos números publicados aparece como pergunta para a contabilidade.
import { brlCurto, pctBp } from '@/lib/financas/dinheiro';
import type { CaixaDoAno, CoberturaCreditos, DividaLRF, ResumoRREO } from '@/lib/financas/painel/fiscal';

const Z = BigInt(0);
const sinal = (v: bigint) => `${v < Z ? '−' : '+'}${brlCurto(v < Z ? -v : v)}`;

export default function BlocoCaixaLOA({ cobertura: c, caixa, rreo, divida }: {
  cobertura: CoberturaCreditos | null;
  caixa: CaixaDoAno | null;
  rreo: ResumoRREO | null;
  divida: DividaLRF | null;
}) {
  if (!c && !caixa) return null;
  const primario = rreo?.primario && rreo.primario.meta !== null && rreo.primario.apurado !== null && rreo.primario.apurado < rreo.primario.meta ? rreo.primario : null;
  const dclNegativa = divida && divida.valor !== null && divida.valor < Z ? divida : null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* ---------- LOA × receita ---------- */}
      {c && (
        <section className="cartao" id="loa">
          <h2 className="font-semibold">LOA {c.ano}: de onde veio o dinheiro do aumento da despesa</h2>
          <p className="text-xs text-slate-500">Município (Executivo + Câmara) · dotação do portal × previsão de receita líquida</p>
          <table className="tabela mt-2">
            <thead><tr><th></th><th className="n">Na LOA</th><th className="n">Hoje</th><th className="n">Variação</th></tr></thead>
            <tbody>
              <tr><td>Despesa autorizada</td><td className="n">{brlCurto(c.despesaInicial)}</td><td className="n">{brlCurto(c.despesaAtual)}</td><td className="n font-semibold">{sinal(c.aumentoDespesa)} <span className="font-normal text-slate-500">({pctBp(c.aumentoDespesaBp)})</span></td></tr>
              <tr><td>Receita líquida prevista</td><td className="n">{brlCurto(c.receitaInicial)}</td><td className="n">{brlCurto(c.receitaAtual)}</td><td className="n font-semibold">{sinal(c.aumentoReceita)} <span className="font-normal text-slate-500">({pctBp(c.aumentoReceitaBp)})</span></td></tr>
            </tbody>
          </table>
          {c.semReceitaNova > Z ? (
            <div className="mt-3 text-sm space-y-2">
              <p>
                <b>{brlCurto(c.semReceitaNova)}</b> do aumento da despesa <b>não veio de previsão de receita nova</b>. Isso é possível: crédito adicional pode ser aberto com <i>superávit financeiro</i> de
                anos anteriores (dinheiro que sobrou em caixa, que não é receita de {c.ano}), com excesso de arrecadação, com anulação de outras dotações ou com operação de crédito
                (Lei 4.320/1964, art. 43, §1º).
              </p>
              {c.saldoAnteriores !== null && (
                <p>
                  O RREO{rreo ? ` do ${rreo.bimestre}º bimestre` : ''} informa <b>{brlCurto(c.saldoAnteriores)}</b> de saldo de anos anteriores usado.{' '}
                  {c.semExplicacao && c.semExplicacao > Z
                    ? <span className="text-amber-800">Ficam <b>{brlCurto(c.semExplicacao)}</b> sem cobertura identificada nos números publicados.</span>
                    : <span className="text-emerald-800">Isso cobre o aumento.</span>}
                </p>
              )}
              {c.semExplicacao && c.semExplicacao > Z && (
                <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded p-2">
                  <b>Pergunte à contabilidade:</b> a relação dos decretos de crédito adicional de {c.ano}, com o valor e a fonte de cobertura de cada um (superávit financeiro, excesso de arrecadação, anulação ou
                  operação de crédito). O RREO pode estar defasado em relação aos decretos mais recentes; esta lacuna pode ser só isso.
                </p>
              )}
              {primario && (
                <p className="text-xs text-slate-600">
                  Efeito: gastar saldo de anos anteriores pesa no resultado primário do ano ({brlCurto(primario.apurado!)} até o {rreo!.bimestre}º bimestre, meta da LDO {brlCurto(primario.meta!)}).
                  Se a meta não for cumprida, a LRF pede limitação de empenho ou revisão da meta (art. 9º).
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-emerald-800">O aumento da despesa autorizada está acompanhado de aumento equivalente na previsão de receita.</p>
          )}
        </section>
      )}

      {/* ---------- caixa do ano ---------- */}
      {caixa && (
        <section className="cartao" id="caixa">
          <h2 className="font-semibold">Caixa de {caixa.ano}: o que entrou × o que saiu</h2>
          <p className="text-xs text-slate-500">Receita líquida arrecadada × despesa paga no ano (orçamento + restos a pagar de anos anteriores)</p>
          <table className="tabela mt-2">
            <tbody>
              <tr><td>Receita líquida arrecadada</td><td className="n">{brlCurto(caixa.receita)}</td></tr>
              <tr><td>Despesa paga do orçamento de {caixa.ano}</td><td className="n">{brlCurto(caixa.pagoOrcamento)}</td></tr>
              <tr><td>Restos a pagar de anos anteriores pagos em {caixa.ano}</td><td className="n">{brlCurto(caixa.rpPagos)}</td></tr>
              <tr className="font-semibold"><td>Total que saiu</td><td className="n">{brlCurto(caixa.saidas)}</td></tr>
            </tbody>
          </table>
          <p className={`text-2xl font-bold mt-2 ${caixa.diferenca > Z ? 'text-amber-800' : 'text-emerald-800'}`}>
            {caixa.diferenca > Z ? `saiu ${brlCurto(caixa.diferenca)} a mais do que entrou` : `sobrou ${brlCurto(-caixa.diferenca)}`}
          </p>
          {caixa.diferenca > Z && (
            <div className="mt-2 text-sm space-y-2">
              <p>
                <b>Por quê?</b> A despesa paga no ano inclui gasto bancado por dinheiro que já estava em caixa no fim do ano anterior, e os restos a pagar de {caixa.ano - 1} (despesa de {caixa.ano - 1} paga com
                dinheiro de {caixa.ano}). Isso é permitido <b>se houver caixa para cobrir</b> (LRF, art. 1º, §1º).
                {caixa.saldoAnteriores !== null && <> O RREO informa {brlCurto(caixa.saldoAnteriores)} de saldo de anos anteriores usado{caixa.semCobertura && caixa.semCobertura > Z ? <>; <span className="text-amber-800">a diferença acima desse saldo é {brlCurto(caixa.semCobertura)}</span></> : ', o que cobre a diferença'}.</>}
              </p>
              {dclNegativa && (
                <p className="text-xs text-slate-600">
                  Sinal favorável: o RGF do {dclNegativa.quadrimestre}º quadrimestre mostra dívida consolidada líquida <b>negativa ({brlCurto(dclNegativa.valor!)})</b>, isto é, mais disponibilidades do que dívidas.
                  A prova, porém, é o demonstrativo da disponibilidade de caixa (RGF, Anexo 5), que o sistema ainda não coleta.
                </p>
              )}
              <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded p-2">
                <b>Pergunte à Fazenda/contabilidade:</b> qual era o saldo em caixa em 31/12/{caixa.ano - 1}, qual é hoje, e quanto dele é de recurso vinculado (saúde, educação, convênios, CFEM), que não pode pagar despesa livre.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
