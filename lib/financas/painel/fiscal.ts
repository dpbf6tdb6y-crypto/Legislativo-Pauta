// Cálculos do painel do prefeito. Funções puras (sem banco), para poderem ser testadas.
// Dinheiro em CENTAVOS (bigint); percentuais em PONTOS-BASE (bigint: 31,91% = 3191n).
// Nada aqui decide o que é irregular: o painel descreve a situação e cita a lei.
import { centavos } from '@/lib/financas/dinheiro';
import { descricaoLegivel, nomeCurtoReceita } from './nomesReceita';

export type Nivel = 'ok' | 'observacao' | 'atencao';
const PESO: Record<Nivel, number> = { ok: 0, observacao: 1, atencao: 2 };
export const piorNivel = (ns: Nivel[]): Nivel => ns.reduce<Nivel>((a, n) => (PESO[n] > PESO[a] ? n : a), 'ok');

/** "48.6" / "54" / "31,91" -> pontos-base (4860n / 5400n / 3191n) */
export const pontosBase = (pct: string) => centavos(pct.replace(',', '.'));
/** a / b em pontos-base (arredonda para baixo) */
export const razaoBp = (a: bigint, b: bigint) => (b === BigInt(0) ? null : (a * BigInt(10000)) / b);

/** Parte do ano já decorrida, em pontos-base. Ano já encerrado = 100%. */
export function tempoDecorridoBp(ano: number, hoje: Date): bigint {
  if (ano < hoje.getFullYear()) return BigInt(10000);
  if (ano > hoje.getFullYear()) return BigInt(0);
  const ini = Date.UTC(ano, 0, 1);
  const fim = Date.UTC(ano + 1, 0, 1);
  const agora = Date.UTC(ano, hoje.getMonth(), hoje.getDate());
  return BigInt(Math.floor(((agora - ini) / (fim - ini)) * 10000));
}

// ---------------------------------------------------------------- pessoal (RGF)

export interface IndicadorFiscalLido { ano: number; periodo: number; relatorio: string; chave: string; valor: string }
export type NivelLRF = 'abaixo' | 'alerta' | 'prudencial' | 'maximo';

export interface LimiteLRF { nome: 'alerta' | 'prudencial' | 'maximo'; rotulo: string; pctBp: bigint; valor: bigint; margem: bigint }

export interface PessoalLRF {
  ano: number;
  quadrimestre: number;
  rcl: bigint;          // base usada no % (RCL ajustada, quando o RGF traz)
  despesa: bigint;      // despesa total com pessoal, 12 meses
  pctBp: bigint;
  limites: LimiteLRF[];
  nivel: NivelLRF;
  /** maior valor por mês (média) que ainda cabe antes do limite de alerta; null se já passou */
  folgaMensalAteAlerta: bigint | null;
}

export const LRF_O_QUE_A_LEI_PREVE: Record<NivelLRF, string> = {
  abaixo: 'Abaixo do limite de alerta. A LRF não prevê providência específica nesta faixa.',
  alerta: 'Limite de alerta (90% do máximo): o Tribunal de Contas emite alerta ao Poder (LRF art. 59, §1º, II).',
  prudencial:
    'Limite prudencial (95% do máximo): ficam vedados, entre outros, aumento de remuneração (salvo revisão geral), criação de cargo, alteração de carreira com aumento de despesa, provimento de cargo (salvo reposição em educação, saúde e segurança) e hora extra (LRF art. 22, parágrafo único).',
  maximo:
    'Acima do limite máximo: o excedente precisa ser eliminado nos dois quadrimestres seguintes, pelo menos um terço no primeiro, além das vedações do limite prudencial (LRF art. 23).',
};

export function pessoalLRF(ind: IndicadorFiscalLido[]): PessoalLRF | null {
  const rgf = ind.filter((i) => i.relatorio === 'RGF');
  if (!rgf.length) return null;
  const ult = [...rgf].sort((a, b) => b.ano - a.ano || b.periodo - a.periodo)[0];
  const v = (k: string) => rgf.find((i) => i.ano === ult.ano && i.periodo === ult.periodo && i.chave === k)?.valor;
  const base = v('rcl_ajustada') ?? v('rcl');
  const dtp = v('dtp');
  const pct = v('dtp_pct');
  const pa = v('limite_alerta_pct'), pp = v('limite_prudencial_pct'), pm = v('limite_max_pct');
  if (!base || !dtp || !pct || !pa || !pp || !pm) return null;
  const rcl = centavos(base), despesa = centavos(dtp), pctBp = pontosBase(pct);
  const lim = (nome: LimiteLRF['nome'], rotulo: string, p: string): LimiteLRF => {
    const pctL = pontosBase(p);
    const valor = (rcl * pctL) / BigInt(10000);
    return { nome, rotulo, pctBp: pctL, valor, margem: valor - despesa };
  };
  const limites = [lim('alerta', 'Alerta', pa), lim('prudencial', 'Prudencial', pp), lim('maximo', 'Máximo', pm)];
  const nivel: NivelLRF =
    pctBp >= limites[2].pctBp ? 'maximo' : pctBp >= limites[1].pctBp ? 'prudencial' : pctBp >= limites[0].pctBp ? 'alerta' : 'abaixo';
  const folga = limites[0].margem;
  return { ano: ult.ano, quadrimestre: ult.periodo, rcl, despesa, pctBp, limites, nivel, folgaMensalAteAlerta: folga > BigInt(0) ? folga / BigInt(12) : null };
}

export const nivelDoLRF = (n: NivelLRF): Nivel => (n === 'abaixo' ? 'ok' : n === 'alerta' ? 'observacao' : 'atencao');

// ---------------------------------------------------------------- execução da despesa

export interface OrgaoAno { orgaoCod: string; orgaoNome: string; dotInicial: bigint; dotAtual: bigint; empenhado: bigint; liquidado: bigint; pago: bigint }
export interface Totais { dotInicial: bigint; dotAtual: bigint; empenhado: bigint; liquidado: bigint; pago: bigint }

/** Câmara Municipal (Poder Legislativo): o orçamento do município a inclui, mas o prefeito não a executa. */
export const ehLegislativo = (nome: string) => /C[ÂA]MARA\s+MUNICIPAL/i.test(nome);

const somaT = (os: OrgaoAno[]): Totais => ({
  dotInicial: os.reduce((a, o) => a + o.dotInicial, BigInt(0)),
  dotAtual: os.reduce((a, o) => a + o.dotAtual, BigInt(0)),
  empenhado: os.reduce((a, o) => a + o.empenhado, BigInt(0)),
  liquidado: os.reduce((a, o) => a + o.liquidado, BigInt(0)),
  pago: os.reduce((a, o) => a + o.pago, BigInt(0)),
});

export interface Execucao {
  ano: number;
  executivo: Totais;          // sem a Câmara
  legislativo: Totais | null;
  municipio: Totais;          // tudo
  empenhadoBp: bigint | null; // empenhado ÷ dotação atual (Executivo)
  tempoBp: bigint;
  /** dotação atual − inicial (Executivo): créditos adicionais líquidos de anulações */
  variacaoDotacao: bigint;
  variacaoDotacaoBp: bigint | null;
}

export function execucao(ano: number, orgaos: OrgaoAno[], hoje: Date): Execucao | null {
  if (!orgaos.length) return null;
  const leg = orgaos.filter((o) => ehLegislativo(o.orgaoNome));
  const exe = somaT(orgaos.filter((o) => !ehLegislativo(o.orgaoNome)));
  return {
    ano,
    executivo: exe,
    legislativo: leg.length ? somaT(leg) : null,
    municipio: somaT(orgaos),
    empenhadoBp: razaoBp(exe.empenhado, exe.dotAtual),
    tempoBp: tempoDecorridoBp(ano, hoje),
    variacaoDotacao: exe.dotAtual - exe.dotInicial,
    variacaoDotacaoBp: razaoBp(exe.dotAtual - exe.dotInicial, exe.dotInicial),
  };
}

// ---------------------------------------------------------------- receita

export interface ContaReceita { contaCod: string; contaPai: string; nome: string; previstoInicial: bigint; previstoAtual: bigint; arrecAteMes: bigint }
export interface LinhaReceita { cod: string; nome: string; previstoInicial: bigint; previstoAtual: bigint; arrecadado: bigint; arrecadadoBp: bigint | null }
export interface FonteReceita { nome: string; arrecadado: bigint; partBp: bigint | null; contas: number }

export interface ResumoReceita {
  ano: number;
  mes: number;
  grupos: LinhaReceita[];        // origem: impostos, transferências... (correntes e de capital)
  correntes: LinhaReceita | null;
  capital: LinhaReceita | null;
  deducoes: LinhaReceita | null; // ex.: formação do FUNDEB
  liquida: { previstoAtual: bigint; arrecadado: bigint; arrecadadoBp: bigint | null };
  fontes: FonteReceita[];        // principais fontes, agrupadas pelo nome curto
}

const linha = (c: ContaReceita): LinhaReceita => ({
  cod: c.contaCod, nome: descricaoLegivel(c.nome), previstoInicial: c.previstoInicial, previstoAtual: c.previstoAtual,
  arrecadado: c.arrecAteMes, arrecadadoBp: razaoBp(c.arrecAteMes, c.previstoAtual),
});

/** contas de UM mês (valores acumulados até o mês) */
export function resumoReceita(ano: number, mes: number, contas: ContaReceita[], nFontes = 8): ResumoReceita | null {
  if (!contas.length) return null;
  const cods = new Set(contas.map((c) => c.contaCod));
  const raizes = contas.filter((c) => !c.contaPai || !cods.has(c.contaPai));
  const raiz = (d: string) => raizes.find((c) => c.contaCod.startsWith(d));
  const corr = raiz('1'), cap = raiz('2'), ded = raiz('9');
  const grupos = contas
    .filter((c) => (corr && c.contaPai === corr.contaCod) || (cap && c.contaPai === cap.contaCod))
    .map(linha)
    .sort((a, b) => (b.arrecadado > a.arrecadado ? 1 : b.arrecadado < a.arrecadado ? -1 : 0));
  const val = (c: ContaReceita | undefined, k: 'previstoAtual' | 'arrecAteMes') => (c ? c[k] : BigInt(0));
  const liqPrev = val(corr, 'previstoAtual') + val(cap, 'previstoAtual') - val(ded, 'previstoAtual');
  const liqArr = val(corr, 'arrecAteMes') + val(cap, 'arrecAteMes') - val(ded, 'arrecAteMes');

  // principais fontes: contas analíticas (sem filhas), fora das deduções, agrupadas pelo nome curto
  const pais = new Set(contas.map((c) => c.contaPai));
  const folhas = contas.filter((c) => !pais.has(c.contaCod) && !(ded && c.contaCod.startsWith(ded.contaCod.charAt(0))));
  const brutoTotal = val(corr, 'arrecAteMes') + val(cap, 'arrecAteMes');
  const porNome = new Map<string, FonteReceita>();
  for (const f of folhas) {
    const nome = nomeCurtoReceita(f.nome) ?? descricaoLegivel(f.nome);
    const x = porNome.get(nome) ?? { nome, arrecadado: BigInt(0), partBp: null, contas: 0 };
    x.arrecadado += f.arrecAteMes;
    x.contas++;
    porNome.set(nome, x);
  }
  const fontes = [...porNome.values()]
    .filter((f) => f.arrecadado > BigInt(0))
    .sort((a, b) => (b.arrecadado > a.arrecadado ? 1 : b.arrecadado < a.arrecadado ? -1 : 0))
    .slice(0, nFontes)
    .map((f) => ({ ...f, partBp: razaoBp(f.arrecadado, brutoTotal) }));

  return {
    ano, mes, grupos,
    correntes: corr ? linha(corr) : null,
    capital: cap ? linha(cap) : null,
    deducoes: ded ? linha(ded) : null,
    liquida: { previstoAtual: liqPrev, arrecadado: liqArr, arrecadadoBp: razaoBp(liqArr, liqPrev) },
    fontes,
  };
}

// ---------------------------------------------------------------- equilíbrio da LOA e projeção da receita

export interface EquilibrioLOA {
  recIni: bigint;   // receita líquida prevista na LOA (correntes + capital − deduções)
  recAtual: bigint; // receita líquida prevista, atualizada
  despIni: bigint;  // despesa fixada na LOA
  despAtual: bigint;// despesa autorizada (LOA + créditos adicionais líquidos)
  difIni: bigint;   // despesa − receita na aprovação
  difAtual: bigint; // despesa autorizada − receita prevista atualizada (positivo = despesa acima da receita)
  difAtualBp: bigint | null;
  creditos: bigint; // despesa atual − inicial
}

/** Município inteiro (Câmara incluída): a LOA é um orçamento só, receita e despesa do mesmo conjunto. */
export function equilibrioLOA(rec: ResumoReceita | null, despesa: Totais | null): EquilibrioLOA | null {
  if (!rec || !despesa || !rec.correntes) return null;
  const z = BigInt(0);
  const recIni = rec.correntes.previstoInicial + (rec.capital?.previstoInicial ?? z) - (rec.deducoes?.previstoInicial ?? z);
  const recAtual = rec.liquida.previstoAtual;
  return {
    recIni, recAtual, despIni: despesa.dotInicial, despAtual: despesa.dotAtual,
    difIni: despesa.dotInicial - recIni, difAtual: despesa.dotAtual - recAtual,
    difAtualBp: razaoBp(despesa.dotAtual - recAtual, recAtual), creditos: despesa.dotAtual - despesa.dotInicial,
  };
}

export interface ProjecaoReceita {
  fracaoBp: bigint;         // parte da receita do ano anterior que já tinha entrado até o mesmo mês
  realizado: bigint;
  projetada: bigint;
  contraPrevisao: bigint;   // projetada − previsão atualizada
  contraPrevisaoBp: bigint | null;
  contraDespesa: bigint;    // projetada − despesa autorizada
}

/**
 * Estimativa: assume que o ano repete a distribuição da arrecadação do ano anterior.
 * `anteriorAteMes` e `anteriorAno`: receita líquida arrecadada no ano anterior até o mesmo mês e no ano todo.
 */
export function projecaoReceita(p: { realizado: bigint; anteriorAteMes: bigint; anteriorAno: bigint; previstoAtual: bigint; despAtual: bigint }): ProjecaoReceita | null {
  const z = BigInt(0);
  if (p.anteriorAteMes <= z || p.anteriorAno <= z || p.realizado <= z || p.anteriorAteMes > p.anteriorAno) return null;
  const projetada = (p.realizado * p.anteriorAno) / p.anteriorAteMes;
  return {
    fracaoBp: razaoBp(p.anteriorAteMes, p.anteriorAno) ?? z, realizado: p.realizado, projetada,
    contraPrevisao: projetada - p.previstoAtual, contraPrevisaoBp: razaoBp(projetada, p.previstoAtual),
    contraDespesa: projetada - p.despAtual,
  };
}

// ---------------------------------------------------------------- confiança dos dados

export interface ItemConfianca { nivel: Nivel; titulo: string; detalhe: string }

/** Último quadrimestre cujo RGF já deveria estar publicado: 30 dias após o fim do quadrimestre (LRF art. 55, §2º). */
export function rgfEsperado(hoje: Date): { ano: number; quadrimestre: number; prazo: Date } {
  for (let ano = hoje.getFullYear(); ; ano--) {
    for (let q = 3; q >= 1; q--) {
      const fimQ = new Date(ano, 4 * q, 0); // último dia do mês 4q
      const prazo = new Date(fimQ.getTime() + 30 * 86400000);
      if (prazo <= hoje) return { ano, quadrimestre: q, prazo };
    }
  }
}

/** Os 12 meses fechados anteriores ao mês atual, no formato "2026/10". */
export function ultimos12Meses(hoje: Date): string[] {
  const out: string[] = [];
  let a = hoje.getFullYear(), m = hoje.getMonth(); // getMonth() = mês anterior em base 1
  for (let i = 0; i < 12; i++) {
    if (m === 0) { a--; m = 12; }
    out.unshift(`${a}/${String(m).padStart(2, '0')}`);
    m--;
  }
  return out;
}

const dataBR = (d: Date) => d.toLocaleDateString('pt-BR');

export function confiancaDados(e: {
  hoje: Date;
  ultimaColeta: { status: string; fim: Date | null } | null;
  coletaRodando: { inicio: Date } | null;
  rgf: { ano: number; quadrimestre: number } | null | undefined; // undefined = sem permissão de ver (não checa)
  folhaMeses: { anoMes: string; linhasPortal: number; linhasColetadas: number }[] | null; // null = sem permissão de ver
  /** data de cada fonte, pelo arquivo baixado (src/coleta/frescor.ts); quando vem, substitui a data da "última coleta" */
  fontes?: { nome: string; baixadoEm: Date | null; diaria: boolean }[];
  /** coletas que começaram e não terminaram; quando vem, substitui coletaRodando */
  interrompidas?: { id: number; inicio: Date }[];
}): ItemConfianca[] {
  const it: ItemConfianca[] = [];
  const { hoje } = e;
  const u = e.ultimaColeta;
  const dh = (d: Date) => `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (e.fontes) {
    // a data que vale é a de cada fonte; coleta parcial ou travada não "atualiza" o que não baixou
    const diarias = e.fontes.filter((f) => f.diaria);
    const nunca = diarias.filter((f) => !f.baixadoEm);
    const velhas = diarias.filter((f) => f.baixadoEm && (hoje.getTime() - f.baixadoEm.getTime()) / 86400000 > 1.5);
    if (nunca.length === diarias.length) it.push({ nivel: 'atencao', titulo: 'Nenhum dado do portal coletado', detalhe: 'Os números do painel não têm fonte ainda.' });
    else if (velhas.length || nunca.length) {
      const maisVelha = velhas.reduce<Date | null>((m, f) => (!m || f.baixadoEm! < m ? f.baixadoEm! : m), null);
      // dias de calendário: dado de 14/11 visto em 16/11 tem 2 dias
      const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      const dias = maisVelha ? Math.round((dia(hoje) - dia(maisVelha)) / 86400000) : 0;
      it.push({
        nivel: 'observacao',
        titulo: velhas.length ? `Dados do portal com ${dias} dia(s)` : 'Fonte do portal nunca coletada',
        detalhe: [
          velhas.length ? `${velhas.map((f) => `${f.nome} (${dh(f.baixadoEm!)})`).join(', ')}.` : '',
          nunca.length ? `Nunca coletado: ${nunca.map((f) => f.nome).join(', ')}.` : '',
          'A coleta diária não trouxe dados novos dessas fontes.',
        ].filter(Boolean).join(' '),
      });
    } else {
      const d = diarias.find((f) => f.baixadoEm)!;
      it.push({ nivel: 'ok', titulo: 'Dados do portal do dia', detalhe: `${diarias.map((f) => `${f.nome} ${dh(f.baixadoEm!)}`).join(' · ')}.` || dh(d.baixadoEm!) });
    }
  } else if (!u || !u.fim) {
    it.push({ nivel: 'atencao', titulo: 'Nenhuma coleta concluída', detalhe: 'Os números do painel não têm fonte ainda.' });
  } else {
    const dias = Math.floor((hoje.getTime() - u.fim.getTime()) / 86400000);
    it.push({
      nivel: dias > 2 ? 'observacao' : 'ok',
      titulo: dias > 2 ? `Dados com ${dias} dias` : 'Dados atualizados',
      detalhe: `Última coleta concluída em ${u.fim.toLocaleString('pt-BR')}.`,
    });
  }
  if (u?.status === 'divergencia')
    it.push({ nivel: 'observacao', titulo: 'Conferência com o portal com diferenças', detalhe: 'A soma dos lançamentos coletados não bate com os totais do portal em algum mês. Ver os detalhes técnicos.' });
  if (u?.status === 'falha')
    it.push({ nivel: 'atencao', titulo: 'A última coleta falhou', detalhe: 'O painel mostra os dados da coleta anterior.' });
  if (e.interrompidas) {
    if (e.interrompidas.length)
      it.push({
        nivel: 'observacao',
        titulo: `${e.interrompidas.length} coleta(s) começaram e não terminaram`,
        detalhe: `A mais recente começou em ${dh(e.interrompidas[0].inicio)} (coleta nº ${e.interrompidas.map((c) => c.id).join(', ')}). Ver o log da coleta na pasta "logs" dos dados do gavix.`,
      });
  } else if (e.coletaRodando) {
    const h = (hoje.getTime() - e.coletaRodando.inicio.getTime()) / 3600000;
    if (h > 6) it.push({ nivel: 'observacao', titulo: 'Coleta em andamento há muito tempo', detalhe: `Começou em ${e.coletaRodando.inicio.toLocaleString('pt-BR')} e ainda não terminou.` });
  }
  const esp = rgfEsperado(hoje);
  const temRgf = e.rgf && (e.rgf.ano > esp.ano || (e.rgf.ano === esp.ano && e.rgf.quadrimestre >= esp.quadrimestre));
  if (e.rgf !== undefined) it.push(
    temRgf
      ? { nivel: 'ok', titulo: 'Limite de pessoal com o RGF mais recente', detalhe: `${e.rgf!.quadrimestre}º quadrimestre de ${e.rgf!.ano} (SICONFI).` }
      : {
          nivel: 'observacao',
          titulo: `RGF do ${esp.quadrimestre}º quadrimestre de ${esp.ano} não consta na coleta`,
          detalhe: `O prazo de publicação foi ${dataBR(esp.prazo)} (LRF art. 55, §2º). ${e.rgf ? `O painel usa o ${e.rgf.quadrimestre}º quadrimestre de ${e.rgf.ano}.` : 'Sem RGF, o limite de pessoal não aparece.'}`,
        },
  );
  if (e.folhaMeses) {
    const esperados = ultimos12Meses(hoje);
    const faltam = esperados.filter((m) => !e.folhaMeses!.some((f) => f.anoMes === m));
    const incompletos = e.folhaMeses.filter((f) => esperados.includes(f.anoMes) && f.linhasColetadas !== f.linhasPortal).map((f) => f.anoMes);
    it.push(
      !faltam.length && !incompletos.length
        ? { nivel: 'ok', titulo: 'Folha dos últimos 12 meses completa', detalhe: `${esperados[0]} a ${esperados[11]}, com todas as linhas do portal.` }
        : {
            nivel: 'observacao',
            titulo: 'Folha dos últimos 12 meses incompleta',
            detalhe: [faltam.length ? `Faltam: ${faltam.join(', ')}.` : '', incompletos.length ? `Com linhas a menos que o portal: ${incompletos.join(', ')}.` : ''].join(' ').trim(),
          },
    );
  }
  return it;
}

// ---------------------------------------------------------------- selo geral

export interface Frase { nivel: Nivel; texto: string; href?: string }

export function seloGeral(fr: Frase[]): { nivel: Nivel; titulo: string } {
  const nivel = piorNivel(fr.map((f) => f.nivel));
  return { nivel, titulo: nivel === 'ok' ? 'Tudo em dia' : nivel === 'observacao' ? 'Pontos para acompanhar' : 'Atenção' };
}

// ---------------------------------------------------------------- RREO (Anexo 14) e dívida (RGF Anexo 06)
// Números já apurados pela contabilidade do município e publicados no SICONFI: o painel só mostra.

const cents = (v: string | undefined) => (v === undefined ? null : centavos(v));

export interface MinimoConstitucional { chave: 'mde' | 'fundeb' | 'asps'; nome: string; base: string; pctBp: bigint; minimoBp: bigint; valor: bigint | null; nivel: Nivel }
export interface ResumoRREO {
  ano: number; bimestre: number; posicao: Date;
  minimos: MinimoConstitucional[];
  primario: { meta: bigint | null; apurado: bigint | null; nivel: Nivel } | null;
  nominal: { meta: bigint | null; apurado: bigint | null } | null;
  resultadoOrcamentario: bigint | null;           // + superávit / − déficit, até o bimestre
  saldoExerciciosAnteriores: bigint | null;       // superávit de anos anteriores usado para créditos adicionais
  rp: { processados: { inscrito: bigint | null; pago: bigint | null; cancelado: bigint | null; saldo: bigint | null };
        naoProcessados: { inscrito: bigint | null; pago: bigint | null; cancelado: bigint | null; saldo: bigint | null } };
}

const BASE_MINIMO: Record<MinimoConstitucional['chave'], [string, string]> = {
  mde: ['Educação (MDE)', 'CF art. 212'],
  fundeb: ['FUNDEB na remuneração dos profissionais', 'Lei 14.113/2020, art. 26'],
  asps: ['Saúde (ASPS)', 'CF art. 198; LC 141/2012, art. 7º'],
};

/** O mínimo é anual: abaixo dele antes do 6º bimestre é observação; no 6º, atenção. */
export const nivelMinimo = (pct: bigint, min: bigint, bimestre: number): Nivel => (pct >= min ? 'ok' : bimestre < 6 ? 'observacao' : 'atencao');

export function resumoRREO(ind: IndicadorFiscalLido[]): ResumoRREO | null {
  const r = ind.filter((i) => i.relatorio === 'RREO');
  if (!r.length) return null;
  const ult = [...r].sort((a, b) => b.ano - a.ano || b.periodo - a.periodo)[0];
  const v = (k: string) => r.find((i) => i.ano === ult.ano && i.periodo === ult.periodo && i.chave === k)?.valor;
  const minimos: MinimoConstitucional[] = [];
  for (const chave of ['mde', 'fundeb', 'asps'] as const) {
    const pct = v(`${chave}_pct`), min = v(`${chave}_minimo_pct`);
    if (pct === undefined || min === undefined) continue;
    const pctB = pontosBase(pct), minB = pontosBase(min);
    minimos.push({ chave, nome: BASE_MINIMO[chave][0], base: BASE_MINIMO[chave][1], pctBp: pctB, minimoBp: minB, valor: cents(v(`${chave}_valor`)), nivel: nivelMinimo(pctB, minB, ult.periodo) });
  }
  const pm = cents(v('primario_meta')), pa = cents(v('primario_apurado'));
  return {
    ano: ult.ano, bimestre: ult.periodo, posicao: new Date(ult.ano, 2 * ult.periodo, 0),
    minimos,
    primario: pm === null && pa === null ? null : { meta: pm, apurado: pa, nivel: pm !== null && pa !== null && pa < pm ? 'observacao' : 'ok' },
    nominal: v('nominal_meta') === undefined && v('nominal_apurado') === undefined ? null : { meta: cents(v('nominal_meta')), apurado: cents(v('nominal_apurado')) },
    resultadoOrcamentario: cents(v('resultado_orcamentario')),
    saldoExerciciosAnteriores: cents(v('saldo_exercicios_anteriores')),
    rp: {
      processados: { inscrito: cents(v('rp_proc_inscrito')), pago: cents(v('rp_proc_pago')), cancelado: cents(v('rp_proc_cancelado')), saldo: cents(v('rp_proc_saldo')) },
      naoProcessados: { inscrito: cents(v('rp_nproc_inscrito')), pago: cents(v('rp_nproc_pago')), cancelado: cents(v('rp_nproc_cancelado')), saldo: cents(v('rp_nproc_saldo')) },
    },
  };
}

export interface DividaLRF { ano: number; quadrimestre: number; valor: bigint | null; pctBp: bigint; limiteBp: bigint; nivel: Nivel }

/** Dívida consolidada líquida × limite do Senado (Res. 40/2001: 120% da RCL); alerta a 90% do limite (LRF art. 59, §1º, III). */
export function dividaLRF(ind: IndicadorFiscalLido[]): DividaLRF | null {
  const g = ind.filter((i) => i.relatorio === 'RGF' && i.chave === 'dcl_pct');
  if (!g.length) return null;
  const ult = [...g].sort((a, b) => b.ano - a.ano || b.periodo - a.periodo)[0];
  const v = (k: string) => ind.find((i) => i.relatorio === 'RGF' && i.ano === ult.ano && i.periodo === ult.periodo && i.chave === k)?.valor;
  const pct = pontosBase(ult.valor), lim = pontosBase(v('dcl_limite_pct') ?? '120');
  return { ano: ult.ano, quadrimestre: ult.periodo, valor: cents(v('dcl')), pctBp: pct, limiteBp: lim, nivel: pct >= lim ? 'atencao' : pct * BigInt(10) >= lim * BigInt(9) ? 'observacao' : 'ok' };
}

/** Último bimestre cujo RREO já deveria estar publicado: 30 dias após o fim do bimestre (LRF art. 52). */
export function rreoEsperado(hoje: Date): { ano: number; bimestre: number; prazo: Date } {
  for (let ano = hoje.getFullYear(); ; ano--) {
    for (let b = 6; b >= 1; b--) {
      const prazo = new Date(new Date(ano, 2 * b, 0).getTime() + 30 * 86400000);
      if (prazo <= hoje) return { ano, bimestre: b, prazo };
    }
  }
}

export function confiancaRREO(hoje: Date, rreo: { ano: number; bimestre: number } | null): ItemConfianca {
  const esp = rreoEsperado(hoje);
  const ok = rreo && (rreo.ano > esp.ano || (rreo.ano === esp.ano && rreo.bimestre >= esp.bimestre));
  return ok
    ? { nivel: 'ok', titulo: 'Educação, saúde e metas com o RREO mais recente', detalhe: `${rreo!.bimestre}º bimestre de ${rreo!.ano} (SICONFI).` }
    : {
        nivel: 'observacao',
        titulo: `RREO do ${esp.bimestre}º bimestre de ${esp.ano} não consta na coleta`,
        detalhe: `O prazo de publicação foi ${esp.prazo.toLocaleDateString('pt-BR')} (LRF art. 52). ${rreo ? `O painel usa o ${rreo.bimestre}º bimestre de ${rreo.ano}.` : 'Sem RREO, educação, saúde e metas fiscais não aparecem.'}`,
      };
}
