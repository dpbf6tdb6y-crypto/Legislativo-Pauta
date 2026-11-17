// Teste 1 do plano: os leitores extraem EXATAMENTE os números do portal (arquivos-gabarito).
import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { brl, centavos } from '@/lib/financas/dinheiro';
import { conferirEmpenho, contratoCitado, lerContratosXml, lerDespesaOrgaoXml, lerEmpenhoHtml, lerReceitaXml, lerRestosAPagarXml, lerRetencoesHtml, situacaoResumida } from '@/lib/financas/conectores/abaco/leitores';

const G = (n: string) => fs.readFileSync(`__tests__/financas/fixtures/abaco/${n}`, 'utf-8');
const soma = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe('dinheiro em centavos', () => {
  it('lê os formatos do portal', () => {
    expect(centavos('R$             27.923,57')).toBe(2792357n);
    expect(centavos('R$ -76.000,00')).toBe(-7600000n);
    expect(centavos('4361,55')).toBe(436155n);
    expect(centavos('7500.00')).toBe(750000n);
    expect(centavos('          2534.14')).toBe(253414n);
    expect(centavos('0')).toBe(0n);
    expect(brl(155102698209n)).toBe('R$ 1.551.026.982,09');
    expect(brl(-7600000n)).toBe('-R$ 76.000,00');
  });
});

describe('despesa por órgão (out/2026)', () => {
  const d = lerDespesaOrgaoXml(G('despesa_orgao_2026-10.xml'), 2026, 10);
  it('traz os 24 órgãos e os totais exibidos na tela do portal', () => {
    expect(d).toHaveLength(24);
    // valores conferidos na tela do portal em 13/11/2026 (Fase 0)
    expect(soma(d.map((x) => x.dotInicial))).toBe(157681500000n);
    expect(soma(d.map((x) => x.dotAtual))).toBe(158916925663n);
    expect(soma(d.map((x) => x.empenhado))).toBe(5181904727n);
    expect(soma(d.map((x) => x.liquidado))).toBe(15102698209n);
    expect(soma(d.map((x) => x.pago))).toBe(15835565625n);
  });
  it('recusa arquivo com filtro diferente do pedido (nome de arquivo compartilhado no portal)', () => {
    expect(() => lerDespesaOrgaoXml(G('despesa_orgao_2026-10.xml'), 2026, 9)).toThrow(/filtro/);
  });
});

describe('receitas (out/2026)', () => {
  const r = lerReceitaXml(G('receitas_2026-10.xml'), 2026, 10);
  it('lê 275 contas e a CFEM', () => {
    expect(r).toHaveLength(275);
    expect(r.find((x) => x.contaCod === '1000000000')!.arrecMes).toBe(12714976356n);
    expect(r.find((x) => x.contaCod === '1712510000')!.arrecMes).toBe(1622123117n);
  });
});

describe('contratos', () => {
  const c = lerContratosXml(G('contratos_amostra.xml'));
  it('lê número, CNPJ, vigência e valor', () => {
    const topocart = c.find((x) => x.idOrigem === 13700)!;
    expect(topocart.numero).toBe('0252');
    expect(topocart.ano).toBe(2025);
    expect(topocart.fornecedorDoc).toBe('26994285000117');
    expect(topocart.valorAtual).toBe(1390000000n);
    expect(topocart.fim?.toISOString().slice(0, 10)).toBe('2027-07-13');
  });
});

describe('detalhe do empenho', () => {
  it('lê o empenho com CNPJ, contrato citado e eventos que fecham', () => {
    const e = lerEmpenhoHtml(G('empenho_89799.html'), 89799)!;
    expect(e.numero).toBe('06000052');
    expect(e.credorDoc).toBe('26994285000117');
    expect(e.processo).toBe('0/0');
    expect(contratoCitado(e.descricao)).toBe('252/2025');
    expect(conferirEmpenho(e)).toBeNull();
  });
  it('id inexistente devolve null', () => {
    expect(lerEmpenhoHtml(G('empenho_inexistente.html'), 80000)).toBeNull();
  });
  it('extrai contrato citado em várias grafias', () => {
    expect(contratoCitado('TACOM - CONTRATO 36/2023')).toBe('36/2023');
    expect(contratoCitado('CONTRATO Nº 041/2026')).toBe('41/2026');
    expect(contratoCitado('3CORP - CONTRATO 0066/25')).toBe('66/2025');
    expect(contratoCitado('SEM REFERENCIA')).toBeNull();
  });
});

describe('LGPD: situação resumida', () => {
  it('não expõe motivo de afastamento', () => {
    expect(situacaoResumida('LICENCIADO/ATESTADO')).toBe('afastado');
    expect(situacaoResumida('EM EXERCÍCIO')).toBe('em exercício');
    expect(situacaoResumida('EXONERADO')).toBe('desligado');
  });
});

describe('restos a pagar (XML da lista, exercício 2026)', () => {
  it('lê os campos e confere o filtro do arquivo', () => {
    const r = lerRestosAPagarXml(G('restos_a_pagar_2026_amostra.xml'), 2026);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ idOrigem: 120102, anoOrigem: 2025, exercicio: 2026, tipo: 'P', empenhoIdOrigem: 62311, empenhoNumero: '24000005/2025', credorDoc: '29979036012823', inscrito: 1315632n, pago: 1315632n });
    expect(() => lerRestosAPagarXml(G('restos_a_pagar_2026_amostra.xml'), 2025)).toThrow(/exercício/);
  });
});

describe('descontos retidos no pagamento (wppagamentodoc)', () => {
  it('lê os itens e confere com o total da página', () => {
    const r = lerRetencoesHtml(G('pagamento_retencoes_189620.html'), 189620);
    expect(r.map((x) => x.valor)).toEqual([431690n, 600n]);
    expect(r[0]).toMatchObject({ seq: 1, tipo: 'DESCONTO', descricao: expect.stringMatching(/^IMPOSTO SOBRE A RENDA/) });
  });
  it('pagamento sem descontos devolve lista vazia', () => {
    expect(lerRetencoesHtml(G('pagamento_inexistente.html'), 999999999)).toEqual([]);
  });
  it('recusa quadro que não fecha com o total', () => {
    const adulterado = G('pagamento_retencoes_189620.html').replace('"6,00"]]', '"7,00"]]');
    expect(() => lerRetencoesHtml(adulterado, 189620)).toThrow(/somam/);
  });
});
