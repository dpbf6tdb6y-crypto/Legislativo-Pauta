// Regras legais usadas no painel: vinculação das receitas, despesa obrigatória × discricionária e base do art. 29-A.
// Sem rateio e sem estimativa: o que nenhuma regra cobre fica "a classificar". Regras combinadas com o município
// (as mesmas do painel anterior; o teste compara linha a linha com o resultado dele).
const norm = (s: string) => (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase();

const LEI_FUNDEB = 'Lei 14.113/2020', LEI_SAUDE = 'LC 141/2012', LEI_CFEM = 'Lei 7.990/1989', LEI_TAXAS = 'CF (vinculada ao serviço)';
const LEI_MELHORIA = 'Decreto-Lei 195/1967', LEI_TRANSITO = 'CTB art. 320', LEI_CONVENIO = 'Regras do convênio';

const AREA_POR_LEI: Record<string, string> = {
  [LEI_FUNDEB]: 'Educação', [LEI_SAUDE]: 'Saúde', [LEI_CFEM]: 'Mineração (restrita)', [LEI_TAXAS]: 'Serviço da taxa',
  [LEI_MELHORIA]: 'Obra pública', [LEI_TRANSITO]: 'Trânsito', [LEI_CONVENIO]: 'Objeto do convênio',
  'CF art. 212, §5º': 'Educação', 'Leis do FNDE (PNAE/PNATE)': 'Educação', 'Lei 8.742/1993': 'Assistência social', 'CF art. 149-A': 'Iluminação pública',
};

export interface ClasseReceita { pct: 100 | 0 | null; lei: string; area: string }

/** 100 = vinculada por lei; 0 = sem vinculação legal; null = nenhuma regra cobre a linha. */
export function classificaReceita(cod: string, tipo: string, nome: string): ClasseReceita {
  const n = norm(nome);
  const v = (lei: string): ClasseReceita => ({ pct: 100, lei, area: AREA_POR_LEI[lei] ?? '' });
  const livre: ClasseReceita = { pct: 0, lei: '', area: '' };

  if (n.includes('FUNDEB') || n.includes('FUNDO DE MANUTENCAO E DESENVOLVI') || cod.startsWith('17155') || cod.startsWith('17515') || cod.startsWith('17580')) return v(LEI_FUNDEB);
  if (cod.startsWith('17135') || cod.startsWith('1723') || cod === '2411514100' || cod === '2421500100'
    || /(^|[^A-Z])SUS([^A-Z]|$)/.test(n) || n.includes('SISTEMA UNICO DE SAUDE') || (n.includes('BLOCO') && n.includes('SAUDE'))) return v(LEI_SAUDE);
  if (cod === '1712510100' || n.includes('EXPLORACAO DE RECURSOS MINER') || (n.includes('COMPENSACAO FINANCEIRA') && n.includes('RECURSOS MINERAIS'))) return v(LEI_CFEM);
  if (tipo === 'Taxas') return v(LEI_TAXAS);
  if (n.includes('CONTRIBUICAO DE MELHORIA')) return v(LEI_MELHORIA);
  if (n.includes('MULTA') && n.includes('TRANSITO')) return v(LEI_TRANSITO);
  if (n.includes('CONVENIO')) return v(LEI_CONVENIO);
  if (n.includes('TRANSFERENCIAS DO SALARIO')) return v('CF art. 212, §5º');
  if (n.includes('PNAE') || n.includes('PNATE') || n.includes('DINHEIRO DIRETO NA ESCOLA')) return v('Leis do FNDE (PNAE/PNATE)');
  if (n.includes('ASSISTENCIA SOCIAL') || n.includes('FNAS')) return v('Lei 8.742/1993');
  if (n.includes('SERVICO DE ILUMINACAO PUBLICA')) return v('CF art. 149-A');
  if (n.includes('PROGRAMAS DE SAUDE')) return v(LEI_SAUDE);

  if (tipo === 'Impostos') return livre;
  if ((n.includes('FUNDO DE PARTICIPACAO') && n.includes('MUNIC')) || n.includes('COTA-PARTE DO ICMS') || n.includes('COTA-PARTE DO IPVA')
    || n.includes('COTA-PARTE DO IPI') || n.includes('PROPRIEDADE TERRITORIAL RURAL')) return livre;
  if (n.includes('REMUNERACAO DE DEPOSITOS') || n.includes('RESTITUICOES')) return livre;
  return { pct: null, lei: '', area: '' };
}

/** Tipo da conta: a espécie (3 dígitos) quando a origem é 11 (tributos); senão a origem (2 dígitos). */
export function tipoDaConta(cod: string, nomes: Map<string, string>) {
  if (!cod.startsWith('1')) return '';
  const origem = cod.slice(0, 2).padEnd(10, '0'), especie = cod.slice(0, 3).padEnd(10, '0');
  const alvo = cod.slice(0, 2) === '11' ? especie : origem;
  let d = (nomes.get(alvo) || nomes.get(origem) || '').replace(/\s*-\s*PRINCIPAL$/i, '').trim();
  if (d && d === d.toUpperCase() && d !== d.toLowerCase()) {
    const miudas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'por', 'sobre']);
    d = d.split(/\s+/).map((w, i) => (i === 0 || !miudas.has(w.toLowerCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ');
  }
  return d;
}

export type TipoNatureza = 'Obrigatória' | 'Discricionária' | null;
export interface ClasseNatureza { tipo: TipoNatureza; grupo: string; lei: string }

const O = 'Obrigatória' as const, D = 'Discricionária' as const;
const REGRAS_NATUREZA: [string, TipoNatureza, string, string][] = [
  ['INDENIZACOES E RESTITUICOES TRABALHISTAS', O, 'Pessoal e encargos', 'CF art. 169 · fora do limite: LRF art. 19, §1º, I'],
  ['VENCIMENTOS E VANTAGENS', O, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'],
  ['OBRIGACOES PATRONAIS', O, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'],
  ['APOSENTADORIAS', O, 'Pessoal e encargos', 'CF art. 169 / LRF art. 18 (inativos)'],
  ['PENSOES', O, 'Pessoal e encargos', 'CF art. 169 / LRF art. 18 (pensionistas)'],
  ['CONTRATACAO POR TEMPO DETERMINADO', O, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'],
  ['OUTRAS DESPESAS VARIAVEIS', O, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'],
  ['DESPESAS DE PESSOAL DECORRENTES DE CONTRATOS DE TERCEIRIZACAO', O, 'Pessoal e encargos', 'LRF art. 18, §1º (terceirização)'],
  ['SENTENCAS JUDICIAIS', O, 'Dívida e sentenças', 'CF art. 100'],
  ['JUROS SOBRE A DIVIDA', O, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)'],
  ['ENCARGOS SOBRE A DIVIDA', O, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)'],
  ['PRINCIPAL DA DIVIDA', O, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)'],
  ['DESPESAS DE EXERCICIOS ANTERIORES', O, 'Outras obrigações', 'Lei 4.320/1964 art. 37'],
  ['RATEIO PELA PARTICIPACAO EM CONSORCIO', O, 'Outras obrigações', 'Lei 11.107/2005'],
  ['OBRAS E INSTALACOES', D, 'Investimentos', ''],
  ['EQUIPAMENTOS E MATERIAL PERMANENTE', D, 'Investimentos', ''],
  ['AQUISICAO DE IMOVEIS', D, 'Investimentos', ''],
  ['MATERIAL DE CONSUMO', D, 'Custeio', ''],
  ['PASSAGENS E DESPESAS COM LOCOMOCAO', D, 'Custeio', ''],
  ['DIARIAS', D, 'Custeio', ''],
  ['PREMIACOES', D, 'Custeio', ''],
  ['SERVICOS DE CONSULTORIA', D, 'Custeio', ''],
];

export function classificaNatureza(nome: string): ClasseNatureza {
  const n = norm(nome);
  const r = REGRAS_NATUREZA.find(([trecho]) => n.includes(trecho));
  return r ? { tipo: r[1], grupo: r[2], lei: r[3] } : { tipo: null, grupo: '', lei: '' };
}

/** Receita tributária própria e transferências dos arts. 153 §5º, 158 e 159 da CF (base do teto da Câmara). */
export const CODIGOS_ART29A = [
  '1112500100', '1112500200', '1112500300', '1112500400', '1112530100', '1112530300', '1112530400', '1113031100', '1113034100',
  '1114511100', '1114511200', '1114511300', '1114511400', '1121010100', '1121010300', '1121010400', '1121022300', '1121022400',
  '1121040100', '1121500100', '1122010101', '1122010102', '1122010110', '1122010300', '1122530100', '1122530300', '1122530400',
  '1711511100', '1711512100', '1711520100', '1721500100', '1721510100', '1721520100', '1721530100',
];

/** Percentual do art. 29-A pela população (EC 58/2009). A conferir com o jurídico. */
export function percentual29A(populacao: number) {
  for (const [ate, pct] of [[100_000, 7], [300_000, 6], [500_000, 5], [3_000_000, 4.5], [8_000_000, 4]] as const) if (populacao <= ate) return pct;
  return 3.5;
}
