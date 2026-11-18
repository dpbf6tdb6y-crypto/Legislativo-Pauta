// Robô único com banco: trava que preserva o dado anterior, conferência com o RREO homologado e isolamento.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { executarColeta } from '@/lib/financas/coleta/executar';
import { conferirComOficial, conferirVisoes } from '@/lib/financas/coleta/conferenciaOficial';
import { selosDaExecucao } from '@/lib/financas/coleta/selos';

const P = 'robo-teste', OUTRA = 'robo-outra';
const CAB = 'ano;mes;contaCod;contaPai;nome;redutora;previstoInicial;previstoAtual;arrecAnterior;arrecMes;arrecAteMes';
const receita = (folha: number) => [CAB, `2026;2;1000000000;;CORRENTES;false;1000;1000;0;100;1000`, `2026;2;1100000000;1000000000;IMPOSTOS;false;1000;1000;0;100;${folha}`].join('\n');
const op = { ano: 2026, meses: [2], folha: [] as string[], siconfi: false, empenhos: false, contratos: false, log: () => {}, esperasAbrirMs: [1] };

let pasta: string;
beforeAll(async () => {
  process.env.FIN_DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-robo-'));
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-robo-csv-'));
  fs.writeFileSync(path.join(pasta, 'despesa_orgao.csv'), 'ano;mes;orgaoCod;orgaoNome;dotInicial;dotAtual;empenhado;liquidado;pago\n2026;2;01;SECRETARIA;1000;1000;700;500;400\n');
  for (const id of [P, OUTRA])
    await prismaSistema.prefeitura.upsert({ where: { id }, update: {}, create: { id, nome: id, uf: 'MG', ibge: 2, conector: 'arquivo', conectorConfig: JSON.stringify({ pasta }) } });
});

describe('trava da receita', () => {
  it('arquivo que fecha é gravado', async () => {
    fs.writeFileSync(path.join(pasta, 'receitas.csv'), receita(1000));
    const r = await executarColeta(P, op);
    expect(r?.status).toBe('ok');
    expect((await dbDa(P).receitaContaMes.findFirst({ where: { contaCod: '1100000000' } }))?.arrecAteMes).toBe(BigInt(1000));
  });
  it('arquivo cuja soma não fecha é recusado e o dado anterior continua inteiro', async () => {
    fs.writeFileSync(path.join(pasta, 'receitas.csv'), receita(900));
    const r = await executarColeta(P, op);
    expect(r?.status).toBe('falha');
    expect(r?.erros.join(' ')).toMatch(/receita recusada/);
    const db = dbDa(P);
    expect(await db.receitaContaMes.count({ where: { ano: 2026, mes: 2 } })).toBe(2);
    expect((await db.receitaContaMes.findFirst({ where: { contaCod: '1100000000' } }))?.arrecAteMes).toBe(BigInt(1000));
    fs.writeFileSync(path.join(pasta, 'receitas.csv'), receita(1000));
  });
});

describe('conferência com o RREO homologado', () => {
  const ind = (periodo: number, chave: string, valor: string) => ({ prefeituraId: P, ano: 2026, periodo, relatorio: 'RREO', chave, valor, coletaId: 1 });
  beforeAll(async () => {
    await dbDa(P).indicadorFiscal.createMany({
      data: [
        ind(1, 'homologado', '1'), ind(1, 'rec_realizada', '10.00'), ind(1, 'desp_empenhada', '7.00'), ind(1, 'desp_liquidada', '5.00'), ind(1, 'desp_paga', '3.99'),
        // bimestre 2 sem homologação: não entra
        ind(2, 'rec_realizada', '999.00'),
      ],
    });
    await dbDa(P).despesaOrgaoMes.createMany({ data: [{ prefeituraId: P, ano: 2026, mes: 1, orgaoCod: '01', orgaoNome: 'S', dotInicial: 0n, dotAtual: 0n, empenhado: 0n, liquidado: 0n, pago: 0n, coletaId: 1 }] });
  });

  it('confere só o homologado, aponta a diferença do pago e não aceita mês faltando como conferido', async () => {
    const db = dbDa(P);
    const r = await conferirComOficial(db, P, 2026, 1);
    expect(r.bimestres).toEqual([1]);
    const l = await db.conferenciaOficial.findMany({ orderBy: { item: 'asc' } });
    expect(l.find((x) => x.item === 'receita')).toMatchObject({ confere: true, oficial: 1000n, portal: 1000n });
    expect(l.find((x) => x.item === 'pago')).toMatchObject({ confere: false, diferenca: 1n });
    expect(r.divergencias).toBe(1);
    const s = await selosDaExecucao(db, 2026);
    expect([s.receita.tipo, s.empenhado.tipo, s.pago.tipo]).toEqual(['conferido', 'conferido', 'divergente']);
    expect(s.divergencias.map((d) => d.item)).toEqual(['pago']);
  });

  it('natureza diferente dos órgãos no mesmo mês é apontada', async () => {
    const db = dbDa(P);
    await db.despesaNaturezaMes.createMany({ data: [{ prefeituraId: P, ano: 2026, mes: 2, naturezaCod: '339039', naturezaNome: 'X', dotInicial: 0n, dotAtual: 0n, empenhado: 700n, liquidado: 501n, pago: 400n, coletaId: 1 }] });
    expect(await conferirVisoes(db, 2026, [2])).toEqual(['2026/2 liquidado: natureza difere dos órgãos em 1 centavos']);
  });

  it('uma prefeitura não enxerga a conferência da outra', async () => {
    expect(await dbDa(OUTRA).conferenciaOficial.count()).toBe(0);
    expect(await dbDa(OUTRA).despesaNaturezaMes.count()).toBe(0);
  });
});
