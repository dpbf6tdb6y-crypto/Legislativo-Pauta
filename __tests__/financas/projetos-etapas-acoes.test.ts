// Ações de dependências e responsabilidades, com um banco de mentira na memória (não precisa de Postgres).
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbPrefeitura } from '@/lib/financas/db';
import {
  adicionarEtapa, adicionarParceira, atorDe, atualizarEtapa, definirEtapaCooperacao, definirParticipacao, definirResponsavelProjeto,
  editarProjeto, mudarFase, registrarAtualizacao, removerParceira,
} from '@/lib/financas/projetos/acoes';
import { criarIndicador, registrarLeitura } from '@/lib/financas/projetos/indicadores';
import { atualizarRisco, criarRisco } from '@/lib/financas/projetos/riscos';
import { desvincular } from '@/lib/financas/projetos/vinculos';

type Linha = Record<string, any>;
let projeto: Linha, secretarias: Linha[], etapas: Linha[], eventos: Linha[], vinculos: Linha[];

const tabela = (linhas: () => Linha[], apagar?: (ids: number[]) => void) => ({
  findFirst: async ({ where }: Linha) => linhas().find((l) => l.id === where.id) ?? null,
  updateMany: async ({ where, data }: Linha) => { for (const l of linhas()) if (l.id === where.id) Object.assign(l, data); },
  deleteMany: async ({ where }: Linha) => apagar?.([where.id]),
});
const db = {
  projeto: {
    // devolve cópia, como o banco: mudar o retorno não muda o que está gravado
    findFirst: async () => ({ ...projeto, secretarias: secretarias.map((s) => ({ ...s })), etapas: etapas.map((e) => ({ ...e })) }),
    updateMany: async ({ data }: Linha) => { Object.assign(projeto, data); },
  },
  etapaProjeto: tabela(() => etapas),
  projetoSecretaria: tabela(() => secretarias, (ids) => { secretarias = secretarias.filter((s) => !ids.includes(s.id)); }),
  eventoProjeto: { create: async ({ data }: Linha) => { eventos.push(data); } },
  vinculoProjeto: tabela(() => vinculos, (ids) => { vinculos = vinculos.filter((v) => !ids.includes(v.id)); }),
} as unknown as DbPrefeitura;

const gestor = atorDe({ nome: 'Prefeito', perfil: 'prefeito', orgaoCod: '' });
const secretaria = atorDe({ nome: 'Ana', perfil: 'secretaria', orgaoCod: '15' });
const coordenadora = atorDe({ nome: 'Dora', perfil: 'secretaria', orgaoCod: '20' });
const ambiente = atorDe({ nome: 'Mário', perfil: 'secretaria', orgaoCod: '30' });
const deFora = atorDe({ nome: 'Fora', perfil: 'secretaria', orgaoCod: '77' });
const auditor = atorDe({ nome: 'Auditor', perfil: 'auditor', orgaoCod: '' });

beforeEach(() => {
  projeto = { id: 1, titulo: 'Habitação', fase: 'execucao', orcamento: 1_000_000_00n, atualizadoEm: new Date(2026, 0, 1) };
  const s = (id: number, orgaoCod: string, orgaoNome: string, papel: string) => ({ id, orgaoCod, orgaoNome, papel, responsavel: '', atuacao: '', atribuicao: '', aporte: null });
  secretarias = [s(1, '20', 'DESENVOLVIMENTO SOCIAL', 'lider'), s(2, '30', 'MEIO AMBIENTE', 'parceira'), s(3, '15', 'OBRAS', 'parceira')];
  const e = (id: number, titulo: string) => ({ id, projetoId: 1, ordem: id, titulo, marco: false, status: 'pendente', orgaoCod: '', dependeDe: [] as number[], inicioPrevisto: null, fimPrevisto: null, concluidaEm: null });
  etapas = [e(1, 'Licença'), e(2, 'Infraestrutura'), e(3, 'Entrega')];
  eventos = [];
  vinculos = [{ id: 1, tipo: 'acao', acao: 'Obra', contratoId: null, orgaoCod: '15' }];
});

const ligar = async () => {
  await definirEtapaCooperacao(db, gestor, 1, 1, { orgaoCod: '30' });
  await definirEtapaCooperacao(db, gestor, 1, 2, { orgaoCod: '15', dependeDe: ['1'] });
  await definirEtapaCooperacao(db, gestor, 1, 3, { orgaoCod: '20', dependeDe: ['2'] });
};

describe('responsável e dependências', () => {
  it('grava, registra no histórico e não repete registro quando nada muda', async () => {
    await ligar();
    expect(etapas.map((e) => [e.orgaoCod, e.dependeDe])).toEqual([['30', []], ['15', [1]], ['20', [2]]]);
    expect(eventos).toHaveLength(3);
    expect(eventos[1].texto).toContain('responsável: (não definida) → OBRAS');
    expect(eventos[1].texto).toContain('depende de: nenhuma → "Licença"');
    await definirEtapaCooperacao(db, gestor, 1, 2, { orgaoCod: '15', dependeDe: ['1', '1'] });
    expect(eventos).toHaveLength(3);
  });

  it('recusa ciclo, etapa de fora, etapa cancelada, secretaria de fora e papel de apoio', async () => {
    await ligar();
    await expect(definirEtapaCooperacao(db, gestor, 1, 1, { orgaoCod: '30', dependeDe: ['3'] })).rejects.toThrow(/ciclo/);
    await expect(definirEtapaCooperacao(db, gestor, 1, 1, { orgaoCod: '30', dependeDe: ['1'] })).rejects.toThrow(/ciclo/);
    await expect(definirEtapaCooperacao(db, gestor, 1, 1, { dependeDe: ['99'] })).rejects.toThrow(/deste projeto/);
    await expect(definirEtapaCooperacao(db, gestor, 1, 1, { orgaoCod: '77' })).rejects.toThrow(/precisa participar/);
    etapas[2].status = 'cancelada';
    await expect(definirEtapaCooperacao(db, gestor, 1, 1, { dependeDe: ['3'] })).rejects.toThrow(/cancelada/);
    secretarias[2].atuacao = 'apoio';
    await expect(definirEtapaCooperacao(db, gestor, 1, 1, { orgaoCod: '15' })).rejects.toThrow(/apoio/);
    expect(etapas[0]).toMatchObject({ orgaoCod: '30', dependeDe: [] });
  });

  it('quem só consulta não altera', async () => {
    await expect(definirEtapaCooperacao(db, auditor, 1, 1, { orgaoCod: '30' })).rejects.toThrow(/Sem permissão/);
    await expect(definirParticipacao(db, auditor, 1, '30', { atribuicao: 'x' })).rejects.toThrow(/Sem permissão/);
  });
});

describe('iniciar, concluir e reabrir respeitam a ordem', () => {
  it('não inicia nem conclui antes da anterior; não reabre com etapa posterior concluída', async () => {
    await ligar();
    await expect(atualizarEtapa(db, gestor, 2, 'iniciar')).rejects.toThrow(/depende de outra/);
    await expect(atualizarEtapa(db, gestor, 2, 'concluir')).rejects.toThrow(/1\. Licença/);
    await atualizarEtapa(db, gestor, 1, 'concluir');
    await atualizarEtapa(db, gestor, 2, 'concluir');
    await expect(atualizarEtapa(db, gestor, 1, 'reabrir', { motivo: 'revisão' })).rejects.toThrow(/Reabra antes/);
    await atualizarEtapa(db, gestor, 2, 'reabrir', { motivo: 'revisão' });
    await atualizarEtapa(db, gestor, 1, 'reabrir', { motivo: 'revisão' });
    expect(etapas.map((e) => e.status)).toEqual(['pendente', 'pendente', 'pendente']);
  });
});

describe('participação das secretarias', () => {
  it('grava papel, atribuição e aporte; a coordenadora não recebe papel nem aporte', async () => {
    await definirParticipacao(db, gestor, 1, '15', { atuacao: 'executora', atribuicao: 'Executar a infraestrutura', aporte: '250.000,00' });
    expect(secretarias[2]).toMatchObject({ atuacao: 'executora', atribuicao: 'Executar a infraestrutura', aporte: 25_000_000n });
    await definirParticipacao(db, gestor, 1, '20', { atuacao: 'apoio', atribuicao: 'Coordenar', aporte: '10,00' });
    expect(secretarias[0]).toMatchObject({ atuacao: '', atribuicao: 'Coordenar', aporte: null });
  });

  it('a soma dos aportes não passa do orçamento', async () => {
    await definirParticipacao(db, gestor, 1, '15', { aporte: '900.000,00' });
    await expect(definirParticipacao(db, gestor, 1, '30', { aporte: '200.000,00' })).rejects.toThrow(/passa do orçamento/);
  });

  it('aporte ausente no envio mantém o que está gravado', async () => {
    await definirParticipacao(db, gestor, 1, '15', { aporte: '100,00' });
    await definirParticipacao(db, gestor, 1, '15', { atribuicao: 'Fiscalizar' });
    expect(secretarias[2]).toMatchObject({ atribuicao: 'Fiscalizar', aporte: 10_000n });
  });

  it('com etapa em aberto, não vira apoio nem sai do projeto', async () => {
    await ligar();
    await expect(definirParticipacao(db, gestor, 1, '15', { atuacao: 'apoio' })).rejects.toThrow(/etapas em aberto/);
    await expect(removerParceira(db, gestor, 1, '15', 'saiu')).rejects.toThrow(/2\. Infraestrutura/);
    await definirEtapaCooperacao(db, gestor, 1, 2, { orgaoCod: '20', dependeDe: ['1'] });
    await removerParceira(db, gestor, 1, '15', 'saiu');
    expect(secretarias.map((s) => s.orgaoCod)).toEqual(['20', '30']);
  });
});

// "secretaria" (15, Obras) e "ambiente" (30) são parceiras; "coordenadora" (20) é a líder
describe('cada secretaria altera só a própria parte', () => {
  it('a parceira executa a própria etapa, e só ela', async () => {
    await ligar();
    await expect(atualizarEtapa(db, secretaria, 1, 'concluir')).rejects.toThrow(/secretaria responsável/);
    await expect(atualizarEtapa(db, secretaria, 3, 'iniciar')).rejects.toThrow(/secretaria responsável/);
    await atualizarEtapa(db, ambiente, 1, 'concluir');
    await atualizarEtapa(db, secretaria, 2, 'iniciar');
    expect(etapas.map((e) => e.status)).toEqual(['concluida', 'andamento', 'pendente']);
  });

  it('a coordenadora não conclui, reabre, cancela nem muda o prazo da etapa de outra', async () => {
    await ligar();
    for (const acao of ['iniciar', 'concluir', 'cancelar', 'datas'] as const)
      await expect(atualizarEtapa(db, coordenadora, 1, acao, { motivo: 'x', fimPrevisto: '2027-01-01' })).rejects.toThrow(/secretaria responsável/);
    await atualizarEtapa(db, ambiente, 1, 'concluir');
    await expect(atualizarEtapa(db, coordenadora, 1, 'reabrir', { motivo: 'x' })).rejects.toThrow(/secretaria responsável/);
  });

  it('só a gestão troca a responsável e as dependências', async () => {
    await ligar();
    const antes = JSON.stringify(etapas);
    await expect(definirEtapaCooperacao(db, coordenadora, 1, 1, { orgaoCod: '20' })).rejects.toThrow(/define responsáveis e dependências/);
    await expect(definirEtapaCooperacao(db, coordenadora, 1, 3, { orgaoCod: '20', dependeDe: [] })).rejects.toThrow(/Só o prefeito ou o controlador/);
    expect(JSON.stringify(etapas)).toBe(antes);
    await definirEtapaCooperacao(db, gestor, 1, 1, { orgaoCod: '20' });
    expect(etapas[0].orgaoCod).toBe('20');
  });

  it('etapa sem responsável fica com a coordenadora', async () => {
    await expect(atualizarEtapa(db, secretaria, 1, 'iniciar')).rejects.toThrow(/sem responsável/);
    await atualizarEtapa(db, coordenadora, 1, 'iniciar');
    expect(etapas[0].status).toBe('andamento');
  });

  it('nenhuma secretaria, nem a coordenadora, mexe no plano, nos dados, nas secretarias, nos riscos ou nas metas', async () => {
    for (const quem of [secretaria, coordenadora]) {
      const tentativas = [
        () => definirEtapaCooperacao(db, quem, 1, 1, { orgaoCod: '15' }),
        () => definirParticipacao(db, quem, 1, '15', { atuacao: 'apoio' }),
        () => definirParticipacao(db, quem, 1, '30', { atribuicao: 'x' }),
        () => adicionarEtapa(db, quem, 1, { titulo: 'x' }),
        () => adicionarParceira(db, quem, 1, '09'),
        () => removerParceira(db, quem, 1, '30', 'x'),
        () => editarProjeto(db, quem, 1, { titulo: 'x', tipo: 'obra' }),
        () => mudarFase(db, quem, 1, 'paralisado', 'x'),
        () => criarRisco(db, quem, 1, { titulo: 'x', probabilidade: 2, impacto: 2 }),
        () => atualizarRisco(db, quem, 1, 1, 'status', { status: 'encerrado', motivo: 'x' }),
        () => criarIndicador(db, quem, 1, { nome: 'x', linhaBase: 1, meta: 2 }),
        () => registrarLeitura(db, quem, 1, 1, { valor: 1 }),
      ];
      for (const t of tentativas) await expect(t()).rejects.toThrow(/Só o prefeito ou o controlador/);
    }
    expect(eventos).toHaveLength(0);
    expect(secretarias).toHaveLength(3);
  });

  it('cada uma informa o próprio contato; nem a coordenadora altera o das outras', async () => {
    await definirResponsavelProjeto(db, secretaria, 1, '15', 'Contato de Obras');
    await expect(definirResponsavelProjeto(db, secretaria, 1, '30', 'x')).rejects.toThrow(/próprio contato/);
    await expect(definirResponsavelProjeto(db, coordenadora, 1, '30', 'x')).rejects.toThrow(/próprio contato/);
    expect(secretarias.map((s) => s.responsavel)).toEqual(['', '', 'Contato de Obras']);
  });

  it('ligação de despesa só é desfeita por quem é dona dela (ou pela gestão)', async () => {
    await expect(desvincular(db, ambiente, 1, 1, 'x')).rejects.toThrow(/fez parte desta ligação/);
    await expect(desvincular(db, coordenadora, 1, 1, 'x')).rejects.toThrow(/fez parte desta ligação/);
    await desvincular(db, secretaria, 1, 1, 'engano');
    expect(vinculos).toHaveLength(0);
  });

  it('registrar andamento continua aberto às participantes; perfil secretaria de fora não executa nada', async () => {
    await registrarAtualizacao(db, secretaria, 1, 'Canteiro montado');
    expect(eventos).toHaveLength(1);
    // (no sistema real ela nem enxerga o projeto; aqui o banco de mentira o devolve, e as regras ainda barram)
    await expect(atualizarEtapa(db, deFora, 1, 'iniciar')).rejects.toThrow(/sem responsável/);
    await expect(definirResponsavelProjeto(db, deFora, 1, '15', 'x')).rejects.toThrow(/próprio contato/);
  });
});
