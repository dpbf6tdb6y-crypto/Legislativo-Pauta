// O Master do SEGOV tem o acesso total a Projetos, qualquer que seja o perfil dele na Gestão; só em Projetos.
import { describe, expect, it } from 'vitest';
import { podeNaGestao } from '@/lib/financas/auth';
import { atorDe } from '@/lib/financas/projetos/acoes';

describe('Master em Projetos', () => {
  it('auditor comum só vê; auditor que é Master cadastra e aprova', () => {
    expect(podeNaGestao({ perfil: 'auditor' }, 'projetos_gerir')).toBe(false);
    expect(podeNaGestao({ perfil: 'auditor', master: true }, 'projetos_gerir')).toBe(true);
    expect(podeNaGestao({ perfil: 'auditor', master: true }, 'projetos_aprovar')).toBe(true);
    const comum = atorDe({ nome: 'A', perfil: 'auditor', orgaoCod: '' });
    expect([comum.verTodos, comum.gerir, comum.aprovar]).toEqual([true, false, false]);
    const master = atorDe({ nome: 'M', perfil: 'auditor', orgaoCod: '', master: true });
    expect([master.verTodos, master.gerir, master.aprovar]).toEqual([true, true, true]);
  });
  it('o Master não ganha nada fora de Projetos', () => {
    expect(podeNaGestao({ perfil: 'auditor', master: true }, 'regras_aprovar')).toBe(false);
    expect(podeNaGestao({ perfil: 'auditor', master: true }, 'documentos_decidir')).toBe(false);
    expect(podeNaGestao({ perfil: 'administrador', master: true }, 'folha')).toBe(false);
  });
});
