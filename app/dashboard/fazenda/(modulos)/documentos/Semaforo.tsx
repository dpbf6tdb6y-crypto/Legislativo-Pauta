import type { Cor } from '@/lib/financas/documentos/fluxo';

export const COR_SEMAFORO: Record<Cor, { bola: string; fundo: string; borda: string; texto: string; rotulo: string }> = {
  verde: { bola: '#16a34a', fundo: 'bg-emerald-50', borda: 'border-emerald-300', texto: 'text-emerald-900', rotulo: 'Pode assinar' },
  amarelo: { bola: '#d97706', fundo: 'bg-amber-50', borda: 'border-amber-300', texto: 'text-amber-900', rotulo: 'Assinar com atenção' },
  vermelho: { bola: '#dc2626', fundo: 'bg-red-50', borda: 'border-red-300', texto: 'text-red-900', rotulo: 'Não assinar sem ajuste' },
  cinza: { bola: '#94a3b8', fundo: 'bg-slate-50', borda: 'border-slate-300', texto: 'text-slate-700', rotulo: 'Aguardando parecer' },
};

export default function BolaSemaforo({ cor, grande }: { cor: Cor; grande?: boolean }) {
  const t = grande ? 'w-10 h-10' : 'w-4 h-4';
  return <span role="img" aria-label={COR_SEMAFORO[cor].rotulo} className={`inline-block rounded-full shrink-0 ${t}`} style={{ background: COR_SEMAFORO[cor].bola }} />;
}
