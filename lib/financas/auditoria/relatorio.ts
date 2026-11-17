// Relatório de auditoria interna da Gestão $$$ (sucessor do botão "Auditoria interna" do painel):
// roda TODAS as regras (aprovadas ou não), junta os apontamentos e os pontos cobrados das secretarias,
// e GUARDA o resultado. O que foi gravado não muda: o SHA-256 do conteúdo prova o que o relatório mostrava.
import crypto from 'crypto';
import type { DbPrefeitura } from '../db';
import { REGRAS } from '../regras/motor';
import { frescorFontes } from '../coleta/frescor';
import { resumoPontos } from './regras';

export type Situacao = 'critico' | 'atencao' | 'ordem' | 'sem_dado';

export interface ItemRelatorio {
  codigo: string;
  titulo: string;
  baseLegal: string;
  estadoRegra: string; // proposta | aprovada | desligada
  situacao: Situacao;
  achados: { resumo: string; valor: string }[];
  totalAchados: number;
  recomendacao: string;
  observacao: string;
}

export interface ConteudoRelatorio {
  versao: 1;
  geradoEm: string;
  geradoPor: string;
  itens: ItemRelatorio[];
  apontamentos: { paraAnalise: number; procedentes: number; improcedentes: number };
  secretarias: { abertos: number; atrasados: number; venceEmBreve: number; respondidos: number; resolvidos: number };
  fontes: { nome: string; baixadoEm: string | null }[];
  limitacoes: string[];
}

// recomendação de cada ponto de controle (as do painel, onde existiam)
const RECOMENDACAO: Record<string, string> = {
  O3: 'Conferir com a Contabilidade a sequência empenho → liquidação → pagamento dos empenhos apontados.',
  C2a: 'Verificar se houve prorrogação (aditivo) não publicada ou pagamento sem cobertura contratual.',
  C2b: 'Priorizar prorrogações ou novos processos dos contratos com vencimento próximo, evitando contratação sem cobertura.',
  C4: 'Conferir aditivos de valor e o saldo do contrato antes de novos empenhos.',
  F1: 'Acompanhar mensalmente a despesa com pessoal; antes de nomeações, reajustes ou horas extras, simular o efeito sobre o limite.',
  C1: 'Conferir a publicação dos contratos (condição de eficácia).',
  F3: 'Acompanhar a dívida consolidada; acima do limite, aplicar as restrições do art. 31 da LRF.',
  F4: 'Programar a aplicação do saldo até dezembro para atingir os mínimos de Educação, FUNDEB e Saúde.',
  E1: 'Acompanhar o ritmo de empenho contra o calendário e a arrecadação, para não comprometer o fim do exercício.',
  E2: 'Conferir se os créditos adicionais têm lei ou decreto e fonte de recurso indicada.',
  E3: 'Verificar o fluxo de caixa e quanto da despesa foi coberto por saldo de exercícios anteriores; se persistir, avaliar a limitação de empenho (LRF art. 9º).',
  R1: 'Rever a previsão de receita e avaliar a limitação de empenho (LRF art. 9º).',
  T1: 'Avaliar a substituição gradual da contratação temporária por provimento efetivo, observados os limites de pessoal.',
  P1: 'Cobrar da Contabilidade a publicação do RREO no prazo legal.',
  A29: 'Controlar o duodécimo contra o teto do art. 29-A; repasse acima do teto é crime de responsabilidade.',
};

// mesma régua do painel: o que é descumprimento/risco imediato é crítico; o resto é atenção
const CRITICOS = new Set(['F1', 'F3', 'F4', 'A29', 'O3']);

export async function montarRelatorio(db: DbPrefeitura, geradoPor: string, agora = new Date()): Promise<ConteudoRelatorio> {
  const regras = await db.regra.findMany();
  const itens: ItemRelatorio[] = [];
  for (const def of REGRAS) {
    const reg = regras.find((r) => r.codigo === def.codigo);
    const params = { ...def.parametrosPadrao, ...JSON.parse(reg?.parametros ?? '{}') };
    const falta = def.exigeParametro?.filter((k) => params[k] === null || params[k] === undefined) ?? [];
    let achados: Awaited<ReturnType<typeof def.avaliar>> = [];
    let observacao = '';
    if (falta.length) observacao = `Sem avaliação: falta definir ${falta.join(', ')} (tela Regras).`;
    else {
      try { achados = await def.avaliar(db, params); }
      catch (e: any) { observacao = `Não avaliada: ${String(e?.message ?? e).slice(0, 200)}`; }
    }
    const situacao: Situacao = falta.length || observacao ? 'sem_dado' : !achados.length ? 'ordem' : CRITICOS.has(def.codigo) ? 'critico' : 'atencao';
    itens.push({
      codigo: def.codigo, titulo: def.titulo, baseLegal: def.baseLegal, estadoRegra: reg?.estado ?? 'proposta', situacao,
      achados: achados.slice(0, 20).map((a) => ({ resumo: a.resumo, valor: a.valorEncontrado })),
      totalAchados: achados.length, recomendacao: RECOMENDACAO[def.codigo] ?? 'Acompanhar.', observacao,
    });
  }
  const ap = await db.apontamento.groupBy({ by: ['status'], _count: { _all: true } });
  const n = (st: string) => ap.find((a) => a.status === st)?._count._all ?? 0;
  const pontos = await db.pontoAuditoria.findMany({ select: { status: true, prazo: true } });
  const fontes = await frescorFontes(db);
  return {
    versao: 1, geradoEm: agora.toISOString(), geradoPor, itens,
    apontamentos: { paraAnalise: n('para_analise'), procedentes: n('procedente'), improcedentes: n('improcedente') },
    secretarias: resumoPontos(pontos, agora),
    fontes: fontes.map((f) => ({ nome: f.nome, baixadoEm: f.baixadoEm ? f.baixadoEm.toISOString() : null })),
    limitacoes: [
      'O portal não informa a fonte (destinação) de recurso da despesa: a aplicação das receitas vinculantes não pode ser confirmada.',
      'A ligação contrato ↔ empenho é deduzida (o portal não a publica); a certeza aparece em cada contrato.',
      'Os limites de Pessoal, Educação, Saúde e Dívida seguem o RGF/RREO oficiais do SICONFI (posição do último período publicado).',
      'Regras ainda "propostas" aparecem no relatório, mas só geram apontamento depois de aprovadas por uma pessoa.',
      'Este relatório não substitui a auditoria do controle interno, o parecer do Tribunal de Contas nem o RREO/RGF oficiais.',
    ],
  };
}

export const hashConteudo = (json: string) => crypto.createHash('sha256').update(json).digest('hex');

/** Gera e GUARDA o relatório. Devolve o registro gravado. */
export async function gerarRelatorio(db: DbPrefeitura, prefeituraId: string, geradoPor: string, agora = new Date()) {
  const c = await montarRelatorio(db, geradoPor, agora);
  const json = JSON.stringify(c);
  return db.relatorioAuditoria.create({
    data: {
      prefeituraId, geradoPor, geradoEm: agora, conteudo: json, sha256: hashConteudo(json),
      criticos: c.itens.filter((i) => i.situacao === 'critico').length,
      atencao: c.itens.filter((i) => i.situacao === 'atencao').length,
    },
  });
}

/** Lê um relatório guardado e confere se o conteúdo ainda bate com o SHA-256 gravado. */
export function lerRelatorio(r: { conteudo: string; sha256: string }) {
  return { conteudo: JSON.parse(r.conteudo) as ConteudoRelatorio, integro: hashConteudo(r.conteudo) === r.sha256 };
}
