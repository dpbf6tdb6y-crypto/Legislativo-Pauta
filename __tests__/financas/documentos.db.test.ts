// Fila de documentos para assinar: semáforo, envio, parecer, decisão com ciência registrada e quem vê o quê.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { cancelar, darParecer, decidir, enviarDocumento, filtroVisivel, lerChecagens, ordenarFila, prazoTexto, semaforo } from '@/lib/financas/documentos/fluxo';
import type { Checagem } from '@/lib/financas/conferir';

const ch = (r: Checagem['resultado']): Checagem => ({ item: 'x', resultado: r, detalhe: '', base: '' });

describe('semáforo', () => {
  it('vermelho só com parecer humano; a conferência automática chega no máximo ao amarelo', () => {
    expect(semaforo({ parecer: null, checagens: [ch('atencao'), ch('atencao')] }).cor).toBe('cinza');
    expect(semaforo({ parecer: 'nao_assinar', checagens: [ch('ok')] }).cor).toBe('vermelho');
    expect(semaforo({ parecer: 'com_ressalva', checagens: [ch('ok')] }).cor).toBe('amarelo');
    expect(semaforo({ parecer: 'pode_assinar', checagens: [ch('ok'), ch('atencao')] }).cor).toBe('amarelo');
    expect(semaforo({ parecer: 'pode_assinar', checagens: [ch('ok'), ch('sem_dado')] }).cor).toBe('verde');
  });
  it('fila por prazo e texto do prazo', () => {
    const h = new Date(2026, 10, 16, 10);
    const ds = [{ id: 1, prazo: null, enviadoEm: new Date(2026, 10, 1) }, { id: 2, prazo: new Date(2026, 10, 20), enviadoEm: new Date(2026, 10, 2) }, { id: 3, prazo: new Date(2026, 10, 17), enviadoEm: new Date(2026, 10, 3) }];
    expect(ordenarFila(ds).map((d) => d.id)).toEqual([3, 2, 1]);
    expect([prazoTexto(new Date(2026, 10, 16, 12), h), prazoTexto(new Date(2026, 10, 15), h), prazoTexto(null, h)]).toEqual(['assinar hoje', 'prazo vencido em 15/11/2026', '']);
  });
});

describe('fluxo no banco', () => {
  const P = 'doc-teste', O = 'doc-outra';
  const sec = { id: 'u-sec', nome: 'Secretária de Educação', perfil: 'secretaria', orgaoCod: '09' };
  const rh = { id: 'u-rh', nome: 'RH', perfil: 'rh', orgaoCod: '' };
  beforeAll(async () => {
    for (const id of [P, O])
      await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 7, conector: 'arquivo' }, update: {} });
    const l = (orgaoCod: string, orgaoNome: string) => ({ prefeituraId: P, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: 100000000n, dotAtual: 100000000n, empenhado: 90000000n, liquidado: 0n, pago: 0n, coletaId: 0 });
    await dbDa(P).despesaOrgaoMes.createMany({ data: [l('09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO'), l('12', 'SECRETARIA MUNICIPAL DE SAÚDE')] });
    // pessoal do Executivo no limite prudencial
    const g = (chave: string, valor: string) => ({ prefeituraId: P, ano: 2026, periodo: 2, relatorio: 'RGF', chave, valor, coletaId: 0 });
    await dbDa(P).indicadorFiscal.createMany({
      data: [g('rcl', '1000000'), g('dtp', '520000'), g('dtp_pct', '52'), g('limite_alerta_pct', '48.6'), g('limite_prudencial_pct', '51.3'), g('limite_max_pct', '54')],
    });
  });

  it('secretaria envia só para a própria secretaria; o sistema confere na hora', async () => {
    const db = dbDa(P);
    const d = await enviarDocumento(db, sec, { tipo: 'empenho', assunto: 'Transporte escolar', valor: '150.000,00', dataAto: '2026-11-16', orgaoCod: '12' });
    expect(d.orgaoCod).toBe('09'); // o formulário pedia 12; vale o cadastro
    expect(d.status).toBe('em_conferencia');
    const saldo = lerChecagens(d.checagens).find((c) => c.item.startsWith('Saldo da dotação'))!;
    expect(saldo.resultado).toBe('atencao'); // saldo de R$ 100 mil, documento de R$ 150 mil
    expect(await db.eventoDocumento.count({ where: { documentoId: d.id, tipo: 'enviado' } })).toBe(1);
    await expect(enviarDocumento(db, sec, { tipo: 'xyz', assunto: 'a', valor: '1', dataAto: '2026-11-16', orgaoCod: '09' })).rejects.toThrow(/Tipo/);
    await expect(enviarDocumento(db, sec, { tipo: 'empenho', assunto: 'a', valor: '1', dataAto: '2026-11-16', orgaoCod: '09', contrato: '252-2025' })).rejects.toThrow(/número\/ano/);
    await expect(enviarDocumento(db, sec, { tipo: 'empenho', assunto: 'a', valor: '1', dataAto: '', orgaoCod: '09' })).rejects.toThrow(/data/);
  });

  it('nomeação no limite prudencial: a conferência cita as vedações do art. 22', async () => {
    const d = await enviarDocumento(dbDa(P), rh, { tipo: 'nomeacao', assunto: 'Nomeação de 3 professores', valor: '15.000,00', dataAto: '2026-11-16', orgaoCod: '09' });
    const p = lerChecagens(d.checagens).find((c) => c.item === 'Limite de despesa com pessoal')!;
    expect(p.resultado).toBe('atencao');
    expect(p.detalhe).toMatch(/provimento de cargo/);
    expect(lerChecagens(d.checagens).some((c) => c.item.startsWith('Certidões'))).toBe(false);
  });

  it('parecer com ressalva exige fundamento; decisão registra a ciência do prefeito', async () => {
    const db = dbDa(P);
    const d = (await db.documentoAssinatura.findFirst({ where: { assunto: 'Transporte escolar' } }))!;
    await expect(decidir(db, 'Prefeito', d.id, 'assinado', '')).rejects.toThrow(/Ainda não há parecer/);
    await expect(darParecer(db, 'Controlador', d.id, 'com_ressalva', '')).rejects.toThrow(/Explique/);
    await darParecer(db, 'Controlador', d.id, 'com_ressalva', 'Abrir crédito suplementar antes do pagamento');
    expect((await db.documentoAssinatura.findFirst({ where: { id: d.id } }))!.status).toBe('para_assinatura');
    await expect(decidir(db, 'Prefeito', d.id, 'assinado', '')).rejects.toThrow(/justificativa/);
    await decidir(db, 'Prefeito', d.id, 'assinado', 'Crédito suplementar aberto pelo Decreto 100/2026');
    const final = (await db.documentoAssinatura.findFirst({ where: { id: d.id } }))!;
    expect([final.status, final.decisaoPor]).toEqual(['assinado', 'Prefeito']);
    const ev = (await db.eventoDocumento.findFirst({ where: { documentoId: d.id, tipo: 'assinado' } }))!;
    expect(ev.texto).toMatch(/Ciência registrada: Semáforo amarelo/);
    expect(ev.texto).toMatch(/Saldo da dotação do órgão/);
    await expect(decidir(db, 'Prefeito', d.id, 'devolvido', 'x')).rejects.toThrow(/encerrado/);
  });

  it('devolver exige dizer o que ajustar; retirar exige motivo', async () => {
    const db = dbDa(P);
    const d = (await db.documentoAssinatura.findFirst({ where: { tipo: 'nomeacao' } }))!;
    await expect(decidir(db, 'Prefeito', d.id, 'devolvido', '')).rejects.toThrow(/ajustado/);
    await expect(cancelar(db, 'RH', d.id, '')).rejects.toThrow(/por que/);
    await decidir(db, 'Prefeito', d.id, 'devolvido', 'Aguardar o próximo quadrimestre');
    expect((await db.documentoAssinatura.findFirst({ where: { id: d.id } }))!.status).toBe('devolvido');
  });

  it('quem vê o quê: secretaria a sua, RH o que enviou, outra prefeitura nada', async () => {
    const db = dbDa(P);
    await enviarDocumento(db, { id: 'u-ctrl', nome: 'Controlador', perfil: 'controlador', orgaoCod: '' }, { tipo: 'pagamento', assunto: 'Pagamento Saúde', valor: '10,00', dataAto: '2026-11-16', orgaoCod: '12' });
    const n = async (f: object) => db.documentoAssinatura.count({ where: f });
    expect(await n(filtroVisivel(sec, false))).toBe(2);          // transporte + nomeação (ambos da Educação)
    expect(await n(filtroVisivel({ ...sec, orgaoCod: '12' }, false))).toBe(1);
    expect(await n(filtroVisivel(rh, false))).toBe(1);           // só a nomeação que ele enviou
    expect(await n(filtroVisivel({ ...sec, orgaoCod: '' }, false))).toBe(0); // secretaria sem cadastro não vê nada
    expect(await n(filtroVisivel(rh, true))).toBe(3);
    expect(await dbDa(O).documentoAssinatura.count()).toBe(0);
    const d = (await db.documentoAssinatura.findFirst())!;
    await expect(darParecer(dbDa(O), 'x', d.id, 'pode_assinar', '')).rejects.toThrow(/não encontrado/);
  });
});
