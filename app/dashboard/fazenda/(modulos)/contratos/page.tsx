import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl } from '@/lib/financas/dinheiro';

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
