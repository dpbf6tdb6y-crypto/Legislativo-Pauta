// Auditoria por secretaria: liquidado/pago na visão geral e "contratos da secretaria". Precisa de banco: só roda com FIN_TESTE_BANCO=1 (CI).
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { contratosSecretaria, fichaSecretaria, visaoGeral } from '@/lib/financas/auditoria/dados';

const HOJE = new Date(2026, 10, 16, 12);
const P = 'aud-contratos-teste', O = 'aud-contratos-outra';
const EDU = 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', SAU = 'SECRETARIA MUNICIPAL DE SAÚDE';

describe('liquidado, pago e contratos por secretaria', () => {
  beforeAll(async () => {
    for (const id of [P, O]) await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 4, conector: 'arquivo' }, update: {} });
    const db = dbDa(P);
    const linha = (orgaoCod: string, orgaoNome: string, dotAtual: bigint, empenhado: bigint, liquidado: bigint, pago: bigint) =>
      ({ prefeituraId: P, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: dotAtual, dotAtual, empenhado, liquidado, pago, coletaId: 0 });
    await db.despesaOrgaoMes.createMany({
      data: [linha('01', 'CÂMARA MUNICIPAL DE TESTE', 100n, 50n, 50n, 50n), linha('09', EDU, 1000n, 800n, 600n, 400n), linha('12', SAU, 1000n, 100n, 0n, 0n)],
    });
    const emp = (idOrigem: number, orgao: string, valor: bigint, anulado: bigint, aLiquidar: bigint) =>
      ({ prefeituraId: P, idOrigem, numero: String(idOrigem), data: new Date(2026, 2, 1), ano: 2026, tipo: 'ORDINARIO', orgao, unidade: '1', credorDoc: '1', credorNome: 'F', processo: '', natureza: 'X', contaDespesa: '339039', fonte: '', funcao: '', subfuncao: '', programa: '', projeto: '', descricao: '', valor, anulado, aLiquidar, aPagar: 0n });
    await db.empenho.createMany({
      data: [
        emp(1, EDU, 1000n, 100n, 300n), // empenhado 900, liquidado 600
        emp(2, EDU, 500n, 0n, 500n), // empenhado 500, nada liquidado
        emp(3, SAU, 700n, 0n, 0n), // outra secretaria, mesmo contrato A
      ],
    });
    const ids = Object.fromEntries((await db.empenho.findMany()).map((e) => [e.idOrigem, e.id]));
    await db.pagamento.createMany({ data: [{ prefeituraId: P, idOrigem: 1, empenhoId: ids[1], numero: '1', data: new Date(2026, 3, 1), valor: 250n }, { prefeituraId: P, idOrigem: 2, empenhoId: ids[1], numero: '2', data: new Date(2026, 4, 1), valor: 50n }] });
    const ctr = (idOrigem: number, numero: string, situacao: string, fim: Date) =>
      ({ prefeituraId: P, idOrigem, numero, ano: 2026, inicio: new Date(2026, 0, 1), fim, publicacaoVeiculo: '', objeto: `objeto ${numero}`, tipo: 'Serviço', situacao, valorInicial: 5000n, valorAtual: 5000n, processo: '', modalidade: '', fornecedorDoc: '1', fornecedorNome: 'F' });
    await db.contrato.createMany({
      data: [
        ctr(1, '001', 'Contrato Vigente', new Date(2026, 11, 20)), // A: vence em 34 dias; alta (EDU) + alta (SAU)
        ctr(2, '002', 'Contrato Vigente', new Date(2027, 5, 1)), // B: só ligação média em EDU
        ctr(3, '003', 'Contrato Encerrado', new Date(2026, 5, 1)), // C: encerrado
        ctr(4, '004', 'Contrato Vigente', new Date(2027, 5, 1)), // D: só na Saúde
      ],
    });
    const cs = Object.fromEntries((await db.contrato.findMany()).map((c) => [c.idOrigem, c.id]));
    const lig = (c: number, e: number, certeza: string) => ({ prefeituraId: P, contratoId: cs[c], empenhoId: ids[e], certeza, motivo: 't' });
    await db.ligacaoContratoEmpenho.createMany({ data: [lig(1, 1, 'alta'), lig(1, 3, 'alta'), lig(2, 2, 'media'), lig(3, 2, 'media'), lig(4, 3, 'alta')] });
  });

  it('a visão geral traz empenhado, liquidado, pago e o liquidado ainda não pago', async () => {
    const v = await visaoGeral(dbDa(P), HOJE);
    const edu = v.linhas.find((l) => l.orgaoCod === '09')!;
    expect([edu.empenhado, edu.liquidado, edu.pago, edu.liquidadoNaoPago]).toEqual([800n, 600n, 400n, 200n]);
    expect(edu.liquidadoBp).toBe(6000n); // 600 de 1000 = 60,00%
    expect(edu.pagoBp).toBe(4000n);
    const f = (await fichaSecretaria(dbDa(P), '09', HOJE))!;
    expect(f.liquidadoBp).toBe(6000n);
    expect(f.pagoBp).toBe(4000n);
  });

  it('contratos da secretaria: só os dos empenhos dela, soma só os empenhos dela, média vem marcada', async () => {
    const r = (await contratosSecretaria(dbDa(P), '09', HOJE))!;
    expect(r.linhas.map((c) => c.numero)).toEqual(['001', '002', '003']); // vigentes por vencimento, depois o encerrado; o 004 é da Saúde
    const [a, b, c] = r.linhas;
    expect(a.certeza).toBe('alta');
    expect([a.empenhado, a.liquidado, a.pago]).toEqual([900n, 600n, 300n]); // o empenho 3 (Saúde) não entra
    expect(a.diasParaVencer).toBe(34);
    expect(b.certeza).toBe('media');
    expect([b.empenhado, b.liquidado, b.pago]).toEqual([500n, 0n, 0n]);
    expect(c.vigente).toBe(false);
    expect(r.vigentes).toBe(2);
    expect(r.vencendo90).toBe(1);
    expect(r.provaveis).toBe(2);
    expect(r.totais.valorAtual).toBe(10000n); // só vigentes
  });

  it('a mesma consulta na Saúde enxerga o contrato compartilhado com a parte dela; a Câmara não é secretaria', async () => {
    const r = (await contratosSecretaria(dbDa(P), '12', HOJE))!;
    expect(r.linhas.map((c) => c.numero).sort()).toEqual(['001', '004']);
    expect(r.linhas.find((c) => c.numero === '001')!.empenhado).toBe(700n);
    expect(await contratosSecretaria(dbDa(P), '01', HOJE)).toBeNull();
    expect(await contratosSecretaria(dbDa(P), '99', HOJE)).toBeNull();
  });

  it('outra prefeitura não vê esses contratos', async () => {
    expect(await contratosSecretaria(dbDa(O), '09', HOJE)).toBeNull();
  });
});
