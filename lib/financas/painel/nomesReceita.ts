// Nomes curtos das receitas para a tela do prefeito ("ISS", "FPM", "CFEM"...).
// Reconhece pela DESCRIÇÃO oficial do ementário da STN, que é a mesma em qualquer
// prefeitura, e não por uma lista de códigos de um município só.
// O que nenhuma regra reconhece fica com a descrição oficial, só mais legível.

function norm(s: string) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// [trechos que precisam aparecer na descrição (todos), nome curto]. A primeira que casar vale.
const REGRAS: [string[], string][] = [
  [['PROPRIEDADE PREDIAL'], 'IPTU'],
  [['TRANSMISSAO', 'INTER VIVOS'], 'ITBI'],
  [['RETIDO NA FONTE', 'TRABALHO'], 'IRRF (salários)'],
  [['RETIDO NA FONTE'], 'IRRF (outros)'],
  [['SERVICOS DE QUALQUER NATUREZA'], 'ISS'],
  [['ISSQN'], 'ISS'],
  [['FUNDO DE PARTICIPACAO DOS MUNICIPIOS'], 'FPM'],
  [['PROPRIEDADE TERRITORIAL RURAL'], 'ITR'],
  [['COTA-PARTE DO ICMS'], 'ICMS'],
  [['COTA-PARTE DO IPVA'], 'IPVA'],
  [['COTA-PARTE DO IPI'], 'IPI-Exportação'],
  [['CONTRIBUICAO DE INTERVENCAO NO DOMINIO ECONOMICO'], 'CIDE'],
  [['RECURSOS MINERAIS'], 'CFEM (mineração)'],
  [['FUNDO DE MANUTENCAO E DESENVOLVIMENTO DA EDUCACAO'], 'FUNDEB'],
  [['FUNDEB'], 'FUNDEB'],
  [['SALARIO-EDUCACAO'], 'Salário-educação'],
  [['SISTEMA UNICO DE SAUDE'], 'SUS'],
  [['SERVICOS PUBLICOS DE SAUDE'], 'SUS'],
  [['REMUNERACAO DE DEPOSITOS'], 'Rendimentos de aplicações'],
  [['ILUMINACAO PUBLICA'], 'Iluminação pública (COSIP)'],
  [['TAXAS DE INSPECAO'], 'Taxas de fiscalização'],
  [['TAXA DE FISCALIZACAO'], 'Taxas de fiscalização'],
  [['TAXA DE CONTROLE E FISCALIZACAO'], 'Taxas de fiscalização'],
  [['CONTRIBUICAO DE MELHORIA'], 'Contribuição de melhoria'],
];

const MIUDAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'por', 'sobre', 'na', 'no']);

/** Descrição oficial em caixa alta -> legível ("Receita Patrimonial"). */
export function descricaoLegivel(nome: string) {
  const d = nome.replace(/\s*-\s*PRINCIPAL\s*$/i, '').replace(/\s+/g, ' ').trim();
  if (d !== d.toUpperCase()) return d;
  return d
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && MIUDAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Nome curto da fonte de receita, sem o detalhe de principal/multa/dívida ativa. null = sem regra. */
export function nomeCurtoReceita(nome: string): string | null {
  const n = norm(nome);
  for (const [trechos, curto] of REGRAS) if (trechos.every((t) => n.includes(t))) return curto;
  return null;
}
