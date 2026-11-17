// Regras, conferir antes de assinar e troca de fonte (conector arquivo CSV), com folha.
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { executarColeta } from '@/lib/financas/coleta/executar';
import { conciliar } from '@/lib/financas/coleta/conciliacao';
import { executarRegras, previaRegra, registrarRegras } from '@/lib/financas/regras/motor';

beforeAll(async () => {
  for (const [id, conector, cfg] of [
    ['demo', 'arquivo', { pasta: path.resolve('__tests__/financas/fixtures/demo') }],
    ['outra', 'arquivo', { pasta: path.resolve('__tests__/financas/fixtures/demo') }],
  ] as const) {
    await prismaSistema.prefeitura.upsert({
      where: { id },
      create: { id, nome: id, uf: 'MG', ibge: 1, conector, conectorConfig: JSON.stringify(cfg) },
      update: {},
    });
  }
  await registrarRegras('demo');
  await dbDa('demo').chave.create({ data: { prefeituraId: 'demo', nome: 'folha', ligada: true } });
  await executarColeta('demo', { ano: 2026, meses: [0, 10], folha: ['2026/10'], empenhos: true, contratos: true, siconfi: false, log: () => {} });
});

describe('troca de fonte (conector arquivo CSV)', () => {
  it('carrega pelo mesmo caminho do portal e concilia sem divergência', async () => {
    const db = dbDa('demo');
    expect(await db.empenho.count()).toBe(3);
    expect(await db.contrato.count()).toBe(2);
    expect(await db.folhaLinha.count()).toBe(3);
    const c = await conciliar(db, 2026);
    expect(c.divergencias).toBe(0);
    expect(c.linhas.filter((l) => l.item !== 'empenhado').every((l) => l.confere)).toBe(true);
    const col = await db.coleta.findFirst({ orderBy: { id: 'desc' } });
    expect(col?.status).toBe('ok');
  });
  it('liga empenhos a contratos com grau de certeza', async () => {
    const db = dbDa('demo');
    const ligs = await db.ligacaoContratoEmpenho.findMany();
    const e100 = await db.empenho.findFirst({ where: { idOrigem: 100 } });
    const e101 = await db.empenho.findFirst({ where: { idOrigem: 101 } });
    expect(ligs.find((l) => l.empenhoId === e100!.id)?.certeza).toBe('alta');
    expect(ligs.find((l) => l.empenhoId === e101!.id)?.certeza).toBe('media');
    expect(ligs).toHaveLength(2);
  });
  it('resume a situação da folha (LGPD)', async () => {
    const l = await dbDa('demo').folhaLinha.findFirst({ where: { matricula: '9002' } });
    expect(l?.situacao).toBe('afastado');
  });
});

describe('regras: o sistema não decide sozinho', () => {
  it('regra proposta NÃO gera apontamento; aprovada gera "para análise"', async () => {
    const db = dbDa('demo');
    const previa = await previaRegra('demo', 'C2a');
    expect(previa).toHaveLength(1); // pagamento em 12/10 após fim do contrato em 30/09
    await executarRegras('demo');
    expect(await db.apontamento.count()).toBe(0);
    await db.regra.updateMany({ where: { codigo: 'C2a' }, data: { estado: 'aprovada', decididoPor: 'teste' } });
    await executarRegras('demo');
    const ap = await db.apontamento.findMany();
    expect(ap).toHaveLength(1);
    expect(ap[0].status).toBe('para_analise');
    await executarRegras('demo'); // não duplica
    expect(await db.apontamento.count()).toBe(1);
  });
});

describe('conferir antes de assinar', () => {
  it('aponta falta de saldo no contrato e data fora da vigência, sem dizer "irregular"', async () => {
    const { conferirDocumento } = await import('@/lib/financas/conferir');
    const r = await conferirDocumento(dbDa('demo'), { tipo: 'empenho', valor: '10.000,00', credorDoc: '11111111000111', orgaoCod: '01', contrato: '10/2026', data: '2026-11-14' });
    const item = (n: string) => r.checagens.find((c) => c.item.startsWith(n))!;
    expect(item('Saldo da dotação').resultado).toBe('ok');
    expect(item('Vigência do contrato').resultado).toBe('atencao'); // contrato terminou em 30/09
    expect(item('Saldo do contrato').resultado).toBe('atencao'); // já empenhado acima do valor
    expect(JSON.stringify(r)).not.toMatch(/irregular/i);
  });
});
// isolamento entre prefeituras: ver coleta.test.ts (contratos, coleta e tabelas do SEGOV)
