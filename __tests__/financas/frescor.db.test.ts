// Data de cada fonte: coleta parcial ou travada não pode fazer o painel dizer que tudo está atualizado.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { coletasInterrompidas, frescorFontes, textoDadosDe } from '@/lib/financas/coleta/frescor';
import { confiancaDados } from '@/lib/financas/painel/fiscal';

const P = 'fres-teste';
const H = new Date(2026, 10, 16, 12);
const dh = (dia: number, hora: number) => new Date(2026, 10, dia, hora);

beforeAll(async () => {
  await prismaSistema.prefeitura.upsert({ where: { id: P }, create: { id: P, nome: P, uf: 'MG', ibge: 9, conector: 'arquivo' }, update: {} });
  const db = dbDa(P);
  // coleta 1: completa, mas travou no fim (status "rodando" para sempre) — foi a que trouxe despesa, receita e contratos
  const c1 = await db.coleta.create({ data: { prefeituraId: P, status: 'rodando', inicio: dh(14, 22) } });
  // coleta 2: só SICONFI, terminou bem, dois dias depois
  const c2 = await db.coleta.create({ data: { prefeituraId: P, status: 'divergencia', inicio: dh(16, 11), fim: dh(16, 11), portalAtualizadoEm: '16/11/2026 01:46:59' } });
  const arq = (coletaId: number, fonte: string, tipo: string, baixadoEm: Date) =>
    ({ prefeituraId: P, coletaId, fonte, tipo, referencia: '', caminho: '-', sha256: '-', bytes: 1, baixadoEm });
  await db.arquivoBruto.createMany({
    data: [
      arq(c1.id, 'portal-abaco', 'despesa_orgao', dh(14, 22)), arq(c1.id, 'portal-abaco', 'receitas', dh(14, 22)),
      arq(c1.id, 'portal-abaco', 'contratos', dh(14, 23)), arq(c2.id, 'siconfi', 'rgf', dh(16, 11)), arq(c2.id, 'siconfi', 'rreo', dh(16, 11)),
    ],
  });
});

describe('frescor das fontes', () => {
  it('a coleta só do SICONFI não "atualiza" a despesa', async () => {
    const fs = await frescorFontes(dbDa(P));
    const f = (c: string) => fs.find((x) => x.chave === c)!;
    expect(f('despesa').baixadoEm).toEqual(dh(14, 22));
    expect(f('despesa').portal).toBe(''); // a coleta que baixou travou antes de anotar a data do portal
    expect(f('rreo').baixadoEm).toEqual(dh(16, 11));
    expect(f('rreo').portal).toBe('16/11/2026 01:46:59');
    expect(f('empenhos').baixadoEm).toBeNull();
    expect(textoDadosDe(fs)).toBe('despesa baixada em 14/11 22:00');
  });

  it('coletas que não terminaram aparecem; a recente ainda em andamento não', async () => {
    const db = dbDa(P);
    expect((await coletasInterrompidas(db, H)).length).toBe(1);
    await db.coleta.create({ data: { prefeituraId: P, status: 'rodando', inicio: dh(16, 10) } });
    expect((await coletasInterrompidas(db, H)).length).toBe(1);
  });

  it('confiança dos dados: fonte diária velha vira observação, com o nome e a data', async () => {
    const fontes = await frescorFontes(dbDa(P));
    const it_ = confiancaDados({
      hoje: H, ultimaColeta: { status: 'divergencia', fim: dh(16, 11) }, coletaRodando: null, rgf: undefined, folhaMeses: null,
      fontes, interrompidas: await coletasInterrompidas(dbDa(P), H),
    });
    const t = it_.map((i) => `${i.nivel}|${i.titulo}|${i.detalhe}`).join('\n');
    expect(t).toMatch(/observacao\|Dados do portal com 2 dia\(s\)\|Despesa por secretaria \(14\/11\/2026 22:00\), Receita/);
    expect(t).toMatch(/Nunca coletado: Empenhos, Restos a pagar/);
    expect(t).toMatch(/observacao\|1 coleta\(s\) começaram e não terminaram/);
    expect(t).not.toMatch(/Dados atualizados/);
  });

  it('tudo do dia: um item "ok" com a data de cada fonte', () => {
    const fontes = ['Despesa por secretaria', 'Receita'].map((nome) => ({ nome, baixadoEm: dh(16, 1), diaria: true }));
    const it_ = confiancaDados({ hoje: H, ultimaColeta: null, coletaRodando: null, rgf: undefined, folhaMeses: null, fontes, interrompidas: [] });
    expect(it_[0]).toMatchObject({ nivel: 'ok', titulo: 'Dados do portal do dia' });
    expect(it_).toHaveLength(1);
  });
});
