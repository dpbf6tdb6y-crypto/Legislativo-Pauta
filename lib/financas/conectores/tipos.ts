// Contrato fixo entre QUALQUER fonte de dados e o resto do sistema.
// Trocar a fonte (portal Ábaco -> sistema interno da prefeitura) = escrever outro
// conector que devolva estes mesmos tipos. Regras e telas não mudam.

export interface ArquivoBaixado {
  tipo: string; // ex.: "despesa_orgao", "contratos"
  referencia: string; // ex.: "2026-10"
  nomeSugerido: string; // ex.: "despesa_orgao_2026-10.xml"
  conteudo: Buffer;
}

export interface DespesaOrgaoMesC {
  ano: number;
  mes: number; // 0 = ano inteiro
  orgaoCod: string;
  orgaoNome: string;
  dotInicial: bigint;
  dotAtual: bigint;
  empenhado: bigint;
  liquidado: bigint;
  pago: bigint;
}

/** Relatório consolidado do portal por natureza da despesa. */
export interface DespesaNaturezaMesC {
  ano: number;
  mes: number; // 0 = ano inteiro
  naturezaCod: string;
  naturezaNome: string;
  dotInicial: bigint;
  dotAtual: bigint;
  empenhado: bigint;
  liquidado: bigint;
  pago: bigint;
}

/** Relatório consolidado do portal por função e subfunção. */
export interface DespesaFuncaoMesC {
  ano: number;
  mes: number; // 0 = ano inteiro
  funcaoCod: string;
  funcaoNome: string;
  subfuncaoCod: string;
  subfuncaoNome: string;
  dotInicial: bigint;
  dotAtual: bigint;
  empenhado: bigint;
  liquidado: bigint;
  pago: bigint;
}

export interface EventoC {
  idOrigem: number;
  numero: string;
  data: Date;
  valor: bigint;
}

export interface EmpenhoC {
  idOrigem: number;
  numero: string;
  data: Date;
  tipo: string;
  orgao: string;
  unidade: string;
  credorDoc: string;
  credorNome: string;
  processo: string;
  natureza: string;
  contaDespesa: string;
  fonte: string;
  funcao: string;
  subfuncao: string;
  programa: string;
  projeto: string;
  descricao: string;
  valor: bigint;
  anulado: bigint;
  aLiquidar: bigint;
  aPagar: bigint;
  liquidacoes: EventoC[];
  pagamentos: EventoC[];
  /** preenchido quando os valores publicados pela fonte não fecham entre si */
  inconsistencia?: string | null;
}

/** Desconto/consignação retido num pagamento (IRRF, ISS, INSS, consignados...). O pagamento do
 *  empenho mostra só o valor líquido creditado; o portal conta como "pago" líquido + retido. */
export interface RetencaoC {
  pagamentoIdOrigem: number;
  seq: number;
  descricao: string;
  tipo: string; // DESCONTO | CONSIGNACAO
  data: Date | null;
  valor: bigint;
}

/** Resto a pagar (posição do dia; a fonte não publica a data de cada pagamento do RP). */
export interface RestoPagarC {
  idOrigem: number;
  numero: string;
  anoOrigem: number; // ano em que foi inscrito
  exercicio: number; // ano em que está sendo pago
  tipo: string; // P = processado, N = não processado, L = não processado liquidado
  empenhoIdOrigem: number; // id do empenho original na fonte
  empenhoNumero: string;
  orgaoCod: string;
  orgaoNome: string;
  credorDoc: string;
  credorNome: string;
  inscrito: bigint;
  anulado: bigint;
  liquidado: bigint;
  pago: bigint;
}

export interface ContratoC {
  idOrigem: number;
  numero: string;
  ano: number;
  assinatura: Date | null;
  inicio: Date | null;
  fim: Date | null;
  publicacaoData: Date | null;
  publicacaoVeiculo: string;
  objeto: string;
  tipo: string;
  situacao: string;
  valorInicial: bigint;
  valorAtual: bigint;
  processo: string;
  modalidade: string;
  fornecedorDoc: string;
  fornecedorNome: string;
}

export interface ReceitaContaMesC {
  ano: number;
  mes: number;
  contaCod: string;
  contaPai: string;
  nome: string;
  redutora: boolean;
  previstoInicial: bigint;
  previstoAtual: bigint;
  arrecAnterior: bigint;
  arrecMes: bigint;
  arrecAteMes: bigint;
}

export interface FolhaLinhaC {
  anoMes: string; // "2026/10"
  seq: number;
  matricula: string;
  nome: string;
  cargo: string;
  ocupacao: string;
  tipoVinculo: string;
  situacaoOriginal: string; // será resumida antes de gravar (LGPD)
  lotacao: string;
  vencimentos: bigint;
  bruto: bigint;
  previdencia: bigint;
  desconto: bigint;
  irrf: bigint;
  liquido: bigint;
}

export interface FolhaMesC {
  anoMes: string;
  linhasInformadasPelaFonte: number; // para conferir que nada ficou para trás
  linhas: FolhaLinhaC[];
}

/** Resultado com os arquivos originais, para guardar na área bruta. */
export interface ComBruto<T> {
  dados: T;
  brutos: ArquivoBaixado[];
}

export interface Conector {
  nome: string;
  abrir(): Promise<void>;
  fechar(): Promise<void>;
  /** data/hora da última atualização informada pela fonte (texto livre) */
  ultimaAtualizacao(): Promise<string>;
  despesaOrgaoMes(ano: number, mes: number): Promise<ComBruto<DespesaOrgaoMesC[]>>;
  /** relatório consolidado por natureza ([] se a fonte não publica) */
  despesaNaturezaMes(ano: number, mes: number): Promise<ComBruto<DespesaNaturezaMesC[]>>;
  /** relatório consolidado por função e subfunção ([] se a fonte não publica) */
  despesaFuncaoMes(ano: number, mes: number): Promise<ComBruto<DespesaFuncaoMesC[]>>;
  receitasMes(ano: number, mes: number): Promise<ComBruto<ReceitaContaMesC[]>>;
  contratos(): Promise<ComBruto<ContratoC[]>>;
  /** devolve o empenho pelo id da fonte, ou null se o id não existir */
  empenho(idOrigem: number): Promise<EmpenhoC | null>;
  /**
   * Entrega empenhos do ano: os novos (ainda não conhecidos) e a releitura dos
   * que ainda têm saldo a liquidar/pagar. A fonte decide como descobrir.
   */
  empenhosDoAno(opts: {
    ano: number;
    /** ids já gravados (o que não estiver aqui é tratado como novo, inclusive falhas de noites anteriores) */
    idsConhecidos: number[];
    /** relistar o ano inteiro (carga inicial / semanal); senão só mês atual e anterior */
    relistarAnoTodo: boolean;
    idsParaReler: number[];
    aoReceber: (e: EmpenhoC) => Promise<void>;
    progresso?: (msg: string) => void;
  }): Promise<{ verificados: number; entregues: number }>;
  folhaMes(anoMes: string): Promise<ComBruto<FolhaMesC>>;
  /** quantos registros a fonte informa hoje para o mês (rápido: descobre mês fechado que foi alterado) */
  contagemFolha?(anoMes: string): Promise<number>;
  /** restos a pagar sendo pagos no exercício (lista do dia) */
  restosAPagar(exercicio: number): Promise<ComBruto<RestoPagarC[]>>;
  /** descontos retidos num pagamento ([] se não houver) */
  retencoesDoPagamento(pagamentoIdOrigem: number): Promise<RetencaoC[]>;
}
