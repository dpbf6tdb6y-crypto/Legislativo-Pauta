// Pessoal: um servidor por linha, filtros e ordem das colunas.
import { describe, expect, it } from 'vitest';
import { agruparServidores, filtrarServidores, lerReais, ordenarServidores, secretariaDaLotacao } from '@/lib/financas/painel/folhaServidores';

const l = (matricula: string, nome: string, lotacao: string, tipoVinculo: string, bruto: bigint) => ({ matricula, nome, lotacao, tipoVinculo, bruto });
const LINHAS = [
  l('1', 'JOÃO DA SILVA', 'SECRETARIA MUNICIPAL DE SAÚDE - GERÊNCIA I', 'EFETIVO', 500000n),
  l('2', 'MARIA SOUZA', 'SECRETARIA MUNICIPAL DE EDUCACAO - DIVISAO DE TRANSPORTE', 'COMISSIONADO', 900000n),
  l('1', 'JOÃO DA SILVA', 'SECRETARIA MUNICIPAL DE SAÚDE - GERÊNCIA II', 'EFETIVO', 100000n), // 2ª linha da mesma matrícula
  l('3', 'ÁLVARO LIMA', 'GABINETE DO PREFEITO', 'ELETIVO', 1500000n),
  l('4', 'ANA PAULA', '', 'EFETIVO', 300000n),
];

describe('servidores da folha', () => {
  it('secretaria = parte antes do " - "; sem lotação vira texto claro', () => {
    expect(secretariaDaLotacao('SECRETARIA MUNICIPAL DE SAÚDE - GERÊNCIA I - CENTRO')).toBe('SECRETARIA MUNICIPAL DE SAÚDE');
    expect(secretariaDaLotacao('GABINETE DO PREFEITO')).toBe('GABINETE DO PREFEITO');
    expect(secretariaDaLotacao('')).toBe('Sem lotação');
  });

  it('agrupa por matrícula somando o bruto; lotação e vínculo vêm da linha de maior bruto', () => {
    const s = agruparServidores(LINHAS);
    expect(s).toHaveLength(4);
    const joao = s.find((x) => x.matricula === '1')!;
    expect(joao.bruto).toBe(600000n);
    expect(joao.linhas).toBe(2);
    expect(joao.lotacao).toBe('SECRETARIA MUNICIPAL DE SAÚDE - GERÊNCIA I');
    expect(joao.secretaria).toBe('SECRETARIA MUNICIPAL DE SAÚDE');
  });

  it('filtra por nome (sem acento e sem maiúscula), matrícula, secretaria, vínculo e faixa de bruto', () => {
    const s = agruparServidores(LINHAS);
    expect(filtrarServidores(s, { nome: 'alvaro' }).map((x) => x.matricula)).toEqual(['3']);
    expect(filtrarServidores(s, { nome: 'joao da' }).map((x) => x.matricula)).toEqual(['1']);
    expect(filtrarServidores(s, { nome: '2' }).map((x) => x.matricula)).toEqual(['2']); // matrícula exata
    expect(filtrarServidores(s, { secretaria: 'SECRETARIA MUNICIPAL DE SAÚDE' })).toHaveLength(1);
    expect(filtrarServidores(s, { vinculo: 'EFETIVO' }).map((x) => x.matricula).sort()).toEqual(['1', '4']);
    expect(filtrarServidores(s, { brutoMin: 600000n, brutoMax: 900000n }).map((x) => x.matricula).sort()).toEqual(['1', '2']);
    expect(filtrarServidores(s, {})).toHaveLength(4);
    expect(filtrarServidores(s, { vinculo: 'EFETIVO', secretaria: 'Sem lotação' }).map((x) => x.matricula)).toEqual(['4']);
  });

  it('ordena por coluna, crescente e decrescente, com desempate estável pelo nome', () => {
    const s = agruparServidores(LINHAS);
    expect(ordenarServidores(s, 'nome').map((x) => x.matricula)).toEqual(['3', '4', '1', '2']);
    expect(ordenarServidores(s, '-bruto').map((x) => x.matricula)).toEqual(['3', '2', '1', '4']);
    expect(ordenarServidores(s, 'bruto').map((x) => x.matricula)).toEqual(['4', '1', '2', '3']);
    expect(ordenarServidores(s, 'vinculo')[0].tipoVinculo).toBe('COMISSIONADO');
  });

  it('lê reais do campo de filtro; vazio ou lixo desliga o filtro', () => {
    expect(lerReais('5000')).toBe(500000n);
    expect(lerReais('5.000,50')).toBe(500050n);
    expect(lerReais('')).toBeNull();
    expect(lerReais(undefined)).toBeNull();
    expect(lerReais('abc')).toBeNull();
  });

  it('LGPD: sem permissão para nomes, a busca só casa com a matrícula e a ordem por nome vira ordem de matrícula', () => {
    const s = agruparServidores(LINHAS);
    expect(filtrarServidores(s, { nome: 'alvaro', soMatricula: true })).toHaveLength(0);
    expect(filtrarServidores(s, { nome: '3', soMatricula: true }).map((x) => x.matricula)).toEqual(['3']);
    expect(ordenarServidores(s, 'nome', true).map((x) => x.matricula)).toEqual(['1', '2', '3', '4']);
    expect(ordenarServidores(s, '-nome', true).map((x) => x.matricula)).toEqual(['4', '3', '2', '1']);
  });
});
