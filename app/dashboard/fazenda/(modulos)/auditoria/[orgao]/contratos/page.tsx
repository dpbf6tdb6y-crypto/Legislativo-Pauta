// Contratos da secretaria: o que ela contratou, quanto empenhou/liquidou/pagou em cada um e o que está para vencer.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto } from '@/lib/financas/dinheiro';
import { contratosSecretaria } from '@/lib/financas/auditoria/dados';

const d = (x: Date | null) => (x ? x.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

export default async function ContratosDaSecretaria({ params, searchParams }: { params: { orgao: string }; searchParams: { ver?: string } }) {
  const { db } = await exigir('contratos', 'Contratos da secretaria', { detalhe: `secretaria ${params.orgao}`, modulo: 'contratos' });
  const r = await contratosSecretaria(db, params.orgao, new Date());
  if (!r) notFound();
  const todos = searchParams.ver === 'todos';
  const linhas = todos ? r.linhas : r.linhas.filter((c) => c.vigente);
  const outros = r.linhas.length - r.vigentes;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link href={`/dashboard/fazenda/auditoria/${r.orgao.orgaoCod}`} className="text-xs text-emerald-700 hover:underline">← {r.orgao.orgaoNome}</Link>
          <h1 className="text-lg font-semibold">Contratos da secretaria · {r.orgao.orgaoCod} · {r.orgao.orgaoNome}</h1>
          <p className="text-sm text-slate-600">Contratos ligados aos empenhos desta secretaria em {r.ano}.</p>
        </div>
        {outros > 0 && <Link href={todos ? '?' : '?ver=todos'} className="btn-sec">{todos ? 'só os vigentes' : `incluir ${outros} não vigente(s)`}</Link>}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {([
          ['Contratos vigentes', String(r.vigentes), `${r.linhas.length} no total`, ''],
          ['Vencem em 90 dias', String(r.vencendo90), 'vigentes com fim próximo', r.vencendo90 ? 'text-amber-700' : ''],
          ['Empenhado', brlCurto(r.totais.empenhado), 'nestes contratos, por esta secretaria', ''],
          ['Liquidado', brlCurto(r.totais.liquidado), 'entregue e atestado', ''],
          ['Pago', brlCurto(r.totais.pago), `${brlCurto(r.totais.liquidado - r.totais.pago)} liquidado e não pago`, ''],
        ] as const).map(([t, v, sub, c]) => (
          <div key={t} className="cartao"><div className="text-xs text-slate-500">{t}</div><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-slate-500">{sub}</div></div>
        ))}
      </div>

      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr><th>Contrato</th><th>Credor</th><th>Objeto</th><th>Vigência</th><th className="n">Valor atual</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th><th>Ligação</th></tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={9} className="text-slate-500 text-center py-4">Nenhum contrato ligado aos empenhos desta secretaria.</td></tr>}
            {linhas.map((c) => {
              const vence = c.vigente && c.diasParaVencer !== null && c.diasParaVencer >= 0 && c.diasParaVencer <= 90;
              return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap"><Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/contratos/${c.id}`}>{c.numero}/{c.ano}</Link><div className="text-xs text-slate-500">{c.situacao}</div></td>
                  <td>{c.fornecedorNome}<div className="text-xs text-slate-500">{c.fornecedorDoc}</div></td>
                  <td className="max-w-md text-xs">{c.objeto.slice(0, 160)}{c.objeto.length > 160 ? '…' : ''}</td>
                  <td className="whitespace-nowrap text-xs">
                    {d(c.inicio)} → {d(c.fim)}
                    {vence && <div><span className="selo bg-amber-100 text-amber-900">vence em {c.diasParaVencer} dia(s)</span></div>}
                  </td>
                  <td className="n">{brl(c.valorAtual)}</td>
                  <td className="n">{brl(c.empenhado)}</td>
                  <td className="n">{brl(c.liquidado)}</td>
                  <td className="n">{brl(c.pago)}</td>
                  <td className="text-xs whitespace-nowrap">{c.certeza === 'alta' ? 'alta' : <span className="selo bg-slate-100 text-slate-700">provável</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        O portal não informa a secretaria do contrato: ela é deduzida pelos empenhos. <b>Alta</b>: a descrição do empenho cita o contrato e o CNPJ confere.
        <b> Provável</b>: é o único contrato vigente do credor na data do empenho{r.provaveis ? ` (${r.provaveis} nesta lista)` : ''}; confirme com a secretaria antes de cobrar.
        Empenhado, liquidado e pago somam só os empenhos desta secretaria; um contrato usado por outra secretaria pode ter mais.
      </p>
    </div>
  );
}
