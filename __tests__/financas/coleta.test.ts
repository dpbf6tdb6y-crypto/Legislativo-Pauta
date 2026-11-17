// Gestão $$$ (fase 1): coleta, conferência, ligação contrato ↔ empenho e isolamento.
// Os testes com banco só rodam com FIN_TESTE_BANCO=1 e um DATABASE_URL de TESTE (o CI sobe um Postgres
// vazio para isso). Nunca rodar com o DATABASE_URL da produção.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirComTentativas } from '@/lib/financas/coleta/executar';

const COM_BANCO = process.env.FIN_TESTE_BANCO === '1';
const descreverComBanco = COM_BANCO ? describe : describe.skip;

describe('abrir o navegador com novas tentativas', () => {
  it('tenta de novo e segue quando abre na terceira', async () => {
    let n = 0; const logs: string[] = [];
    await abrirComTentativas({ abrir: async () => { if (++n < 3) throw new Error('Target page, context or browser has been closed\nmais detalhes'); }, fechar: async () => {} }, (m) => logs.push(m), [1, 1]);
    expect(n).toBe(3);
    expect(logs[0]).toMatch(/navegador não abriu \(Target page, context or browser has been closed\); nova tentativa/);
    expect(logs.at(-1)).toBe('navegador aberto na tentativa 3');
  });
  it('desiste depois das tentativas, com mensagem clara', async () => {
    await expect(abrirComTentativas({ abrir: async () => { throw new Error('fechou'); }, fechar: async () => {} }, () => {}, [1, 1]))
      .rejects.toThrow('não consegui abrir o navegador depois de 3 tentativas: fechou');
  });
});

descreverComBanco('coleta com banco (Postgres de teste)', () => {
  const DEMO = 'teste-demo', OUTRA = 'teste-outra', RUIM = 'teste-ruim';
  const pastaDemo = path.resolve('__tests__/financas/fixtures/demo');
  const op = { ano: 2026, meses: [0, 10], empenhos: true, contratos: true, log: () => {}, esperasAbrirMs: [1, 1] };

  // importados aqui dentro: o cliente Prisma só é criado quando há banco de teste
  let m: {
    db: typeof import('@/lib/financas/db');
    ex: typeof import('@/lib/financas/coleta/executar');
    conc: typeof import('@/lib/financas/coleta/conciliacao');
    fr: typeof import('@/lib/financas/coleta/frescor');
  };

  beforeAll(async () => {
    process.env.FIN_DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-teste-'));
    m = {
      db: await import('@/lib/financas/db'),
      ex: await import('@/lib/financas/coleta/executar'),
      conc: await import('@/lib/financas/coleta/conciliacao'),
      fr: await import('@/lib/financas/coleta/frescor'),
    };
    const p = m.db.prismaSistema;
    for (const [id, pasta] of [[DEMO, pastaDemo], [OUTRA, pastaDemo], [RUIM, '/nao-existe/fin']] as const)
      await p.prefeitura.upsert({
        where: { id }, update: {},
        create: { id, nome: id, uf: 'MG', ibge: 1, conector: 'arquivo', conectorConfig: JSON.stringify({ pasta }) },
      });
    await m.ex.executarColeta(DEMO, op);
  });

  it('a migração cadastrou Nova Lima com o conector do portal', async () => {
    const nl = await m.db.prismaSistema.prefeitura.findUnique({ where: { id: m.db.PREFEITURA_PADRAO } });
    expect(nl?.conector).toBe('abaco');
    expect(JSON.parse(nl!.conectorConfig).base).toBe('https://mgnl.abaco.com.br/transparencia/servlet');
  });

  it('carrega pelo mesmo caminho do portal e a conferência fecha', async () => {
    const db = m.db.dbDa(DEMO);
    expect(await db.empenho.count()).toBe(3);
    expect(await db.contrato.count()).toBe(2);
    const c = await m.conc.conciliar(db, 2026);
    expect(c.divergencias).toBe(0);
    expect(c.linhas.filter((l) => l.item !== 'empenhado' && !l.observacao.endsWith('(informativo)')).every((l) => l.confere)).toBe(true);
    const col = await db.coleta.findFirst({ orderBy: { id: 'desc' } });
    expect(col?.status).toBe('ok');
  });

  it('liga empenhos a contratos com o grau de certeza', async () => {
    const db = m.db.dbDa(DEMO);
    const ligs = await db.ligacaoContratoEmpenho.findMany();
    const e100 = await db.empenho.findFirst({ where: { idOrigem: 100 } });
    const e101 = await db.empenho.findFirst({ where: { idOrigem: 101 } });
    expect(ligs.find((l) => l.empenhoId === e100!.id)?.certeza).toBe('alta');
    expect(ligs.find((l) => l.empenhoId === e101!.id)?.certeza).toBe('media');
    expect(ligs).toHaveLength(2);
  });

  it('guarda cada arquivo baixado com SHA-256 e a data de cada fonte', async () => {
    const db = m.db.dbDa(DEMO);
    const arqs = await db.arquivoBruto.findMany();
    expect(arqs.length).toBeGreaterThan(0);
    expect(arqs.every((a) => /^[0-9a-f]{64}$/.test(a.sha256) && fs.existsSync(a.caminho))).toBe(true);
    const fontes = await m.fr.frescorFontes(db);
    expect(fontes.find((f) => f.chave === 'despesa')?.baixadoEm).not.toBeNull();
    expect(fontes.find((f) => f.chave === 'empenhos')?.baixadoEm).not.toBeNull();
    expect(fontes.map((f) => f.chave)).not.toContain('folha');
  });

  it('quando a fonte não abre, a coleta fica "falha" com o motivo, e não "rodando"', async () => {
    await expect(m.ex.executarColeta(RUIM, { ...op, meses: [0] })).rejects.toThrow(/não consegui abrir/);
    const c = (await m.db.dbDa(RUIM).coleta.findFirst({ orderBy: { id: 'desc' } }))!;
    expect(c.status).toBe('falha');
    expect(c.fim).not.toBeNull();
    expect(c.erros).toMatch(/coleta parou: não consegui abrir o navegador depois de 3 tentativas: pasta .* não existe/);
  });

  it('a coleta seguinte marca como "interrompida" a que morreu no meio', async () => {
    const db = m.db.dbDa(DEMO);
    const morta = await db.coleta.create({ data: { prefeituraId: DEMO, status: 'rodando', inicio: new Date(Date.now() - 20 * 3600000) } });
    expect((await m.fr.coletasInterrompidas(db, new Date())).map((c) => c.id)).toEqual([morta.id]);
    const r = await m.ex.executarColeta(DEMO, op);
    expect(r?.status).toBe('ok');
    const antes = (await db.coleta.findFirst({ where: { id: morta.id } }))!;
    expect(antes.status).toBe('interrompida');
    expect(await db.coleta.count({ where: { status: 'rodando' } })).toBe(0);
  });

  it('a situação da coleta (tela) resume a última coleta, as fontes e a conferência', async () => {
    const { situacaoColeta } = await import('@/lib/financas/situacao');
    const s = await situacaoColeta(new Date(Date.UTC(2026, 10, 16, 12)), DEMO);
    expect(s.coletas[0].status).toBe('ok');
    expect(s.totais.empenhos).toBe(3);
    expect(s.totais.contratos).toBe(2);
    expect(s.totais.ligacoesAlta + s.totais.ligacoesMedia).toBe(2);
    expect(s.conferencia?.divergencias).toBe(0);
    expect(() => JSON.stringify(s)).not.toThrow(); // nada de BigInt indo para o JSON da rota
  });

  it('a limpeza apaga do disco só os arquivos com mais de 30 dias e mantém o registro com o SHA-256', async () => {
    const { limparBrutos } = await import('../../scripts/financas/limpar-brutos');
    const db = m.db.dbDa(DEMO);
    const antes = await db.arquivoBruto.findMany();
    expect((await limparBrutos(DEMO, 30)).arquivos).toBe(0); // tudo é de hoje
    const daqui31 = new Date(Date.now() + 31 * 86400000);
    const r = await limparBrutos(DEMO, 30, false, daqui31);
    expect(r.arquivos).toBe(antes.length);
    const depois = await db.arquivoBruto.findMany();
    expect(depois).toHaveLength(antes.length);
    expect(depois.every((a) => a.apagadoEm && !fs.existsSync(a.caminho) && /^[0-9a-f]{64}$/.test(a.sha256))).toBe(true);
    expect((await limparBrutos(DEMO, 30, false, daqui31)).arquivos).toBe(0); // não repete
  });

  describe('isolamento', () => {
    it('uma prefeitura não lê dados da outra', async () => {
      expect(await m.db.dbDa(OUTRA).empenho.count()).toBe(0);
      expect(await m.db.dbDa(OUTRA).contrato.findMany()).toHaveLength(0);
    });
    it('não altera nem apaga registro de outra prefeitura', async () => {
      const c = await m.db.prismaSistema.contrato.findFirstOrThrow({ where: { prefeituraId: DEMO } });
      await expect(m.db.dbDa(OUTRA).contrato.update({ where: { id: c.id }, data: { objeto: 'invadido' } })).rejects.toThrow(/outra prefeitura/);
      await expect(m.db.dbDa(OUTRA).contrato.delete({ where: { id: c.id } })).rejects.toThrow(/outra prefeitura/);
      expect((await m.db.dbDa(OUTRA).contrato.updateMany({ where: { id: c.id }, data: { objeto: 'invadido' } })).count).toBe(0);
      expect(await m.db.dbDa(OUTRA).contrato.findUnique({ where: { id: c.id } })).toBeNull();
      expect((await m.db.prismaSistema.contrato.findUniqueOrThrow({ where: { id: c.id } })).objeto).not.toBe('invadido');
    });
    it('create força a prefeitura do cliente, mesmo se o código mandar outra', async () => {
      const r = await m.db.dbDa(DEMO).coleta.create({ data: { prefeituraId: OUTRA, status: 'ok' } });
      expect(r.prefeituraId).toBe(DEMO);
    });
    it('as tabelas do SEGOV e a de prefeituras não passam pelo cliente financeiro', async () => {
      await expect((m.db.dbDa(DEMO) as any).prefeitura.findMany()).rejects.toThrow(/não é permitido/);
      await expect((m.db.dbDa(DEMO) as any).user.findMany()).rejects.toThrow(/não é permitido/);
    });
  });
});
