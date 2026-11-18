// Travas da coleta: arquivo suspeito é recusado ANTES de tocar no dado que já está gravado.
// A recusa vira erro da etapa: o número anterior continua na tela e a falha aparece na situação da coleta.
import type { ReceitaContaMesC } from '@/lib/financas/conectores/tipos';

/** A soma das contas analíticas de cada raiz (correntes, capital, deduções) tem de fechar com o total publicado. */
export function conferirSomaReceita(contas: ReceitaContaMesC[]) {
  const pais = new Set(contas.map((c) => c.contaPai));
  const cods = new Set(contas.map((c) => c.contaCod));
  const raizes = contas.filter((c) => !c.contaPai || !cods.has(c.contaPai));
  for (const raiz of raizes) {
    const soma = contas
      .filter((c) => !pais.has(c.contaCod) && c.contaCod.charAt(0) === raiz.contaCod.charAt(0))
      .reduce((s, c) => s + c.arrecAteMes, BigInt(0));
    const dif = soma - raiz.arrecAteMes;
    if (dif > BigInt(1) || dif < BigInt(-1))
      throw new Error(`receita recusada: as contas da raiz ${raiz.contaCod} somam ${soma} centavos e o total publicado é ${raiz.arrecAteMes}`);
  }
}

/** Lista de contratos que encolhe mais de 10% de um dia para o outro é lista parcial do portal. */
export function conferirListaContratos(novos: number, antes: number) {
  if (novos === 0) throw new Error('contratos recusados: o portal entregou uma lista vazia');
  if (antes > 0 && novos < antes * 0.9) throw new Error(`contratos recusados: o portal trouxe ${novos} e havia ${antes} (lista parcial?)`);
}

/** Folha que encolhe mais de 20% num mês já gravado é leitura parcial. */
export function conferirVolumeFolha(anoMes: string, novas: number, antes: number) {
  if (novas === 0) throw new Error(`folha ${anoMes} recusada: nenhuma linha`);
  if (antes > 0 && novas < antes * 0.8) throw new Error(`folha ${anoMes} recusada: ${novas} linhas e havia ${antes} (leitura parcial?)`);
}
