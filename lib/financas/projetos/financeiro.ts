// Projeto × dinheiro do portal: regras puras (sem banco), testáveis.
// Um projeto se liga a contratos (pelos empenhos ligados a eles) e a ações orçamentárias (programa + projeto da despesa).
// Contrato e ação podem alcançar o mesmo empenho: dentro do projeto cada empenho entra UMA vez.
import { brlCurto } from '@/lib/financas/dinheiro';
import { diasEntre } from './regras';

export interface EmpenhoFin {
  id: number; valor: bigint; anulado: bigint; aLiquidar: bigint;
  pago: bigint; // soma dos pagamentos listados
  ultimoPagamento: Date | null;
}
export interface Execucao { empenhos: number; empenhado: bigint; liquidado: bigint; pago: bigint; ultimoPagamento: Date | null }

export const execucaoVazia = (): Execucao => ({ empenhos: 0, empenhado: 0n, liquidado: 0n, pago: 0n, ultimoPagamento: null });

/** Soma os empenhos sem repetir nenhum. Empenhado = valor − anulado; liquidado = empenhado − a liquidar; pago = pagamentos listados (mesma conta da tela de contratos por secretaria). */
export function somarExecucao(emps: EmpenhoFin[]): Execucao {
  const vistos = new Set<number>();
  const r = execucaoVazia();
  for (const e of emps) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    r.empenhos++;
    r.empenhado += e.valor - e.anulado;
    r.liquidado += e.valor - e.anulado - e.aLiquidar;
    r.pago += e.pago;
    if (e.ultimoPagamento && (!r.ultimoPagamento || e.ultimoPagamento > r.ultimoPagamento)) r.ultimoPagamento = e.ultimoPagamento;
  }
  return r;
}

export interface ContratoLigado {
  vinculoId: number; id: number; numero: string; ano: number; fornecedorNome: string; objeto: string; situacao: string;
  fim: Date | null; valorAtual: bigint; certeza: 'alta' | 'media';
  execucao: Execucao;
  outrosProjetos: { id: number; titulo: string }[];
}
export interface AcaoLigada {
  vinculoId: number; programa: string; acao: string; orgaoEmpenho: string; desde: Date | null;
  execucao: Execucao;
  outrosProjetos: { id: number; titulo: string }[];
}
export interface FinanceiroProjeto {
  contratos: ContratoLigado[]; acoes: AcaoLigada[];
  /** soma dos valores atuais dos contratos ligados (o que a prefeitura já se comprometeu a pagar) */
  contratado: bigint;
  /** total do projeto, sem contar duas vezes o mesmo empenho */
  execucao: Execucao;
}

export type NivelAlerta = 'alto' | 'medio' | 'info';
export interface Alerta { codigo: string; nivel: NivelAlerta; texto: string }

// limites (ajustáveis)
const FOLGA_PAGO_SOBRE_AVANCO = 25; // pontos percentuais
const DIAS_SEM_EMPENHO = 60;
const DIAS_PAGAMENTO_RECENTE = 30;

export interface ProjetoParaAlerta {
  fase: string; orcamento: bigint | null; inicioPrevisto: Date | null; fimPrevisto: Date | null; inicioReal: Date | null; avanco: number | null;
}

const ROT_NIVEL: Record<NivelAlerta, number> = { alto: 0, medio: 1, info: 2 };
const dt = (d: Date) => d.toLocaleDateString('pt-BR');

/**
 * Alertas que cruzam o projeto com o dinheiro. Não mudam o semáforo de prazo: aparecem ao lado, sempre com o motivo.
 * Só projeto aprovado, em execução, paralisado ou cancelado é cobrado pelo gasto.
 */
export function alertasFinanceiros(p: ProjetoParaAlerta, f: FinanceiroProjeto, hoje: Date): Alerta[] {
  const out: Alerta[] = [];
  const ativo = ['aprovado', 'execucao', 'paralisado'].includes(p.fase);
  const tem = f.contratos.length + f.acoes.length > 0;
  const ex = f.execucao;

  if (!tem) {
    if (p.fase === 'execucao') out.push({ codigo: 'sem_ligacao', nivel: 'info', texto: 'Em execução sem ligação com contrato ou despesa: o sistema não consegue acompanhar o gasto' });
    return out;
  }

  if (p.orcamento !== null && p.orcamento > 0n && p.fase !== 'cancelado') {
    if (ex.empenhado > p.orcamento) {
      const pct = Number(((ex.empenhado - p.orcamento) * 1000n) / p.orcamento) / 10;
      out.push({ codigo: 'estouro', nivel: 'alto', texto: `Empenhado ${brlCurto(ex.empenhado)} passa do orçamento do projeto (${brlCurto(p.orcamento)}), ${pct.toLocaleString('pt-BR')}% a mais` });
    } else if (f.contratado > p.orcamento) {
      out.push({ codigo: 'contratado_acima', nivel: 'medio', texto: `Os contratos ligados somam ${brlCurto(f.contratado)}, acima do orçamento do projeto (${brlCurto(p.orcamento)})` });
    }
    if ((p.fase === 'execucao' || p.fase === 'paralisado') && p.avanco !== null) {
      const pagoPct = Number((ex.pago * 1000n) / p.orcamento) / 10;
      if (pagoPct - p.avanco > FOLGA_PAGO_SOBRE_AVANCO)
        out.push({ codigo: 'pago_adiantado', nivel: 'medio', texto: `Já foi pago ${Math.round(pagoPct)}% do orçamento e o avanço registrado é ${p.avanco}%` });
    }
  }

  if (p.fase === 'execucao' && ex.empenhado === 0n) {
    const base = p.inicioReal ?? p.inicioPrevisto;
    const d = base ? diasEntre(base, hoje) : 0;
    if (d > DIAS_SEM_EMPENHO) out.push({ codigo: 'sem_empenho', nivel: 'medio', texto: `Em execução há ${d} dias e nada foi empenhado nos contratos e ações ligados` });
  }

  if ((p.fase === 'paralisado' || p.fase === 'cancelado') && ex.ultimoPagamento) {
    const d = diasEntre(ex.ultimoPagamento, hoje);
    if (d >= 0 && d <= DIAS_PAGAMENTO_RECENTE)
      out.push({ codigo: 'pagamento_parado', nivel: p.fase === 'cancelado' ? 'alto' : 'medio', texto: `Projeto ${p.fase === 'cancelado' ? 'cancelado' : 'paralisado'} e houve pagamento em ${dt(ex.ultimoPagamento)} nos contratos e ações ligados` });
  }

  for (const c of f.contratos) {
    const rot = `Contrato ${c.numero}/${c.ano}`;
    const cumprido = c.valorAtual > 0n && c.execucao.pago >= c.valorAtual;
    if (ativo && c.fim && !cumprido) {
      if (diasEntre(c.fim, hoje) > 0 && p.fase === 'execucao')
        out.push({ codigo: `contrato_vencido:${c.id}`, nivel: 'alto', texto: `${rot} (${c.fornecedorNome}) venceu em ${dt(c.fim)} e o projeto segue em execução` });
      else if (p.fimPrevisto && c.fim < p.fimPrevisto && diasEntre(c.fim, hoje) <= 0)
        out.push({ codigo: `contrato_curto:${c.id}`, nivel: 'medio', texto: `${rot} vence em ${dt(c.fim)}, antes do fim previsto do projeto (${dt(p.fimPrevisto)})` });
    }
    if (c.certeza === 'media') out.push({ codigo: `ligacao_provavel:${c.id}`, nivel: 'info', texto: `${rot} está ligado aos empenhos por dedução provável (certeza média): confira o valor` });
    if (c.outrosProjetos.length) out.push({ codigo: `compartilhado:${c.id}`, nivel: 'info', texto: `${rot} também está no projeto ${c.outrosProjetos.map((o) => `“${o.titulo}”`).join(', ')}: o gasto aparece nos dois` });
  }
  for (const a of f.acoes)
    if (a.outrosProjetos.length) out.push({ codigo: `compartilhada:${a.vinculoId}`, nivel: 'info', texto: `A ação “${a.acao}” também está no projeto ${a.outrosProjetos.map((o) => `“${o.titulo}”`).join(', ')}: o gasto aparece nos dois` });

  return out.sort((a, b) => ROT_NIVEL[a.nivel] - ROT_NIVEL[b.nivel]);
}

/** Maior nível entre os alertas (para o selo da lista). */
export function nivelMaximo(alertas: Alerta[]): NivelAlerta | null {
  if (alertas.some((a) => a.nivel === 'alto')) return 'alto';
  if (alertas.some((a) => a.nivel === 'medio')) return 'medio';
  return alertas.length ? 'info' : null;
}
