// Resumo dos contratos para a tela do prefeito: totais, vencimentos próximos e maiores fornecedores.
// Função pura (sem banco) para poder ser testada. Dinheiro em CENTAVOS (bigint).

export const SITUACAO_VIGENTE = 'Contrato Vigente';

export interface ContratoResumivel {
  id: number; numero: string; ano: number; situacao: string; objeto: string;
  fornecedorNome: string; fim: Date | null; valorAtual: bigint;
}

export interface Vencimento { id: number; numero: string; ano: number; fornecedorNome: string; objeto: string; dias: number; valor: bigint; fim: Date }
export interface Fornecedor { nome: string; valor: bigint; contratos: number }

export interface ResumoContratos {
  quantidade: number;
  valorTotal: bigint;
  vigentes: number;
  vencimentos: Vencimento[];   // vigentes que terminam em até `janelaDias`, do mais próximo ao mais distante
  valorVencendo: bigint;
  fornecedores: Fornecedor[];  // maiores por valor contratado
}

/** dias corridos de hoje até a data (ambas lidas como dia de calendário em UTC) */
export function diasAte(fim: Date, hoje: Date): number {
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const f = Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate());
  return Math.round((f - h) / 86400000);
}

export function resumoContratos(lista: ContratoResumivel[], hoje: Date, janelaDias = 90, nFornecedores = 8): ResumoContratos {
  const z = BigInt(0);
  const vencimentos: Vencimento[] = [];
  const porForn = new Map<string, Fornecedor>();
  let valorTotal = z, vigentes = 0;
  for (const c of lista) {
    valorTotal += c.valorAtual;
    const f = porForn.get(c.fornecedorNome) ?? { nome: c.fornecedorNome, valor: z, contratos: 0 };
    f.valor += c.valorAtual; f.contratos++;
    porForn.set(c.fornecedorNome, f);
    if (c.situacao !== SITUACAO_VIGENTE) continue;
    vigentes++;
    if (!c.fim) continue;
    const dias = diasAte(c.fim, hoje);
    if (dias >= 0 && dias <= janelaDias)
      vencimentos.push({ id: c.id, numero: c.numero, ano: c.ano, fornecedorNome: c.fornecedorNome, objeto: c.objeto, dias, valor: c.valorAtual, fim: c.fim });
  }
  vencimentos.sort((a, b) => a.dias - b.dias || (b.valor > a.valor ? 1 : b.valor < a.valor ? -1 : 0));
  const fornecedores = [...porForn.values()].sort((a, b) => (b.valor > a.valor ? 1 : b.valor < a.valor ? -1 : 0)).slice(0, nFornecedores);
  return { quantidade: lista.length, valorTotal, vigentes, vencimentos, valorVencendo: vencimentos.reduce((s, v) => s + v.valor, z), fornecedores };
}

// ───────── tabela de contratos: linha consolidada, prazo, filtros por coluna e ordenação ─────────

export interface LinhaContrato extends ContratoResumivel {
  fornecedorDoc: string;
  inicio: Date | null;
  valorAtual: bigint;
  /** secretaria deduzida dos empenhos ligados (a que mais empenhou); null se nenhum empenho ligado */
  secretaria: string | null;
  outrasSecretarias: number;
  empenhado: bigint;
  pago: bigint;
  alta: number;
  media: number;
}

export interface EmpenhoLigavel { orgao: string; liquido: bigint /* valor - anulado */; pago: bigint }
export interface AgregadoLigacao { empenhado: bigint; pago: bigint; alta: number; media: number; secretaria: string | null; outras: number }

/** Soma os empenhos ligados a um contrato e escolhe a secretaria que mais empenhou. */
export function agregarLigacoes(itens: { certeza: string; empenho: EmpenhoLigavel }[]): AgregadoLigacao {
  const z = BigInt(0);
  const porOrgao = new Map<string, bigint>();
  let empenhado = z, pago = z, alta = 0, media = 0;
  for (const { certeza, empenho: e } of itens) {
    empenhado += e.liquido; pago += e.pago;
    if (certeza === 'alta') alta++; else media++;
    const o = e.orgao.trim();
    if (o) porOrgao.set(o, (porOrgao.get(o) ?? z) + e.liquido);
  }
  const ord = [...porOrgao.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0].localeCompare(b[0], 'pt-BR')));
  return { empenhado, pago, alta, media, secretaria: ord[0]?.[0] ?? null, outras: Math.max(ord.length - 1, 0) };
}

export type Tom = 'vermelho' | 'ambar' | 'cinza' | 'verde';
/** Prazo restante do contrato em texto, com a cor do selo. Sem data de fim, não dá para calcular. */
export function prazoContrato(fim: Date | null, situacao: string, hoje: Date): { dias: number | null; texto: string; tom: Tom } {
  if (!fim) return { dias: null, texto: 'sem data de fim', tom: 'cinza' };
  const dias = diasAte(fim, hoje);
  const vigente = situacao === SITUACAO_VIGENTE;
  if (dias < 0) {
    const n = -dias;
    return { dias, texto: `vencido há ${n} ${n === 1 ? 'dia' : 'dias'}`, tom: vigente ? 'vermelho' : 'cinza' };
  }
  if (dias === 0) return { dias, texto: 'vence hoje', tom: vigente ? 'vermelho' : 'cinza' };
  if (dias <= 90) return { dias, texto: `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, tom: dias <= 30 ? 'vermelho' : dias <= 60 ? 'ambar' : 'cinza' };
  if (dias < 365) return { dias, texto: `faltam ${Math.round(dias / 30)} meses`, tom: 'verde' };
  const anos = Math.floor(dias / 365), meses = Math.round((dias % 365) / 30);
  return { dias, texto: `faltam ${anos} ${anos === 1 ? 'ano' : 'anos'}${meses ? ` e ${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''}`, tom: 'verde' };
}

export const COLUNAS = ['contrato', 'secretaria', 'credor', 'objeto', 'vigencia', 'prazo', 'valor', 'empenhado', 'pago'] as const;
export type Coluna = (typeof COLUNAS)[number];

export interface FiltrosContrato {
  contrato?: string; situacao?: string; secretaria?: string; credor?: string; objeto?: string;
  prazo?: string;       // 30 | 60 | 90 | vencido | semfim
  valorMin?: string;    // em reais
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function filtrarContratos(linhas: LinhaContrato[], f: FiltrosContrato, hoje: Date): LinhaContrato[] {
  const contrato = (f.contrato ?? '').trim();
  const num = contrato.match(/^(\d{1,5})\s*\/\s*(\d{4})$/);
  const credor = norm(f.credor ?? ''), credorDig = (f.credor ?? '').replace(/\D/g, '');
  const objeto = norm(f.objeto ?? '');
  const minimo = f.valorMin && f.valorMin.trim() ? BigInt(Math.round(Number(f.valorMin.replace(/\./g, '').replace(',', '.')) * 100) || 0) : null;
  return linhas.filter((c) => {
    if (f.situacao && c.situacao !== f.situacao) return false;
    if (contrato) {
      if (num ? !(Number(c.numero) === Number(num[1]) && c.ano === Number(num[2])) : !`${c.numero}/${c.ano}`.includes(contrato)) return false;
    }
    if (f.secretaria) {
      if (f.secretaria === '__sem') { if (c.secretaria) return false; } else if (c.secretaria !== f.secretaria) return false;
    }
    if (credor && !(norm(c.fornecedorNome).includes(credor) || (credorDig && c.fornecedorDoc.includes(credorDig)))) return false;
    if (objeto && !norm(c.objeto).includes(objeto)) return false;
    if (minimo !== null && c.valorAtual < minimo) return false;
    if (f.prazo) {
      if (f.prazo === 'semfim') return !c.fim;
      if (!c.fim) return false;
      const d = diasAte(c.fim, hoje);
      if (f.prazo === 'vencido') return d < 0;
      const lim = Number(f.prazo);
      if (!(d >= 0 && d <= lim)) return false;
    }
    return true;
  });
}

const cmpBig = (a: bigint, b: bigint) => (a > b ? 1 : a < b ? -1 : 0);
const cmpTxt = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

/** Ordena por coluna; valores ausentes (sem data, sem secretaria) ficam sempre no fim. */
export function ordenarContratos(linhas: LinhaContrato[], coluna: Coluna, dir: 'asc' | 'desc'): LinhaContrato[] {
  const s = dir === 'asc' ? 1 : -1;
  const t = (d: Date | null) => (d ? d.getTime() : null);
  const chave = (c: LinhaContrato): string | bigint | number | null => {
    switch (coluna) {
      case 'contrato': return c.ano * 1e6 + Number(c.numero);
      case 'secretaria': return c.secretaria;
      case 'credor': return c.fornecedorNome;
      case 'objeto': return c.objeto;
      case 'vigencia': return t(c.inicio);
      case 'prazo': return t(c.fim);
      case 'valor': return c.valorAtual;
      case 'empenhado': return c.empenhado;
      case 'pago': return c.pago;
    }
  };
  return [...linhas].sort((a, b) => {
    const x = chave(a), y = chave(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const r = typeof x === 'string' ? cmpTxt(x, y as string) : typeof x === 'bigint' ? cmpBig(x, y as bigint) : x - (y as number);
    return r * s || b.ano - a.ano || Number(b.numero) - Number(a.numero);
  });
}
