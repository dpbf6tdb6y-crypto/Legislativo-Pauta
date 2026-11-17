// Pacote B: leitura do RREO (Anexo 14) e do RGF (Anexos 01 e 06) do SICONFI, com os arquivos públicos de Nova Lima.
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { extrairRgf, extrairRreoSimplificado, type IndicadorC } from '@/lib/financas/conectores/siconfi';
import { confiancaRREO, dividaLRF, nivelMinimo, pessoalLRF, resumoRREO, rreoEsperado } from '@/lib/financas/painel/fiscal';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { executarRegras, registrarRegras } from '@/lib/financas/regras/motor';

const ler = (f: string) => JSON.parse(fs.readFileSync(path.resolve('__tests__/financas/fixtures/siconfi', f), 'utf-8')).items;
const mapa = (xs: IndicadorC[]) => Object.fromEntries(xs.map((x) => [x.chave, x.valor]));

describe('leitura do SICONFI', () => {
  const rreo = extrairRreoSimplificado(ler('rreo_3144805_2026_b4_anexo14.json'), 2026, 4);
  const rgf = extrairRgf(ler('rgf_3144805_2026_q2.json'), 2026, 2);

  it('RREO Anexo 14: mínimos, metas, resultado e restos a pagar', () => {
    const m = mapa(rreo);
    expect(rreo.every((i) => i.relatorio === 'RREO' && i.ano === 2026 && i.periodo === 4)).toBe(true);
    expect([m.mde_pct, m.mde_minimo_pct, m.fundeb_pct, m.fundeb_minimo_pct, m.asps_pct, m.asps_minimo_pct]).toEqual(['26.42', '25', '95.25', '70', '22.04', '15']);
    expect([m.primario_meta, m.primario_apurado, m.nominal_meta]).toEqual(['370000', '-218040078.36', '-15218775']);
    expect(m.resultado_orcamentario).toBe('-124522180.89'); // déficit vira negativo
    expect(m.saldo_exercicios_anteriores).toBe('122101556.24');
    expect([m.rp_proc_saldo, m.rp_nproc_saldo, m.rp_nproc_cancelado]).toEqual(['2920096.28', '9427615.94', '26844629.99']); // total, não o do Executivo
    expect(m.desp_empenhada).toBe('1425762655.69');
  });
  it('RGF: pessoal (Anexo 01) e dívida (Anexo 06)', () => {
    const m = mapa(rgf);
    expect([m.dtp_pct, m.rcl_ajustada, m.limite_alerta_pct]).toEqual(['31.91', '1560794069.71', '48.6']);
    expect([m.dcl, m.dcl_pct, m.dcl_limite_pct]).toEqual(['-283875372.23', '-18.09', '120']);
    expect(pessoalLRF(rgf)?.pctBp).toBe(3191n);
  });
  it('relatório vazio (bimestre ainda não publicado) não grava nada', () => {
    expect(extrairRreoSimplificado([], 2026, 5)).toEqual([]);
    expect(extrairRgf([], 2026, 3)).toEqual([]);
  });

  it('resumo do RREO para a tela', () => {
    const r = resumoRREO(rreo)!;
    expect([r.ano, r.bimestre, r.posicao.toLocaleDateString('pt-BR')]).toEqual([2026, 4, '31/08/2026']);
    expect(r.minimos.map((m) => [m.chave, m.pctBp, m.nivel])).toEqual([['mde', 2642n, 'ok'], ['fundeb', 9525n, 'ok'], ['asps', 2204n, 'ok']]);
    expect(r.primario).toEqual({ meta: 37000000n, apurado: -21804007836n, nivel: 'observacao' });
    expect(r.rp.naoProcessados.saldo).toBe(942761594n);
  });
  it('dívida negativa fica em ordem', () => {
    expect(dividaLRF(rgf)).toMatchObject({ pctBp: -1809n, limiteBp: 12000n, nivel: 'ok' });
  });
});

describe('regras da lei sobre os números oficiais', () => {
  it('mínimo é anual: abaixo antes do 6º bimestre é observação; no 6º, atenção', () => {
    expect(nivelMinimo(2400n, 2500n, 4)).toBe('observacao');
    expect(nivelMinimo(2400n, 2500n, 6)).toBe('atencao');
    expect(nivelMinimo(2500n, 2500n, 6)).toBe('ok');
  });
  it('dívida: alerta a 90% do limite, atenção no limite', () => {
    const d = (pct: string) => dividaLRF([{ ano: 2026, periodo: 2, relatorio: 'RGF', chave: 'dcl_pct', valor: pct }, { ano: 2026, periodo: 2, relatorio: 'RGF', chave: 'dcl_limite_pct', valor: '120' }])!.nivel;
    expect([d('107.99'), d('108'), d('120')]).toEqual(['ok', 'observacao', 'atencao']);
  });
  it('RREO esperado: 30 dias após o fim do bimestre (LRF art. 52)', () => {
    expect(rreoEsperado(new Date(2026, 10, 16))).toMatchObject({ ano: 2026, bimestre: 4 });
    expect(rreoEsperado(new Date(2026, 11, 1))).toMatchObject({ ano: 2026, bimestre: 5 });
    expect(rreoEsperado(new Date(2026, 0, 15))).toMatchObject({ ano: 2025, bimestre: 5 });
    expect(confiancaRREO(new Date(2026, 10, 16), { ano: 2026, bimestre: 4 }).nivel).toBe('ok');
    expect(confiancaRREO(new Date(2026, 11, 1), { ano: 2026, bimestre: 4 }).titulo).toMatch(/5º bimestre de 2026 não consta/);
  });
});

describe('F3 e F4: nascem propostas; aprovadas, apontam pelos números oficiais', () => {
  const P = 'siconfi-teste';
  beforeAll(async () => {
    await prismaSistema.prefeitura.upsert({ where: { id: P }, create: { id: P, nome: P, uf: 'MG', ibge: 6, conector: 'arquivo' }, update: {} });
    const i = (relatorio: string, periodo: number, chave: string, valor: string) => ({ prefeituraId: P, ano: 2025, periodo, relatorio, chave, valor, coletaId: 0 });
    await dbDa(P).indicadorFiscal.createMany({
      data: [
        i('RREO', 4, 'mde_pct', '20'), i('RREO', 4, 'mde_minimo_pct', '25'), // 4º bimestre: não aponta
        i('RREO', 6, 'mde_pct', '24.5'), i('RREO', 6, 'mde_minimo_pct', '25'),
        i('RREO', 6, 'asps_pct', '16'), i('RREO', 6, 'asps_minimo_pct', '15'),
        i('RGF', 3, 'dcl_pct', '110'), i('RGF', 3, 'dcl_limite_pct', '120'),
      ],
    });
    await registrarRegras(P);
  });
  it('propostas não apontam; aprovadas apontam só o que a lei manda', async () => {
    const db = dbDa(P);
    await executarRegras(P);
    expect(await db.apontamento.count()).toBe(0);
    await db.regra.updateMany({ where: { codigo: { in: ['F3', 'F4'] } }, data: { estado: 'aprovada', decididoPor: 'teste' } });
    await executarRegras(P);
    const ap = await db.apontamento.findMany({ orderBy: { regraCodigo: 'asc' } });
    expect(ap.map((a) => [a.regraCodigo, a.valorEncontrado])).toEqual([['F3', '110,0%'], ['F4', '24,50%']]);
    expect(ap[1].resumo).toMatch(/Educação \(MDE\): 24,50% aplicado em 2025, mínimo 25%/);
  });
});
