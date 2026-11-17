// Anexos PDF: validação, guarda por hash fora do OneDrive, conferência de integridade, ciência e isolamento.
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { guardarAnexo, LIMITE_BYTES, lerAnexo, MAX_ANEXOS, retirarAnexo, sha256, validarPdf } from '@/lib/financas/documentos/anexos';
import { darParecer, decidir, enviarDocumento } from '@/lib/financas/documentos/fluxo';

const pdf = (txt: string) => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% ${txt}\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const P = 'anx-teste', O = 'anx-outra';
const DADOS = process.env.FIN_DADOS_DIR!;
const ctrl = { id: 'u-c', nome: 'Controlador', perfil: 'controlador', orgaoCod: '' };

describe('validação do PDF', () => {
  it('aceita PDF inteiro; recusa vazio, outro formato, incompleto e grande demais', () => {
    expect(() => validarPdf(pdf('ok'), 'a.pdf')).not.toThrow();
    expect(() => validarPdf(Buffer.alloc(0), 'a.pdf')).toThrow(/vazio/);
    expect(() => validarPdf(Buffer.from('MZ\x90\x00 executável'), 'virus.pdf')).toThrow(/não é um PDF/);
    expect(() => validarPdf(Buffer.from('%PDF-1.4\n1 0 obj'), 'cortado.pdf')).toThrow(/incompleto/);
    const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(LIMITE_BYTES), Buffer.from('\n%%EOF')]);
    expect(() => validarPdf(grande, 'g.pdf')).toThrow(/maior que 15 MB/);
  });
});

describe('guarda e leitura', () => {
  let docId = 0;
  beforeAll(async () => {
    fs.rmSync(path.join(DADOS, P), { recursive: true, force: true }); // começa sem arquivos de rodadas anteriores
    for (const id of [P, O])
      await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 8, conector: 'arquivo' }, update: {} });
    await dbDa(P).despesaOrgaoMes.create({ data: { prefeituraId: P, ano: 2026, mes: 0, orgaoCod: '16', orgaoNome: 'SECRETARIA DE OBRAS', dotInicial: 10000000n, dotAtual: 10000000n, empenhado: 0n, liquidado: 0n, pago: 0n, coletaId: 0 } });
    docId = (await enviarDocumento(dbDa(P), ctrl, { tipo: 'empenho', assunto: 'Obra', valor: '1.000,00', dataAto: '2026-11-16', orgaoCod: '16' })).id;
  });

  it('grava em FIN_DADOS_DIR/<prefeitura>/anexos/<sha256>.pdf, com nome limpo, e lê conferindo o hash', async () => {
    const db = dbDa(P);
    const buf = pdf('contrato');
    const a = await guardarAnexo(db, P, 'Controlador', docId, '..\\..\\Windows\\contrato:final.pdf', buf);
    const arq = path.join(DADOS, P, 'anexos', `${sha256(buf)}.pdf`);
    expect(fs.existsSync(arq)).toBe(true);
    expect(a.nome).not.toMatch(/[\\/:]/);
    expect(a.sha256).toBe(sha256(buf));
    expect(lerAnexo(P, a).equals(buf)).toBe(true);
    // o mesmo conteúdo anexado de novo usa o mesmo arquivo
    await guardarAnexo(db, P, 'Controlador', docId, 'copia.pdf', buf);
    expect(fs.readdirSync(path.dirname(arq)).filter((f) => f === `${a.sha256}.pdf`)).toHaveLength(1);
    expect(await db.eventoDocumento.count({ where: { documentoId: docId, tipo: 'anexo' } })).toBe(2);
  });

  it('arquivo alterado no disco não é entregue; caminho com pasta fora do padrão é recusado', async () => {
    const buf = pdf('alterar');
    const a = await guardarAnexo(dbDa(P), P, 'Controlador', docId, 'b.pdf', buf);
    const arq = path.join(DADOS, P, 'anexos', `${a.sha256}.pdf`);
    fs.writeFileSync(arq, pdf('ADULTERADO'));
    expect(() => lerAnexo(P, a)).toThrow(/alterado/);
    expect(() => lerAnexo('../demo', a)).toThrow(/caminho inválido/);
    expect(() => lerAnexo(P, { sha256: '../../gavix' })).toThrow(/caminho inválido/);
  });

  it('retirar só esconde; limite de anexos; outra prefeitura não acha o anexo', async () => {
    const db = dbDa(P);
    const a = (await db.anexoDocumento.findFirst({ where: { nome: 'copia.pdf' } }))!;
    await retirarAnexo(db, 'Controlador', a.id);
    const depois = (await db.anexoDocumento.findFirst({ where: { id: a.id } }))!;
    expect(depois.removidoEm).not.toBeNull();
    expect(fs.existsSync(path.join(DADOS, P, 'anexos', `${a.sha256}.pdf`))).toBe(true);
    await expect(retirarAnexo(dbDa(O), 'x', a.id)).rejects.toThrow(/não encontrado/);
    expect(await dbDa(O).anexoDocumento.count()).toBe(0);
    await expect(guardarAnexo(dbDa(O), O, 'x', docId, 'x.pdf', pdf('x'))).rejects.toThrow(/Documento não encontrado/);
    const ativos = await db.anexoDocumento.count({ where: { documentoId: docId, removidoEm: null } });
    for (let i = ativos; i < MAX_ANEXOS; i++) await guardarAnexo(db, P, 'Controlador', docId, `p${i}.pdf`, pdf(`p${i}`));
    await expect(guardarAnexo(db, P, 'Controlador', docId, 'demais.pdf', pdf('demais'))).rejects.toThrow(/No máximo/);
  });

  it('a ciência registra o hash dos PDFs; documento decidido não aceita anexo', async () => {
    const db = dbDa(P);
    await darParecer(db, 'Controlador', docId, 'pode_assinar', '');
    await decidir(db, 'Prefeito', docId, 'assinado', 'ok');
    const ev = (await db.eventoDocumento.findFirst({ where: { documentoId: docId, tipo: 'assinado' } }))!;
    expect(ev.texto).toMatch(/Anexos: .*SHA-256/);
    const ativos = await db.anexoDocumento.findMany({ where: { documentoId: docId, removidoEm: null } });
    for (const a of ativos) expect(ev.texto).toContain(a.sha256);
    const retirado = (await db.anexoDocumento.findFirst({ where: { nome: 'copia.pdf' } }))!;
    expect(ev.texto).not.toContain(`${retirado.nome} (SHA-256`);
    await expect(guardarAnexo(db, P, 'Controlador', docId, 'tarde.pdf', pdf('tarde'))).rejects.toThrow(/encerrado/);
  });

  it('assinar sem nenhum PDF exige justificativa, mesmo com semáforo verde', async () => {
    const db = dbDa(P);
    const d = await enviarDocumento(db, ctrl, { tipo: 'pagamento', assunto: 'Sem arquivo', valor: '10,00', dataAto: '2026-11-16', orgaoCod: '16' });
    await darParecer(db, 'Controlador', d.id, 'pode_assinar', '');
    await expect(decidir(db, 'Prefeito', d.id, 'assinado', '')).rejects.toThrow(/Não há PDF anexado/);
    await decidir(db, 'Prefeito', d.id, 'assinado', 'Original em papel conferido no gabinete');
    expect((await db.eventoDocumento.findFirst({ where: { documentoId: d.id, tipo: 'assinado' } }))!.texto).toMatch(/Sem anexo\./);
  });
});
