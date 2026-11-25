// Escala de tempo do cronograma (Gantt): só contas de datas e porcentagens, sem banco nem tela.

const DIA = 86400000;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const diaMs = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

export interface Marca { rotulo: string; esquerdaPct: number; larguraPct: number }
export interface Escala {
  inicio: Date; fim: Date; // fim = último dia mostrado (inclusive)
  dias: number;
  grupos: Marca[]; // faixa de cima: anos
  colunas: Marca[]; // faixa de baixo: meses (até 24 meses) ou trimestres
  hojePct: number | null;
}

/** dias entre inicio e d (inclusive nas duas pontas = d - inicio + 0) */
const offset = (e: { inicio: Date }, d: Date) => (diaMs(d) - diaMs(e.inicio)) / DIA;

/**
 * Monta a escala. Com `ano`, mostra janeiro a dezembro daquele ano; sem ele, vai do primeiro mês com data
 * até o último (incluindo hoje), com pelo menos 12 meses e arredondando para trimestres quando passa de 24.
 */
export function montarEscala(datas: (Date | null | undefined)[], hoje: Date, ano?: number): Escala {
  let ini: Date, fim: Date;
  if (ano) {
    ini = new Date(ano, 0, 1);
    fim = new Date(ano, 11, 31);
  } else {
    const ds = [...datas.filter((d): d is Date => !!d), hoje];
    const min = new Date(Math.min(...ds.map((d) => d.getTime())));
    const max = new Date(Math.max(...ds.map((d) => d.getTime())));
    ini = new Date(min.getFullYear(), min.getMonth(), 1);
    fim = new Date(max.getFullYear(), max.getMonth() + 1, 0);
    let meses = (fim.getFullYear() - ini.getFullYear()) * 12 + fim.getMonth() - ini.getMonth() + 1;
    if (meses < 12) { fim = new Date(ini.getFullYear(), ini.getMonth() + 12, 0); meses = 12; }
    if (meses > 24) {
      ini = new Date(ini.getFullYear(), Math.floor(ini.getMonth() / 3) * 3, 1);
      fim = new Date(fim.getFullYear(), Math.floor(fim.getMonth() / 3) * 3 + 3, 0);
    }
  }
  const e0 = { inicio: ini };
  const dias = Math.round(offset(e0, fim)) + 1;
  const pct = (n: number) => (n * 100) / dias;
  const faixa = (de: Date, ate: Date, rotulo: string): Marca => {
    const a = Math.max(de.getTime(), ini.getTime()), b = Math.min(ate.getTime(), fim.getTime());
    const esq = offset(e0, new Date(a)), larg = offset(e0, new Date(b)) + 1 - esq;
    return { rotulo, esquerdaPct: pct(esq), larguraPct: pct(larg) };
  };

  const grupos: Marca[] = [];
  for (let a = ini.getFullYear(); a <= fim.getFullYear(); a++) grupos.push(faixa(new Date(a, 0, 1), new Date(a, 11, 31), String(a)));

  const meses = (fim.getFullYear() - ini.getFullYear()) * 12 + fim.getMonth() - ini.getMonth() + 1;
  const colunas: Marca[] = [];
  if (meses <= 24) {
    for (let m = 0; m < meses; m++) {
      const d = new Date(ini.getFullYear(), ini.getMonth() + m, 1);
      colunas.push(faixa(d, new Date(d.getFullYear(), d.getMonth() + 1, 0), MESES[d.getMonth()]));
    }
  } else {
    for (let m = 0; m < meses; m += 3) {
      const d = new Date(ini.getFullYear(), ini.getMonth() + m, 1);
      colunas.push(faixa(d, new Date(d.getFullYear(), d.getMonth() + 3, 0), `${Math.floor(d.getMonth() / 3) + 1}º tri`));
    }
  }
  const h = diaMs(hoje) >= diaMs(ini) && diaMs(hoje) <= diaMs(fim) ? pct(offset(e0, hoje) + 0.5) : null;
  return { inicio: ini, fim, dias, grupos, colunas, hojePct: h };
}

/** Posição de uma barra (de, ate) na escala, em %. null quando está toda fora do período mostrado. `cortadaE/D` avisam que a barra continua fora da tela. */
export function posicaoBarra(e: Escala, de: Date | null, ate: Date | null): { esquerdaPct: number; larguraPct: number; cortadaEsq: boolean; cortadaDir: boolean } | null {
  const a = de ?? ate, b = ate ?? de;
  if (!a || !b) return null;
  const ini = Math.min(diaMs(a), diaMs(b)), fim = Math.max(diaMs(a), diaMs(b));
  if (fim < diaMs(e.inicio) || ini > diaMs(e.fim)) return null;
  const x0 = Math.max(ini, diaMs(e.inicio)), x1 = Math.min(fim, diaMs(e.fim));
  const esq = (x0 - diaMs(e.inicio)) / DIA, larg = (x1 - x0) / DIA + 1;
  return {
    esquerdaPct: (esq * 100) / e.dias,
    larguraPct: Math.max((larg * 100) / e.dias, 0.4), // barra de 1 dia continua visível
    cortadaEsq: ini < diaMs(e.inicio), cortadaDir: fim > diaMs(e.fim),
  };
}

/** Posição de um marco (data pontual) em %. null se fora da escala. */
export function posicaoMarco(e: Escala, d: Date | null): number | null {
  if (!d || diaMs(d) < diaMs(e.inicio) || diaMs(d) > diaMs(e.fim)) return null;
  return ((offset(e, d) + 0.5) * 100) / e.dias;
}
