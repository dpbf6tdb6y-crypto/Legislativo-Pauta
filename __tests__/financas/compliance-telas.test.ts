// Telas do Compliance: regras legais iguais às do painel anterior, contas do painel e menu por perfil.
import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { lerDespesaNaturezaXml, lerReceitaXml } from '@/lib/financas/conectores/abaco/leitores';
import { classificaNatureza, classificaReceita, percentual29A, tipoDaConta } from '@/lib/financas/painel/vinculacao';
import { agruparNaturezas, partesObrigatorias, receitasVinculantes, resumirFolha } from '@/lib/financas/painel/compliance';
import { GRUPOS, gruposDoPerfil, telaInicial } from '@/lib/financas/menu';
import { removerFolhaDoPainel } from '@/lib/financas/painelAnterior';

const G = (n: string) => fs.readFileSync(`__tests__/financas/fixtures/abaco/${n}`, 'utf-8');
const gabarito = JSON.parse(G('vinculacao_gabarito.json')) as {
  receita: { cod: string; tipo: string; pct: number | null; lei: string; area: string }[];
  natureza: { nome: string; tipo: string | null; grupo: string; lei: string }[];
};

describe('regras iguais às do painel anterior (gabarito gerado por ele)', () => {
  const contas = lerReceitaXml(G('receitas_2026-10.xml'), 2026, 10);
  const nomes = new Map(contas.map((c) => [c.contaCod, c.nome]));
  it.each(gabarito.receita.map((r) => [r.cod, r] as const))('receita %s', (cod, r) => {
    const tipo = tipoDaConta(cod, nomes);
    expect(tipo).toBe(r.tipo);
    expect(classificaReceita(cod, tipo, nomes.get(cod)!)).toEqual({ pct: r.pct, lei: r.lei, area: r.area });
  });
  it.each(gabarito.natureza.map((n) => [n.nome, n] as const))('natureza %s', (nome, n) => {
    expect(classificaNatureza(nome)).toEqual({ tipo: n.tipo, grupo: n.grupo, lei: n.lei });
  });
  it('percentual do art. 29-A pela população', () => {
    expect([percentual29A(100_000), percentual29A(120_959), percentual29A(400_000), percentual29A(9_000_000)]).toEqual([7, 6, 5, 3.5]);
  });
});

describe('contas do painel', () => {
  it('vinculante + livre + sem regra = receita bruta (corrente + capital)', () => {
    const contas = lerReceitaXml(G('receitas_2026-10.xml'), 2026, 10);
    const v = receitasVinculantes(contas);
    const bruta = contas.filter((c) => ['1000000000', '2000000000'].includes(c.contaCod)).reduce((s, c) => s + c.arrecAteMes, 0n);
    expect(v.bruta).toBe(bruta);
    expect(v.vinculante + v.livre + v.semRegra).toBe(bruta);
    expect(v.areas.reduce((s, a) => s + a.recebido, 0n)).toBe(v.vinculante);
  });
  it('natureza: soma os meses, usa a dotação do ano inteiro e as partes fecham com o total', () => {
    const mes8 = lerDespesaNaturezaXml(G('despesa_natureza_2026-08.xml'), 2026, 8);
    const linhas = [...mes8, ...mes8.map((l) => ({ ...l, mes: 7 })), ...mes8.map((l) => ({ ...l, mes: 0, dotAtual: 123n }))];
    const a = agruparNaturezas(linhas);
    expect(a).toHaveLength(53);
    expect(a.reduce((s, l) => s + l.liquidado, 0n)).toBe(15013871864n * 2n);
    expect(a.every((l) => l.dotAtual === 123n)).toBe(true);
    expect(partesObrigatorias(a).reduce((s, p) => s + p.valor, 0n)).toBe(a.reduce((s, l) => s + l.empenhado, 0n));
  });
  it('folha: servidor é matrícula, e a média considera só quem tem vencimento', () => {
    const l = (matricula: string, tipoVinculo: string, vencimentos: bigint, bruto: bigint) => ({ matricula, lotacao: 'SAÚDE', tipoVinculo, vencimentos, bruto, liquido: bruto });
    const r = resumirFolha([l('1', 'EFETIVO', 1000n, 1500n), l('1', 'EFETIVO', 0n, 200n), l('2', 'TEMPORÁRIO', 3000n, 3000n), l('3', 'EFETIVO', 0n, 50n)]);
    expect([r.servidores, r.comVencimento, r.vencimentos, r.bruto, r.mediaVencimento]).toEqual([3, 2, 4000n, 4750n, 2000n]);
    expect(r.porVinculo).toEqual([{ nome: 'EFETIVO', servidores: 2 }, { nome: 'TEMPORÁRIO', servidores: 1 }]);
  });
  it('folha por secretaria: soma os setores da mesma secretaria e mostra todas', () => {
    const l = (matricula: string, lotacao: string, v: bigint) => ({ matricula, lotacao, tipoVinculo: 'EFETIVO', vencimentos: v, bruto: v, liquido: v });
    const r = resumirFolha([l('1', 'SAÚDE - GERÊNCIA I', 100n), l('2', 'SAÚDE - UPA', 50n), l('3', 'EDUCACAO - E. M. A', 80n), ...Array.from({ length: 12 }, (_, i) => l(`x${i}`, `SEC ${i} - SETOR`, 1n))]);
    expect(r.porLotacao.slice(0, 2)).toEqual([{ nome: 'SAÚDE', valor: 150n }, { nome: 'EDUCACAO', valor: 80n }]);
    expect(r.porLotacao).toHaveLength(14);
  });
});

describe('menu do Compliance', () => {
  const rotulos = (p: string) => gruposDoPerfil(p).map((g) => g.rotulo);
  it('seis áreas e a Administração', () => {
    expect(GRUPOS.map((g) => g.rotulo)).toEqual(['Painel', 'Finanças', 'Contratos', 'Pessoal', 'Documentos', 'Auditoria', 'Administração']);
    expect(GRUPOS.find((g) => g.rotulo === 'Auditoria')!.itens.slice(0, 3).map((i) => i.rotulo)).toEqual(['Auditoria interna', 'Auditoria por secretaria', 'Relatório de auditoria']);
  });
  it('cada perfil vê só o que pode abrir', () => {
    expect(rotulos('prefeito')).toEqual(['Painel', 'Finanças', 'Contratos', 'Pessoal', 'Documentos', 'Auditoria', 'Administração']);
    expect(rotulos('financeiro')).not.toContain('Pessoal');
    expect(rotulos('secretaria')).toEqual(['Documentos', 'Auditoria']);
    expect(gruposDoPerfil('secretaria').find((g) => g.rotulo === 'Auditoria')!.itens.map((i) => i.rotulo)).toEqual(['Minha secretaria']);
    expect(rotulos('rh')).not.toContain('Finanças');
  });
  it('tela inicial', () => {
    expect(telaInicial('prefeito')).toBe('/dashboard/fazenda/resumo');
    expect(telaInicial('secretaria')).toBe('/dashboard/fazenda/documentos');
  });
});

describe('painel anterior sem a lista de servidores', () => {
  it('sem dados: devolve igual', () => expect(removerFolhaDoPainel('<h1>x</h1>')).toBe('<h1>x</h1>'));
  it('marcador quebrado com folha: não entrega', () => expect(removerFolhaDoPainel('x "rh":[["a"]]')).toBeNull());
});
