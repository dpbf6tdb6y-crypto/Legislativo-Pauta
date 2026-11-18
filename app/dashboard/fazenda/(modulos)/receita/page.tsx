import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pct, pctBp } from '@/lib/financas/dinheiro';
import { resumoReceita } from '@/lib/financas/painel/fiscal';
import { classificaReceita, tipoDaConta } from '@/lib/financas/painel/vinculacao';
import { selosDaExecucao } from '@/lib/financas/coleta/selos';
import SeloDado from '@/app/dashboard/fazenda/_componentes/SeloDado';
import { GraficoColunas } from '@/app/dashboard/fazenda/_componentes/Graficos';
import { BarrasH, MES_CURTO, MES_LONGO, Numero, reais } from '@/app/dashboard/fazenda/_componentes/BlocosFinancas';

const BLOCOS = [{ k: 'correntes', d: '1', nome: 'Receita corrente' }, { k: 'capital', d: '2', nome: 'Receita de capital' }, { k: 'deducoes', d: '9', nome: 'Deduções' }];
const Z = BigInt(0);

export default async function Receita({ searchParams }: { searchParams: { ano?: string; mes?: string; bloco?: string } }) {
  const { db } = await exigir('orcamento', 'Receita', { detalhe: JSON.stringify(searchParams), modulo: 'orcamento' });
  const periodos = await db.receitaContaMes.findMany({ distinct: ['ano', 'mes'], select: { ano: true, mes: true } });
  const anos = [...new Set(periodos.map((p) => p.ano))].sort((a, b) => a - b);
  const ano = anos.includes(Number(searchParams.ano)) ? Number(searchParams.ano) : anos.at(-1) ?? new Date().getFullYear();
  const meses = periodos.filter((p) => p.ano === ano).map((p) => p.mes).sort((a, b) => a - b);
  const mes = meses.includes(Number(searchParams.mes)) ? Number(searchParams.mes) : meses.at(-1) ?? 0;
  const bloco = BLOCOS.find((b) => b.k === searchParams.bloco) ?? BLOCOS[0];

  const contas = await db.receitaContaMes.findMany({ where: { ano, mes } });
  const resumo = resumoReceita(ano, mes, contas);
  const selos = await selosDaExecucao(db, ano);
  const cods = new Set(contas.map((c) => c.contaCod)), pais = new Set(contas.map((c) => c.contaPai)), nomes = new Map(contas.map((c) => [c.contaCod, c.nome]));
  const raiz = contas.find((c) => (!c.contaPai || !cods.has(c.contaPai)) && c.contaCod.startsWith(bloco.d));
  const total = raiz?.arrecAteMes ?? Z;
  const folhas = contas.filter((c) => !pais.has(c.contaCod) && c.contaCod.startsWith(bloco.d) && c.arrecAteMes !== Z)
    .map((c) => ({ ...c, classe: classificaReceita(c.contaCod, tipoDaConta(c.contaCod, nomes), c.nome) }))
    .sort((a, b) => (b.arrecAteMes > a.arrecAteMes ? 1 : b.arrecAteMes < a.arrecAteMes ? -1 : 0));
  const maior = folhas[0];

  // arrecadado de cada ano (posição do último mês coletado) e de cada mês do ano escolhido
  const raizes = await db.receitaContaMes.findMany({ where: { contaCod: { in: ['1000000000', '2000000000', '90000000000', '91000000000'] } }, select: { ano: true, mes: true, contaCod: true, arrecAteMes: true, arrecMes: true } });
  const doBloco = raizes.filter((r) => r.contaCod.startsWith(bloco.d));
  const porAno = anos.map((a) => { const x = doBloco.filter((r) => r.ano === a).sort((p, q) => q.mes - p.mes)[0]; return { rotulo: String(a), valor: reais(x?.arrecAteMes ?? Z) }; });
  const porMes = doBloco.filter((r) => r.ano === ano).sort((a, b) => a.mes - b.mes).map((r) => ({ rotulo: MES_CURTO[r.mes], valor: reais(r.arrecMes) }));
  const link = (mud: Record<string, string>) => `?${new URLSearchParams({ ano: String(ano), mes: String(mes), bloco: bloco.k, ...mud })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Receita · {ano} <SeloDado selo={selos.receita} /></h1>
          <p className="text-xs text-slate-500">Acumulado de janeiro a {MES_LONGO[mes]}. Fonte: Portal da Transparência.</p>
        </div>
        <form className="flex items-end gap-2">
          <input type="hidden" name="bloco" value={bloco.k} />
          <label className="text-xs text-slate-600">Ano<select name="ano" defaultValue={ano} className="campo block mt-0.5">{anos.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="text-xs text-slate-600">Até o mês<select name="mes" defaultValue={mes} className="campo block mt-0.5">{meses.map((m) => <option key={m} value={m}>{MES_LONGO[m]}</option>)}</select></label>
          <button className="btn-sec">Ver</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">{BLOCOS.map((b) => <Link key={b.k} href={link({ bloco: b.k })} aria-current={b.k === bloco.k ? 'page' : undefined} className={b.k === bloco.k ? 'btn' : 'btn-sec'}>{b.nome}</Link>)}</div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Numero titulo="Arrecadado" valor={brlCurto(total)} detalhe={brl(total)} />
        <Numero titulo="Previsto atualizado" valor={brlCurto(raiz?.previstoAtual ?? Z)} detalhe={`${pct(total, raiz?.previstoAtual ?? Z)} do previsto`} />
        <Numero titulo="Receita líquida do município" valor={brlCurto(resumo?.liquida.arrecadado ?? Z)} detalhe="corrente + capital − deduções" />
        <Numero titulo="Maior fonte" valor={maior ? brlCurto(maior.arrecAteMes) : '—'} detalhe={maior ? `${maior.nome} · ${pct(maior.arrecAteMes, total)}` : ''} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="cartao"><h2 className="font-semibold mb-2">Arrecadado por ano</h2><GraficoColunas titulo="Arrecadado no ano" itens={porAno} />{anos.length < 2 && <p className="text-xs text-slate-500 mt-1">O histórico dos anos anteriores aparece depois da carga inicial.</p>}</section>
        <section className="cartao"><h2 className="font-semibold mb-2">Mês a mês em {ano}</h2><GraficoColunas titulo="Arrecadado no mês" itens={porMes} /></section>
      </div>

      {resumo && (
        <section className="cartao overflow-x-auto">
          <h2 className="font-semibold mb-1">Receitas por origem · previsto × arrecadado</h2>
          <table className="tabela">
            <thead><tr><th>Origem</th><th className="n">Previsto na LOA</th><th className="n">Previsto atualizado</th><th className="n">Arrecadado</th><th className="n">% do previsto</th></tr></thead>
            <tbody>
              {resumo.grupos.map((g) => <tr key={g.cod}><td>{g.nome}</td><td className="n">{brl(g.previstoInicial)}</td><td className="n">{brl(g.previstoAtual)}</td><td className="n">{brl(g.arrecadado)}</td><td className="n">{pctBp(g.arrecadadoBp)}</td></tr>)}
              {resumo.deducoes && <tr><td>(−) {resumo.deducoes.nome}</td><td className="n">{brl(resumo.deducoes.previstoInicial)}</td><td className="n">{brl(resumo.deducoes.previstoAtual)}</td><td className="n">{brl(resumo.deducoes.arrecadado)}</td><td className="n">{pctBp(resumo.deducoes.arrecadadoBp)}</td></tr>}
              <tr className="font-semibold"><td>Receita líquida</td><td className="n">—</td><td className="n">{brl(resumo.liquida.previstoAtual)}</td><td className="n">{brl(resumo.liquida.arrecadado)}</td><td className="n">{pctBp(resumo.liquida.arrecadadoBp)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="cartao">
        <h2 className="font-semibold mb-2">Principais fontes · {bloco.nome.toLowerCase()}</h2>
        <BarrasH total={total} itens={folhas.slice(0, 8).map((f) => ({ nome: f.nome, valor: f.arrecAteMes }))} />
      </section>

      <section className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Todas as contas · {folhas.length}</h2>
        <table className="tabela">
          <thead><tr><th>Conta</th><th className="n">Arrecadado</th><th className="n">% do total</th><th>Vinculação</th></tr></thead>
          <tbody>
            {folhas.map((f) => (
              <tr key={f.contaCod}>
                <td><span className="font-mono text-xs text-slate-500">{f.contaCod}</span> {f.nome}</td>
                <td className="n">{brl(f.arrecAteMes)}</td><td className="n">{pct(f.arrecAteMes, total)}</td>
                <td className="text-xs">{f.classe.pct === 100 ? <>{f.classe.area} · <span className="text-slate-500">{f.classe.lei}</span></> : f.classe.pct === 0 ? 'Livre' : <span className="text-amber-800">Sem regra definida</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
