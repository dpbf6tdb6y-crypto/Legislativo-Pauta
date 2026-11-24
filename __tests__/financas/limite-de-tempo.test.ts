// Leitura que não responde não pode segurar a coleta inteira (a de 24/11/2026 ficou 4h48 parada nos empenhos até o limite de 6 h).
import { describe, expect, it } from 'vitest';
import { comLimite } from '@/lib/financas/conectores/abaco';

describe('comLimite', () => {
  it('devolve o resultado quando a operação responde a tempo', async () => {
    expect(await comLimite(Promise.resolve(42), 1000, 'x')).toBe(42);
  });
  it('vira erro claro quando a operação fica pendurada', async () => {
    await expect(comLimite(new Promise(() => {}), 30, 'empenho 123')).rejects.toThrow('empenho 123: sem resposta em 0s');
  });
  it('repassa o erro da própria operação', async () => {
    await expect(comLimite(Promise.reject(new Error('HTTP 500')), 1000, 'x')).rejects.toThrow('HTTP 500');
  });
});
