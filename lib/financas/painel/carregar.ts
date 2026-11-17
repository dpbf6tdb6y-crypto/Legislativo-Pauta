// Busca no banco (sempre pelo cliente preso à prefeitura) o que o painel do prefeito e as regras de
// execução precisam. Os cálculos ficam em fiscal.ts.
import type { DbPrefeitura } from '@/lib/financas/db';
import { dividaLRF, execucao, pessoalLRF, resumoReceita, resumoRREO, type Execucao, type PessoalLRF, type ResumoReceita } from './fiscal';

/** Ano mais recente com despesa coletada (o ano corrente, salvo em janeiro antes da 1ª coleta). */
async function anoComDados(db: DbPrefeitura, hoje: Date) {
  const r = await db.despesaOrgaoMes.findFirst({ where: { mes: 0 }, orderBy: { ano: 'desc' }, select: { ano: true } });
  return r?.ano ?? hoje.getFullYear();
}

export async function carregarExecucao(db: DbPrefeitura, hoje: Date): Promise<Execucao | null> {
  const ano = await anoComDados(db, hoje);
  return execucao(ano, await db.despesaOrgaoMes.findMany({ where: { ano, mes: 0 } }), hoje);
}

export async function carregarReceita(db: DbPrefeitura, hoje: Date, nFontes = 8): Promise<ResumoReceita | null> {
  const ano = await anoComDados(db, hoje);
  const ult = await db.receitaContaMes.findFirst({ where: { ano }, orderBy: { mes: 'desc' }, select: { mes: true } });
  if (!ult) return null;
  return resumoReceita(ano, ult.mes, await db.receitaContaMes.findMany({ where: { ano, mes: ult.mes } }), nFontes);
}

export async function carregarPessoal(db: DbPrefeitura): Promise<PessoalLRF | null> {
  return pessoalLRF(await db.indicadorFiscal.findMany({ where: { relatorio: 'RGF' } }));
}

export async function carregarRREO(db: DbPrefeitura) {
  return resumoRREO(await db.indicadorFiscal.findMany({ where: { relatorio: 'RREO' } }));
}

export async function carregarDivida(db: DbPrefeitura) {
  return dividaLRF(await db.indicadorFiscal.findMany({ where: { relatorio: 'RGF', chave: { in: ['dcl', 'dcl_pct', 'dcl_limite_pct'] } } }));
}
