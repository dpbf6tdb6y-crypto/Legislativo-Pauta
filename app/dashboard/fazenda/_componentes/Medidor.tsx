// Medidor em meia-lua: o arco colorido é o valor; os tracinhos são os limites da lei.
// Componente de servidor (só SVG), sem JavaScript no navegador.
import type { Nivel } from '@/lib/financas/painel/fiscal';

export const COR_NIVEL: Record<Nivel, { arco: string; texto: string; fundo: string; borda: string }> = {
  ok: { arco: '#16a34a', texto: 'text-emerald-800', fundo: 'bg-emerald-50', borda: 'border-emerald-300' },
  observacao: { arco: '#d97706', texto: 'text-amber-800', fundo: 'bg-amber-50', borda: 'border-amber-300' },
  atencao: { arco: '#dc2626', texto: 'text-red-800', fundo: 'bg-red-50', borda: 'border-red-300' },
};

const ponto = (cx: number, cy: number, r: number, f: number) => {
  const a = Math.PI * (1 - Math.min(Math.max(f, 0), 1));
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
};
const arco = (cx: number, cy: number, r: number, f0: number, f1: number) => {
  const [x0, y0] = ponto(cx, cy, r, f0), [x1, y1] = ponto(cx, cy, r, f1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

export default function Medidor(props: {
  valor: number;              // em %
  escala: number;             // valor do fim do arco, em %
  marcas: { valor: number; rotulo: string }[];
  nivel: Nivel;
  texto: string;              // número grande no centro
  rotulo: string;
}) {
  const { valor, escala, marcas, nivel, texto, rotulo } = props;
  const f = valor / escala;
  return (
    <svg viewBox="0 0 200 118" className="w-full max-w-[260px]" role="img" aria-label={`${rotulo}: ${texto}`}>
      <path d={arco(100, 100, 80, 0, 1)} fill="none" stroke="#e5e7eb" strokeWidth="16" />
      <path d={arco(100, 100, 80, 0, Math.max(f, 0.004))} fill="none" stroke={COR_NIVEL[nivel].arco} strokeWidth="16" />
      {marcas.map((m) => {
        const [x0, y0] = ponto(100, 100, 66, m.valor / escala), [x1, y1] = ponto(100, 100, 94, m.valor / escala);
        return (
          <g key={m.rotulo}>
            <title>{`${m.rotulo}: ${m.valor.toLocaleString('pt-BR')}%`}</title>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#fff" strokeWidth="5" />
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#111827" strokeWidth="2" />
          </g>
        );
      })}
      <text x="100" y="92" textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827">{texto}</text>
      <text x="100" y="112" textAnchor="middle" fontSize="11" fill="#6b7280">{rotulo}</text>
    </svg>
  );
}
