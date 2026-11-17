import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { pode } from '@/lib/financas/perfis';
import { acaoGerarRelatorio } from './acoes';

// Relatórios de auditoria interna guardados. Cada um é uma fotografia: não muda depois de gerado.
export default async function Relatorios() {
  const { s, db } = await exigir('apontamentos', 'Relatório de auditoria');
  const lista = await db.relatorioAuditoria.findMany({
    orderBy: { id: 'desc' }, take: 100,
    select: { id: true, geradoEm: true, geradoPor: true, sha256: true, criticos: true, atencao: true },
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Relatório de auditoria interna</h1>
          <p className="text-xs text-slate-500">
            Roda todos os pontos de controle (limites legais, equilíbrio, contratos, pessoal, prazos), junta apontamentos e cobranças às
            secretarias e guarda o resultado com data e SHA-256: o histórico prova o que o relatório mostrava em cada data.
          </p>
        </div>
        {pode(s.perfil, 'auditoria_gerir') && <form action={acaoGerarRelatorio}><button className="btn">Gerar relatório agora</button></form>}
      </div>
      <div className="cartao overflow-x-auto">
        {lista.length === 0 ? <p className="text-sm text-slate-500">Nenhum relatório gerado ainda.</p> : (
          <table className="tabela">
            <thead><tr><th>Nº</th><th>Gerado em</th><th>Por</th><th className="n">Críticos</th><th className="n">Atenção</th><th>SHA-256</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/dashboard/fazenda/relatorio/${r.id}`} className="text-emerald-700 hover:underline">#{r.id}</Link></td>
                  <td>{r.geradoEm.toLocaleString('pt-BR')}</td><td>{r.geradoPor}</td>
                  <td className="n">{r.criticos ? <span className="text-red-700 font-semibold">{r.criticos}</span> : 0}</td>
                  <td className="n">{r.atencao}</td>
                  <td className="font-mono text-xs text-slate-500">{r.sha256.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
