import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pct, pctBp } from '@/lib/financas/dinheiro';
import { equilibrioLOA, projecaoReceita, resumoReceita, tempoDecorridoBp, type Totais } from '@/lib/financas/painel/fiscal';

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

  // Posição do ano inteiro (mes 0), sempre: é a base do equilíbrio da LOA e do quadro "fixada × executada",
  // mesmo quando a tabela por órgão está mostrando o movimento de um mês.
  const orgaosAno = mes === 0 ? orgaos : await db.despesaOrgaoMes.findMany({ where: { ano, mes: 0 } });
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
            <p className="text-xs text-slate-500 mt-2">Município inteiro (Câmara incluída). Já passaram {pctBp(tempoDecorridoBp(ano, new Date()))} do ano; o empenhado representa {pct(tAno.empenhado, tAno.dotAtual)} da dotação atualizada. O detalhe por secretaria está logo abaixo.</p>
          </>
        )}
      </div>

      <div className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Execução da despesa por órgão · {MESES[mes]}</h2>
        <p className="text-xs text-slate-500 mb-2">
          {mes === 0 ? 'Acumulado do ano.' : 'Movimento do mês. Empenhado do mês já desconta anulações (pode ficar negativo).'} Fonte: portal, aba Órgão.
        </p>
        <table className="tabela">
          <thead><tr><th>Órgão</th><th className="n">Dotação inicial</th><th className="n">Dotação atual</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th>{mes === 0 && <th className="n" title="Dotação atual − dotação inicial: créditos adicionais líquidos de anulações. Autoriza gastar, mas não é receita nova.">Variação sobre a LOA</th>}{mes === 0 && <th className="n">Saldo da dotação</th>}{mes === 0 && <th className="n">% empenhado</th>}</tr></thead>
          <tbody>
            {orgaos.map((o) => (
              <tr key={o.orgaoCod}>
                <td>{o.orgaoCod} · {o.orgaoNome}</td>
                <td className="n">{brl(o.dotInicial)}</td><td className="n">{brl(o.dotAtual)}</td>
                <td className={`n ${o.empenhado < BigInt(0) ? 'text-amber-700' : ''}`}>{brl(o.empenhado)}</td>
                <td className="n">{brl(o.liquidado)}</td><td className="n">{brl(o.pago)}</td>
                {mes === 0 && <td className={`n ${o.dotAtual < o.dotInicial ? 'text-red-700' : ''}`}>{o.dotAtual === o.dotInicial ? '—' : o.dotInicial === BigInt(0) ? 'novo' : `${sinalBrl(o.dotAtual - o.dotInicial)} (${o.dotAtual > o.dotInicial ? '+' : '−'}${pct(o.dotAtual > o.dotInicial ? o.dotAtual - o.dotInicial : o.dotInicial - o.dotAtual, o.dotInicial)})`}</td>}
                {mes === 0 && <td className={`n ${o.dotAtual - o.empenhado < BigInt(0) ? 'text-red-700 font-semibold' : ''}`}>{brl(o.dotAtual - o.empenhado)}</td>}
                {mes === 0 && <td className="n">{pct(o.empenhado, o.dotAtual)}</td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Total</td><td className="n">{brl(t('dotInicial'))}</td><td className="n">{brl(t('dotAtual'))}</td><td className="n">{brl(t('empenhado'))}</td><td className="n">{brl(t('liquidado'))}</td><td className="n">{brl(t('pago'))}</td>
              {mes === 0 && <td className="n">{sinalBrl(t('dotAtual') - t('dotInicial'))}</td>}
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
