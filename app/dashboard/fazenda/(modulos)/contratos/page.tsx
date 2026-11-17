import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl, pct } from '@/lib/financas/dinheiro';
import { resumoContratos } from '@/lib/financas/painel/contratos';

const d = (x: Date | null) => (x ? x.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

export default async function Contratos({ searchParams }: { searchParams: { q?: string; situacao?: string; pg?: string } }) {
  const q = (searchParams.q ?? '').trim();
  const situacao = searchParams.situacao ?? 'Contrato Vigente';
  const pg = Math.max(1, Number(searchParams.pg ?? 1));
  const { db } = await exigir('contratos', 'Contratos', { detalhe: `busca="${q}" situação="${situacao}"`, acao: q ? 'buscar' : 'ver', modulo: 'contratos' });

  const where: any = { AND: [] };
  if (situacao) where.AND.push({ situacao });
  if (q) {
    const num = q.match(/^(\d{1,5})\s*\/\s*(\d{4})$/);
    where.AND.push(num ? { numero: { endsWith: num[1].padStart(3, '0').slice(-3) }, ano: Number(num[2]) } : { OR: [{ fornecedorNome: { contains: q } }, { objeto: { contains: q } }, { fornecedorDoc: { contains: q.replace(/\D/g, '') || '#' } }] });
  }
  const total = await db.contrato.count({ where });
  const totalGeral = await db.contrato.count();
  // totais, vencimentos e fornecedores seguem o mesmo filtro da tabela (situação e busca)
  const resumo = resumoContratos(
    await db.contrato.findMany({ where, select: { id: true, numero: true, ano: true, situacao: true, objeto: true, fornecedorNome: true, fim: true, valorAtual: true } }),
    new Date(),
  );
  const lista = await db.contrato.findMany({ where, orderBy: [{ ano: 'desc' }, { numero: 'desc' }], skip: (pg - 1) * 50, take: 50 });
  const situacoes = (await db.contrato.findMany({ distinct: ['situacao'], select: { situacao: true } })).map((s) => s.situacao).sort();

  // empenhado/pago ligado (todas as certezas) por contrato da página
  const ligs = await db.ligacaoContratoEmpenho.findMany({ where: { contratoId: { in: lista.map((c) => c.id) } } });
  const emps = await db.empenho.findMany({ where: { id: { in: ligs.map((l) => l.empenhoId) } }, include: { pagamentos: { select: { valor: true } } } });
  const porC = new Map<number, { emp: bigint; pag: bigint; alta: number; media: number }>();
  for (const l of ligs) {
    const e = emps.find((x) => x.id === l.empenhoId)!;
    const acc = porC.get(l.contratoId) ?? { emp: BigInt(0), pag: BigInt(0), alta: 0, media: 0 };
    acc.emp += e.valor - e.anulado;
    acc.pag += e.pagamentos.reduce((s, p) => s + p.valor, BigInt(0));
    if (l.certeza === 'alta') acc.alta++; else acc.media++;
    porC.set(l.contratoId, acc);
  }
  const hoje = new Date();
  const em90 = new Date(hoje.getTime() + 90 * 86400000);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-lg font-semibold mr-auto">Contratos</h1>
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="credor, CNPJ, objeto ou 252/2025" className="campo w-64" />
          <select name="situacao" defaultValue={situacao} className="campo">
            <option value="">Todas as situações</option>
            {situacoes.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-sec">Buscar</button>
        </form>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="cartao"><div className="text-xs text-slate-500">{situacao === 'Contrato Vigente' ? 'Contratos vigentes' : 'Contratos no filtro'}</div><div className="text-2xl font-bold">{resumo.quantidade}</div><div className="text-xs text-slate-500">de {totalGeral} no total</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Valor contratado</div><div className="text-2xl font-bold tabular-nums">{brl(resumo.valorTotal)}</div><div className="text-xs text-slate-500">soma do filtro atual (valor atual dos contratos)</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Vencendo em 90 dias</div><div className={`text-2xl font-bold ${resumo.vencimentos.length ? 'text-amber-700' : ''}`}>{resumo.vencimentos.length}</div><div className="text-xs text-slate-500">{resumo.vencimentos.length ? `${brl(resumo.valorVencendo)} em jogo` : 'nenhum no filtro atual'}</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Maior fornecedor</div><div className="text-sm font-semibold leading-tight mt-1">{resumo.fornecedores[0]?.nome ?? '—'}</div><div className="text-xs text-slate-500">{resumo.fornecedores[0] ? `${brl(resumo.fornecedores[0].valor)} · ${pct(resumo.fornecedores[0].valor, resumo.valorTotal)} do total` : ''}</div></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="cartao">
          <h2 className="font-semibold mb-1">Vencimentos próximos · contratos vigentes que terminam em até 90 dias</h2>
          <p className="text-xs text-slate-500 mb-2">Renovação ou nova licitação precisa começar antes do vencimento (Lei 14.133/2021).</p>
          {!resumo.vencimentos.length ? <p className="text-sm text-slate-500">Nenhum contrato vencendo nos próximos 90 dias neste filtro.</p> : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {resumo.vencimentos.map((v) => (
                <li key={v.id} className="py-1.5 flex gap-2 text-sm">
                  <span className={`selo shrink-0 h-fit ${v.dias <= 30 ? 'bg-red-100 text-red-900' : v.dias <= 60 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{v.dias === 0 ? 'hoje' : `${v.dias} dias`}</span>
                  <span className="min-w-0 flex-1">
                    <Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/contratos/${v.id}`}>{v.numero}/{v.ano}</Link> · {v.fornecedorNome}
                    <span className="block text-xs text-slate-500 break-words">{v.objeto.slice(0, 110)}{v.objeto.length > 110 ? '…' : ''} · vence {d(v.fim)}</span>
                  </span>
                  <span className="tabular-nums text-right shrink-0">{brl(v.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao">
          <h2 className="font-semibold mb-1">Maiores fornecedores</h2>
          <p className="text-xs text-slate-500 mb-2">Valor contratado (não o pago), somando os contratos de cada credor no filtro atual.</p>
          {!resumo.fornecedores.length ? <p className="text-sm text-slate-500">Sem contratos neste filtro.</p> : (
            <ul className="space-y-1.5">
              {resumo.fornecedores.map((f) => (
                <li key={f.nome} className="text-sm" title={`${f.contratos} contrato(s)`}>
                  <div className="flex justify-between gap-2"><span className="min-w-0 break-words">{f.nome}</span><span className="tabular-nums shrink-0">{brl(f.valor)} · {pct(f.valor, resumo.valorTotal)}</span></div>
                  <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-emerald-600" style={{ width: `${Math.min(Number((f.valor * BigInt(100)) / (resumo.fornecedores[0].valor || BigInt(1))), 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {total} contrato(s). Empenhado/pago = empenhos ligados ao contrato. O portal não informa essa ligação: ela é deduzida
        (<b>alta</b>: descrição do empenho cita o contrato e o CNPJ confere; <b>média</b>: único contrato vigente do credor na data). Valores parciais: só empenhos já coletados.
      </p>
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead><tr><th>Contrato</th><th>Credor</th><th>Objeto</th><th>Vigência</th><th className="n">Valor atual</th><th className="n">Empenhado ligado</th><th className="n">Pago ligado</th><th>Ligações</th></tr></thead>
          <tbody>
            {lista.map((c) => {
              const a = porC.get(c.id);
              const vencendo = c.fim && c.fim >= hoje && c.fim <= em90;
              return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap"><Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/contratos/${c.id}`}>{c.numero}/{c.ano}</Link><div className="text-xs text-slate-500">{c.situacao}</div></td>
                  <td>{c.fornecedorNome}<div className="text-xs text-slate-500">{c.fornecedorDoc}</div></td>
                  <td className="max-w-md text-xs">{c.objeto.slice(0, 160)}{c.objeto.length > 160 ? '…' : ''}</td>
                  <td className="whitespace-nowrap text-xs">{d(c.inicio)} → {d(c.fim)} {vencendo && <span className="selo bg-amber-100 text-amber-900">vence em até 90 dias</span>}</td>
                  <td className="n">{brl(c.valorAtual)}</td>
                  <td className="n">{a ? brl(a.emp) : '—'}</td>
                  <td className="n">{a ? brl(a.pag) : '—'}</td>
                  <td className="text-xs whitespace-nowrap">{a ? `${a.alta} alta · ${a.media} média` : 'nenhuma'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 text-sm">
        {pg > 1 && <Link className="btn-sec" href={{ query: { ...searchParams, pg: pg - 1 } }}>← anterior</Link>}
        {pg * 50 < total && <Link className="btn-sec" href={{ query: { ...searchParams, pg: pg + 1 } }}>próxima →</Link>}
      </div>
    </div>
  );
}
