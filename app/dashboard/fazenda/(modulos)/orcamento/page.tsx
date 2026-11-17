import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pct, pctBp } from '@/lib/financas/dinheiro';
import { resumoReceita, tempoDecorridoBp } from '@/lib/financas/painel/fiscal';

const MESES = ['Ano inteiro', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default async function Orcamento({ searchParams }: { searchParams: { ano?: string; mes?: string } }) {
  const ano = Number(searchParams.ano ?? new Date().getFullYear());
  const mes = Number(searchParams.mes ?? 0);
  const { db } = await exigir('orcamento', 'Orçamento e metas', { detalhe: `${ano}/${mes}`, modulo: 'orcamento' });

  const orgaos = await db.despesaOrgaoMes.findMany({ where: { ano, mes }, orderBy: { orgaoCod: 'asc' } });
  const t = (k: 'dotInicial' | 'dotAtual' | 'empenhado' | 'liquidado' | 'pago') => orgaos.reduce((a, o) => a + o[k], BigInt(0));
  const mesesDisponiveis = (await db.despesaOrgaoMes.findMany({ where: { ano }, distinct: ['mes'], select: { mes: true } })).map((m) => m.mes).sort((a, b) => a - b);

  const mesReceita = mes || Math.max(0, ...(await db.receitaContaMes.findMany({ where: { ano }, distinct: ['mes'], select: { mes: true } })).map((m) => m.mes));
  const receitas = await db.receitaContaMes.findMany({ where: { ano, mes: mesReceita }, orderBy: { contaCod: 'asc' } });
  const resumo = resumoReceita(ano, mesReceita, receitas);
  // parte do ano coberta pelos dados: até hoje, no mês corrente; até o fim do mês, nos meses fechados
  const agora = new Date();
  const tempo = ano === agora.getFullYear() && mesReceita === agora.getMonth() + 1 ? tempoDecorridoBp(ano, agora) : BigInt(Math.round((mesReceita * 10000) / 12));
  const cfem = receitas.find((r) => r.contaCod === '1712510000');

  const ind = await db.indicadorFiscal.findMany({ where: { ano, relatorio: 'RGF' }, orderBy: { periodo: 'asc' } });
  const quads = [...new Set(ind.map((i) => i.periodo))];
  const rreo = await db.indicadorFiscal.findMany({ where: { ano, relatorio: 'RREO' }, orderBy: { periodo: 'asc' } });
  const bims = [...new Set(rreo.map((i) => i.periodo))];
  const rv = (b: number, k: string) => rreo.find((i) => i.periodo === b && i.chave === k)?.valor;
  const rPct = (b: number, k: string) => { const x = rv(b, k); return x === undefined ? '—' : `${Number(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`; };
  const rBrl = (b: number, k: string) => { const x = rv(b, k); return x === undefined ? '—' : brlCurto(BigInt(Math.round(Number(x) * 100))); };
  const iv = (q: number, k: string) => ind.find((i) => i.periodo === q && i.chave === k)?.valor;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-lg font-semibold mr-auto">Orçamento e metas · {ano}</h1>
        <form className="flex gap-2">
          <input type="hidden" name="ano" value={ano} />
          <select name="mes" defaultValue={mes} className="campo">
            {mesesDisponiveis.map((m) => <option key={m} value={m}>{MESES[m]}</option>)}
          </select>
          <button className="btn-sec">Ver</button>
        </form>
      </div>

      <div className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Execução da despesa por órgão · {MESES[mes]}</h2>
        <p className="text-xs text-slate-500 mb-2">
          {mes === 0 ? 'Acumulado do ano.' : 'Movimento do mês. Empenhado do mês já desconta anulações (pode ficar negativo).'} Fonte: portal, aba Órgão.
        </p>
        <table className="tabela">
          <thead><tr><th>Órgão</th><th className="n">Dotação inicial</th><th className="n">Dotação atual</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th>{mes === 0 && <th className="n">Saldo da dotação</th>}{mes === 0 && <th className="n">% empenhado</th>}</tr></thead>
          <tbody>
            {orgaos.map((o) => (
              <tr key={o.orgaoCod}>
                <td>{o.orgaoCod} · {o.orgaoNome}</td>
                <td className="n">{brl(o.dotInicial)}</td><td className="n">{brl(o.dotAtual)}</td>
                <td className={`n ${o.empenhado < BigInt(0) ? 'text-amber-700' : ''}`}>{brl(o.empenhado)}</td>
                <td className="n">{brl(o.liquidado)}</td><td className="n">{brl(o.pago)}</td>
                {mes === 0 && <td className={`n ${o.dotAtual - o.empenhado < BigInt(0) ? 'text-red-700 font-semibold' : ''}`}>{brl(o.dotAtual - o.empenhado)}</td>}
                {mes === 0 && <td className="n">{pct(o.empenhado, o.dotAtual)}</td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td><td className="n">{brl(t('dotInicial'))}</td><td className="n">{brl(t('dotAtual'))}</td><td className="n">{brl(t('empenhado'))}</td><td className="n">{brl(t('liquidado'))}</td><td className="n">{brl(t('pago'))}</td>
              {mes === 0 && <td className="n">{brl(t('dotAtual') - t('empenhado'))}</td>}{mes === 0 && <td className="n">{pct(t('empenhado'), t('dotAtual'))}</td>}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="cartao overflow-x-auto">
          <h2 className="font-semibold mb-1">Receitas por origem · previsto × arrecadado até {MESES[mesReceita] ?? '—'}</h2>
          {!resumo ? <p className="text-sm text-slate-500">Sem receita coletada.</p> : (
            <table className="tabela">
              <thead><tr><th>Origem</th><th className="n">Previsto na LOA</th><th className="n">Previsto atualizado</th><th className="n">Arrecadado</th><th className="n">% do previsto</th></tr></thead>
              <tbody>
                {resumo.grupos.map((g) => (
                  <tr key={g.cod} title={g.cod}>
                    <td>{g.nome}</td><td className="n">{brl(g.previstoInicial)}</td><td className="n">{brl(g.previstoAtual)}</td><td className="n">{brl(g.arrecadado)}</td>
                    <td className={`n ${g.arrecadadoBp !== null && g.arrecadadoBp < tempo ? 'text-amber-700' : ''}`}>{pctBp(g.arrecadadoBp)}</td>
                  </tr>
                ))}
                {resumo.deducoes && (
                  <tr><td>(−) {resumo.deducoes.nome} <span className="text-xs text-slate-500">(ex.: formação do FUNDEB)</span></td><td className="n">{brl(resumo.deducoes.previstoInicial)}</td><td className="n">{brl(resumo.deducoes.previstoAtual)}</td><td className="n">{brl(resumo.deducoes.arrecadado)}</td><td className="n">{pctBp(resumo.deducoes.arrecadadoBp)}</td></tr>
                )}
                <tr className="font-semibold"><td>Receita líquida</td><td className="n">—</td><td className="n">{brl(resumo.liquida.previstoAtual)}</td><td className="n">{brl(resumo.liquida.arrecadado)}</td><td className="n">{pctBp(resumo.liquida.arrecadadoBp)}</td></tr>
                {cfem && (
                  <tr className="bg-slate-50"><td>↳ dentro das transferências: CFEM (cota-parte, mineração)</td><td className="n">{brl(cfem.previstoInicial)}</td><td className="n">{brl(cfem.previstoAtual)}</td><td className="n">{brl(cfem.arrecAteMes)}</td><td className="n">{pct(cfem.arrecAteMes, cfem.previstoAtual)}</td></tr>
                )}
              </tbody>
            </table>
          )}
          <p className="text-xs text-slate-500 mt-2">Em laranja: arrecadação abaixo da parte do ano já decorrida ({pctBp(tempo)}). A arrecadação varia ao longo do ano; serve como sinal, não como conclusão.</p>
          <p className="text-xs text-slate-500 mt-2">A CFEM tem uso vedado em pessoal e dívida (Lei 7.990/1989, art. 8º). A conferência do uso depende de regra ainda não aprovada.</p>
        </div>

        <div className="cartao overflow-x-auto">
          <h2 className="font-semibold mb-1">Limites da LRF · pessoal (RGF, SICONFI)</h2>
          {!quads.length ? <p className="text-sm text-slate-500">Sem RGF de {ano} coletado.</p> : (
            <table className="tabela">
              <thead><tr><th>Quadrimestre</th><th className="n">RCL</th><th className="n">Pessoal</th><th className="n">% RCL</th><th className="n">Alerta</th><th className="n">Prudencial</th><th className="n">Máximo</th></tr></thead>
              <tbody>
                {quads.map((q) => (
                  <tr key={q}><td>{q}º</td><td className="n">{iv(q, 'rcl') ? brl(BigInt(Math.round(Number(iv(q, 'rcl')) * 100))) : '—'}</td><td className="n">{iv(q, 'dtp') ? brl(BigInt(Math.round(Number(iv(q, 'dtp')) * 100))) : '—'}</td><td className="n font-semibold">{iv(q, 'dtp_pct')}%</td><td className="n">{iv(q, 'limite_alerta_pct')}%</td><td className="n">{iv(q, 'limite_prudencial_pct')}%</td><td className="n">{iv(q, 'limite_max_pct')}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-slate-500 mt-2">Metas de resultado primário e nominal da LDO: no quadro do RREO abaixo, como o município publicou no SICONFI.</p>
        </div>
      </div>

      <div className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">RREO · mínimos constitucionais e metas fiscais, bimestre a bimestre ({ano})</h2>
        <p className="text-xs text-slate-500 mb-2">Valores acumulados até cada bimestre, como a contabilidade publicou no SICONFI (RREO, Anexo 14). Os mínimos e as metas valem para o ano inteiro.</p>
        {!bims.length ? <p className="text-sm text-slate-500">Sem RREO de {ano} coletado.</p> : (
          <table className="tabela">
            <thead>
              <tr><th>Bimestre</th><th className="n">Educação (mín. 25%)</th><th className="n">Saúde (mín. 15%)</th><th className="n">FUNDEB (mín. 70%)</th><th className="n">Resultado primário</th><th className="n">Meta primário (ano)</th><th className="n">Resultado orçamentário</th><th className="n">Restos a pagar a pagar</th></tr>
            </thead>
            <tbody>
              {bims.map((b) => (
                <tr key={b}>
                  <td>{b}º (até {new Date(ano, 2 * b, 0).toLocaleDateString('pt-BR')})</td>
                  <td className="n">{rPct(b, 'mde_pct')}</td><td className="n">{rPct(b, 'asps_pct')}</td><td className="n">{rPct(b, 'fundeb_pct')}</td>
                  <td className="n">{rBrl(b, 'primario_apurado')}</td><td className="n">{rBrl(b, 'primario_meta')}</td>
                  <td className="n">{rBrl(b, 'resultado_orcamentario')}</td>
                  <td className="n">{rv(b, 'rp_proc_saldo') === undefined ? '—' : brlCurto(BigInt(Math.round((Number(rv(b, 'rp_proc_saldo')) + Number(rv(b, 'rp_nproc_saldo') ?? 0)) * 100)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500 mt-2">Resultado orçamentário negativo = déficit (despesa empenhada maior que a receita), normalmente coberto por saldo de anos anteriores. O 6º bimestre fecha o ano.</p>
      </div>
    </div>
  );
}
