// Relatório de auditoria guardado (com SHA-256), regras vindas do painel (T1, P1, A29) e nomes da folha (LGPD).
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { executarColeta } from '@/lib/financas/coleta/executar';
import { gerarRelatorio, lerRelatorio, montarRelatorio } from '@/lib/financas/auditoria/relatorio';
import { REGRAS, previaRegra, registrarRegras } from '@/lib/financas/regras/motor';
import { mudarChave } from '@/lib/financas/chaves';
import { nomeExibido, podeVerNomes } from '@/lib/financas/folha';

const P = 'rel-teste';

beforeAll(async () => {
  await prismaSistema.prefeitura.upsert({
    where: { id: P }, update: {},
    create: { id: P, nome: P, uf: 'MG', ibge: 12, conector: 'arquivo', conectorConfig: JSON.stringify({ pasta: path.resolve('__tests__/financas/fixtures/demo') }) },
  });
  await executarColeta(P, { ano: 2026, meses: [0, 10], folha: ['2026/10'], empenhos: true, contratos: true, siconfi: false, log: () => {}, esperasAbrirMs: [1, 1] });
  await registrarRegras(P);
});

describe('regras que vieram da auditoria do painel', () => {
  it('estão registradas como propostas, com base legal', async () => {
    const regs = await dbDa(P).regra.findMany({ where: { codigo: { in: ['T1', 'P1', 'A29'] } } });
    expect(regs.map((r) => r.codigo).sort()).toEqual(['A29', 'P1', 'T1']);
    expect(regs.every((r) => r.estado === 'proposta' && r.baseLegal.length > 10)).toBe(true);
    expect(REGRAS.length).toBe(15);
  });

  it('T1 conta matrículas (não linhas) com vínculo temporário', async () => {
    const a = await previaRegra(P, 'T1');
    expect(a).toHaveLength(1);
    expect(a[0].resumo).toMatch(/1 de 2 matrículas com vínculo temporário \(50,0%\)/);
  });

  it('A29 não avalia sem a base e o percentual informados por uma pessoa', async () => {
    expect(await previaRegra(P, 'A29')).toEqual([]);
  });
});

describe('relatório de auditoria guardado', () => {
  it('avalia todos os pontos de controle, inclusive regras ainda propostas, e explica os que ficaram sem avaliação', async () => {
    const c = await montarRelatorio(dbDa(P), 'Controlador', new Date(Date.UTC(2026, 10, 16, 12)));
    expect(c.itens).toHaveLength(15);
    const t1 = c.itens.find((i) => i.codigo === 'T1')!;
    expect(t1).toMatchObject({ situacao: 'atencao', estadoRegra: 'proposta', totalAchados: 1 });
    expect(t1.recomendacao).toMatch(/temporária/);
    const a29 = c.itens.find((i) => i.codigo === 'A29')!;
    expect(a29.situacao).toBe('sem_dado');
    expect(a29.observacao).toMatch(/falta definir baseAnoAnteriorReais, percentual/);
    expect(c.limitacoes.length).toBeGreaterThan(2);
  });

  it('grava com SHA-256; o conteúdo alterado no banco deixa de conferir', async () => {
    const db = dbDa(P);
    const r = await gerarRelatorio(db, P, 'Controlador');
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lerRelatorio(r).integro).toBe(true);
    const adulterado = { ...r, conteudo: r.conteudo.replace('"atencao"', '"ordem"') };
    expect(lerRelatorio(adulterado).integro).toBe(false);
    expect(await db.relatorioAuditoria.count()).toBe(1);
  });
});

describe('nomes da folha (LGPD)', () => {
  const sessao = (perfil: string) => ({ usuarioId: 'x', prefeituraId: P, perfil, nome: 'x' });
  it('começam ocultos; com a chave ligada aparecem só para prefeito, controlador, RH e auditor', async () => {
    const l = (await dbDa(P).folhaLinha.findFirst({ where: { matricula: '9001' } }))!;
    expect(await podeVerNomes(sessao('prefeito'))).toBe(false);
    expect(nomeExibido(l, false)).toBe('Servidor (mat. 9001)');
    await mudarChave(P, 'folha_nomes', true, 'teste');
    for (const p of ['prefeito', 'controlador', 'rh', 'auditor']) expect(await podeVerNomes(sessao(p))).toBe(true);
    for (const p of ['financeiro', 'juridico', 'administrador', 'secretaria']) expect(await podeVerNomes(sessao(p))).toBe(false);
    expect(nomeExibido(l, true)).toBe('PESSOA FICTICIA UM');
  });
});
