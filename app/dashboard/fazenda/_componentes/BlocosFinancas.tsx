// Peças das telas do Compliance. Componentes de servidor: as contas já vêm prontas de lib/financas/painel/compliance.ts.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { brl, brlCurto, pct } from '@/lib/financas/dinheiro';
import type { DadosPainel, MesExecucao, PartesRP, ResumoVinculantes } from '@/lib/financas/painel/compliance';
import { COR_SERIE } from '@/lib/financas/painel/cores';
import { GraficoLinhas } from './Graficos';

export const MES_CURTO = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MES_LONGO = ['Ano inteiro', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const reais = (c: bigint) => Number(c) / 100;
const Z = BigInt(0);
const abs = (v: bigint) => (v < Z ? -v : v);

export function Numero({ titulo, valor, detalhe, selo, href, tom }: { titulo: string; valor: string; detalhe?: ReactNode; selo?: ReactNode; href?: string; tom?: 'alerta' | 'bom' }) {
  const corpo = (
    <>
      <div className="flex items-start justify-between gap-2 text-xs text-slate-500"><span>{titulo}</span>{selo}</div>
      <div className={`text-2xl font-bold mt-1 ${tom === 'alerta' ? 'text-amber-800' : tom === 'bom' ? 'text-emerald-800' : 'text-slate-900'}`}>{valor}</div>
      {detalhe && <div className="text-xs text-slate-600 mt-1 leading-snug">{detalhe}</div>}
    </>
  );
  return href ? <Link href={href} className="cartao block hover:border-emerald-400">{corpo}</Link> : <div className="cartao">{corpo}</div>;
}

/** Barras horizontais de uma série, ordenadas por quem chamou. */
export function BarrasH({ itens, formato = brlCurto, total }: { itens: { nome: string; valor: bigint; href?: string; ativo?: boolean }[]; formato?: (v: bigint) => string; total?: bigint }) {
  const max = itens.reduce((m, i) => (i.valor > m ? i.valor : m), Z);
  return (
    <ul className="space-y-1.5">
      {itens.map((i) => {
        const conteudo = (
          <>
            <span className="flex justify-between gap-3 text-sm"><span className={`truncate ${i.ativo ? 'font-semibold' : ''}`}>{i.nome}</span><span className="tabular-nums whitespace-nowrap">{formato(i.valor)}{total ? <span className="text-slate-500"> · {pct(i.valor, total)}</span> : null}</span></span>
            <span className="block h-2 rounded bg-slate-100 mt-0.5"><span className="block h-2 rounded-r" style={{ width: `${max > Z ? Number((i.valor * BigInt(1000)) / max) / 10 : 0}%`, background: COR_SERIE[0] }} /></span>
          </>
        );
        return <li key={i.nome} title={`${i.nome}: ${brl(i.valor)}`}>{i.href ? <Link href={i.href} className="block hover:opacity-80">{conteudo}</Link> : conteudo}</li>;
      })}
    </ul>
  );
}

/** Uma linha por item, no modelo do painel anterior: nome, barra, % do total e valor. Rola quando a lista passa de `linhasVisiveis`. */
export function BarrasLinha({ itens, formato = brlCurto, linhasVisiveis = 10 }: {
  itens: { nome: string; valor: bigint; href?: string; ativo?: boolean }[]; formato?: (v: bigint) => string; linhasVisiveis?: number;
}) {
  const max = itens.reduce((m, i) => (i.valor > m ? i.valor : m), Z);
  const total = itens.reduce((s, i) => s + i.valor, Z);
  const GRADE = 'minmax(0,2fr) minmax(3rem,1fr) 3.2rem 7rem';
  return (
    <ul className="overflow-y-auto pr-1" style={{ maxHeight: `${linhasVisiveis * 2.1}rem` }}>
      {itens.map((i) => {
        const linha = (
          <span className="grid items-center gap-x-3 text-[13px] py-1" style={{ gridTemplateColumns: GRADE }}>
            <span className={`truncate ${i.ativo ? 'font-semibold' : ''}`}>{i.nome}</span>
            <span className="block h-2 rounded bg-slate-100"><span className="block h-2 rounded" style={{ width: `${max > Z ? Number((i.valor * BigInt(1000)) / max) / 10 : 0}%`, background: COR_SERIE[0] }} /></span>
            <span className="text-right tabular-nums text-slate-500">{total > Z ? pct(i.valor, total) : ''}</span>
            <span className="text-right tabular-nums whitespace-nowrap">{formato(i.valor)}</span>
          </span>
        );
        return (
          <li key={i.nome} title={`${i.nome}: ${formato(i.valor)}`} className="border-b border-slate-100 last:border-0">
            {i.href ? <Link href={i.href} className="block hover:bg-slate-50" scroll={false}>{linha}</Link> : linha}
          </li>
        );
      })}
    </ul>
  );
}

/** Um todo dividido em partes, com a legenda dizendo nome, valor e percentual de cada uma. */
export function BarraPartes({ partes, rotulo }: { partes: { nome: string; valor: bigint; cor?: string }[]; rotulo: string }) {
  const visiveis = partes.filter((p) => p.valor > Z);
  const total = visiveis.reduce((s, p) => s + p.valor, Z);
  if (total === Z) return <p className="text-sm text-slate-500">Aguardando dados coletados.</p>;
  return (
    <div>
      <div className="flex gap-0.5 h-3" role="img" aria-label={`${rotulo}: ${visiveis.map((p) => `${p.nome} ${pct(p.valor, total)}`).join(', ')}`}>
        {visiveis.map((p, i) => <span key={p.nome} title={`${p.nome}: ${brl(p.valor)}`} className="block first:rounded-l-full last:rounded-r-full" style={{ width: `${Number((p.valor * BigInt(1000)) / total) / 10}%`, background: p.cor ?? COR_SERIE[i] }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-600">
        {visiveis.map((p, i) => <li key={p.nome} className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.cor ?? COR_SERIE[i] }} />{p.nome}: <b className="text-slate-900 font-semibold">{brlCurto(p.valor)}</b> · {pct(p.valor, total)}</li>)}
      </ul>
    </div>
  );
}

/** Receita, empenhado, liquidado e pago acumulados no ano, com a tabela equivalente. */
export function EvolucaoAno({ meses }: { meses: MesExecucao[] }) {
  let r = Z, e = Z, l = Z, p = Z;
  const acum = meses.map((m) => { r += m.receita; e += m.empenhado; l += m.liquidado; p += m.pago; return { mes: m.mes, r, e, l, p }; });
  return (
    <>
      <GraficoLinhas titulo="Acumulado no ano" rotulos={acum.map((a) => MES_CURTO[a.mes])} series={[
        { nome: 'Receita', valores: acum.map((a) => reais(a.r)) }, { nome: 'Empenhado', valores: acum.map((a) => reais(a.e)) },
        { nome: 'Liquidado', valores: acum.map((a) => reais(a.l)) }, { nome: 'Pago', valores: acum.map((a) => reais(a.p)) },
      ]} />
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-emerald-700 text-xs">Ver em tabela</summary>
        <div className="overflow-x-auto mt-1">
          <table className="tabela"><thead><tr><th>Até</th><th className="n">Receita</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th></tr></thead>
            <tbody>{acum.map((a) => <tr key={a.mes}><td>{MES_LONGO[a.mes]}</td><td className="n">{brl(a.r)}</td><td className="n">{brl(a.e)}</td><td className="n">{brl(a.l)}</td><td className="n">{brl(a.p)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function QuadroVinculantes({ v }: { v: ResumoVinculantes | null }) {
  if (!v) return <p className="text-sm text-slate-500">Sem receita coletada.</p>;
  return (
    <>
      <p className="text-sm mb-2"><b className="text-2xl">{pct(v.vinculante, v.bruta)}</b> da receita bruta ({brlCurto(v.vinculante)}) só pode ser gasta na finalidade que a lei fixou.</p>
      <BarraPartes rotulo="Receita bruta" partes={[{ nome: 'Vinculante', valor: v.vinculante, cor: COR_SERIE[0] }, { nome: 'Livre', valor: v.livre, cor: '#94a3b8' }, { nome: 'Sem regra definida', valor: v.semRegra, cor: COR_SERIE[3] }]} />
      <div className="overflow-x-auto mt-3">
        <table className="tabela">
          <thead><tr><th>Área</th><th className="n">Recebido</th><th className="n" title="Despesa total da função de governo, não só a parte paga com esta receita">Empenhado na função</th><th>Base legal</th></tr></thead>
          <tbody>{v.areas.map((a) => <tr key={a.area}><td>{a.area}</td><td className="n">{brl(a.recebido)}</td><td className="n">{a.gastoFuncao === null ? '—' : brl(a.gastoFuncao)}</td><td className="text-xs text-slate-500">{a.leis.join(' · ')}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 mt-2">Só as regras legais definidas, sem rateio. O portal não informa a fonte de recurso da despesa: a aplicação na finalidade não pode ser confirmada aqui.</p>
    </>
  );
}

export function TabelaExecucao({ p }: { p: DadosPainel }) {
  const a = p.acumulado, atual = p.orcamento.dotAtual;
  const lin = (n: string, v: bigint, forte = false) => <tr className={forte ? 'font-semibold' : ''}><td>{n}</td><td className="n">{brl(v)}</td><td className="n">{pct(v, atual)}</td></tr>;
  const bruta = (p.receita?.correntes?.arrecadado ?? Z) + (p.receita?.capital?.arrecadado ?? Z);
  return (
    <table className="tabela">
      <thead><tr><th>Município</th><th className="n">Valor</th><th className="n">% do orçamento atual</th></tr></thead>
      <tbody>
        {lin('Orçamento inicial (LOA)', p.orcamento.dotInicial)}{lin('Orçamento atual', atual, true)}{lin('Empenhado', a.empenhado)}{lin('Liquidado', a.liquidado)}{lin('Pago', a.pago)}
        <tr className="border-t-2 border-slate-200"><td>Receita bruta (corrente + capital)</td><td className="n">{brl(bruta)}</td><td className="n">—</td></tr>
        <tr><td>(−) Deduções (FUNDEB e outras)</td><td className="n">{brl(p.receita?.deducoes?.arrecadado ?? Z)}</td><td className="n">—</td></tr>
        <tr className="font-semibold"><td>Receita líquida arrecadada</td><td className="n">{brl(a.receita)}</td><td className="n">{pct(a.receita, a.pago)} do pago</td></tr>
      </tbody>
    </table>
  );
}

export function QuadroRestos({ rp, posicao }: { rp: { processados: PartesRP; naoProcessados: PartesRP }; posicao: string }) {
  const linhas: [string, PartesRP][] = [['Processados', rp.processados], ['Não processados', rp.naoProcessados]];
  return (
    <div className="space-y-4">
      {linhas.map(([nome, x]) => (
        <div key={nome}>
          <p className="text-sm font-semibold mb-1">{nome} <span className="font-normal text-slate-500">· inscrito {brlCurto(x.inscrito)}</span></p>
          <BarraPartes rotulo={`Restos a pagar ${nome}`} partes={[{ nome: 'Pagos', valor: x.pagos, cor: COR_SERIE[0] }, { nome: 'Cancelados', valor: x.cancelados, cor: '#94a3b8' }, { nome: 'Ainda a pagar', valor: x.saldo, cor: COR_SERIE[1] }]} />
        </div>
      ))}
      <p className="text-xs text-slate-500">RREO, Anexo 07, posição em {posicao}. São despesas de anos anteriores, por isso ficam fora da conta de receita × pago do exercício.</p>
    </div>
  );
}

export function SeletorMes({ meses, atual, ano, rotulo = 'Até o mês' }: { meses: number[]; atual: number; ano: number; rotulo?: string }) {
  return (
    <form className="flex items-end gap-2">
      <input type="hidden" name="ano" value={ano} />
      <label className="text-xs text-slate-600">{rotulo}
        <select name="ate" defaultValue={atual} className="campo block mt-0.5">{meses.map((m) => <option key={m} value={m}>{MES_LONGO[m]}</option>)}</select>
      </label>
      <button className="btn-sec">Ver</button>
    </form>
  );
}

export const textoSaldo = (v: bigint) => `${v >= Z ? '+' : '−'} ${brlCurto(abs(v))}`;
