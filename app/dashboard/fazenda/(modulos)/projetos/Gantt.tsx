// Cronograma (Gantt) de projetos: uma linha por projeto, agrupado por secretaria. Sem biblioteca: só divs posicionadas em %.
import Link from 'next/link';
import type { ProjetoCompleto } from '@/lib/financas/projetos/dados';
import { posicaoBarra, posicaoMarco, type Escala } from '@/lib/financas/projetos/gantt';
import { ROTULO_FASE, type Fase } from '@/lib/financas/projetos/regras';
import { COR_SAUDE, fmtData } from './Selos';

export interface GrupoGantt { orgaoCod: string; orgaoNome: string; itens: { p: ProjetoCompleto; papel: string }[] }

const COR_ETAPA: Record<string, string> = { concluida: 'bg-emerald-600', andamento: 'bg-sky-500', pendente: 'bg-slate-300', cancelada: 'bg-slate-200' };

function Grade({ escala }: { escala: Escala }) {
  return (
    <>
      {escala.colunas.map((c) => <div key={c.esquerdaPct} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${c.esquerdaPct}%` }} />)}
      {escala.hojePct !== null && <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${escala.hojePct}%` }} title="hoje" />}
    </>
  );
}

export default function Gantt({ escala, grupos, mostrarEtapas, hoje }: { escala: Escala; grupos: GrupoGantt[]; mostrarEtapas: boolean; hoje: Date }) {
  const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1000px]">
        {/* cabeçalho de tempo */}
        <div className="grid grid-cols-[18rem_1fr] sticky top-0 bg-white z-10">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 py-2 px-2 bg-slate-50 border-b border-slate-200">Projeto</div>
          <div className="relative bg-slate-50 border-b border-slate-200">
            <div className="relative h-5">
              {escala.grupos.map((g) => (
                <div key={g.rotulo} className="absolute top-0 h-5 text-xs font-semibold text-slate-600 border-l border-slate-300 pl-1 overflow-hidden" style={{ left: `${g.esquerdaPct}%`, width: `${g.larguraPct}%` }}>{g.rotulo}</div>
              ))}
            </div>
            <div className="relative h-5">
              {escala.colunas.map((c) => (
                <div key={c.esquerdaPct} className="absolute top-0 h-5 text-[11px] text-slate-500 border-l border-slate-200 pl-1 overflow-hidden" style={{ left: `${c.esquerdaPct}%`, width: `${c.larguraPct}%` }}>{c.rotulo}</div>
              ))}
              {escala.hojePct !== null && <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${escala.hojePct}%` }} />}
            </div>
          </div>
        </div>

        {grupos.map((g) => (
          <section key={g.orgaoCod}>
            <div className="grid grid-cols-[18rem_1fr] bg-slate-100 border-b border-slate-200">
              <div className="px-2 py-1 text-sm font-semibold">{g.orgaoCod} · {g.orgaoNome}</div>
              <div className="px-2 py-1 text-xs text-slate-500">{g.itens.length} projeto(s)</div>
            </div>
            {g.itens.map(({ p, papel }) => {
              const barra = posicaoBarra(escala, p.inicioPrevisto, p.fimPrevisto);
              const cor = COR_SAUDE[p.saude];
              const original = p.fimPrevistoOriginal && p.fimPrevisto && p.fimPrevistoOriginal.getTime() !== p.fimPrevisto.getTime() ? posicaoMarco(escala, p.fimPrevistoOriginal) : null;
              const etapas = mostrarEtapas ? p.etapas.filter((e) => e.status !== 'cancelada') : [];
              return (
                <div key={p.id}>
                  <div className="grid grid-cols-[18rem_1fr] border-b border-slate-100 hover:bg-slate-50">
                    <div className="px-2 py-1 text-sm flex items-center gap-2 min-w-0">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cor.ponto}`} title={p.saude} />
                      <div className="min-w-0">
                        <Link href={`/dashboard/fazenda/projetos/${p.id}`} className="text-[#0f4c81] hover:underline block truncate" title={p.titulo}>{p.titulo}</Link>
                        <div className="text-[11px] text-slate-500 truncate">
                          {ROTULO_FASE[p.fase as Fase]}{papel !== 'lider' ? ' · em parceria' : p.secretarias.length > 1 ? ` · com ${p.secretarias.length - 1} parceira(s)` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="relative h-9">
                      <Grade escala={escala} />
                      {barra && (
                        <div
                          className={`absolute top-2 h-5 ${cor.barra} ${barra.cortadaEsq ? '' : 'rounded-l'} ${barra.cortadaDir ? '' : 'rounded-r'} overflow-hidden ${p.fase === 'paralisado' ? 'opacity-70' : ''}`}
                          style={{ left: `${barra.esquerdaPct}%`, width: `${barra.larguraPct}%` }}
                          title={`${p.titulo}\n${ROTULO_FASE[p.fase as Fase]} · ${p.avanco ?? 0}% · ${fmtData(p.inicioPrevisto)} → ${fmtData(p.fimPrevisto)}${p.motivos[0] ? `\n${p.motivos[0]}` : ''}`}
                        >
                          <div className={`h-full ${cor.preenchimento}`} style={{ width: `${p.avanco ?? 0}%` }} />
                        </div>
                      )}
                      {original !== null && <div className="absolute top-1 bottom-1 w-0.5 bg-slate-800" style={{ left: `${original}%` }} title={`Prazo original: ${fmtData(p.fimPrevistoOriginal)}`} />}
                      {!barra && <div className="absolute inset-y-0 left-2 flex items-center text-xs text-slate-400">{p.inicioPrevisto || p.fimPrevisto ? 'fora do período mostrado' : 'sem datas definidas'}</div>}
                    </div>
                  </div>
                  {etapas.map((e) => {
                    const vencida = (e.status === 'pendente' || e.status === 'andamento') && e.fimPrevisto && e.fimPrevisto < h0;
                    const b = e.marco ? null : posicaoBarra(escala, e.inicioPrevisto, e.fimPrevisto);
                    const m = e.marco || (!e.inicioPrevisto && e.fimPrevisto) ? posicaoMarco(escala, e.fimPrevisto) : null;
                    const corE = vencida ? 'bg-red-500' : COR_ETAPA[e.status];
                    return (
                      <div key={e.id} className="grid grid-cols-[18rem_1fr] border-b border-slate-50">
                        <div className="pl-7 pr-2 py-0.5 text-xs text-slate-600 truncate" title={e.titulo}>{e.marco ? '◆' : '▸'} {e.titulo}</div>
                        <div className="relative h-5">
                          <Grade escala={escala} />
                          {b && <div className={`absolute top-1.5 h-2 rounded ${corE}`} style={{ left: `${b.esquerdaPct}%`, width: `${b.larguraPct}%` }} title={`${e.titulo} · ${fmtData(e.inicioPrevisto)} → ${fmtData(e.fimPrevisto)}`} />}
                          {m !== null && <div className={`absolute top-1 w-3 h-3 rotate-45 -ml-1.5 ${corE}`} style={{ left: `${m}%` }} title={`${e.titulo} · ${fmtData(e.fimPrevisto)}`} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
