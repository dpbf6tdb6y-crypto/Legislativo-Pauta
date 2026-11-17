import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brlCurto, pctBp } from '@/lib/financas/dinheiro';
import { visaoGeral } from '@/lib/financas/auditoria/dados';

const fmt = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—');

export default async function Auditoria() {
  const { db } = await exigir('auditoria', 'Auditoria por secretaria');
  const hoje = new Date();
  const v = await visaoGeral(db, hoje);
  // quem tem atraso primeiro, depois quem tem mais pontos abertos
  const linhas = [...v.linhas].sort((a, b) => b.pontos.atrasados - a.pontos.atrasados || b.pontos.abertos + b.pontos.respondidos - (a.pontos.abertos + a.pontos.respondidos) || a.orgaoCod.localeCompare(b.orgaoCod));
  const primeiraComPendencia = linhas.find((l) => l.pontos.abertos + l.pontos.respondidos > 0) ?? linhas[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Auditoria por secretaria</h1>
          <p className="text-sm text-slate-600">Pontos cobrados de cada secretaria, com responsável, prazo e resposta. Tudo fica registrado.</p>
        </div>
        {primeiraComPendencia && <Link href={`/dashboard/fazenda/reuniao/${primeiraComPendencia.orgaoCod}`} className="btn text-base px-4 py-2">▶ Modo reunião</Link>}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {([
          ['Aguardando as secretarias', v.total.abertos, ''],
          ['Atrasados', v.total.atrasados, v.total.atrasados ? 'text-red-700' : ''],
          ['Vencem em 7 dias', v.total.venceEmBreve, v.total.venceEmBreve ? 'text-amber-700' : ''],
          ['Respondidos, falta validar', v.total.respondidos, v.total.respondidos ? 'text-sky-800' : ''],
        ] as const).map(([r, n, c]) => (
          <div key={r} className="cartao"><div className="text-xs text-slate-500">{r}</div><div className={`text-3xl font-bold ${c}`}>{n}</div></div>
        ))}
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr><th>Secretaria</th><th>Responsável</th><th className="n">Abertos</th><th className="n">Atrasados</th><th className="n">Para validar</th><th className="n">Empenhado</th><th className="n">Saldo da dotação</th><th>Última reunião</th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.orgaoCod} className="hover:bg-slate-50">
                <td><Link href={`/dashboard/fazenda/auditoria/${l.orgaoCod}`} className="text-emerald-700 hover:underline">{l.orgaoCod} · {l.orgaoNome}</Link></td>
                <td className={l.responsavel ? '' : 'text-slate-400'}>{l.responsavel || 'não definido'}</td>
                <td className="n">{l.pontos.abertos || ''}</td>
                <td className={`n ${l.pontos.atrasados ? 'text-red-700 font-bold' : ''}`}>{l.pontos.atrasados || ''}</td>
                <td className="n">{l.pontos.respondidos || ''}</td>
                <td className="n" title={`ano decorrido: ${pctBp(v.tempoBp)}`}>{pctBp(l.empenhadoBp)}</td>
                <td className={`n ${l.saldo < BigInt(0) ? 'text-red-700 font-semibold' : ''}`}>{brlCurto(l.saldo)}</td>
                <td>{fmt(l.ultimaReuniao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-2">
          {v.ano} · Executivo (a Câmara não entra: o prefeito não cobra o Legislativo). Empenhado = parte da dotação atualizada já comprometida; {pctBp(v.tempoBp)} do ano já passou.
        </p>
      </div>
    </div>
  );
}
