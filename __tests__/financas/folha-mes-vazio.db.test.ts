// Folha: mês que o portal ainda não publicou (zero linhas) não cria mês zerado nem apaga o que já está guardado.
// Precisa de banco: só roda com FIN_TESTE_BANCO=1 (o CI sobe um Postgres vazio).
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { executarColeta } from '@/lib/financas/coleta/executar';
import { carregarMesesGuardados, mesesDeFolhaPendentes } from '@/lib/financas/coleta/folhaPendente';

const P = 'folha-vazia-teste';
const op = { ano: 2026, meses: [] as number[], siconfi: false, empenhos: false, contratos: false, log: () => {}, esperasAbrirMs: [1, 1] };

beforeAll(async () => {
  await prismaSistema.prefeitura.upsert({
    where: { id: P },
    create: { id: P, nome: P, uf: 'MG', ibge: 1, conector: 'arquivo', conectorConfig: JSON.stringify({ pasta: path.resolve('__tests__/financas/fixtures/demo') }) },
    update: {},
  });
  await dbDa(P).chave.create({ data: { prefeituraId: P, nome: 'folha', ligada: true } });
});

describe('folha de mês sem linhas no portal', () => {
  it('coleta 2026/10 (tem linhas) e sonda 2026/11 (sem linhas): só o 10 fica guardado', async () => {
    await executarColeta(P, { ...op, folha: ['2026/10', '2026/11'] });
    const db = dbDa(P);
    expect((await db.folhaMes.findMany()).map((m) => m.anoMes)).toEqual(['2026/10']);
    expect(await db.folhaLinha.count({ where: { anoMes: '2026/11' } })).toBe(0);
  });

  it('repetir a coleta com o mês 2026/11 vazio não mexe no 2026/10', async () => {
    const db = dbDa(P);
    const antes = await db.folhaLinha.count({ where: { anoMes: '2026/10' } });
    expect(antes).toBeGreaterThan(0);
    await executarColeta(P, { ...op, folha: ['2026/11'] });
    expect(await db.folhaLinha.count({ where: { anoMes: '2026/10' } })).toBe(antes);
    expect(await db.folhaMes.count()).toBe(1);
  });

  it('a rotina pede só o corrente quando o último fechado já está completo', async () => {
    const db = dbDa(P);
    const guardados = await carregarMesesGuardados(db);
    // 2026/10 está completo (primeiro teste); em 20/11/2026 o último fechado é 2026/10
    expect(mesesDeFolhaPendentes(guardados, new Date(Date.UTC(2026, 10, 20, 12)))).toEqual(['2026/11']);
  });
});
