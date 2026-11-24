import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pct, somar } from '@/lib/financas/dinheiro';
import { agruparNaturezas, anoMaisRecente, execucaoMensal, partesObrigatorias } from '@/lib/financas/painel/compliance';
import { selosDaExecucao } from '@/lib/financas/coleta/selos';
import SeloDado from '@/app/dashboard/fazenda/_componentes/SeloDado';
import { GraficoColunas } from '@/app/dashboard/fazenda/_componentes/Graficos';
import { BarraPartes, BarrasH, MES_CURTO, MES_LONGO, Numero, reais } from '@/app/dashboard/fazenda/_componentes/BlocosFinancas';

const Z = BigInt(0);
const sinalBrl = (v: bigint) => `${v >= Z ? '+' : '−'} ${brl(v < Z ? -v : v)}`;

export default async function Despesas({ searchParams }: { searchParams: { ano?: string; mes?: string } }) {
  const { db } = await exigir('orcamento', 'Despesas', { detalhe: JSON.stringify(searchParams), modulo: 'orcamento' });
  const ano = Number(searchParams.ano) || await anoMaisRecente(db, new Date());
  const todos = await execucaoMensal(db, ano);
  const mes = Number(searchParams.mes ?? 0);
  const noPeriodo = (m: number) => (mes === 0 ? m > 0 : m === mes);

  const [orgaos, natureza, funcoes, selos] = await Promise.all([
    db.despesaOrgaoMes.findMany({ where: { ano, mes }, orderBy: { orgaoCod: 'asc' } }),
    db.despesaNaturezaMes.findMany({ where: { ano } }),
    db.despesaFuncaoMes.findMany({ where: { ano, mes: { gt: 0 } }, select: { mes: true, funcaoNome: true, empenhado: true } }),
    selosDaExecucao(db, ano),
  ]);
  const t = (k: 'dotInicial' | 'dotAtual' | 'empenhado' | 'liquidado' | 'pago') => somar(orgaos.map((o) => o[k]));
  const naturezas = agruparNaturezas(natureza.filter((n) => n.mes === 0 || noPeriodo(n.mes)));
  const porFuncao = new Map<string, bigint>();
  for (const f of funcoes.filter((x) => noPeriodo(x.mes))) porFuncao.set(f.funcaoNome, (porFuncao.get(f.funcaoNome) ?? Z) + f.empenhado);
  const listaFuncoes = [...porFuncao].filter(([, v]) => v > Z).map(([nome, valor]) => ({ nome: nome.charAt(0) + nome.slice(1).toLowerCase(), valor })).sort((a, b) => (b.valor > a.valor ? 1 : -1));
  const totalFuncoes = somar(listaFuncoes.map((f) => f.valor));
  const periodo = mes === 0 ? `acumulado de ${ano}` : `${MES_LONGO[mes]} de ${ano}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Despesas · {periodo}</h1>
          <p className="text-xs text-slate-500">Município inteiro, com a Câmara. Fonte: relatórios consolidados do Portal da Transparência.</p>
        </div>
        <form className="flex items-end gap-2">
          <input type="hidden" name="ano" value={ano} />
          <label className="text-xs text-slate-600">Período<select name="mes" defaultValue={mes} className="campo block mt-0.5"><option value={0}>Ano inteiro</option>{todos.map((m) => <option key={m.mes} value={m.mes}>{MES_LONGO[m.mes]}</option>)}</select></label>
          <button className="btn-sec">Ver</button>
        </form>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Numero titulo="Empenhado" valor={brlCurto(t('empenhado'))} detalhe={brl(t('empenhado'))} selo={<SeloDado selo={selos.empenhado} />} />
        <Numero titulo="Liquidado" valor={brlCurto(t('liquidado'))} detalhe={brl(t('liquidado'))} selo={<SeloDado selo={selos.liquidado} />} />
        <Numero titulo="Pago" valor={brlCurto(t('pago'))} detalhe={brl(t('pago'))} selo={<SeloDado selo={selos.pago} />} />
        <Numero titulo="Execução" valor={pct(t('pago'), t('empenhado'))} detalhe="pago sobre empenhado" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="cartao"><h2 className="font-semibold mb-2">Pagamento mês a mês</h2><GraficoColunas titulo="Pago no mês" itens={todos.map((m) => ({ rotulo: MES_CURTO[m.mes], valor: reais(m.pago) }))} /></section>
        <section className="cartao">
          <h2 className="font-semibold mb-2">Para onde vai o dinheiro</h2>
          {listaFuncoes.length ? <BarrasH total={totalFuncoes} itens={listaFuncoes.slice(0, 9)} /> : <p className="text-sm text-slate-500">Aguardando a primeira coleta do relatório por função.</p>}
          <p className="text-xs text-slate-500 mt-2">Empenhado por função de governo. Uma secretaria pode gastar em mais de uma função.</p>
        </section>
      </div>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Por secretaria</h2>
        <p className="text-xs text-slate-500 mb-2">{mes === 0 ? 'Acumulado do ano.' : 'Movimento do mês. O empenhado do mês já desconta anulações e pode ficar negativo.'}</p>
        <table className="tabela text-xs [&_th]:whitespace-nowrap [&_th]:text-[10px] [&_th]:px-1.5 [&_td]:whitespace-nowrap [&_td]:px-1.5 [&_td]:py-1">
          <thead><tr><th>Secretaria</th><th className="n">Dotação inicial</th><th className="n">Dotação atual</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th>{mes === 0 && <th className="n">Variação sobre a LOA</th>}{mes === 0 && <th className="n">Saldo da dotação</th>}{mes === 0 && <th className="n">% empenhado</th>}</tr></thead>
          <tbody>
            {orgaos.map((o) => (
              <tr key={o.orgaoCod}>
                <td className="max-w-[20rem] truncate" title={`${o.orgaoCod} · ${o.orgaoNome}`}>{o.orgaoCod} · {o.orgaoNome.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /i, '')}</td><td className="n">{brl(o.dotInicial)}</td><td className="n">{brl(o.dotAtual)}</td>
                <td className={`n ${o.empenhado < Z ? 'text-amber-700' : ''}`}>{brl(o.empenhado)}</td><td className="n">{brl(o.liquidado)}</td><td className="n">{brl(o.pago)}</td>
                {mes === 0 && <td className={`n ${o.dotAtual < o.dotInicial ? 'text-red-700' : ''}`}>{o.dotAtual === o.dotInicial ? '—' : sinalBrl(o.dotAtual - o.dotInicial)}</td>}
                {mes === 0 && <td className={`n ${o.dotAtual - o.empenhado < Z ? 'text-red-700 font-semibold' : ''}`}>{brl(o.dotAtual - o.empenhado)}</td>}
                {mes === 0 && <td className="n">{pct(o.empenhado, o.dotAtual)}</td>}
              </tr>
            ))}
            <tr className="font-semibold"><td>Total</td><td className="n">{brl(t('dotInicial'))}</td><td className="n">{brl(t('dotAtual'))}</td><td className="n">{brl(t('empenhado'))}</td><td className="n">{brl(t('liquidado'))}</td><td className="n">{brl(t('pago'))}</td>
              {mes === 0 && <td className="n">{sinalBrl(t('dotAtual') - t('dotInicial'))}</td>}{mes === 0 && <td className="n">{brl(t('dotAtual') - t('empenhado'))}</td>}{mes === 0 && <td className="n">{pct(t('empenhado'), t('dotAtual'))}</td>}
            </tr>
          </tbody>
        </table>
      </section>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-2">Por natureza da despesa</h2>
        {!naturezas.length ? <p className="text-sm text-slate-500">Aguardando a primeira coleta do relatório por natureza.</p> : (
          <>
            <BarraPartes rotulo="Empenhado por categoria" partes={partesObrigatorias(naturezas).map((p) => ({ nome: p.nome, valor: p.valor }))} />
            <table className="tabela mt-3">
              <thead><tr><th>Natureza</th><th>Tipo</th><th className="n">Dotação atual</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th><th>Base legal</th></tr></thead>
              <tbody>
                {naturezas.map((n) => (
                  <tr key={n.cod}>
                    <td><span className="font-mono text-xs text-slate-500">{n.cod}</span> {n.nome}</td>
                    <td className="text-xs">{n.tipo ? `${n.tipo} · ${n.grupo}` : <span className="text-amber-800">A classificar</span>}</td>
                    <td className="n">{brl(n.dotAtual)}</td><td className="n">{brl(n.empenhado)}</td><td className="n">{brl(n.liquidado)}</td><td className="n">{brl(n.pago)}</td>
                    <td className="text-xs text-slate-500">{n.lei}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">Classificação só pelas regras definidas, pelo nome da natureza. O que nenhuma regra cobre fica em &quot;a classificar&quot;.</p>
          </>
        )}
      </section>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Detalhado por mês</h2>
        <table className="tabela">
          <thead><tr><th>Mês</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th></tr></thead>
          <tbody>
            {todos.map((m) => <tr key={m.mes}><td className="capitalize">{MES_LONGO[m.mes]}</td><td className="n">{brl(m.empenhado)}</td><td className="n">{brl(m.liquidado)}</td><td className="n">{brl(m.pago)}</td></tr>)}
            <tr className="font-semibold"><td>Total</td><td className="n">{brl(somar(todos.map((m) => m.empenhado)))}</td><td className="n">{brl(somar(todos.map((m) => m.liquidado)))}</td><td className="n">{brl(somar(todos.map((m) => m.pago)))}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
