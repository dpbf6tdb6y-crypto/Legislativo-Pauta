// Peças da aba Governança (classes escritas por extenso para o Tailwind encontrar).
import Link from 'next/link';
import { estadoEtapa, niveis, ROTULO_ESTADO, type Bloqueio, type EstadoEtapa, type EtapaRede } from '@/lib/financas/projetos/etapas';

const COR_ESTADO: Record<EstadoEtapa, { selo: string; borda: string; simbolo: string }> = {
  concluida: { selo: 'bg-emerald-100 text-emerald-900', borda: 'border-slate-300', simbolo: '✓' },
  andamento: { selo: 'bg-sky-100 text-sky-900', borda: 'border-slate-300', simbolo: '●' },
  atrasada: { selo: 'bg-red-600 text-white', borda: 'border-red-600 border-2', simbolo: '■' },
  aguardando: { selo: 'bg-amber-100 text-amber-900', borda: 'border-amber-500 border-2', simbolo: '▲' },
  prevista: { selo: 'bg-slate-100 text-slate-700', borda: 'border-slate-300', simbolo: '○' },
  cancelada: { selo: 'bg-slate-200 text-slate-500', borda: 'border-slate-200', simbolo: '×' },
};

export function SeloEstado({ estado }: { estado: EstadoEtapa }) {
  return <span className={`selo ${COR_ESTADO[estado].selo}`}><span aria-hidden="true">{COR_ESTADO[estado].simbolo} </span>{ROTULO_ESTADO[estado]}</span>;
}

export type NomeDe = (orgaoCod: string) => string;

/** Etapas agrupadas por ordem de execução: as da mesma coluna não dependem uma da outra. */
export function Fluxo({ etapas, hoje, nomeDe }: { etapas: EtapaRede[]; hoje: Date; nomeDe: NomeDe }) {
  const vivas = etapas.filter((e) => e.status !== 'cancelada');
  const n = niveis(vivas);
  const colunas = [...new Set(vivas.map((e) => n.get(e.id)!))].sort((a, b) => a - b);
  return (
    <ol className="grid gap-3 lg:grid-flow-col lg:auto-cols-[minmax(190px,1fr)] overflow-x-auto">
      {colunas.map((c) => {
        const daColuna = vivas.filter((e) => n.get(e.id) === c).sort((a, b) => a.ordem - b.ordem);
        return (
          <li key={c} className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600 border-b-2 border-slate-700 pb-1 mb-2">{c}ª ordem{daColuna.length > 1 && <span className="font-normal normal-case text-slate-500"> · podem ocorrer juntas</span>}</h3>
            <ul className="space-y-2">
              {daColuna.map((e) => {
                const estado = estadoEtapa(etapas, e, hoje);
                const antes = etapas.filter((x) => (e.dependeDe ?? []).includes(x.id)).map((x) => x.ordem).sort((a, b) => a - b);
                return (
                  <li key={e.id} className={`rounded-md border bg-white p-2.5 ${COR_ESTADO[estado].borda}`}>
                    <div className="text-xs text-slate-500">Etapa {e.ordem} · {nomeDe(e.orgaoCod)}</div>
                    <div className="text-sm font-medium leading-snug mb-1">{e.titulo}</div>
                    <SeloEstado estado={estado} />
                    <div className="text-xs text-slate-500 mt-1">{antes.length ? `depende da(s) etapa(s) ${antes.join(', ')}` : 'não depende de outra'}</div>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

const situacaoDaCausa = (b: Bloqueio) => (b.diasVencida ? `vencida há ${b.diasVencida} dia(s)` : b.causa.fimPrevisto ? `prazo em ${b.causa.fimPrevisto.toLocaleDateString('pt-BR')}` : 'sem prazo');

export function QuemEsperaQuem({ lista, nomeDe, comProjeto = true }: { lista: Bloqueio[]; nomeDe: NomeDe; comProjeto?: boolean }) {
  if (!lista.length) return <p className="text-sm text-slate-500">Nenhuma etapa retida por outra.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="tabela">
        <thead><tr><th>Quem espera</th><th>Está esperando</th><th>Situação da causa</th>{comProjeto && <th>Projeto</th>}<th className="n">Etapas afetadas</th></tr></thead>
        <tbody>
          {lista.map((b) => (
            <tr key={`${b.etapa.id}-${b.causa.id}`}>
              <td><b>{nomeDe(b.etapa.orgaoCod)}</b><div className="text-xs text-slate-600">{b.etapa.ordem}. {b.etapa.titulo}</div></td>
              <td><b>{nomeDe(b.causa.orgaoCod)}</b><div className="text-xs text-slate-600">{b.causa.ordem}. {b.causa.titulo}</div></td>
              <td><span className={b.diasVencida ? 'text-red-700 font-semibold' : ''}>{situacaoDaCausa(b)}</span></td>
              {comProjeto && <td><Link href={`/dashboard/governanca/projetos/${b.projetoId}`} className="text-[#0f4c81] hover:underline">{b.titulo}</Link></td>}
              <td className="n">{b.afetadas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Cartao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="cartao">
      <h2 className="font-semibold">{titulo}{nota && <span className="text-xs font-normal text-slate-500"> · {nota}</span>}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
