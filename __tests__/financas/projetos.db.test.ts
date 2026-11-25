// Carteira de projetos: regras de fase, semáforo, avanço, cronograma e o fluxo com várias secretarias.
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { PERFIS, pode } from '@/lib/financas/perfis';
import { atorDe, adicionarEtapa, adicionarParceira, atualizarEtapa, criarProjeto, editarProjeto, mudarFase, projetoVisivel, registrarAtualizacao, removerParceira } from '@/lib/financas/projetos/acoes';
import { carteira, fichaProjeto, indicadores, porSecretaria } from '@/lib/financas/projetos/dados';
import { avaliarProjeto, avancoPct, impedimentoDeFase, transicoesPermitidas, type EtapaBase } from '@/lib/financas/projetos/regras';
import { montarEscala, posicaoBarra, posicaoMarco } from '@/lib/financas/projetos/gantt';

const d = (s: string) => { const [a, m, dia] = s.split('-').map(Number); return new Date(a, m - 1, dia, 12); };
const HOJE = d('2026-11-24');
const et = (o: Partial<EtapaBase> = {}): EtapaBase => ({ titulo: 'Licitação', peso: 1, status: 'pendente', inicioPrevisto: null, fimPrevisto: null, ...o });

// ---------------------------------------------------------------- com banco
const P = 'proj-teste', O = 'proj-outra';
const gestor = atorDe({ nome: 'Prefeito', perfil: 'prefeito', orgaoCod: '' });
const sec09 = atorDe({ nome: 'Ana (Educação)', perfil: 'secretaria', orgaoCod: '09' });
const sec12 = atorDe({ nome: 'Beto (Saúde)', perfil: 'secretaria', orgaoCod: '12' });
const sec15 = atorDe({ nome: 'Carla (Obras)', perfil: 'secretaria', orgaoCod: '15' });
const auditor = atorDe({ nome: 'Auditor', perfil: 'auditor', orgaoCod: '' });

beforeAll(async () => {
  for (const id of [P, O]) await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 7, conector: 'arquivo' }, update: {} });
  const linha = (pref: string, orgaoCod: string, orgaoNome: string) =>
    ({ prefeituraId: pref, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: 100n, dotAtual: 100n, empenhado: 10n, liquidado: 10n, pago: 0n, coletaId: 0 });
  await dbDa(P).despesaOrgaoMes.createMany({ data: [
    linha(P, '09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO'), linha(P, '12', 'SECRETARIA MUNICIPAL DE SAÚDE'),
    linha(P, '15', 'SECRETARIA MUNICIPAL DE OBRAS'), linha(P, '01', 'CÂMARA MUNICIPAL'),
  ] });
  await dbDa(O).despesaOrgaoMes.createMany({ data: [linha(O, '09', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO')] });
});

describe('perfis', () => {
  it('o prefeito e o controlador aprovam; a secretaria só atualiza o que é dela; auditor e financeiro só leem', () => {
    for (const perfil of ['prefeito', 'controlador']) for (const p of ['projetos', 'projetos_gerir', 'projetos_aprovar'] as const) expect(pode(perfil, p)).toBe(true);
    for (const perfil of ['financeiro', 'juridico', 'auditor']) { expect(pode(perfil, 'projetos')).toBe(true); expect(pode(perfil, 'projetos_gerir')).toBe(false); expect(pode(perfil, 'projetos_aprovar')).toBe(false); }
    expect(pode('secretaria', 'projetos')).toBe(false);
    expect(pode('secretaria', 'projetos_secretaria')).toBe(true);
    expect(pode('secretaria', 'projetos_aprovar')).toBe(false);
    expect(Object.entries(PERFIS).filter(([, v]) => v.pode.includes('projetos_secretaria')).map(([k]) => k)).toEqual(['secretaria']);
    for (const perfil of ['rh', 'administrador', 'suporte']) expect(pode(perfil, 'projetos')).toBe(false);
  });
});

describe('cadastro com várias secretarias', () => {
  let id = 0;
  const dados = { titulo: 'Escola integrada do bairro Vila Nova', tipo: 'obra', prioridade: 'alta', bairro: 'Vila Nova', eixo: 'Educação' };

  it('a secretaria cadastra só para si, como ideia, e pode chamar outras em conjunto', async () => {
    const db = dbDa(P);
    // tenta cadastrar para outra secretaria: vale a dela
    const p = await criarProjeto(db, sec09, { ...dados, secretariaLider: '12', responsavel: 'Ana', parceiras: ['12', '15', '12', '09'] });
    id = p.id;
    expect(p.fase).toBe('ideia');
    const f = (await fichaProjeto(db, gestor, id, HOJE))!;
    expect(f.secretarias.map((s) => `${s.orgaoCod}:${s.papel}`)).toEqual(['09:lider', '12:parceira', '15:parceira']);
    expect(f.secretarias[0].responsavel).toBe('Ana');
    expect(f.eventos[0]).toMatchObject({ tipo: 'criado', por: 'Ana (Educação)' });
    await expect(criarProjeto(db, sec09, { ...dados, tipo: 'invalido' })).rejects.toThrow(/tipo/);
    await expect(criarProjeto(db, sec09, { ...dados, titulo: '  ' })).rejects.toThrow(/nome do projeto/);
    await expect(criarProjeto(db, sec09, { ...dados, fimPrevisto: '2026-01-01', inicioPrevisto: '2026-06-01' })).rejects.toThrow(/antes do início/);
    await expect(criarProjeto(db, sec09, { ...dados, orcamento: 'abc' })).rejects.toThrow(/Orçamento inválido/);
    await expect(criarProjeto(db, sec09, { ...dados, parceiras: ['77'] })).rejects.toThrow(/parceira não encontrada/);
    await expect(criarProjeto(db, gestor, { ...dados })).rejects.toThrow(/secretaria líder/);
    await expect(criarProjeto(db, gestor, { ...dados, secretariaLider: '01' })).rejects.toThrow(/secretaria líder/); // a Câmara não é do Executivo
    await expect(criarProjeto(db, auditor, { ...dados })).rejects.toThrow(/Sem permissão/);
  });

  it('cada secretaria vê só os projetos em que participa; o prefeito, auditor e financeiro veem tudo', async () => {
    const db = dbDa(P);
    const outro = await criarProjeto(db, sec15, { ...dados, titulo: 'Recapeamento do centro', tipo: 'obra' });
    expect((await carteira(db, sec09, HOJE)).map((p) => p.titulo)).toEqual([dados.titulo]);
    expect((await carteira(db, sec12, HOJE)).map((p) => p.titulo)).toEqual([dados.titulo]); // parceira também enxerga
    expect((await carteira(db, sec15, HOJE)).map((p) => p.titulo).sort()).toEqual([dados.titulo, 'Recapeamento do centro'].sort());
    expect((await carteira(db, gestor, HOJE))).toHaveLength(2);
    expect((await carteira(db, auditor, HOJE))).toHaveLength(2);
    expect(await fichaProjeto(db, sec12, outro.id, HOJE)).toBeNull();
    await expect(projetoVisivel(db, sec12, outro.id)).rejects.toThrow(/não encontrado/);
    await expect(registrarAtualizacao(db, sec12, outro.id, 'invasão')).rejects.toThrow(/não encontrado/);
    // usuário de secretaria sem secretaria no cadastro não vê nada
    expect(await carteira(db, atorDe({ nome: 'X', perfil: 'secretaria', orgaoCod: '' }), HOJE)).toEqual([]);
  });

  it('outra prefeitura não enxerga nada', async () => {
    expect(await carteira(dbDa(O), gestor, HOJE)).toEqual([]);
    await expect(projetoVisivel(dbDa(O), gestor, id)).rejects.toThrow(/não encontrado/);
  });

  it('a secretaria não aprova; o prefeito só aprova com orçamento e datas', async () => {
    const db = dbDa(P);
    await mudarFase(db, sec09, id, 'estudo');
    await expect(mudarFase(db, sec09, id, 'aprovado')).rejects.toThrow(/Só o prefeito ou o controlador/);
    await expect(mudarFase(db, gestor, id, 'aprovado')).rejects.toThrow(/orçamento/);
    await editarProjeto(db, sec09, id, { ...dados, orcamento: '4.500.000,00', fonteRecurso: 'convenio_estadual', inicioPrevisto: '2026-12-01', fimPrevisto: '2027-12-01' });
    await mudarFase(db, gestor, id, 'aprovado');
    const f = (await fichaProjeto(db, gestor, id, HOJE))!;
    expect(f).toMatchObject({ fase: 'aprovado', aprovadoPor: 'Prefeito', orcamento: 450000000n });
    expect(f.fimPrevistoOriginal).toEqual(f.fimPrevisto);
    expect(f.eventos.map((e) => e.tipo)).toEqual(['fase', 'prazo', 'fase', 'criado']); // a edição definiu as datas, então entra como "prazo"
  });

  it('depois de aprovado: orçamento só do aprovador; mudar data exige motivo e fica no histórico', async () => {
    const db = dbDa(P);
    const base = { ...dados, orcamento: '4.500.000,00', fonteRecurso: 'convenio_estadual', inicioPrevisto: '2026-12-01', fimPrevisto: '2027-12-01' };
    await expect(editarProjeto(db, sec09, id, { ...base, orcamento: '5.000.000,00' })).rejects.toThrow(/só o prefeito ou o controlador altera o orçamento/);
    await expect(editarProjeto(db, sec09, id, { ...base, fimPrevisto: '2028-03-01' })).rejects.toThrow(/motivo da mudança de data/);
    await expect(editarProjeto(db, sec09, id, { ...base, orcamento: '' })).rejects.toThrow(/orçamento/);
    await editarProjeto(db, sec09, id, { ...base, fimPrevisto: '2028-03-01' }, 'Chuvas atrasaram a fundação');
    const f = (await fichaProjeto(db, gestor, id, HOJE))!;
    expect(f.fimPrevisto).toEqual(d('2028-03-01'));
    expect(f.fimPrevistoOriginal).toEqual(d('2027-12-01')); // o original não muda
    expect(f.eventos[0]).toMatchObject({ tipo: 'prazo', por: 'Ana (Educação)' });
    expect(f.eventos[0].texto).toMatch(/01\/12\/2027 → 01\/03\/2028.*Chuvas/);
  });

  it('etapas: marco sem início, prazo obrigatório depois de aprovado, concluir, reabrir e cancelar com motivo', async () => {
    const db = dbDa(P);
    await expect(adicionarEtapa(db, sec09, id, { titulo: 'Licitação' })).rejects.toThrow(/prazo da etapa/);
    await expect(adicionarEtapa(db, sec09, id, { titulo: 'X', peso: 0, fimPrevisto: '2027-01-10' })).rejects.toThrow(/peso/);
    const e1 = await adicionarEtapa(db, sec09, id, { titulo: 'Licitação', peso: 2, inicioPrevisto: '2026-12-01', fimPrevisto: '2027-03-01' });
    const e2 = await adicionarEtapa(db, sec12, id, { titulo: 'Equipar a sala de vacina', peso: 1, fimPrevisto: '2027-10-01' }); // parceira também mexe
    const marco = await adicionarEtapa(db, gestor, id, { titulo: 'Inauguração', marco: true, inicioPrevisto: '2026-01-01', fimPrevisto: '2027-12-20' });
    expect(marco).toMatchObject({ marco: true, inicioPrevisto: null, ordem: 3 });

    await atualizarEtapa(db, sec09, e1.id, 'iniciar');
    await expect(atualizarEtapa(db, sec09, e1.id, 'iniciar')).rejects.toThrow(/a fazer/);
    await atualizarEtapa(db, sec09, e1.id, 'concluir');
    expect((await fichaProjeto(db, gestor, id, HOJE))!.avanco).toBe(50); // pesos 2 + 1 + 1 = 4; concluído 2
    await expect(atualizarEtapa(db, sec09, e1.id, 'reabrir')).rejects.toThrow(/Diga por que/);
    await atualizarEtapa(db, sec09, e1.id, 'reabrir', { motivo: 'Edital impugnado' });
    await expect(atualizarEtapa(db, sec09, e2.id, 'cancelar')).rejects.toThrow(/Diga por que/);
    await expect(atualizarEtapa(db, sec09, e2.id, 'datas', { fimPrevisto: '2027-11-01' })).rejects.toThrow(/motivo/);
    await atualizarEtapa(db, sec09, e2.id, 'datas', { fimPrevisto: '2027-11-01', motivo: 'Entrega do fornecedor' });
    const f = (await fichaProjeto(db, gestor, id, HOJE))!;
    expect(f.etapas.find((e) => e.id === e2.id)!.fimPrevisto).toEqual(d('2027-11-01'));
    expect(f.eventos.some((e) => e.tipo === 'prazo' && /Equipar.*01\/10\/2027 → 01\/11\/2027.*Entrega/.test(e.texto))).toBe(true);
    // etapa de outro projeto não é alcançada por quem não o enxerga
    const alheio = await criarProjeto(db, sec15, { ...dados, titulo: 'Praça nova' });
    const eAlheia = await adicionarEtapa(db, sec15, alheio.id, { titulo: 'Projeto executivo' });
    await expect(atualizarEtapa(db, sec12, eAlheia.id, 'concluir')).rejects.toThrow(/não encontrado/);
  });

  it('execução: início real, pausa com motivo, e só encerra com as etapas fechadas', async () => {
    const db = dbDa(P);
    await mudarFase(db, sec09, id, 'execucao');
    expect((await fichaProjeto(db, gestor, id, HOJE))!.inicioReal).not.toBeNull();
    await expect(mudarFase(db, sec09, id, 'paralisado')).rejects.toThrow(/por que o projeto foi paralisado/);
    await mudarFase(db, sec09, id, 'paralisado', 'Aguardando liberação do convênio');
    expect(await fichaProjeto(db, sec09, id, HOJE)).toMatchObject({ fase: 'paralisado', saude: 'paralisado', motivoFase: 'Aguardando liberação do convênio' });
    await mudarFase(db, sec09, id, 'execucao');
    await expect(mudarFase(db, sec09, id, 'concluido')).rejects.toThrow(/Só o prefeito ou o controlador/);
    await expect(mudarFase(db, gestor, id, 'concluido')).rejects.toThrow(/etapa\(s\) em aberto/);
    const f0 = (await fichaProjeto(db, gestor, id, HOJE))!;
    for (const e of f0.etapas) await atualizarEtapa(db, gestor, e.id, 'concluir');
    await mudarFase(db, gestor, id, 'concluido');
    const f = (await fichaProjeto(db, gestor, id, HOJE))!;
    expect(f).toMatchObject({ fase: 'concluido', avanco: 100, saude: 'concluido' });
    expect(f.fimReal).not.toBeNull();
    await expect(editarProjeto(db, gestor, id, { ...dados })).rejects.toThrow(/encerrado/);
    await expect(adicionarEtapa(db, gestor, id, { titulo: 'Nova', fimPrevisto: '2028-01-01' })).rejects.toThrow(/encerrado/);
    await expect(mudarFase(db, gestor, id, 'execucao')).rejects.toThrow(/Não é possível/);
  });

  it('o histórico guarda quem fez o quê e a atualização reinicia o relógio do "sem atualização"', async () => {
    const db = dbDa(P);
    const p = await criarProjeto(db, gestor, { ...dados, titulo: 'Horta comunitária', secretariaLider: '12', orcamento: '80.000,00', inicioPrevisto: '2026-01-10', fimPrevisto: '2026-12-31' });
    await mudarFase(db, gestor, p.id, 'aprovado');
    await mudarFase(db, gestor, p.id, 'execucao');
    await db.projeto.updateMany({ where: { id: p.id }, data: { atualizadoEm: d('2026-08-01') } });
    expect((await fichaProjeto(db, gestor, p.id, HOJE))!.motivos.join()).toMatch(/Sem atualização/);
    await expect(registrarAtualizacao(db, sec12, p.id, ' ')).rejects.toThrow(/Escreva/);
    await registrarAtualizacao(db, sec12, p.id, 'Canteiros prontos; mudas chegam semana que vem.');
    const f = (await fichaProjeto(db, gestor, p.id, new Date()))!;
    expect(f.eventos[0]).toMatchObject({ tipo: 'atualizacao', por: 'Beto (Saúde)' });
    expect(f.motivos.join()).not.toMatch(/Sem atualização/);
  });

  it('parceiras entram e saem com registro; a líder fica', async () => {
    const db = dbDa(P);
    const p = await criarProjeto(db, sec09, { ...dados, titulo: 'Merenda regional' });
    await expect(adicionarParceira(db, sec09, p.id, '09')).rejects.toThrow(/já participa/);
    await expect(adicionarParceira(db, sec09, p.id, '77')).rejects.toThrow(/não encontrada/);
    await adicionarParceira(db, sec09, p.id, '12', 'Beto');
    expect((await carteira(db, sec12, HOJE)).some((x) => x.id === p.id)).toBe(true);
    await expect(removerParceira(db, sec09, p.id, '09', 'x')).rejects.toThrow(/líder/);
    await expect(removerParceira(db, sec12, p.id, '12', 'x')).rejects.toThrow(/não pode se retirar sozinha/);
    await expect(removerParceira(db, gestor, p.id, '12', '')).rejects.toThrow(/Diga por que/);
    await removerParceira(db, gestor, p.id, '12', 'Escopo mudou');
    expect((await carteira(db, sec12, HOJE)).some((x) => x.id === p.id)).toBe(false);
    expect((await fichaProjeto(db, gestor, p.id, HOJE))!.eventos.map((e) => e.tipo)).toEqual(['parceria', 'parceria', 'criado']);
  });

  it('indicadores e quadro por secretaria', async () => {
    const db = dbDa(P);
    const todos = await carteira(db, gestor, HOJE);
    const ind = indicadores(todos, HOJE);
    expect(ind.aguardandoAprovacao).toBeGreaterThan(0);
    expect(ind.orcamentoAtivo).toBeGreaterThanOrEqual(8000000n);
    const quadro = porSecretaria(todos);
    expect(quadro.find((q) => q.orgaoCod === '12')!.lidera).toBeGreaterThanOrEqual(1);
    expect(quadro.every((q) => q.orgaoCod !== '01')).toBe(true);
    // o concluído não conta como trabalho aberto
    expect(quadro.find((q) => q.orgaoCod === '09')!.lidera).toBe(1); // só a "Merenda regional"
  });
});

