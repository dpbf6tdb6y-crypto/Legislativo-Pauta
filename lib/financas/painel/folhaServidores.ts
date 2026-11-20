// Pessoal: um servidor por linha (a matrícula pode ter 2 linhas no mês), com filtros e ordem das colunas.
import { centavos } from '@/lib/financas/dinheiro';

export interface LinhaFolha { matricula: string; nome: string; lotacao: string; tipoVinculo: string; bruto: bigint }
export interface Servidor { matricula: string; nome: string; secretaria: string; lotacao: string; tipoVinculo: string; bruto: bigint; linhas: number }

/** "SECRETARIA MUNICIPAL DE SAÚDE - GERÊNCIA I ..." -> "SECRETARIA MUNICIPAL DE SAÚDE" (o setor fica na dica da célula) */
export function secretariaDaLotacao(lotacao: string): string {
  const s = lotacao.split(' - ')[0].trim();
  return s || 'Sem lotação';
}

/** Soma o bruto das linhas da mesma matrícula; secretaria e vínculo vêm da linha de maior bruto. */
export function agruparServidores(linhas: LinhaFolha[]): Servidor[] {
  const por = new Map<string, Servidor & { maior: bigint }>();
  for (const l of linhas) {
    const x = por.get(l.matricula);
    if (!x) {
      por.set(l.matricula, { matricula: l.matricula, nome: l.nome, secretaria: secretariaDaLotacao(l.lotacao), lotacao: l.lotacao, tipoVinculo: l.tipoVinculo, bruto: l.bruto, linhas: 1, maior: l.bruto });
      continue;
    }
    x.bruto += l.bruto;
    x.linhas++;
    if (l.bruto > x.maior) { x.maior = l.bruto; x.secretaria = secretariaDaLotacao(l.lotacao); x.lotacao = l.lotacao; x.tipoVinculo = l.tipoVinculo; }
  }
  return [...por.values()].map(({ maior: _m, ...s }) => s);
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export interface FiltroServidores {
  nome?: string; secretaria?: string; vinculo?: string; brutoMin?: bigint | null; brutoMax?: bigint | null;
  /** LGPD: sem permissão para ver nomes, o campo de busca só casa com a matrícula (nunca com o nome) */
  soMatricula?: boolean;
}

export function filtrarServidores(lista: Servidor[], f: FiltroServidores): Servidor[] {
  const n = norm(f.nome ?? '');
  return lista.filter((s) =>
    (!n || (!f.soMatricula && norm(s.nome).includes(n)) || s.matricula === (f.nome ?? '').trim()) &&
    (!f.secretaria || s.secretaria === f.secretaria) &&
    (!f.vinculo || s.tipoVinculo === f.vinculo) &&
    (f.brutoMin == null || s.bruto >= f.brutoMin) &&
    (f.brutoMax == null || s.bruto <= f.brutoMax));
}

export type OrdemServidores = 'nome' | '-nome' | 'secretaria' | '-secretaria' | 'vinculo' | '-vinculo' | 'bruto' | '-bruto';
export const ORDENS: OrdemServidores[] = ['nome', '-nome', 'secretaria', '-secretaria', 'vinculo', '-vinculo', 'bruto', '-bruto'];

/** `semNomes`: a ordem "por nome" vira ordem de matrícula, para não revelar a ordem alfabética dos nomes ocultos. */
export function ordenarServidores(lista: Servidor[], ord: OrdemServidores, semNomes = false): Servidor[] {
  const desc = ord.startsWith('-') ? -1 : 1;
  const campo = ord.replace('-', '') as 'nome' | 'secretaria' | 'vinculo' | 'bruto';
  const chave = (x: Servidor) => (semNomes ? x.matricula : x.nome);
  const cmp = (a: Servidor, b: Servidor) => {
    if (campo === 'nome' && semNomes) return a.matricula.localeCompare(b.matricula, 'pt-BR', { numeric: true });
    if (campo === 'bruto') return a.bruto === b.bruto ? 0 : a.bruto > b.bruto ? 1 : -1;
    const x = campo === 'vinculo' ? a.tipoVinculo : a[campo], y = campo === 'vinculo' ? b.tipoVinculo : b[campo];
    return x.localeCompare(y, 'pt-BR');
  };
  return [...lista].sort((a, b) => desc * cmp(a, b) || chave(a).localeCompare(chave(b), 'pt-BR') || a.matricula.localeCompare(b.matricula));
}

/** "5000", "5.000,50" ou "5000.5" -> centavos; vazio ou inválido -> null (filtro desligado) */
export function lerReais(txt: string | undefined): bigint | null {
  if (!txt || !txt.trim()) return null;
  try { return centavos(txt); } catch { return null; }
}
