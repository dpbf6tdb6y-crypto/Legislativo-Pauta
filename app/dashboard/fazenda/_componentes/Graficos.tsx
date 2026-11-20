'use client';
// Gráficos do Compliance: SVG leve, com leitura por mouse, toque e teclado. Valores em reais.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { COR_SERIE } from '@/lib/financas/painel/cores';

const GRADE = '#e5e7eb', EIXO = '#cbd5e1', TEXTO = '#64748b';

const cheio = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function curto(v: number) {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  const f = (x: number, c: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  if (a >= 1e9) return `${s}${f(a / 1e9, 2)} bi`;
  if (a >= 1e6) return `${s}${f(a / 1e6, a >= 1e8 ? 0 : 1)} mi`;
  if (a >= 1e3) return `${s}${f(a / 1e3, 0)} mil`;
  return `${s}${f(a, 0)}`;
}
/** Teto "redondo" do eixo. */
function teto(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function useLargura(inicial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(inicial);
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return [ref, w] as const;
}

function Dica({ x, w, titulo, linhas }: { x: number; w: number; titulo: string; linhas: { nome: string; valor: string; cor?: string }[] }) {
  const largura = 210, esquerda = Math.min(Math.max(0, x + 12), w - largura);
  return (
    <div role="status" className="absolute top-1 z-10 pointer-events-none bg-white border border-slate-200 rounded-md shadow-md px-2.5 py-1.5 text-xs" style={{ left: esquerda, width: largura }}>
      <div className="font-semibold text-slate-800 mb-0.5">{titulo}</div>
      {linhas.map((l) => (
        <div key={l.nome} className="flex items-center justify-between gap-2 text-slate-600">
          <span className="flex items-center gap-1.5">{l.cor && <i className="inline-block w-2 h-2 rounded-full" style={{ background: l.cor }} />}{l.nome}</span>
          <span className="tabular-nums text-slate-900">{l.valor}</span>
        </div>
      ))}
    </div>
  );
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-1">
      {itens.map((i) => <li key={i.nome} className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: i.cor }} />{i.nome}</li>)}
    </ul>
  );
}

/** Linhas acumuladas. `series[].valores` alinhados a `rotulos`. */
export function GraficoLinhas({ rotulos, series, titulo, altura = 220 }: { rotulos: string[]; series: { nome: string; valores: number[] }[]; titulo: string; altura?: number }) {
  const [ref, w] = useLargura();
  const [i, setI] = useState<number | null>(null);
  const m = { e: 58, d: 14, t: 10, b: 24 };
  const n = rotulos.length;
  const max = teto(Math.max(0, ...series.flatMap((s) => s.valores)));
  const X = (k: number) => m.e + (n > 1 ? ((w - m.e - m.d) * k) / (n - 1) : (w - m.e - m.d) / 2);
  const Y = (v: number) => altura - m.b - ((altura - m.t - m.b) * v) / max;
  const mover = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setI(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setI((x) => Math.min(n - 1, (x ?? -1) + 1));
    if (e.key === 'ArrowLeft') setI((x) => Math.max(0, (x ?? n) - 1));
  };
  if (!n) return <p className="text-sm text-slate-500">Sem dados coletados.</p>;
  return (
    <div>
      <Legenda itens={series.map((s, k) => ({ nome: s.nome, cor: COR_SERIE[k] }))} />
      <div ref={ref} className="relative outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded" tabIndex={0} role="img" aria-label={`${titulo}. Use as setas para ler cada mês.`} onKeyDown={teclas} onBlur={() => setI(null)}>
        <svg width={w} height={altura} className="block">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={m.e} x2={w - m.d} y1={Y(max * f)} y2={Y(max * f)} stroke={f ? GRADE : EIXO} />
              <text x={m.e - 6} y={Y(max * f) + 4} textAnchor="end" fontSize="11" fill={TEXTO}>{f ? curto(max * f) : '0'}</text>
            </g>
          ))}
          {rotulos.map((r, k) => <text key={r} x={X(k)} y={altura - 7} textAnchor="middle" fontSize="11" fill={TEXTO}>{r}</text>)}
          {i !== null && <line x1={X(i)} x2={X(i)} y1={m.t} y2={altura - m.b} stroke={EIXO} />}
          {series.map((s, k) => (
            <g key={s.nome}>
              <path d={s.valores.map((v, j) => `${j ? 'L' : 'M'}${X(j).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke={COR_SERIE[k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={X(i ?? n - 1)} cy={Y(s.valores[i ?? n - 1])} r="4" fill={COR_SERIE[k]} stroke="#fff" strokeWidth="2" />
            </g>
          ))}
          <rect x={m.e} y={m.t} width={Math.max(1, w - m.e - m.d)} height={altura - m.t - m.b} fill="transparent" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setI(null)} />
        </svg>
        {i !== null && <Dica x={X(i)} w={w} titulo={rotulos[i]} linhas={series.map((s, k) => ({ nome: s.nome, valor: cheio(s.valores[i]), cor: COR_SERIE[k] }))} />}
      </div>
    </div>
  );
}

/** Colunas de uma série. Com `sinal`, negativo fica em vermelho e abaixo da linha de base. */
/**
 * Colunas. Com `href` em cada item, a coluna vira escolha: clicar (ou Enter na coluna lida pelas setas) abre o endereço,
 * e `ativo` marca a escolhida (as demais ficam mais claras).
 */
export function GraficoColunas({ itens, titulo, sinal = false, altura = 200 }: { itens: { rotulo: string; valor: number; href?: string; ativo?: boolean }[]; titulo: string; sinal?: boolean; altura?: number }) {
  const router = useRouter();
  const temAtivo = itens.some((x) => x.ativo);
  const [ref, w] = useLargura();
  const [i, setI] = useState<number | null>(null);
  const m = { e: 58, d: 8, t: 12, b: 24 };
  const n = itens.length;
  const maxP = teto(Math.max(0, ...itens.map((x) => x.valor))), maxN = sinal ? teto(Math.max(0, ...itens.map((x) => -x.valor))) : 0;
  const temNeg = itens.some((x) => x.valor < 0);
  const total = maxP + (temNeg ? maxN : 0);
  const Y = (v: number) => m.t + ((altura - m.t - m.b) * ((temNeg || maxP ? maxP : 1) - v)) / total;
  const faixa = (w - m.e - m.d) / Math.max(1, n), larg = Math.min(24, faixa * 0.62);
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setI((x) => Math.min(n - 1, (x ?? -1) + 1));
    if (e.key === 'ArrowLeft') setI((x) => Math.max(0, (x ?? n) - 1));
    if (e.key === 'Enter' && i !== null && itens[i]?.href) router.push(itens[i].href!, { scroll: false });
  };
  if (!n) return <p className="text-sm text-slate-500">Sem dados coletados.</p>;
  const coluna = (v: number, cx: number) => {
    const y0 = Y(0), y1 = Y(v), r = Math.min(4, Math.abs(y1 - y0)), x0 = cx - larg / 2, x1 = cx + larg / 2;
    return v >= 0
      ? `M${x0} ${y0}V${y1 + r}Q${x0} ${y1} ${x0 + r} ${y1}H${x1 - r}Q${x1} ${y1} ${x1} ${y1 + r}V${y0}Z`
      : `M${x0} ${y0}V${y1 - r}Q${x0} ${y1} ${x0 + r} ${y1}H${x1 - r}Q${x1} ${y1} ${x1} ${y1 - r}V${y0}Z`;
  };
  return (
    <div ref={ref} className="relative outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded" tabIndex={0} role="img" aria-label={`${titulo}. Use as setas para ler cada coluna.`} onKeyDown={teclas} onBlur={() => setI(null)} onPointerLeave={() => setI(null)}>
      <svg width={w} height={altura} className="block">
        {[1, 0.5].map((f) => (
          <g key={f}>
            <line x1={m.e} x2={w - m.d} y1={Y(maxP * f)} y2={Y(maxP * f)} stroke={GRADE} />
            <text x={m.e - 6} y={Y(maxP * f) + 4} textAnchor="end" fontSize="11" fill={TEXTO}>{curto(maxP * f)}</text>
          </g>
        ))}
        {temNeg && <text x={m.e - 6} y={Y(-maxN) + 4} textAnchor="end" fontSize="11" fill={TEXTO}>{curto(-maxN)}</text>}
        <text x={m.e - 6} y={Y(0) + 4} textAnchor="end" fontSize="11" fill={TEXTO}>0</text>
        {itens.map((x, k) => {
          const cx = m.e + faixa * (k + 0.5);
          return (
            <g key={x.rotulo} onPointerEnter={() => setI(k)} onPointerDown={() => setI(k)} onClick={x.href ? () => router.push(x.href!, { scroll: false }) : undefined} style={x.href ? { cursor: 'pointer' } : undefined}>
              <rect x={m.e + faixa * k} y={m.t} width={faixa} height={altura - m.t - m.b} fill="transparent" />
              <path d={coluna(x.valor, cx)} fill={x.valor < 0 ? '#d03b3b' : COR_SERIE[0]} opacity={temAtivo && !x.ativo ? 0.4 : i === null || i === k ? 1 : 0.55} />
              <text x={cx} y={altura - 7} textAnchor="middle" fontSize="11" fontWeight={x.ativo ? 700 : 400} fill={x.ativo ? '#0f172a' : TEXTO}>{x.rotulo}</text>
            </g>
          );
        })}
        <line x1={m.e} x2={w - m.d} y1={Y(0)} y2={Y(0)} stroke={EIXO} />
      </svg>
      {i !== null && <Dica x={m.e + faixa * (i + 0.5)} w={w} titulo={itens[i].rotulo} linhas={[{ nome: titulo, valor: cheio(itens[i].valor) }]} />}
    </div>
  );
}
