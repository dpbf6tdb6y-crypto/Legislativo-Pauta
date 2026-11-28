// Cargo da pessoa no gabinete. Hoje serve para a saudação e o menu curto da aba Governança.
// Não dá nem tira permissão: o acesso continua vindo do perfil e dos acessos por menu.
export const CARGOS = ['Prefeito', 'Vice-Prefeito', 'Assessor de Governança'] as const;

export type Cargo = (typeof CARGOS)[number];

/** Só aceita os cargos da lista; qualquer outro valor vira "sem cargo". */
export const normalizaCargo = (valor: unknown): Cargo | null =>
  (CARGOS as readonly unknown[]).includes(valor) ? (valor as Cargo) : null;
