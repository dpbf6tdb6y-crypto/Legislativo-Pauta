// Mínimos constitucionais, metas fiscais da LDO, restos a pagar e dívida, como a contabilidade
// publicou no SICONFI (RREO Anexo 14 e RGF Anexo 06). O painel só mostra; não recalcula.
import { brlCurto, pctBp } from '@/lib/financas/dinheiro';
import type { DividaLRF, Nivel, ResumoRREO } from '@/lib/financas/painel/fiscal';
import { COR_NIVEL } from './Medidor';
import SeloDado from './SeloDado';
import { SELO_OFICIAL } from '@/lib/financas/coleta/selos';

const pctNum = (bp: bigint) => Number(bp) / 100;
const sinal = (v: bigint | null) => (v === null ? '—' : `${v < BigInt(0) ? '−' : '+'}${brlCurto(v < BigInt(0) ? -v : v)}`);

function Barra({ pct, min, nivel, escala }: { pct: number; min: number; nivel: Nivel; escala: number }) {
  return (
    <div className="relative h-2.5 rounded bg-slate-200 mt-1">
      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.min((pct / escala) * 100, 100)}%`, background: COR_NIVEL[nivel].arco }} />
      <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900" style={{ left: `${(min / escala) * 100}%` }} title={`mínimo ${min}%`} />
    </div>
  );
}

export default function BlocoRREO({ r, divida }: { r: ResumoRREO | null; divida: DividaLRF | null }) {
  if (!r && !divida) return null;
  const pos = r ? `${r.bimestre}º bimestre de ${r.ano} · até ${r.posicao.toLocaleDateString('pt-BR')}` : '';
  const rpSaldo = r ? (r.rp.processados.saldo ?? BigInt(0)) + (r.rp.naoProcessados.saldo ?? BigInt(0)) : null;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* ---------- mínimos constitucionais ---------- */}
      <section className="cartao">
        <h2 className="font-semibold">Mínimos da Constituição {r && <SeloDado selo={SELO_OFICIAL} />}</h2>
        <p className="text-xs text-slate-500">RREO (SICONFI) · {pos || 'sem RREO coletado'}</p>
        {r?.minimos.map((m) => {
          const escala = Math.max(pctNum(m.minimoBp) * 1.6, pctNum(m.pctBp) * 1.05);
          return (
            <div key={m.chave} className="mt-3" title={`${m.nome}: ${pctBp(m.pctBp, 2)} (mínimo ${pctBp(m.minimoBp, 0)}) · ${m.base}`}>
              <div className="flex justify-between text-sm"><span>{m.nome}</span><b className={COR_NIVEL[m.nivel].texto}>{pctBp(m.pctBp)}</b></div>
              <Barra pct={pctNum(m.pctBp)} min={pctNum(m.minimoBp)} nivel={m.nivel} escala={escala} />
              <div className="text-xs text-slate-500 mt-0.5">mínimo {pctBp(m.minimoBp, 0)} · {m.base}{m.valor !== null ? ` · aplicado ${brlCurto(m.valor)}` : ''}</div>
            </div>
          );
        })}
        <p className="text-xs text-slate-500 mt-3">O mínimo vale para o ano inteiro; o traço preto marca o mínimo. Números da contabilidade do município, não do painel.</p>
      </section>

      {/* ---------- metas fiscais ---------- */}
      <section className="cartao">
        <h2 className="font-semibold">Metas fiscais da LDO</h2>
        <p className="text-xs text-slate-500">RREO (SICONFI) · {pos || 'sem RREO coletado'}</p>
        {r?.primario && (
          <div className={`mt-3 rounded border p-2 ${r.primario.nivel === 'ok' ? 'border-slate-200' : `${COR_NIVEL[r.primario.nivel].borda} ${COR_NIVEL[r.primario.nivel].fundo}`}`}>
            <div className="text-sm font-semibold">Resultado primário</div>
            <div className="flex justify-between text-sm"><span>Apurado até o bimestre</span><b>{sinal(r.primario.apurado)}</b></div>
            <div className="flex justify-between text-sm"><span>Meta da LDO para o ano</span><span>{sinal(r.primario.meta)}</span></div>
            {r.primario.nivel !== 'ok' && <p className="text-xs mt-1">Abaixo da meta. Pergunte à contabilidade se a receita do ano permite cumpri-la ou se é preciso limitar empenhos (LRF art. 9º).</p>}
          </div>
        )}
        {r?.nominal && (
          <div className="mt-2 text-sm">
            <div className="flex justify-between"><span>Resultado nominal apurado</span><span>{sinal(r.nominal.apurado)}</span></div>
            <div className="flex justify-between text-slate-600"><span>meta da LDO</span><span>{sinal(r.nominal.meta)}</span></div>
          </div>
        )}
        {r?.resultadoOrcamentario !== null && r?.resultadoOrcamentario !== undefined && (
          <p className="text-sm mt-3 border-t border-slate-100 pt-2">
            Resultado orçamentário até o bimestre: <b>{r.resultadoOrcamentario < BigInt(0) ? 'déficit' : 'superávit'} de {brlCurto(r.resultadoOrcamentario < BigInt(0) ? -r.resultadoOrcamentario : r.resultadoOrcamentario)}</b>
            {r.saldoExerciciosAnteriores !== null && <> · saldos de anos anteriores usados para créditos adicionais: <b>{brlCurto(r.saldoExerciciosAnteriores)}</b></>}.
          </p>
        )}
        <p className="text-xs text-slate-500 mt-2">A meta é do ano inteiro; o apurado é acumulado até o bimestre.</p>
      </section>

      {/* ---------- restos a pagar e dívida ---------- */}
      <section className="cartao">
        <h2 className="font-semibold">Restos a pagar e dívida</h2>
        {r && (
          <>
            <p className="text-xs text-slate-500">Restos a pagar de anos anteriores · {pos}</p>
            <table className="w-full text-sm mt-2">
              <thead><tr className="text-xs text-slate-500"><th className="text-left font-normal"></th><th className="text-right font-normal">inscrito</th><th className="text-right font-normal">pago</th><th className="text-right font-normal">cancelado</th><th className="text-right font-normal">falta</th></tr></thead>
              <tbody>
                {([['Processados (já entregues)', r.rp.processados], ['Não processados', r.rp.naoProcessados]] as const).map(([n, x]) => (
                  <tr key={n} className="border-t border-slate-100">
                    <td className="py-1">{n}</td>
                    <td className="py-1 text-right tabular-nums">{x.inscrito !== null ? brlCurto(x.inscrito) : '—'}</td>
                    <td className="py-1 text-right tabular-nums">{x.pago !== null ? brlCurto(x.pago) : '—'}</td>
                    <td className="py-1 text-right tabular-nums">{x.cancelado !== null ? brlCurto(x.cancelado) : '—'}</td>
                    <td className="py-1 text-right tabular-nums font-semibold">{x.saldo !== null ? brlCurto(x.saldo) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rpSaldo !== null && <p className="text-xs text-slate-500 mt-1">Ainda a pagar de anos anteriores: {brlCurto(rpSaldo)}.</p>}
          </>
        )}
        {divida && (
          <div className="mt-3 border-t border-slate-100 pt-2" title="Resolução do Senado 40/2001; alerta a 90% do limite (LRF art. 59, §1º, III)">
            <div className="flex justify-between text-sm"><span>Dívida consolidada líquida</span><b className={COR_NIVEL[divida.nivel].texto}>{pctBp(divida.pctBp)} da RCL</b></div>
            <p className="text-xs text-slate-500">
              Limite {pctBp(divida.limiteBp, 0)} · {divida.quadrimestre}º quadrimestre de {divida.ano} (RGF)
              {divida.pctBp < BigInt(0) ? ' · negativa: o caixa e os créditos a receber são maiores que a dívida.' : ''}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
