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
