// Folha: só o mês mais recente. Quais meses a coleta busca.
import { describe, expect, it } from 'vitest';
import { anoMesDe, mesesDeFolhaPendentes, type MesGuardado } from '@/lib/financas/coleta/folhaPendente';

const ok = (anoMes: string, n = 100): MesGuardado => ({ anoMes, linhasPortal: n, linhasGuardadas: n });
const HOJE = new Date(Date.UTC(2026, 10, 20, 12)); // 20/11/2026

describe('mês de folha a coletar (só o mais recente)', () => {
  it('anoMesDe atravessa o ano', () => {
    expect(anoMesDe(2026, -1)).toBe('2025/12');
    expect(anoMesDe(2026, 12)).toBe('2027/01');
    expect(anoMesDe(2026, 10)).toBe('2026/11');
  });

  it('já há o último fechado completo: só sonda o mês corrente', () => {
    expect(mesesDeFolhaPendentes([ok('2026/09'), ok('2026/10')], HOJE)).toEqual(['2026/11']);
  });

  it('o corrente já está guardado e completo: basta ele (o fechado não é buscado)', () => {
    expect(mesesDeFolhaPendentes([ok('2026/11')], HOJE)).toEqual(['2026/11']);
  });

  it('nada guardado: o corrente e o último fechado', () => {
    expect(mesesDeFolhaPendentes([], HOJE)).toEqual(['2026/11', '2026/10']);
  });

  it('o último fechado está incompleto ou zerado: busca de novo; meses antigos são ignorados', () => {
    const g = [ok('2026/03'), { anoMes: '2026/05', linhasPortal: 100, linhasGuardadas: 40 }, { anoMes: '2026/10', linhasPortal: 100, linhasGuardadas: 40 }, { anoMes: '2026/09', linhasPortal: 0, linhasGuardadas: 0 }];
    expect(mesesDeFolhaPendentes(g, HOJE)).toEqual(['2026/11', '2026/10']);
  });

  it('em janeiro o último fechado é dezembro do ano anterior', () => {
    expect(mesesDeFolhaPendentes([], new Date(Date.UTC(2026, 0, 10)))).toEqual(['2026/01', '2025/12']);
    expect(mesesDeFolhaPendentes([ok('2025/12')], new Date(Date.UTC(2026, 0, 10)))).toEqual(['2026/01']);
  });
});
