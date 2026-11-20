// Motor de regras. O sistema NÃO decide o que é irregular:
//  - toda regra nasce "proposta"; só gera apontamento depois de "aprovada" por uma pessoa;
//  - apontamento = "para análise", com base legal; quem classifica é o controlador/jurídico.
import { dbDa, type DbPrefeitura } from '@/lib/financas/db';
import { brl, pctBp } from '@/lib/financas/dinheiro';
import { carregarExecucao, carregarReceita, carregarRREO } from '@/lib/financas/painel/carregar';
import { coberturaCreditos, dividaLRF, equilibrioLOA, resumoRREO, tempoDecorridoBp } from '@/lib/financas/painel/fiscal';

export interface Achado {
  chaveUnica: string;
  entidade: 'empenho' | 'contrato' | 'indicador';
  entidadeId: string;
  resumo: string;
  valorEncontrado: string;
}

export interface DefRegra {
  codigo: string;
  titulo: string;
  baseLegal: string;
  descricao: string;
  parametrosPadrao: Record<string, number | string | null>;
  /** parâmetros que precisam ser informados por uma pessoa antes de aprovar */
  exigeParametro?: string[];
  avaliar(db: DbPrefeitura, p: Record<string, any>): Promise<Achado[]>;
}

const fmtData = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '—');

export const REGRAS: DefRegra[] = [
  {
    codigo: 'O3',
    titulo: 'Ordem empenho → liquidação → pagamento',
    baseLegal: 'Lei 4.320/1964, arts. 60 a 64',
    descricao: 'Aponta empenho com pagamento maior que o liquidado, liquidação maior que o empenhado líquido, ou evento com data anterior ao empenho.',
    parametrosPadrao: {},
    async avaliar(db) {
      const out: Achado[] = [];
      const emps = await db.empenho.findMany({ include: { liquidacoes: true, pagamentos: true } });
      for (const e of emps) {
        const liq = e.liquidacoes.reduce((s, x) => s + x.valor, BigInt(0));
        const pag = e.pagamentos.reduce((s, x) => s + x.valor, BigInt(0));
        const problemas: string[] = [];
        if (liq > e.valor - e.anulado) problemas.push(`liquidado ${brl(liq)} > empenhado líquido ${brl(e.valor - e.anulado)}`);
        if (pag > liq) problemas.push(`pago ${brl(pag)} > liquidado ${brl(liq)}`);
        const antes = [...e.liquidacoes, ...e.pagamentos].filter((x) => x.data < e.data);
        if (antes.length) problemas.push(`${antes.length} evento(s) com data anterior ao empenho (${fmtData(e.data)})`);
        const primeiraLiq = e.liquidacoes.reduce<Date | null>((m, x) => (!m || x.data < m ? x.data : m), null);
        const pagAntes = primeiraLiq ? e.pagamentos.filter((x) => x.data < primeiraLiq) : e.pagamentos;
        if (pagAntes.length) problemas.push(`${pagAntes.length} pagamento(s) antes da primeira liquidação`);
        if (problemas.length)
          out.push({ chaveUnica: `O3:${e.idOrigem}`, entidade: 'empenho', entidadeId: String(e.id), resumo: `Empenho ${e.numero}: ${problemas.join('; ')}`, valorEncontrado: problemas[0] });
      }
      return out;
    },
  },
  {
    codigo: 'C2a',
    titulo: 'Pagamento após o fim da vigência do contrato',
    baseLegal: 'Lei 14.133/2021, arts. 105 a 107',
    descricao: 'Pagamento de empenho ligado ao contrato (certeza alta) com data posterior ao fim da vigência registrado no portal. Pode haver aditivo de prazo não refletido no cadastro.',
    parametrosPadrao: { toleranciaDias: 0 },
    async avaliar(db, p) {
      const out: Achado[] = [];
      const ligs = await db.ligacaoContratoEmpenho.findMany({ where: { certeza: 'alta' } });
      for (const l of ligs) {
        const c = await db.contrato.findFirst({ where: { id: l.contratoId } });
        if (!c?.fim) continue;
        const limite = new Date(c.fim.getTime() + Number(p.toleranciaDias ?? 0) * 86400000);
        const pags = await db.pagamento.findMany({ where: { empenhoId: l.empenhoId, data: { gt: limite } } });
        for (const pg of pags)
          out.push({
            chaveUnica: `C2a:${pg.idOrigem}`, entidade: 'contrato', entidadeId: String(c.id),
            resumo: `Contrato ${c.numero}/${c.ano} (${c.fornecedorNome}) terminou em ${fmtData(c.fim)}; pagamento ${pg.numero} em ${fmtData(pg.data)} de ${brl(pg.valor)}`,
            valorEncontrado: brl(pg.valor),
          });
      }
      return out;
    },
  },
  {
    codigo: 'C2b',
    titulo: 'Contrato vigente vencendo',
    baseLegal: 'Lei 14.133/2021, arts. 105 a 107 (planejamento de prorrogação/nova contratação)',
    descricao: 'Lista contratos vigentes cuja vigência termina nos próximos N dias. Informativo.',
    parametrosPadrao: { dias: 90 },
    async avaliar(db, p) {
      const hoje = new Date();
      const ate = new Date(hoje.getTime() + Number(p.dias ?? 90) * 86400000);
      const cs = await db.contrato.findMany({ where: { fim: { gte: hoje, lte: ate }, situacao: { contains: 'Vigente' } } });
      return cs.map((c) => ({
        chaveUnica: `C2b:${c.idOrigem}:${c.fim?.toISOString().slice(0, 10)}`, entidade: 'contrato' as const, entidadeId: String(c.id),
        resumo: `Contrato ${c.numero}/${c.ano} (${c.fornecedorNome}) vence em ${fmtData(c.fim)}`, valorEncontrado: fmtData(c.fim),
      }));
    },
  },
  {
    codigo: 'C4',
    titulo: 'Empenhado no contrato acima do valor atual do contrato',
    baseLegal: 'Lei 14.133/2021, art. 92 (valor) e arts. 124–125 (alterações); Lei 4.320/1964, art. 60',
    descricao: 'Soma dos empenhos ligados ao contrato (certeza alta), descontadas anulações, maior que o valor atual do contrato no portal.',
    parametrosPadrao: {},
    async avaliar(db) {
      const out: Achado[] = [];
      const ligs = await db.ligacaoContratoEmpenho.findMany({ where: { certeza: 'alta' } });
      const porContrato = new Map<number, number[]>();
      for (const l of ligs) porContrato.set(l.contratoId, [...(porContrato.get(l.contratoId) ?? []), l.empenhoId]);
      for (const [cid, eids] of porContrato) {
        const c = await db.contrato.findFirst({ where: { id: cid } });
        if (!c || c.valorAtual <= BigInt(0)) continue;
        const es = await db.empenho.findMany({ where: { id: { in: eids } }, select: { valor: true, anulado: true } });
        const total = es.reduce((s, e) => s + e.valor - e.anulado, BigInt(0));
        if (total > c.valorAtual)
          out.push({
            chaveUnica: `C4:${c.idOrigem}`, entidade: 'contrato', entidadeId: String(c.id),
            resumo: `Contrato ${c.numero}/${c.ano} (${c.fornecedorNome}): empenhado ${brl(total)} > valor atual ${brl(c.valorAtual)} (só empenhos coletados)`,
            valorEncontrado: brl(total),
          });
      }
      return out;
    },
  },
  {
    codigo: 'F1',
    titulo: 'Despesa com pessoal × RCL (limites da LRF)',
    baseLegal: 'LC 101/2000 (LRF), arts. 19, 20, 22 e 59, §1º, II',
    descricao: 'Compara a despesa com pessoal do Executivo (RGF/SICONFI) com os limites de alerta, prudencial e máximo.',
    parametrosPadrao: {},
    async avaliar(db) {
      const ind = await db.indicadorFiscal.findMany({ where: { relatorio: 'RGF' }, orderBy: [{ ano: 'desc' }, { periodo: 'desc' }] });
      if (!ind.length) return [];
      const { ano, periodo } = ind[0];
      const v = (k: string) => Number(ind.find((i) => i.ano === ano && i.periodo === periodo && i.chave === k)?.valor ?? NaN);
      const dtp = v('dtp_pct');
      const nivel = dtp >= v('limite_max_pct') ? 'máximo' : dtp >= v('limite_prudencial_pct') ? 'prudencial' : dtp >= v('limite_alerta_pct') ? 'alerta' : null;
      if (!nivel) return [];
      return [{ chaveUnica: `F1:${ano}:${periodo}:${nivel}`, entidade: 'indicador', entidadeId: `${ano}-Q${periodo}`, resumo: `Pessoal ${dtp}% da RCL no ${periodo}º quadrimestre de ${ano}: atingiu o limite ${nivel}`, valorEncontrado: `${dtp}%` }];
    },
  },
  {
    codigo: 'C1',
    titulo: 'Prazo entre assinatura e publicação do contrato',
    baseLegal: 'Lei 14.133/2021, art. 94 (publicação como condição de eficácia)',
    descricao: 'Contrato com publicação registrada mais de N dias após a assinatura. O prazo depende do tipo de contratação: precisa ser definido por você antes de aprovar.',
    parametrosPadrao: { prazoDias: null },
    exigeParametro: ['prazoDias'],
    async avaliar(db, p) {
      if (p.prazoDias === null || p.prazoDias === undefined) return [];
      const cs = await db.contrato.findMany({ where: { assinatura: { not: null }, publicacaoData: { not: null } } });
      return cs
        .filter((c) => (c.publicacaoData!.getTime() - c.assinatura!.getTime()) / 86400000 > Number(p.prazoDias))
        .map((c) => {
          const dias = Math.round((c.publicacaoData!.getTime() - c.assinatura!.getTime()) / 86400000);
          return { chaveUnica: `C1:${c.idOrigem}`, entidade: 'contrato' as const, entidadeId: String(c.id), resumo: `Contrato ${c.numero}/${c.ano}: assinado ${fmtData(c.assinatura)}, publicado ${fmtData(c.publicacaoData)} (${dias} dias)`, valorEncontrado: `${dias} dias` };
        });
    },
  },
  // ---- SICONFI (Pacote B): números já apurados pela contabilidade; a regra só compara com a lei.
  {
    codigo: 'F3',
    titulo: 'Dívida consolidada líquida × limite do Senado',
    baseLegal: 'Resolução do Senado 40/2001, art. 3º, II (120% da RCL); LRF art. 59, §1º, III (alerta a 90% do limite)',
    descricao: 'Lê o RGF publicado no SICONFI. Aponta quando a dívida consolidada líquida passa de 90% do limite (alerta) ou do próprio limite.',
    parametrosPadrao: {},
    async avaliar(db) {
      const d = dividaLRF(await db.indicadorFiscal.findMany({ where: { relatorio: 'RGF', chave: { in: ['dcl', 'dcl_pct', 'dcl_limite_pct'] } } }));
      if (!d || d.nivel === 'ok') return [];
      return [{
        chaveUnica: `F3:${d.ano}:${d.quadrimestre}:${d.nivel}`, entidade: 'indicador', entidadeId: `${d.ano}-Q${d.quadrimestre}`,
        resumo: `Dívida consolidada líquida em ${pctBp(d.pctBp)} da RCL no ${d.quadrimestre}º quadrimestre de ${d.ano} (limite ${pctBp(d.limiteBp, 0)})`,
        valorEncontrado: pctBp(d.pctBp),
      }];
    },
  },
  {
    codigo: 'F4',
    titulo: 'Mínimos de Educação, FUNDEB e Saúde no fechamento do ano',
    baseLegal: 'CF art. 212; Lei 14.113/2020, art. 26; CF art. 198 e LC 141/2012, art. 7º',
    descricao: 'Lê o RREO do 6º bimestre publicado no SICONFI (apuração do ano) e aponta o mínimo que ficou abaixo. Nos bimestres anteriores o painel só mostra o andamento, porque o mínimo é anual.',
    parametrosPadrao: {},
    async avaliar(db) {
      const r = resumoRREO(await db.indicadorFiscal.findMany({ where: { relatorio: 'RREO', periodo: 6 } }));
      if (!r) return [];
      return r.minimos.filter((m) => m.pctBp < m.minimoBp).map((m) => ({
        chaveUnica: `F4:${r.ano}:${m.chave}`, entidade: 'indicador' as const, entidadeId: String(r.ano),
        resumo: `${m.nome}: ${pctBp(m.pctBp, 2)} aplicado em ${r.ano}, mínimo ${pctBp(m.minimoBp, 0)} (RREO 6º bimestre)`,
        valorEncontrado: pctBp(m.pctBp, 2),
      }));
    },
  },
  // ---- execução orçamentária (Pacote A). Os percentuais NÃO vêm da lei: quem define é o controlador.
  {
    codigo: 'E1',
    titulo: 'Ritmo de empenho acima do calendário',
    baseLegal: 'Lei 4.320/1964, arts. 58 a 60; LRF art. 9º (limitação de empenho)',
    descricao:
      'Compara o empenhado do Executivo (sem a Câmara) com a dotação atualizada e com a parte do ano já decorrida. Aponta quando o empenhado passa a parte do ano em mais de N pontos percentuais. Contratos anuais empenhados no início do ano (estimativo/global) fazem o ritmo parecer alto: por isso N é decisão sua.',
    parametrosPadrao: { pontosAcima: null },
    exigeParametro: ['pontosAcima'],
    async avaliar(db, p) {
      if (p.pontosAcima === null || p.pontosAcima === undefined) return [];
      const hoje = new Date();
      const e = await carregarExecucao(db, hoje);
      if (!e || e.empenhadoBp === null) return [];
      const dif = e.empenhadoBp - e.tempoBp;
      if (dif <= BigInt(Math.round(Number(p.pontosAcima) * 100))) return [];
      return [{
        chaveUnica: `E1:${e.ano}:${hoje.getMonth() + 1}`, entidade: 'indicador', entidadeId: String(e.ano),
        resumo: `Empenhado ${pctBp(e.empenhadoBp)} da dotação atualizada (${brl(e.executivo.empenhado)} de ${brl(e.executivo.dotAtual)}), com ${pctBp(e.tempoBp)} do ano decorrido em ${fmtData(hoje)}`,
        valorEncontrado: `${pctBp(dif)} acima do calendário`,
      }];
    },
  },
  {
    codigo: 'E2',
    titulo: 'Aumento líquido do orçamento acima do percentual definido',
    baseLegal: 'CF art. 167, V; Lei 4.320/1964, arts. 7º e 40 a 43 (ver O4)',
    descricao:
      'Dotação atualizada do Executivo × dotação inicial da LOA. O portal só mostra o saldo das alterações (créditos abertos menos anulações), não cada decreto: não substitui a conferência do % de suplementação autorizado na LOA (regra O4). Informe o percentual que deseja acompanhar.',
    parametrosPadrao: { percentual: null },
    exigeParametro: ['percentual'],
    async avaliar(db, p) {
      if (p.percentual === null || p.percentual === undefined) return [];
      const hoje = new Date();
      const e = await carregarExecucao(db, hoje);
      if (!e || e.variacaoDotacaoBp === null) return [];
      if (e.variacaoDotacaoBp <= BigInt(Math.round(Number(p.percentual) * 100))) return [];
      return [{
        chaveUnica: `E2:${e.ano}:${hoje.getMonth() + 1}`, entidade: 'indicador', entidadeId: String(e.ano),
        resumo: `Dotação do Executivo passou de ${brl(e.executivo.dotInicial)} (LOA) para ${brl(e.executivo.dotAtual)} (+${brl(e.variacaoDotacao)}) em ${fmtData(hoje)}`,
        valorEncontrado: pctBp(e.variacaoDotacaoBp),
      }];
    },
  },
  {
    codigo: 'E3',
    titulo: 'Pago no ano acima da receita arrecadada no ano',
    baseLegal: 'LRF art. 1º, §1º (equilíbrio das contas) e art. 9º',
    descricao:
      'Receita líquida arrecadada no ano (correntes + capital − deduções) × despesa paga no ano (município, com a Câmara; sem restos a pagar). Pagar mais do que se arrecadou pode ser legítimo quando há saldo de caixa de anos anteriores: o apontamento pede que a contabilidade mostre essa cobertura. Informe a tolerância em % (0 = qualquer excesso).',
    parametrosPadrao: { toleranciaPct: null },
    exigeParametro: ['toleranciaPct'],
    async avaliar(db, p) {
      if (p.toleranciaPct === null || p.toleranciaPct === undefined) return [];
      const hoje = new Date();
      const [e, r] = [await carregarExecucao(db, hoje), await carregarReceita(db, hoje)];
      if (!e || !r || r.ano !== e.ano) return [];
      const rec = r.liquida.arrecadado, pago = e.municipio.pago;
      const limite = rec + (rec * BigInt(Math.round(Number(p.toleranciaPct) * 100))) / BigInt(10000);
      if (pago <= limite) return [];
      return [{
        chaveUnica: `E3:${e.ano}:${hoje.getMonth() + 1}`, entidade: 'indicador', entidadeId: String(e.ano),
        resumo: `Em ${e.ano}, até ${fmtData(hoje)}: pago ${brl(pago)} × receita líquida arrecadada ${brl(rec)} (diferença ${brl(pago - rec)})`,
        valorEncontrado: brl(pago - rec),
      }];
    },
  },
  {
    codigo: 'E4',
    titulo: 'Empenhado no ano acima da receita arrecadada no ano',
    baseLegal: 'LRF art. 1º, §1º (equilíbrio das contas) e art. 9º (limitação de empenho)',
    descricao:
      'Receita líquida arrecadada no ano (correntes + capital − deduções) × despesa empenhada no ano (município, com a Câmara). Empenhar mais do que se arrecadou até a data é comum: contratos anuais são empenhados no início do ano e a receita entra ao longo dele. O apontamento pede que a contabilidade mostre a cobertura (previsão de receita, superávit financeiro, créditos adicionais). Informe a tolerância em % (0 = qualquer excesso).',
    parametrosPadrao: { toleranciaPct: null },
    exigeParametro: ['toleranciaPct'],
    async avaliar(db, p) {
      if (p.toleranciaPct === null || p.toleranciaPct === undefined) return [];
      const hoje = new Date();
      const [e, r] = [await carregarExecucao(db, hoje), await carregarReceita(db, hoje)];
      if (!e || !r || r.ano !== e.ano) return [];
      const rec = r.liquida.arrecadado, emp = e.municipio.empenhado;
      const limite = rec + (rec * BigInt(Math.round(Number(p.toleranciaPct) * 100))) / BigInt(10000);
      if (emp <= limite) return [];
      return [{
        chaveUnica: `E4:${e.ano}:${hoje.getMonth() + 1}`, entidade: 'indicador', entidadeId: String(e.ano),
        resumo: `Em ${e.ano}, até ${fmtData(hoje)}: empenhado ${brl(emp)} × receita líquida arrecadada ${brl(rec)} (diferença ${brl(emp - rec)})`,
        valorEncontrado: brl(emp - rec),
      }];
    },
  },
  {
    codigo: 'R1',
    titulo: 'Arrecadação abaixo do ritmo do previsto',
    baseLegal: 'LRF art. 13 (metas bimestrais de arrecadação) e art. 9º (limitação de empenho)',
    descricao:
      'Receita líquida arrecadada no ano ÷ previsão atualizada, comparada com a parte do ano já decorrida. Aponta quando a arrecadação fica mais de N pontos percentuais atrás. A arrecadação varia ao longo do ano (o IPTU, por exemplo, concentra no início): o ideal é comparar com as metas bimestrais do art. 13, que ainda não estão no sistema.',
    parametrosPadrao: { pontosAbaixo: null },
    exigeParametro: ['pontosAbaixo'],
    async avaliar(db, p) {
      if (p.pontosAbaixo === null || p.pontosAbaixo === undefined) return [];
      const hoje = new Date();
      const r = await carregarReceita(db, hoje);
      if (!r || r.liquida.arrecadadoBp === null) return [];
      const tempo = tempoDecorridoBp(r.ano, hoje);
      const dif = tempo - r.liquida.arrecadadoBp;
      if (dif <= BigInt(Math.round(Number(p.pontosAbaixo) * 100))) return [];
      return [{
        chaveUnica: `R1:${r.ano}:${hoje.getMonth() + 1}`, entidade: 'indicador', entidadeId: String(r.ano),
        resumo: `Arrecadado ${pctBp(r.liquida.arrecadadoBp)} do previsto (${brl(r.liquida.arrecadado)} de ${brl(r.liquida.previstoAtual)}), com ${pctBp(tempo)} do ano decorrido em ${fmtData(hoje)}`,
        valorEncontrado: `${pctBp(dif)} abaixo do calendário`,
      }];
    },
  },
  // ---- pontos de controle que vieram da "Auditoria interna" do painel Gestão $$$ (versão com histórico)
  {
    codigo: 'T1',
    titulo: 'Peso dos contratos temporários na folha',
    baseLegal: 'CF art. 37, II e IX (contratação temporária só por excepcional interesse público)',
    descricao: 'Na última folha coletada, conta os servidores com vínculo temporário. Aponta quando passam de N% do total (o painel usava 25% para atenção e 40% para crítico).',
    parametrosPadrao: { pctMax: 25 },
    async avaliar(db, p) {
      const ult = await db.folhaMes.findFirst({ orderBy: { anoMes: 'desc' } });
      if (!ult) return [];
      const linhas = await db.folhaLinha.findMany({ where: { anoMes: ult.anoMes }, select: { matricula: true, tipoVinculo: true } });
      // uma pessoa pode ter mais de uma linha no mês: conta matrículas
      const todas = new Set(linhas.map((l) => l.matricula));
      const temp = new Set(linhas.filter((l) => /TEMPOR/i.test(l.tipoVinculo)).map((l) => l.matricula));
      if (!todas.size) return [];
      const pct = (temp.size / todas.size) * 100;
      if (pct <= Number(p.pctMax ?? 25)) return [];
      return [{
        chaveUnica: `T1:${ult.anoMes}`, entidade: 'indicador', entidadeId: ult.anoMes,
        resumo: `Folha ${ult.anoMes}: ${temp.size} de ${todas.size} matrículas com vínculo temporário (${pct.toFixed(1).replace('.', ',')}%)`,
        valorEncontrado: `${pct.toFixed(1).replace('.', ',')}%`,
      }];
    },
  },
  {
    codigo: 'P2',
    titulo: 'Oscilação da folha de pessoal entre meses',
    baseLegal: 'LRF arts. 18 a 23 (despesa com pessoal). A lei não fixa limite para a variação mensal: é acompanhamento de gestão.',
    descricao:
      'Compara o total bruto da folha de cada mês coletado com o do mês anterior e aponta quando a variação passa de N% (para mais ou para menos). Só compara meses seguidos e com a coleta completa. A folha oscila por 13º salário, férias, abonos, nomeações e exonerações: o apontamento pede que Recursos Humanos explique a causa. N começa em 2%, a pedido do prefeito, e pode ser ajustado.',
    parametrosPadrao: { pctMax: 2 },
    async avaliar(db, p) {
      const limiteBp = BigInt(Math.round(Number(p.pctMax ?? 2) * 100));
      const meses = (await db.folhaMes.findMany({ orderBy: { anoMes: 'asc' } })).filter((m) => m.linhasColetadas > 0 && m.linhasColetadas === m.linhasPortal);
      const total = new Map<string, bigint>();
      for (const m of meses) total.set(m.anoMes, (await db.folhaLinha.aggregate({ where: { anoMes: m.anoMes }, _sum: { bruto: true } }))._sum.bruto ?? BigInt(0));
      const anterior = (anoMes: string) => {
        const [a, m] = anoMes.split('/').map(Number);
        return m === 1 ? `${a - 1}/12` : `${a}/${String(m - 1).padStart(2, '0')}`;
      };
      const out: Achado[] = [];
      for (const [anoMes, atual] of total) {
        const ant = total.get(anterior(anoMes));
        if (ant === undefined || ant <= BigInt(0)) continue;
        const bp = ((atual - ant) * BigInt(10000)) / ant;
        if ((bp < BigInt(0) ? -bp : bp) <= limiteBp) continue;
        const sinal = bp < BigInt(0) ? '−' : '+';
        const valor = `${sinal}${pctBp(bp < BigInt(0) ? -bp : bp)}`;
        out.push({
          chaveUnica: `P2:${anoMes}`, entidade: 'indicador', entidadeId: anoMes,
          resumo: `Folha ${anoMes}: bruto ${brl(atual)} contra ${brl(ant)} em ${anterior(anoMes)} (${valor})`,
          valorEncontrado: valor,
        });
      }
      return out;
    },
  },
  {
    codigo: 'P1',
    titulo: 'RREO do bimestre não publicado no prazo',
    baseLegal: 'LRF art. 52 (publicação até 30 dias após o encerramento do bimestre)',
    descricao: 'Compara o último RREO publicado no SICONFI com o calendário: aponta quando o bimestre seguinte já passou do prazo de 30 dias e ainda não consta.',
    parametrosPadrao: {},
    async avaliar(db) {
      const hoje = new Date();
      const r = await db.indicadorFiscal.findFirst({ where: { relatorio: 'RREO' }, orderBy: [{ ano: 'desc' }, { periodo: 'desc' }] });
      // o bimestre que deveria estar publicado: o último cujo prazo (fim do bimestre + 30 dias) já passou
      let ano = hoje.getFullYear(), b = 0;
      for (let x = 6; x >= 1; x--) {
        const prazo = new Date(ano, 2 * x, 30);
        if (hoje > prazo) { b = x; break; }
      }
      if (!b) { ano -= 1; b = 6; }
      if (r && (r.ano > ano || (r.ano === ano && r.periodo >= b))) return [];
      const prazo = new Date(ano, 2 * b, 30);
      return [{
        chaveUnica: `P1:${ano}:${b}`, entidade: 'indicador', entidadeId: `${ano}-B${b}`,
        resumo: `RREO do ${b}º bimestre de ${ano} não consta no SICONFI (prazo ${fmtData(prazo)}). Último publicado: ${r ? `${r.periodo}º bimestre/${r.ano}` : 'nenhum'}`,
        valorEncontrado: `${Math.floor((hoje.getTime() - prazo.getTime()) / 86400000)} dia(s) de atraso`,
      }];
    },
  },
  {
    codigo: 'A29',
    titulo: 'Repasse à Câmara acima do teto do art. 29-A',
    baseLegal: 'CF art. 29-A (percentual pela população sobre a receita tributária e transferências do ano anterior); repasse acima do teto é crime de responsabilidade (§2º, I)',
    descricao: 'Compara o empenhado do órgão Câmara no ano com o teto. A base (receita do ano anterior) e o percentual dependem da conferência do contador/jurídico: precisam ser informados antes de aprovar.',
    parametrosPadrao: { baseAnoAnteriorReais: null, percentual: null },
    exigeParametro: ['baseAnoAnteriorReais', 'percentual'],
    async avaliar(db, p) {
      if (p.baseAnoAnteriorReais == null || p.percentual == null) return [];
      const ano = new Date().getFullYear();
      const orgs = await db.despesaOrgaoMes.findMany({ where: { ano, mes: 0 } });
      const camara = orgs.filter((o) => /C[AÂ]MARA/i.test(o.orgaoNome));
      if (!camara.length) return [];
      const empenhado = camara.reduce((t, o) => t + o.empenhado, BigInt(0));
      const teto = BigInt(Math.round(Number(p.baseAnoAnteriorReais) * Number(p.percentual))); // reais × % = centavos
      if (empenhado <= teto) return [];
      return [{
        chaveUnica: `A29:${ano}`, entidade: 'indicador', entidadeId: String(ano),
        resumo: `Câmara: empenhado ${brl(empenhado)} em ${ano}, acima do teto de ${brl(teto)} (${p.percentual}% de ${brl(BigInt(Math.round(Number(p.baseAnoAnteriorReais) * 100)))})`,
        valorEncontrado: brl(empenhado - teto) + ' acima',
      }];
    },
  },
  // ---- Pacote C (auditoria sênior, 19/11/2026): origem do dinheiro da LOA (E6), metas da LDO, restos a pagar, fracionamento.
  //      Vieram do compliance.gavix; a E4 de lá (cobertura dos créditos) aqui é E6, porque a E4 do SEGOV é outra regra.
  {
    codigo: 'O1',
    titulo: 'Empenhado acima da dotação atualizada (por órgão)',
    baseLegal: 'CF art. 167, II; Lei 4.320/1964, art. 59',
    descricao:
      'Compara, órgão a órgão, o empenhado do ano com a dotação atualizada publicada no portal. O portal só mostra a dotação por órgão: o controle por dotação (programa × natureza × fonte) existe só no sistema interno da prefeitura, então a ausência de apontamento aqui não prova que nenhuma dotação foi estourada.',
    parametrosPadrao: {},
    async avaliar(db) {
      const ult = await db.despesaOrgaoMes.findFirst({ where: { mes: 0 }, orderBy: { ano: 'desc' }, select: { ano: true } });
      if (!ult) return [];
      const orgaos = await db.despesaOrgaoMes.findMany({ where: { ano: ult.ano, mes: 0 } });
      return orgaos.filter((o) => o.empenhado > o.dotAtual).map((o) => ({
        chaveUnica: `O1:${ult.ano}:${o.orgaoCod}`, entidade: 'indicador' as const, entidadeId: `${ult.ano}-${o.orgaoCod}`,
        resumo: `${o.orgaoNome}: empenhado ${brl(o.empenhado)} acima da dotação atualizada ${brl(o.dotAtual)} (excesso ${brl(o.empenhado - o.dotAtual)})`,
        valorEncontrado: brl(o.empenhado - o.dotAtual),
      }));
    },
  },
  {
    codigo: 'E6',
    titulo: 'Origem do aumento do orçamento: crédito adicional sem cobertura identificada',
    baseLegal: 'CF art. 167, V; Lei 4.320/1964, art. 43, §1º (superávit financeiro, excesso de arrecadação, anulação de dotação, operação de crédito)',
    descricao:
      'A dotação atualizada do município (com a Câmara) menos a dotação inicial da LOA é o aumento líquido da despesa autorizada. Parte dele pode vir de previsão de receita nova; o resto vem de saldo de anos anteriores (superávit financeiro). Esta regra subtrai do aumento a receita nova prevista e o "saldo de exercícios anteriores" que o RREO informa, e aponta o que sobrou sem explicação nos números publicados. Não diz que o crédito é irregular: pede à contabilidade a relação dos decretos com a fonte de cobertura de cada um.',
    parametrosPadrao: {},
    async avaliar(db) {
      const hoje = new Date();
      const [e, r, rreo] = [await carregarExecucao(db, hoje), await carregarReceita(db, hoje), await carregarRREO(db)];
      if (!e || !r || r.ano !== e.ano) return [];
      const eq = equilibrioLOA(r, e.municipio);
      if (!eq) return [];
      const c = coberturaCreditos(e.ano, eq, rreo && rreo.ano === e.ano ? rreo.saldoExerciciosAnteriores : null);
      if (c.semExplicacao === null || c.semExplicacao <= 0n) return [];
      return [{
        chaveUnica: `E6:${e.ano}:${hoje.getMonth() + 1}`, entidade: 'indicador', entidadeId: String(e.ano),
        resumo: `Despesa autorizada subiu ${brl(c.aumentoDespesa)} sobre a LOA e a receita líquida prevista subiu ${brl(c.aumentoReceita)}; o RREO informa ${brl(c.saldoAnteriores!)} de saldo de anos anteriores. Ficam ${brl(c.semExplicacao)} sem cobertura identificada (em ${fmtData(hoje)})`,
        valorEncontrado: brl(c.semExplicacao),
      }];
    },
  },
  {
    codigo: 'E5',
    titulo: 'Suplementação de um órgão acima do percentual definido',
    baseLegal: 'CF art. 167, V; Lei 4.320/1964, arts. 40 a 43 e art. 7º (limite de suplementação autorizado na LOA)',
    descricao:
      'Aponta o órgão cuja dotação atualizada ficou mais de N% acima da dotação inicial da LOA (créditos abertos menos anulações). Complementa a E2, que olha o Executivo inteiro e deixa escondido o órgão que mais cresceu. N é decisão sua.',
    parametrosPadrao: { percentual: null },
    exigeParametro: ['percentual'],
    async avaliar(db, p) {
      if (p.percentual === null || p.percentual === undefined) return [];
      const ult = await db.despesaOrgaoMes.findFirst({ where: { mes: 0 }, orderBy: { ano: 'desc' }, select: { ano: true } });
      if (!ult) return [];
      const limiteBp = BigInt(Math.round(Number(p.percentual) * 100));
      const orgaos = await db.despesaOrgaoMes.findMany({ where: { ano: ult.ano, mes: 0 } });
      return orgaos
        .filter((o) => o.dotInicial > 0n && ((o.dotAtual - o.dotInicial) * 10000n) / o.dotInicial > limiteBp)
        .map((o) => {
          const bp = ((o.dotAtual - o.dotInicial) * 10000n) / o.dotInicial;
          return {
            chaveUnica: `E5:${ult.ano}:${o.orgaoCod}`, entidade: 'indicador' as const, entidadeId: `${ult.ano}-${o.orgaoCod}`,
            resumo: `${o.orgaoNome}: dotação de ${brl(o.dotInicial)} (LOA) para ${brl(o.dotAtual)} (+${brl(o.dotAtual - o.dotInicial)}, ${pctBp(bp)})`,
            valorEncontrado: pctBp(bp),
          };
        });
    },
  },
  {
    codigo: 'F2',
    titulo: 'Resultado primário abaixo da meta da LDO',
    baseLegal: 'LC 101/2000 (LRF), art. 4º, §1º (Anexo de Metas Fiscais); art. 9º e §4º (avaliação das metas e limitação de empenho)',
    descricao:
      'Lê o RREO mais recente no SICONFI e aponta quando o resultado primário acumulado está abaixo da meta anual da LDO. É comum o primário ficar negativo no meio do ano; o que a LRF pede é que, se a receita não comportar a meta, haja limitação de empenho ou revisão da meta. Crédito aberto com superávit financeiro de anos anteriores piora o primário do ano: vale conferir se a LDO foi alterada.',
    parametrosPadrao: {},
    async avaliar(db) {
      const r = resumoRREO(await db.indicadorFiscal.findMany({ where: { relatorio: 'RREO' } }));
      if (!r?.primario || r.primario.meta === null || r.primario.apurado === null || r.primario.apurado >= r.primario.meta) return [];
      const { meta, apurado } = r.primario;
      return [{
        chaveUnica: `F2:${r.ano}:${r.bimestre}`, entidade: 'indicador', entidadeId: `${r.ano}-B${r.bimestre}`,
        resumo: `Resultado primário até o ${r.bimestre}º bimestre de ${r.ano}: ${brl(apurado)}; meta da LDO para o ano: ${brl(meta)} (diferença ${brl(meta - apurado)})`,
        valorEncontrado: brl(apurado),
      }];
    },
  },
  {
    codigo: 'C5',
    titulo: 'Possível fracionamento: empenhos ordinários repetidos ao mesmo credor sem contrato',
    baseLegal: 'Lei 14.133/2021, art. 75, I e II e §1º (valor da dispensa considera o ano e o mesmo ramo de atividade); art. 337-E do Código Penal (contratação direta ilegal)',
    descricao:
      'Soma, no ano, os empenhos ORDINÁRIOS sem contrato (nem ligado, nem citado) do mesmo credor no mesmo elemento de despesa de compras e serviços (3390.30/32/35/36/37/39/40 e 4490.52). Aponta quando há pelo menos N empenhos e a soma passa do limite de dispensa que VOCÊ informa (em reais; o valor é atualizado por decreto a cada ano). Sinal para análise: o mesmo elemento pode reunir objetos diferentes, e a licitação pode ter sido feita por ata de registro de preços.',
    parametrosPadrao: { limiteReais: null, minEmpenhos: 3 },
    exigeParametro: ['limiteReais'],
    async avaliar(db, p) {
      if (p.limiteReais === null || p.limiteReais === undefined) return [];
      const limite = BigInt(Math.round(Number(p.limiteReais) * 100));
      const minimo = Number(p.minEmpenhos ?? 3);
      const ano = new Date().getFullYear();
      const ELEMENTOS = new Set(['339030', '339032', '339035', '339036', '339037', '339039', '339040', '449052']);
      const comLigacao = new Set((await db.ligacaoContratoEmpenho.findMany({ select: { empenhoId: true } })).map((l) => l.empenhoId));
      const emps = await db.empenho.findMany({
        where: { ano, tipo: 'ORDINARIO', contratoCitado: null },
        select: { id: true, numero: true, credorDoc: true, credorNome: true, contaDespesa: true, valor: true, anulado: true },
      });
      const grupos = new Map<string, { nome: string; elemento: string; total: bigint; n: number; primeiro: number }>();
      for (const e of emps) {
        const elemento = e.contaDespesa.slice(0, 6);
        if (!ELEMENTOS.has(elemento) || comLigacao.has(e.id) || !e.credorDoc) continue;
        const k = `${e.credorDoc}|${elemento}`;
        const g = grupos.get(k) ?? { nome: e.credorNome, elemento, total: 0n, n: 0, primeiro: e.id };
        g.total += e.valor - e.anulado;
        g.n++;
        grupos.set(k, g);
      }
      return [...grupos.entries()]
        .filter(([, g]) => g.n >= minimo && g.total > limite)
        .sort((a, b) => (b[1].total > a[1].total ? 1 : -1))
        .map(([k, g]) => ({
          chaveUnica: `C5:${ano}:${k}`, entidade: 'empenho' as const, entidadeId: String(g.primeiro),
          resumo: `${g.nome}: ${g.n} empenhos ordinários sem contrato no elemento ${g.elemento} somam ${brl(g.total)} em ${ano} (limite informado ${brl(limite)})`,
          valorEncontrado: brl(g.total),
        }));
    },
  },
  {
    codigo: 'RP1',
    titulo: 'Restos a pagar não processados cancelados acima do percentual definido',
    baseLegal: 'Lei 4.320/1964, arts. 35, 36 e 60; LC 141/2012, art. 24 (restos a pagar de saúde cancelados podem exigir recomposição); LRF art. 1º, §1º',
    descricao:
      'Dos restos a pagar NÃO processados (despesa empenhada e não liquidada em 31/12) inscritos para o exercício, quanto já foi cancelado. Cancelamento alto indica empenho feito acima da necessidade (por exemplo, estimativo/global) e pode afetar o cálculo de saúde e educação. N é decisão sua.',
    parametrosPadrao: { percentual: null },
    exigeParametro: ['percentual'],
    async avaliar(db, p) {
      if (p.percentual === null || p.percentual === undefined) return [];
      const ult = await db.restoPagar.findFirst({ orderBy: { exercicio: 'desc' }, select: { exercicio: true } });
      if (!ult) return [];
      const rps = await db.restoPagar.findMany({ where: { exercicio: ult.exercicio, tipo: 'N' }, select: { inscrito: true, anulado: true } });
      const insc = rps.reduce((s, r) => s + r.inscrito, 0n), anul = rps.reduce((s, r) => s + r.anulado, 0n);
      if (insc <= 0n) return [];
      const bp = (anul * 10000n) / insc;
      if (bp <= BigInt(Math.round(Number(p.percentual) * 100))) return [];
      return [{
        chaveUnica: `RP1:${ult.exercicio}`, entidade: 'indicador', entidadeId: String(ult.exercicio),
        resumo: `Restos a pagar não processados em ${ult.exercicio}: ${brl(anul)} cancelados de ${brl(insc)} inscritos (${pctBp(bp)}), ${rps.length} empenho(s)`,
        valorEncontrado: pctBp(bp),
      }];
    },
  },
];

/** Garante que as regras existem no banco da prefeitura (como "proposta"). */
export async function registrarRegras(prefeituraId: string) {
  const db = dbDa(prefeituraId);
  for (const r of REGRAS) {
    const existe = await db.regra.findFirst({ where: { codigo: r.codigo } });
    if (!existe)
      await db.regra.create({ data: { prefeituraId, codigo: r.codigo, titulo: r.titulo, baseLegal: r.baseLegal, descricao: r.descricao, parametros: JSON.stringify(r.parametrosPadrao) } });
  }
}

/** Prévia: quantos apontamentos a regra geraria (não grava nada). */
export async function previaRegra(prefeituraId: string, codigo: string) {
  const def = REGRAS.find((r) => r.codigo === codigo)!;
  const db = dbDa(prefeituraId);
  const reg = await db.regra.findFirst({ where: { codigo } });
  const achados = await def.avaliar(db, JSON.parse(reg?.parametros ?? '{}'));
  return achados;
}

/** Roda as regras APROVADAS e grava apontamentos novos (não duplica). */
export async function executarRegras(prefeituraId: string) {
  await registrarRegras(prefeituraId);
  const db = dbDa(prefeituraId);
  const regras = await db.regra.findMany({ where: { estado: 'aprovada' } });
  const res: Record<string, number> = {};
  for (const reg of regras) {
    const def = REGRAS.find((r) => r.codigo === reg.codigo);
    if (!def) continue;
    const achados = await def.avaliar(db, JSON.parse(reg.parametros));
    let novos = 0;
    for (const a of achados) {
      const ja = await db.apontamento.findFirst({ where: { chaveUnica: a.chaveUnica } });
      if (ja) continue;
      await db.apontamento.create({ data: { prefeituraId, regraCodigo: reg.codigo, ...a } });
      novos++;
    }
    res[reg.codigo] = novos;
  }
  return { aprovadas: regras.length, novosApontamentos: res };
}
