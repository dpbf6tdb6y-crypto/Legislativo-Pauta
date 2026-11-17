// Dinheiro sempre em CENTAVOS (bigint). Nunca usar float para somar.

/** "R$ -76.000,00" | "4361,55" | "7500.00" | "  2534.14 " -> centavos */
export function centavos(txt: string | number | null | undefined): bigint {
  if (txt === null || txt === undefined) return BigInt(0);
  let s = String(txt).replace(/R\$/g, '').replace(/\s/g, '');
  if (s === '' || s === '-') return BigInt(0);
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  let inteiro: string, frac: string;
  if (s.includes(',')) {
    // formato brasileiro: 1.234,56
    const [i, f = ''] = s.split(',');
    inteiro = i.replace(/\./g, '');
    frac = f;
  } else {
    // formato com ponto decimal: 1234.56
    const partes = s.split('.');
    if (partes.length > 2) throw new Error(`valor ambíguo: ${txt}`);
    inteiro = partes[0];
    frac = partes[1] ?? '';
  }
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(frac)) throw new Error(`valor inválido: ${txt}`);
  frac = (frac + '00').slice(0, 2);
  const v = BigInt(inteiro || '0') * BigInt(100) + BigInt(frac);
  return neg ? -v : v;
}

/** centavos -> "R$ 1.234,56" */
export function brl(c: bigint | number | null | undefined): string {
  const v = BigInt(c ?? 0);
  const neg = v < BigInt(0);
  const a = neg ? -v : v;
  const reais = (a / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = (a % BigInt(100)).toString().padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${cent}`;
}

export function somar(vs: Iterable<bigint>): bigint {
  let t = BigInt(0);
  for (const v of vs) t += v;
  return t;
}

/** percentual a/b com 2 casas, como texto */
export function pct(a: bigint, b: bigint): string {
  if (b === BigInt(0)) return '—';
  const x = (a * BigInt(10000)) / b;
  const neg = x < BigInt(0);
  const ax = neg ? -x : x;
  return `${neg ? '-' : ''}${ax / BigInt(100)},${(ax % BigInt(100)).toString().padStart(2, '0')}%`;
}

/** centavos -> "R$ 260,5 mi" / "R$ 1,35 bi" / "R$ 830 mil" (só para exibir; as contas continuam em centavos) */
export function brlCurto(c: bigint | number | null | undefined): string {
  const v = Number(BigInt(c ?? 0)) / 100;
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  const f = (x: number, casas: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  if (a >= 1e9) return `${s}R$ ${f(a / 1e9, 2)} bi`;
  if (a >= 1e6) return `${s}R$ ${f(a / 1e6, 1)} mi`;
  if (a >= 1e3) return `${s}R$ ${f(a / 1e3, 0)} mil`;
  return `${s}R$ ${f(a, 2)}`;
}

/** pontos-base -> "31,9%" (só para exibir) */
export function pctBp(bp: bigint | null | undefined, casas = 1): string {
  if (bp === null || bp === undefined) return '—';
  return `${(Number(bp) / 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
