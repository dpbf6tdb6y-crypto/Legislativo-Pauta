// "Conferir antes de assinar": roda verificações sobre o documento informado,
// usando os dados de ONTEM (última coleta). Não diz "irregular": diz o que encontrou.
import type { DbPrefeitura } from '@/lib/financas/db';
import { brl, centavos, pctBp } from '@/lib/financas/dinheiro';
import { frescorFontes, textoDadosDe } from '@/lib/financas/coleta/frescor';
import { LRF_O_QUE_A_LEI_PREVE, pessoalLRF } from '@/lib/financas/painel/fiscal';

export interface Documento {
  tipo: string; // empenho | pagamento | aditivo | contrato_novo | nomeacao | outro
  valor: string;
  credorDoc: string;
  orgaoCod: string;
  contrato: string; // "252/2025" (opcional)
  data: string; // aaaa-mm-dd
}

export interface Checagem {
  item: string;
  resultado: 'ok' | 'atencao' | 'sem_dado';
  detalhe: string;
  base: string;
}

export async function conferirDocumento(db: DbPrefeitura, doc: Documento): Promise<{ checagens: Checagem[]; dadosDe: string }> {
  const out: Checagem[] = [];
  const valor = centavos(doc.valor || '0');
  const data = doc.data ? new Date(`${doc.data}T12:00:00Z`) : new Date();
  const ano = data.getUTCFullYear();
  const credor = doc.credorDoc.replace(/\D/g, '');
  // a conferência usa despesa, contratos e empenhos: vale a data em que esses dados foram baixados
  const dadosDe = textoDadosDe(await frescorFontes(db));

  // 1) saldo da dotação do órgão (ano inteiro)
  if (doc.orgaoCod) {
    const o = await db.despesaOrgaoMes.findFirst({ where: { ano, mes: 0, orgaoCod: doc.orgaoCod } });
    if (!o) out.push({ item: 'Saldo da dotação do órgão', resultado: 'sem_dado', detalhe: `Sem dados do órgão ${doc.orgaoCod} em ${ano}.`, base: 'CF art. 167, II; Lei 4.320/1964 art. 59' });
    else {
      const saldo = o.dotAtual - o.empenhado;
      const cabe = doc.tipo === 'pagamento' || valor <= saldo;
      out.push({
        item: 'Saldo da dotação do órgão',
        resultado: cabe ? 'ok' : 'atencao',
        detalhe: doc.tipo === 'pagamento'
          ? `Pagamento não consome dotação (já empenhada). Saldo do órgão: ${brl(saldo)}.`
          : `${o.orgaoNome}: dotação atual ${brl(o.dotAtual)}, empenhado ${brl(o.empenhado)}, saldo ${brl(saldo)}. Documento: ${brl(valor)}.${cabe ? '' : ' O valor é maior que o saldo do órgão.'} Saldo por órgão; o saldo por dotação/elemento não é publicado no portal.`,
        base: 'CF art. 167, II; Lei 4.320/1964 art. 59',
      });
    }
  }

  // 2) contrato informado
  let contrato = null as Awaited<ReturnType<typeof db.contrato.findFirst>>;
  if (doc.contrato) {
    const m = doc.contrato.match(/^(\d{1,5})\s*\/\s*(\d{4})$/);
    if (m) {
      const cands = await db.contrato.findMany({ where: { ano: Number(m[2]) } });
      contrato = cands.find((c) => Number(c.numero) === Number(m[1]) && (!credor || c.fornecedorDoc === credor)) ?? null;
    }
    if (!contrato) out.push({ item: 'Contrato informado', resultado: 'atencao', detalhe: `Contrato ${doc.contrato}${credor ? ` com o CNPJ ${credor}` : ''} não localizado no portal.`, base: 'Lei 14.133/2021 art. 94 (publicidade); art. 92' });
    else {
      const vigente = contrato.inicio && contrato.fim && contrato.inicio <= data && data <= contrato.fim;
      out.push({
        item: 'Vigência do contrato na data do documento',
        resultado: vigente ? 'ok' : 'atencao',
        detalhe: `Contrato ${contrato.numero}/${contrato.ano} (${contrato.fornecedorNome}), situação "${contrato.situacao}", vigência ${contrato.inicio?.toISOString().slice(0, 10) ?? '?'} a ${contrato.fim?.toISOString().slice(0, 10) ?? '?'}.${vigente ? '' : ' A data do documento está fora da vigência registrada (verificar aditivo de prazo).'}`,
        base: 'Lei 14.133/2021 arts. 105 a 107',
      });
      const ligs = await db.ligacaoContratoEmpenho.findMany({ where: { contratoId: contrato.id } });
      const emps = await db.empenho.findMany({ where: { id: { in: ligs.map((l) => l.empenhoId) } }, select: { valor: true, anulado: true } });
      const empenhado = emps.reduce((s, e) => s + e.valor - e.anulado, BigInt(0));
      const saldo = contrato.valorAtual - empenhado;
      const cabe = doc.tipo === 'pagamento' || valor <= saldo;
      out.push({
        item: 'Saldo do contrato',
        resultado: cabe ? 'ok' : 'atencao',
        detalhe: `Valor atual ${brl(contrato.valorAtual)}; empenhos ligados (${ligs.length}) ${brl(empenhado)}; saldo ${brl(saldo)}. Documento: ${brl(valor)}. Ligação deduzida; só empenhos coletados.`,
        base: 'Lei 14.133/2021 arts. 124–125; Lei 4.320/1964 art. 60',
      });
      if (doc.tipo === 'aditivo') {
        const acresc = contrato.valorAtual - contrato.valorInicial + valor;
        const lim = (contrato.valorInicial * BigInt(25)) / BigInt(100);
        out.push({
          item: 'Limite de acréscimo (aditivo)',
          resultado: acresc <= lim ? 'ok' : 'atencao',
          detalhe: `Acréscimo acumulado com este aditivo: ${brl(acresc)} sobre valor inicial ${brl(contrato.valorInicial)} (25% = ${brl(lim)}; 50% em reforma). Cálculo simplificado: valor atual − inicial.`,
          base: 'Lei 14.133/2021 art. 125',
        });
      }
    }
  }

  // 3) credor
  if (credor) {
    const contratosCredor = await db.contrato.findMany({ where: { fornecedorDoc: credor } });
    const vig = contratosCredor.filter((c) => c.inicio && c.fim && c.inicio <= data && data <= c.fim);
    out.push({
      item: 'Contratos do credor',
      resultado: doc.contrato || vig.length ? 'ok' : 'atencao',
      detalhe: contratosCredor.length
        ? `${contratosCredor.length} contrato(s) com este CNPJ; ${vig.length} vigente(s) na data: ${vig.map((c) => `${c.numero}/${c.ano}`).join(', ') || 'nenhum'}.`
        : 'Nenhum contrato com este CNPJ no portal (pode ser despesa sem contrato, ex.: dispensa por valor, diárias, sentenças).',
      base: 'Lei 14.133/2021 arts. 72, 75 e 95',
    });
  }

  // 4) nomeação / aumento de pessoal: limite da LRF (RGF do Executivo)
  if (doc.tipo === 'nomeacao') {
    const p = pessoalLRF(await db.indicadorFiscal.findMany({ where: { relatorio: 'RGF' } }));
    if (!p) out.push({ item: 'Limite de despesa com pessoal', resultado: 'sem_dado', detalhe: 'Sem RGF coletado: não dá para saber a situação do limite.', base: 'LRF arts. 19, 20 e 22' });
    else {
      const vedado = p.nivel === 'prudencial' || p.nivel === 'maximo';
      const anual = valor * BigInt(12);
      out.push({
        item: 'Limite de despesa com pessoal',
        resultado: vedado ? 'atencao' : 'ok',
        detalhe: `Pessoal do Executivo em ${pctBp(p.pctBp, 2)} da RCL (${p.quadrimestre}º quadrimestre de ${p.ano}; alerta ${pctBp(p.limites[0].pctBp)}, prudencial ${pctBp(p.limites[1].pctBp)}).`
          + (vedado ? ` ${LRF_O_QUE_A_LEI_PREVE[p.nivel]}` : ` Folga até o alerta: ${brl(p.limites[0].margem)} em 12 meses; este ato soma cerca de ${brl(anual)} por ano (remuneração × 12, sem 13º, férias e encargos).`),
        base: 'LRF arts. 19, 20, 22 (parágrafo único) e 59, §1º, II',
      });
    }
  }

  if (doc.tipo !== 'nomeacao') out.push({ item: 'Certidões do fornecedor (CND, FGTS, trabalhista)', resultado: 'sem_dado', detalhe: 'O portal não publica certidões. Depende de upload ou do sistema da prefeitura.', base: 'Lei 14.133/2021 arts. 68 e 92, XVI' });
  return { checagens: out, dadosDe };
}
