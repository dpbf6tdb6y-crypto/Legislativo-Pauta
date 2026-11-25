// Gráficos do andamento de um projeto: o termômetro de prazo (tempo gasto × avanço das etapas) e a linha do tempo das etapas.
// Componentes de servidor, só HTML/SVG. Descrevem o que as secretarias registraram; não julgam o mérito do projeto.
import Medidor from '@/app/dashboard/fazenda/_componentes/Medidor';
import type { Nivel } from '@/lib/financas/painel/fiscal';
import { diasEntre, type Saude } from '@/lib/financas/projetos/regras';
import { COR_SAUDE, fmtData } from './Selos';

const limita = (v: number) => Math.max(0, Math.min(100, v));
const NIVEL: Record<Saude, Nivel> = { no_prazo: 'ok', atencao: 'observacao', atrasado: 'atencao', paralisado: 'observacao', planejamento: 'ok', concluido: 'ok', cancelado: 'observacao' };
const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export interface DadosTermometro {
  inicio: Date | null; fim: Date | null; hoje: Date; avanco: number | null; saude: Saude; fase: string; diasAtraso: number; fimReal: Date | null;
}

export function Termometro({ inicio, fim, hoje, avanco, saude, fase, diasAtraso, fimReal }: DadosTermometro) {
  const cor = COR_SAUDE[saude];
  const encerrado = fase === 'concluido' || fase === 'cancelado';
  const temPrazo = !!inicio && !!fim && diasEntre(inicio, fim) > 0;
  const decorrido = temPrazo ? limita((diasEntre(inicio!, dia(hoje)) * 100) / diasEntre(inicio!, fim!)) : null;
  const esperado = decorrido !== null && !encerrado ? Math.round(decorrido) : null;
  const restam = fim ? diasEntre(dia(hoje), fim) : null;
  const diferenca = avanco !== null && esperado !== null ? avanco - esperado : null;

  const titulo = fase === 'concluido' ? `Concluído${fimReal ? ` em ${fmtData(fimReal)}` : ''}`
    : fase === 'cancelado' ? 'Projeto cancelado'
    : fase === 'ideia' || fase === 'estudo' ? 'Ainda em planejamento'
    : fase === 'paralisado' ? 'Projeto paralisado'
    : restam === null ? 'Sem prazo definido'
    : restam < 0 ? `Prazo vencido há ${-restam} dia(s)`
    : restam === 0 ? 'O prazo termina hoje'
    : `Faltam ${restam} dia(s) para o prazo`;
  const frase = diferenca === null ? (avanco === null ? 'Sem etapas: o avanço ainda não pode ser medido.' : '')
    : diferenca >= 0 ? `No ritmo: ${diferenca} ponto(s) à frente do esperado pelo calendário.` : `${-diferenca} ponto(s) atrás do esperado pelo calendário.`;

  return (
    <section className="cartao" aria-label="Termômetro de prazo">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="shrink-0">
          {avanco !== null ? (
            <Medidor valor={avanco} escala={100} marcas={esperado !== null ? [{ valor: esperado, rotulo: 'Esperado pelo calendário' }] : []}
              nivel={NIVEL[saude]} texto={`${avanco}%`} rotulo="das etapas concluídas" largura="max-w-[170px]" />
          ) : <div className="w-[170px] text-center text-xs text-slate-500">Inclua etapas para medir o avanço</div>}
        </div>
        <div className="flex-1 min-w-[260px]">
          <div className={`text-lg font-semibold ${saude === 'atrasado' ? 'text-red-700' : saude === 'atencao' ? 'text-amber-800' : 'text-slate-900'}`}>{titulo}</div>
          {frase && <div className="text-sm text-slate-600">{frase}</div>}

          {temPrazo ? (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-0.5"><span>Tempo do prazo · {Math.round(decorrido!)}% decorrido</span><span>{diasEntre(inicio!, fim!)} dias no total</span></div>
                <div className="relative h-3 rounded bg-slate-200" role="img" aria-label={`${Math.round(decorrido!)}% do prazo decorrido`}>
                  <div className="absolute inset-y-0 left-0 rounded bg-slate-500" style={{ width: `${decorrido}%` }} />
                  <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900" style={{ left: `${decorrido}%` }} title="hoje" />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 mt-0.5"><span>início {fmtData(inicio)}</span><span>prazo {fmtData(fim)}</span></div>
              </div>
              {avanco !== null && (
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-0.5"><span>Avanço das etapas · {avanco}%</span>{esperado !== null && <span>esperado hoje: {esperado}%</span>}</div>
                  <div className="relative h-3 rounded bg-slate-200">
                    <div className={`absolute inset-y-0 left-0 rounded ${cor.preenchimento}`} style={{ width: `${avanco}%` }} />
                    {esperado !== null && <div className="absolute -top-1 -bottom-1 w-0.5 bg-slate-900" style={{ left: `${esperado}%` }} title="esperado pelo calendário" />}
                  </div>
                </div>
              )}
              {diasAtraso > 0 && <div className="text-xs text-red-700">Maior atraso: {diasAtraso} dia(s).</div>}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-2">Defina o início e o fim previstos (em “Editar dados do projeto”) para ver o termômetro de prazo.</p>
          )}
          <p className="text-[11px] text-slate-400 mt-3">O traço preto marca onde o projeto deveria estar hoje. Quanto mais o avanço fica à esquerda do traço, mais atrasado o ritmo.</p>
        </div>
      </div>
    </section>
  );
}

export interface EtapaLinha { id: number; titulo: string; marco: boolean; status: string; inicioPrevisto: Date | null; fimPrevisto: Date | null }

const COR_ETAPA: Record<string, string> = { concluida: 'bg-emerald-600', andamento: 'bg-sky-500', pendente: 'bg-slate-400', cancelada: 'bg-slate-300' };

/** Cada etapa em uma linha, posicionada no calendário do projeto, com o traço de hoje. */
export function LinhaDoTempo({ etapas, inicio, fim, hoje }: { etapas: EtapaLinha[]; inicio: Date | null; fim: Date | null; hoje: Date }) {
  const comData = etapas.filter((e) => e.fimPrevisto);
  if (!comData.length) return null;
  const pontas = [inicio, fim, ...comData.flatMap((e) => [e.inicioPrevisto, e.fimPrevisto])].filter(Boolean) as Date[];
  const ini = new Date(Math.min(...pontas.map((d) => d.getTime()))), fi = new Date(Math.max(...pontas.map((d) => d.getTime())));
  const total = Math.max(1, diasEntre(ini, fi));
  const pos = (d: Date) => limita((diasEntre(ini, d) * 100) / total);
  const h = dia(hoje), hojeNoIntervalo = h >= ini && h <= fi;
  return (
    <div className="mb-3" aria-label="Linha do tempo das etapas">
      <div className="flex justify-between text-[11px] text-slate-500 mb-1"><span>{fmtData(ini)}</span><span>linha do tempo das etapas</span><span>{fmtData(fi)}</span></div>
      <div className="space-y-1">
        {comData.map((e) => {
          const aberta = e.status === 'pendente' || e.status === 'andamento';
          const vencida = aberta && e.fimPrevisto! < h;
          const fimPos = pos(e.fimPrevisto!), iniPos = e.marco || !e.inicioPrevisto ? Math.max(0, fimPos - 1.5) : pos(e.inicioPrevisto);
          const cor = vencida ? 'bg-red-600' : COR_ETAPA[e.status] ?? 'bg-slate-400';
          return (
            <div key={e.id} className="grid items-center gap-2" style={{ gridTemplateColumns: 'minmax(0,12rem) 1fr' }} title={`${e.titulo}: ${e.marco ? fmtData(e.fimPrevisto) : `${fmtData(e.inicioPrevisto)} → ${fmtData(e.fimPrevisto)}`}`}>
              <span className={`truncate text-xs ${e.status === 'cancelada' ? 'line-through text-slate-400' : ''}`}>{e.marco ? '◆ ' : ''}{e.titulo}</span>
              <div className="relative h-4 rounded bg-slate-100">
                {hojeNoIntervalo && <div className="absolute inset-y-0 w-px bg-slate-900/70 z-10" style={{ left: `${pos(h)}%` }} />}
                {e.marco
                  ? <div className={`absolute top-0.5 h-3 w-3 rotate-45 ${cor}`} style={{ left: `calc(${fimPos}% - 6px)` }} />
                  : <div className={`absolute inset-y-0.5 rounded ${cor}`} style={{ left: `${iniPos}%`, width: `${Math.max(1.5, fimPos - iniPos)}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mt-1.5">
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600 mr-1" />concluída</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500 mr-1" />em andamento</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-400 mr-1" />a fazer</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600 mr-1" />vencida</span>
        <span><i className="inline-block w-px h-3 bg-slate-900 mr-1 align-middle" />hoje</span>
      </div>
    </div>
  );
}
