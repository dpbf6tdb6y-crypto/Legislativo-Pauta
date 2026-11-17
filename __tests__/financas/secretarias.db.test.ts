// Perfil Secretaria da Gestão: cada uma vê e responde só os próprios pontos; o perfil vem do cadastro do SEGOV.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { PERFIS, pode } from '@/lib/financas/perfis';
import { normalizaPerfilGestao } from '@/lib/financas/perfis';
import { perfilGestao, usuarioDaSessao } from '@/lib/financas/auth';
import { prisma } from '@/lib/prisma';
import { criarPonto, mudarStatus, responderComoSecretaria } from '@/lib/financas/auditoria/acoes';

const P = 'sec-teste', O = 'sec-outra';

beforeAll(async () => {
  for (const id of [P, O])
    await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 5, conector: 'arquivo' }, update: {} });
  const linha = (pref: string, orgaoCod: string, orgaoNome: string) =>
    ({ prefeituraId: pref, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: 100n, dotAtual: 100n, empenhado: 10n, liquidado: 10n, pago: 0n, coletaId: 0 });
  await dbDa(P).despesaOrgaoMes.createMany({ data: [linha(P, '09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO'), linha(P, '12', 'SECRETARIA MUNICIPAL DE SAÚDE')] });
  await dbDa(O).despesaOrgaoMes.createMany({ data: [linha(O, '09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO')] });
});

describe('perfil secretaria', () => {
  it('só responde; não vê auditoria geral, orçamento, folha nem apontamentos', () => {
    expect(pode('secretaria', 'secretaria_responder')).toBe(true);
    for (const p of ['auditoria', 'auditoria_gerir', 'orcamento', 'folha', 'apontamentos', 'contratos', 'usuarios'] as const) expect(pode('secretaria', p)).toBe(false);
    expect(Object.entries(PERFIS).filter(([, v]) => v.pode.includes('secretaria_responder')).map(([k]) => k)).toEqual(['secretaria']);
  });
});

describe('perfil na Gestão no cadastro do SEGOV', () => {
  it('valida o perfil escolhido; secretaria exige o código do órgão', () => {
    expect(normalizaPerfilGestao('controlador', '09')).toEqual({ gestaoPerfil: 'controlador', gestaoOrgaoCod: '' });
    expect(normalizaPerfilGestao('qualquer', '')).toEqual({ gestaoPerfil: null, gestaoOrgaoCod: '' });
    expect(normalizaPerfilGestao(null, '')).toEqual({ gestaoPerfil: null, gestaoOrgaoCod: '' });
    expect(normalizaPerfilGestao('secretaria', '09')).toEqual({ gestaoPerfil: 'secretaria', gestaoOrgaoCod: '09' });
    expect(normalizaPerfilGestao('secretaria', '')).toHaveProperty('erro');
    expect(normalizaPerfilGestao('secretaria', '../x')).toHaveProperty('erro');
  });

  it('Master/Admin sem perfil entram só como administrador; operador sem perfil não entra', () => {
    expect(perfilGestao({ perfil: 'master', gestaoPerfil: null })).toBe('administrador');
    expect(perfilGestao({ perfil: 'admin', gestaoPerfil: null })).toBe('administrador');
    expect(perfilGestao({ perfil: 'operador', gestaoPerfil: null })).toBeNull();
    expect(perfilGestao({ perfil: 'operador', gestaoPerfil: 'prefeito' })).toBe('prefeito');
    expect(perfilGestao({ perfil: 'master', gestaoPerfil: 'controlador' })).toBe('controlador');
    expect(pode('administrador', 'folha')).toBe(false); // o administrador não vê a folha individual
  });

  it('o cadastro vale mais que a sessão: desativado, sem o menu Gestão ou com perfil trocado perde o acesso', async () => {
    const u = await prisma.user.create({
      data: { nome: 'Secretária de Educação', email: `educacao-${Date.now()}@teste.gov`, senha: '-', perfil: 'operador', acessos: JSON.stringify({ gestao: { ver: true } }), gestaoPerfil: 'secretaria', gestaoOrgaoCod: '09' },
    });
    const sessao = { usuarioId: u.id, prefeituraId: P, perfil: 'secretaria', nome: u.nome };
    expect((await usuarioDaSessao(sessao))?.orgaoCod).toBe('09');
    expect(await usuarioDaSessao({ ...sessao, perfil: 'prefeito' })).toBeNull();
    await prisma.user.update({ where: { id: u.id }, data: { acessos: JSON.stringify({ gestao: { ver: false } }) } });
    expect(await usuarioDaSessao(sessao)).toBeNull();
    await prisma.user.update({ where: { id: u.id }, data: { acessos: JSON.stringify({ gestao: { ver: true } }), ativo: false } });
    expect(await usuarioDaSessao(sessao)).toBeNull();
    await prisma.user.update({ where: { id: u.id }, data: { ativo: true, gestaoPerfil: null } });
    expect(await usuarioDaSessao(sessao)).toBeNull();
  });
});

describe('resposta pela própria secretaria', () => {
  it('responde o ponto da sua secretaria; não alcança outra secretaria, ponto encerrado nem outra prefeitura', async () => {
    const db = dbDa(P);
    const edu = await criarPonto(db, 'Controlador', { orgaoCod: '09', titulo: 'Plano de aplicação do saldo' });
    const sau = await criarPonto(db, 'Controlador', { orgaoCod: '12', titulo: 'Contrato vencendo' });
    const u = { nome: 'Secretária de Educação', orgaoCod: '09' };

    await responderComoSecretaria(db, u, edu.id, 'Plano enviado à Fazenda em 10/11.');
    const p = (await db.pontoAuditoria.findFirst({ where: { id: edu.id } }))!;
    expect(p.status).toBe('respondido');
    const ev = await db.eventoAuditoria.findFirst({ where: { pontoId: edu.id, tipo: 'resposta' } });
    expect(ev).toMatchObject({ por: 'Secretária de Educação', emNomeDe: 'Secretária de Educação · pelo sistema' });

    await expect(responderComoSecretaria(db, u, sau.id, 'tentativa')).rejects.toThrow(/não encontrado/);
    await expect(responderComoSecretaria(db, { nome: 'X', orgaoCod: '' }, edu.id, 'x')).rejects.toThrow(/sem secretaria/);
    await expect(responderComoSecretaria(db, u, edu.id, '   ')).rejects.toThrow(/Escreva a resposta/);
    await expect(responderComoSecretaria(dbDa(O), u, edu.id, 'outra prefeitura')).rejects.toThrow(/não encontrado/);

    await mudarStatus(db, 'Controlador', edu.id, 'resolvido', 'Plano conferido');
    await expect(responderComoSecretaria(db, u, edu.id, 'depois de encerrado')).rejects.toThrow(/encerrado/);
    expect(await db.eventoAuditoria.count({ where: { pontoId: sau.id, tipo: 'resposta' } })).toBe(0);
  });
});
