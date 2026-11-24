// Medidor em meia-lua, no modelo do painel anterior: o arco colorido é o valor, o traço escuro com bolinha é o limite da lei.
// Componente de servidor (só SVG), sem JavaScript no navegador.
import type { Nivel } from '@/lib/financas/painel/fiscal';

export const COR_NIVEL: Record<Nivel, { arco: string; texto: string; fundo: string; borda: string; numero: string }> = {
  ok: { arco: '#16a34a', texto: 'text-emerald-800', fundo: 'bg-emerald-50', borda: 'border-emerald-300', numero: '#007A2E' },
  observacao: { arco: '#d97706', texto: 'text-amber-800', fundo: 'bg-amber-50', borda: 'border-amber-300', numero: '#9A6B00' },
  atencao: { arco: '#dc2626', texto: 'text-red-800', fundo: 'bg-red-50', borda: 'border-red-300', numero: '#B42318' },
};
// o arco em cor viva; o número, em tom mais escuro, que lê melhor no branco
const ARCO_VIVO: Record<Nivel, string> = { ok: '#009C3B', observacao: '#E3A008', atencao: '#D92D20' };

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
  rotulo?: string;            // legenda abaixo do arco
  largura?: string;           // largura máxima (classe do Tailwind)
}) {
  const { valor, escala, marcas, nivel, texto, rotulo, largura = 'max-w-[220px]' } = props;
  const f = valor / escala;
  const ultima = marcas.reduce((m, x) => (x.valor > m ? x.valor : m), -Infinity);
  return (
    <div className={`w-full ${largura} text-center`}>
      <svg viewBox="0 -10 120 88" className="w-full overflow-visible" role="img" aria-label={`${rotulo ?? 'Medidor'}: ${texto}`}>
        <g transform="translate(0,62) scale(1,1.2) translate(0,-62)">
          <path d={arco(60, 62, 41, 0, 1)} fill="none" stroke="#EFF1F5" strokeWidth="11" />
          <path d={arco(60, 62, 41, 0, Math.max(f, 0.002))} fill="none" stroke={ARCO_VIVO[nivel]} strokeWidth="11" />
          {marcas.map((m) => {
            const l = m.valor / escala;
            const [x0, y0] = ponto(60, 62, 34, l), [x1, y1] = ponto(60, 62, 54, l);
            return (
              <g key={m.rotulo}>
                <title>{`${m.rotulo}: ${m.valor.toLocaleString('pt-BR')}%`}</title>
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#fff" strokeWidth="7" />
                <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#111827" strokeWidth="3.6" />
                {m.valor === ultima && <circle cx={x1} cy={y1} r="3.4" fill="#111827" stroke="#fff" strokeWidth="1.5" />}
              </g>
            );
          })}
        </g>
        <text x="60" y="58" textAnchor="middle" style={{ fontSize: 21, fontWeight: 700, fill: COR_NIVEL[nivel].numero }}>{texto}</text>
      </svg>
      {rotulo && <div className="text-xs text-slate-500 leading-tight">{rotulo}</div>}
    </div>
  );
}
