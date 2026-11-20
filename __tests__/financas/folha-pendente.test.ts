// Folha: quais meses a coleta da noite busca para a tabela ficar completa e com o mês mais recente.
import { describe, expect, it } from 'vitest';
import { anoMesDe, mesesDeFolhaPendentes, type MesGuardado } from '@/lib/financas/coleta/folhaPendente';

const ok = (anoMes: string, n = 100): MesGuardado => ({ anoMes, linhasPortal: n, linhasGuardadas: n });
const HOJE = new Date(Date.UTC(2026, 10, 20, 12)); // 20/11/2026

describe('meses de folha a coletar', () => {
  it('anoMesDe atravessa o ano', () => {
    expect(anoMesDe(2026, -1)).toBe('2025/12');
    expect(anoMesDe(2026, 12)).toBe('2027/01');
    expect(anoMesDe(2026, 10)).toBe('2026/11');
  });

  it('tudo em dia: sonda o mês corrente e refaz o último fechado', () => {
    const g = ['2026/08', '2026/09', '2026/10'].map((m) => ok(m));
    expect(mesesDeFolhaPendentes(g, HOJE)).toEqual(['2026/11', '2026/10']);
  });

  it('no domingo (completa) refaz também o penúltimo', () => {
    const g = ['2026/08', '2026/09', '2026/10'].map((m) => ok(m));
    expect(mesesDeFolhaPendentes(g, HOJE, true)).toEqual(['2026/11', '2026/10', '2026/09']);
  });

  it('mês incompleto, mês zerado e lacuna entram, do mais recente para o mais antigo', () => {
    const g = [ok('2026/03'), { anoMes: '2026/05', linhasPortal: 100, linhasGuardadas: 40 }, ok('2026/06'), { anoMes: '2026/07', linhasPortal: 0, linhasGuardadas: 0 }, ok('2026/09'), ok('2026/10')];
    // lacunas: 04 e 08; incompleto: 05; zerado: 07
    expect(mesesDeFolhaPendentes(g, HOJE)).toEqual(['2026/11', '2026/10', '2026/08', '2026/07', '2026/05', '2026/04']);
  });

  it('nada guardado ainda: só o corrente e o último fechado (a carga dos 12 meses é a opção --inicial)', () => {
    expect(mesesDeFolhaPendentes([], HOJE)).toEqual(['2026/11', '2026/10']);
  });

  it('em janeiro o último fechado é dezembro do ano anterior', () => {
    expect(mesesDeFolhaPendentes([ok('2025/11'), ok('2025/12')], new Date(Date.UTC(2026, 0, 10)))).toEqual(['2026/01', '2025/12']);
  });
});
