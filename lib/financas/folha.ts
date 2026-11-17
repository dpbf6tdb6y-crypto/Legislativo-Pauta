// LGPD na folha da Gestão $$$: o nome do servidor só aparece para os perfis com a permissão folha_nomes
// (prefeito, controlador, RH, auditor) E com a chave folha_nomes ligada (começa desligada).
// Fora disso a tela mostra "Servidor (mat. 1234)" e a busca é só por matrícula.
import { chaveLigada } from './chaves';
import { pode } from './perfis';
import type { Sessao } from './auth';

export async function podeVerNomes(s: Sessao) {
  return pode(s.perfil, 'folha_nomes') && (await chaveLigada(s.prefeituraId, 'folha_nomes'));
}

export const nomeOculto = (matricula: string) => `Servidor (mat. ${matricula})`;

export const nomeExibido = (l: { nome: string; matricula: string }, verNomes: boolean) => (verNomes ? l.nome : nomeOculto(l.matricula));
