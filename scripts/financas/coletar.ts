// Coleta da Gestão $$$ (dados financeiros do Portal da Transparência).
// Uso (no servidor, roda dentro do contêiner "coletor": ver scripts/financas/coletar.sh):
//   npx tsx scripts/financas/coletar.ts                       rotina diária
//   npx tsx scripts/financas/coletar.ts --inicial             primeira carga: ano todo + folha do mês mais recente
//   npx tsx scripts/financas/coletar.ts --so folha --folha 2026/10
//   npx tsx scripts/financas/coletar.ts --so contratos,despesa
//   npx tsx scripts/financas/coletar.ts --ano 2025            outro exercício
//   npx tsx scripts/financas/coletar.ts --historico 2020-2025 anos fechados: receita, despesa, natureza, função e SICONFI
import { executarColeta, type OpcoesColeta } from '../../lib/financas/coleta/executar';
import { dbDa, PREFEITURA_PADRAO, prismaSistema } from '../../lib/financas/db';
import { carregarMesesGuardados, mesesDeFolhaPendentes } from '../../lib/financas/coleta/folhaPendente';

function arg(nome: string) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : undefined;
}

async function main() {
  const prefeitura = arg('prefeitura') ?? PREFEITURA_PADRAO;
  const hoje = new Date();

  // histórico: cada ano fechado é conferido com os RREOs homologados daquele ano
  const historico = arg('historico')?.match(/^(\d{4})-(\d{4})$/);
  if (arg('historico') !== undefined && !historico) throw new Error('use --historico 2020-2025');
  if (historico) {
    const todos = Array.from({ length: 13 }, (_, i) => i);
    let falhou = false;
    for (let a = Number(historico[1]); a <= Number(historico[2]); a++) {
      const r = await executarColeta(prefeitura, { ano: a, meses: todos, mesesVisoes: todos, folha: [], siconfi: true, empenhos: false, contratos: false });
      falhou = falhou || r?.status === 'falha';
    }
    process.exitCode = falhou ? 1 : 0;
    return;
  }

  const ano = Number(arg('ano') ?? hoje.getUTCFullYear());
  const mesAtual = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() + 1 : 12;
  const inicial = process.argv.includes('--inicial');
  const domingo = hoje.getDay() === 0;

  // despesa/receita: ano inteiro (0) + mês atual e anterior; todos os meses no domingo ou na carga inicial
  // (o portal altera meses passados com lançamentos de data retroativa)
  const meses = inicial || domingo ? [0, ...Array.from({ length: mesAtual }, (_, i) => i + 1)] : [0, Math.max(1, mesAtual - 1), mesAtual];

  // folha por servidor: só o mês mais recente publicado (o corrente é sondado a cada coleta; o último fechado só se ainda não houver
  // nenhum mês recente completo). --folha 2026/10 pede um mês à mão.
  const folhaArg = arg('folha');
  const folha = folhaArg !== undefined
    ? folhaArg.split(',').filter(Boolean)
    : mesesDeFolhaPendentes(await carregarMesesGuardados(dbDa(prefeitura)), hoje);
  const folhaVerificar: string[] = [];

  const so = arg('so')?.split(',');
  const quer = (p: string) => !so || so.includes(p);
  const op: OpcoesColeta = {
    ano,
    meses: quer('despesa') ? [...new Set(meses)] : [],
    mesesVisoes: quer('despesa') || quer('visoes') ? [...new Set(meses)] : [],
    folha: quer('folha') ? folha : [],
    folhaVerificar: quer('folha') && folhaArg === undefined ? folhaVerificar : [],
    siconfi: quer('siconfi'),
    empenhos: quer('empenhos'),
    contratos: quer('contratos'),
    restos: quer('restos'),
    retencoes: quer('retencoes'),
    completa: inicial || domingo,
  };
  console.log(`coleta ${prefeitura}: ${JSON.stringify(op)}`);
  const r = await executarColeta(prefeitura, op);
  process.exitCode = r?.status === 'falha' ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prismaSistema.$disconnect());
