// Indicadores de resultado: o que o projeto deve mudar na cidade (alunos atendidos, tempo de espera, km pavimentados…).
// A obra pode estar 100% e o resultado não ter vindo: por isso o resultado é medido à parte, com leituras que não se editam.
import type { DbPrefeitura } from '@/lib/financas/db';
import { lerData } from '@/lib/financas/auditoria/acoes';
import { curto, evento, fmt, lerDataOpcional, podeMexer, projetoVisivel, type Ator } from './acoes';
import type { Alerta } from './financeiro';
import { diasEntre } from './regras';

export interface LeituraBase { valor: number; data: Date }
export interface IndicadorBase { id: number; nome: string; unidade: string; linhaBase: number; meta: number; prazoMeta: Date | null; criadoEm: Date; leituras: LeituraBase[] }

/** A leitura mais recente; com a mesma data vale a lançada por último. */
export function ultimaLeitura<T extends LeituraBase>(ls: T[]): T | null {
  let m: T | null = null;
  for (const l of ls) if (!m || l.data.getTime() >= m.data.getTime()) m = l;
  return m;
}

/** Quanto do caminho entre a linha de base e a meta já foi percorrido (pode passar de 100 ou ficar negativo se piorou). null = sem leitura ou meta igual à base. */
export function progresso(i: Pick<IndicadorBase, 'linhaBase' | 'meta'>, atual: number | null): number | null {
  if (atual === null || i.meta === i.linhaBase) return null;
  return Math.round(((atual - i.linhaBase) / (i.meta - i.linhaBase)) * 100);
}
export const fmtNum = (n: number, unidade = '') => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${unidade ? ` ${unidade}` : ''}`;

const DIAS_SEM_LEITURA = 90;

/** Alertas de resultado: meta não atingida em projeto concluído ou com prazo vencido (atenção); indicador sem leitura recente (aviso). */
export function alertasResultado(fase: string, indicadores: IndicadorBase[], hoje: Date): Alerta[] {
  if (fase === 'cancelado' || fase === 'ideia' || fase === 'estudo') return [];
  const out: Alerta[] = [];
  for (const i of indicadores) {
    const ult = ultimaLeitura(i.leituras);
    const pr = progresso(i, ult?.valor ?? null);
    const naoAtingida = pr !== null && pr < 100;
    if (naoAtingida && fase === 'concluido')
      out.push({ codigo: `meta_nao_atingida:${i.id}`, nivel: 'medio', texto: `Projeto concluído e a meta de “${i.nome}” não foi atingida: ${pr}% do caminho (${fmtNum(ult!.valor, i.unidade)} de ${fmtNum(i.meta, i.unidade)})` });
    else if (naoAtingida && i.prazoMeta && diasEntre(i.prazoMeta, hoje) > 0)
      out.push({ codigo: `meta_vencida:${i.id}`, nivel: 'medio', texto: `Prazo da meta de “${i.nome}” (${fmt(i.prazoMeta)}) passou e o indicador está em ${pr}% do caminho` });
    if (fase === 'execucao' || fase === 'concluido') {
      const desde = ult?.data ?? i.criadoEm;
      const d = diasEntre(desde, hoje);
      if (d > DIAS_SEM_LEITURA && !(pr !== null && pr >= 100))
        out.push({ codigo: `indicador_sem_leitura:${i.id}`, nivel: 'info', texto: `Indicador “${i.nome}” ${ult ? `sem leitura há ${d} dias` : `criado há ${d} dias e ainda sem nenhuma leitura`}` });
    }
  }
  return out;
}

export function lerNumero(v: unknown, campo: string): number {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  if (!t) throw new Error(`Informe ${campo}`);
  // 1.250 = mil duzentos e cinquenta (ponto de milhar); 12.5 = doze e meio; com vírgula, o ponto é sempre milhar
  const milhar = /^-?\d{1,3}(\.\d{3})+$/.test(t);
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : milhar ? t.replace(/\./g, '') : t);
  if (!Number.isFinite(n)) throw new Error(`${campo}: use números, como 1.250 ou 12,5`);
  return n;
}

function conferirNaoCancelado(fase: string) {
  if (fase === 'cancelado') throw new Error('Projeto cancelado não aceita indicadores');
}

export async function criarIndicador(db: DbPrefeitura, a: Ator, projetoId: number, d: { nome: string; unidade?: string; linhaBase: unknown; meta: unknown; prazoMeta?: string }) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirNaoCancelado(p.fase);
  const nome = curto(d.nome, 200);
  if (!nome) throw new Error('Dê um nome ao indicador (ex.: alunos atendidos)');
  const linhaBase = lerNumero(d.linhaBase, 'o valor de hoje (linha de base)'), meta = lerNumero(d.meta, 'a meta');
  if (linhaBase === meta) throw new Error('A meta precisa ser diferente do valor de hoje');
  const prazoMeta = lerDataOpcional(d.prazoMeta, 'prazo da meta');
  const unidade = curto(d.unidade, 40);
  const i = await db.indicadorProjeto.create({ data: { prefeituraId: '', projetoId, nome, unidade, sentido: meta > linhaBase ? 'maior' : 'menor', linhaBase, meta, prazoMeta, criadoPor: a.nome } });
  await evento(db, projetoId, 'resultado', a.nome, `Indicador de resultado criado: “${nome}”, de ${fmtNum(linhaBase, unidade)} para ${fmtNum(meta, unidade)}${prazoMeta ? ` até ${fmt(prazoMeta)}` : ''}`);
  return i;
}

/** Registra uma medição. Vale também para projeto concluído: o resultado costuma aparecer depois da entrega. */
export async function registrarLeitura(db: DbPrefeitura, a: Ator, projetoId: number, indicadorId: number, d: { valor: unknown; data?: string; nota?: string }, hoje = new Date()) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirNaoCancelado(p.fase);
  const i = await db.indicadorProjeto.findFirst({ where: { id: indicadorId, projetoId } });
  if (!i) throw new Error('Indicador não encontrado');
  const valor = lerNumero(d.valor, 'o valor medido');
  const data = d.data ? lerData(curto(d.data, 20)) : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
  if (!data) throw new Error('Data da medição inválida');
  if (data.getTime() > hoje.getTime() + 86400000) throw new Error('A medição não pode ter data no futuro');
  await db.leituraIndicador.create({ data: { prefeituraId: '', indicadorId, valor, data, nota: curto(d.nota, 500), por: a.nome } });
  const pr = progresso(i, valor);
  await evento(db, projetoId, 'resultado', a.nome, `Medição de “${i.nome}”: ${fmtNum(valor, i.unidade)} em ${fmt(data)}${pr !== null ? ` (${pr}% do caminho até a meta)` : ''}${d.nota ? `. ${curto(d.nota, 500)}` : ''}`);
}
