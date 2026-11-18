import type { Selo, TipoSelo } from '@/lib/financas/coleta/selos';

const COR: Record<TipoSelo, string> = {
  oficial: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  conferido: 'bg-sky-100 text-sky-900 border-sky-300',
  provisorio: 'bg-slate-100 text-slate-700 border-slate-300',
  divergente: 'bg-amber-100 text-amber-900 border-amber-400',
};

/** Selo de origem do número. O detalhe aparece ao parar o mouse e é lido por leitores de tela. */
export default function SeloDado({ selo }: { selo: Selo }) {
  return (
    <span title={selo.detalhe} aria-label={`${selo.rotulo}: ${selo.detalhe}`} className={`inline-block align-middle text-[11px] font-semibold px-1.5 py-px rounded border whitespace-nowrap ${COR[selo.tipo]}`}>
      {selo.rotulo}
    </span>
  );
}
