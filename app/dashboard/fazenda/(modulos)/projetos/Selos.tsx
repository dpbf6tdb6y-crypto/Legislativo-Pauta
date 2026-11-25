// Selos e cores da carteira de projetos (classes escritas por extenso para o Tailwind encontrar).
import { nivelMaximo, type Alerta, type NivelAlerta } from '@/lib/financas/projetos/financeiro';
import { ROTULO_FASE, ROTULO_SAUDE, type Fase, type Saude } from '@/lib/financas/projetos/regras';

export const COR_SAUDE: Record<Saude, { selo: string; barra: string; preenchimento: string; ponto: string }> = {
  no_prazo: { selo: 'bg-emerald-100 text-emerald-900', barra: 'bg-emerald-200', preenchimento: 'bg-emerald-600', ponto: 'bg-emerald-500' },
  atencao: { selo: 'bg-amber-100 text-amber-900', barra: 'bg-amber-200', preenchimento: 'bg-amber-500', ponto: 'bg-amber-500' },
  atrasado: { selo: 'bg-red-600 text-white', barra: 'bg-red-200', preenchimento: 'bg-red-600', ponto: 'bg-red-600' },
  paralisado: { selo: 'bg-slate-300 text-slate-800', barra: 'bg-slate-200', preenchimento: 'bg-slate-500', ponto: 'bg-slate-500' },
  planejamento: { selo: 'bg-sky-100 text-sky-900', barra: 'bg-sky-200', preenchimento: 'bg-sky-500', ponto: 'bg-sky-400' },
  concluido: { selo: 'bg-emerald-800 text-white', barra: 'bg-emerald-300', preenchimento: 'bg-emerald-800', ponto: 'bg-emerald-800' },
  cancelado: { selo: 'bg-slate-200 text-slate-600', barra: 'bg-slate-100', preenchimento: 'bg-slate-400', ponto: 'bg-slate-400' },
};

export function SeloSaude({ saude, diasAtraso }: { saude: Saude; diasAtraso?: number }) {
  return (
    <span className={`selo ${COR_SAUDE[saude].selo}`}>
      {saude === 'atrasado' && diasAtraso ? `atrasado ${diasAtraso} d` : ROTULO_SAUDE[saude]}
    </span>
  );
}

export function SeloFase({ fase }: { fase: string }) {
  return <span className="selo bg-slate-100 text-slate-700 border border-slate-200">{ROTULO_FASE[fase as Fase] ?? fase}</span>;
}

export function BarraAvanco({ pct, saude }: { pct: number | null; saude: Saude }) {
  if (pct === null) return <span className="text-xs text-slate-400">sem etapas</span>;
  return (
    <div className="flex items-center gap-2" title={`${pct}% das etapas concluídas`}>
      <div className="h-2 w-20 rounded bg-slate-200 overflow-hidden"><div className={`h-full ${COR_SAUDE[saude].preenchimento}`} style={{ width: `${pct}%` }} /></div>
      <span className="text-xs tabular-nums text-slate-600">{pct}%</span>
    </div>
  );
}

export const COR_ALERTA: Record<NivelAlerta, { selo: string; caixa: string }> = {
  alto: { selo: 'bg-red-100 text-red-900 border border-red-300', caixa: 'border-red-300 bg-red-50' },
  medio: { selo: 'bg-amber-100 text-amber-900 border border-amber-300', caixa: 'border-amber-300 bg-amber-50' },
  info: { selo: 'bg-slate-100 text-slate-700 border border-slate-200', caixa: 'border-slate-200 bg-slate-50' },
};

/** Quadro de alertas (gasto, riscos e metas) no alto da ficha. */
export function QuadroAlertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return null;
  return (
    <ul className="space-y-1">
      {alertas.map((a) => (
        <li key={a.codigo} className={`rounded border px-2 py-1 text-sm ${COR_ALERTA[a.nivel].caixa}`}>
          <b className="text-xs uppercase mr-1">{a.nivel === 'alto' ? 'grave' : a.nivel === 'medio' ? 'atenção' : 'aviso'}</b>{a.texto}
        </li>
      ))}
    </ul>
  );
}

/** Contagem de alertas de gasto com a cor do mais grave; some quando não há nenhum. */
export function SeloAlertas({ alertas }: { alertas: Alerta[] }) {
  const n = nivelMaximo(alertas);
  if (!n) return null;
  const graves = alertas.filter((a) => a.nivel !== 'info').length;
  const texto = graves ? `${graves} alerta(s)` : `${alertas.length} aviso(s)`;
  return <span className={`selo ${COR_ALERTA[n].selo}`} title={alertas.map((a) => a.texto).join('\n')}>{texto}</span>;
}

export const fmtData =(d: Date | null | undefined) => (d ? d.toLocaleDateString('pt-BR') : '—');

/** Data local como yyyy-mm-dd (para campos de data); toISOString usaria UTC e viraria o dia à noite no Brasil. */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
