// Coleta da Gestão $$$ (dados financeiros do Portal da Transparência).
// Uso (no servidor, roda dentro do contêiner "coletor": ver scripts/financas/coletar.sh):
//   npx tsx scripts/financas/coletar.ts                       rotina diária
//   npx tsx scripts/financas/coletar.ts --inicial             primeira carga: ano todo, relista todos os meses
//   npx tsx scripts/financas/coletar.ts --so contratos,despesa
//   npx tsx scripts/financas/coletar.ts --ano 2025            outro exercício
import { executarColeta, type OpcoesColeta } from '../../lib/financas/coleta/executar';
import { PREFEITURA_PADRAO, prismaSistema } from '../../lib/financas/db';

function arg(nome: string) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : undefined;
}

async function main() {
  const prefeitura = arg('prefeitura') ?? PREFEITURA_PADRAO;
  const hoje = new Date();
  const ano = Number(arg('ano') ?? hoje.getUTCFullYear());
  const mesAtual = ano === hoje.getUTCFullYear() ? hoje.getUTCMonth() + 1 : 12;
  const inicial = process.argv.includes('--inicial');
  const domingo = hoje.getDay() === 0;

  // despesa/receita: ano inteiro (0) + mês atual e anterior; todos os meses no domingo ou na carga inicial
  // (o portal altera meses passados com lançamentos de data retroativa)
  const meses = inicial || domingo ? [0, ...Array.from({ length: mesAtual }, (_, i) => i + 1)] : [0, Math.max(1, mesAtual - 1), mesAtual];

  const so = arg('so')?.split(',');
  const quer = (p: string) => !so || so.includes(p);
  const op: OpcoesColeta = {
    ano,
    meses: quer('despesa') ? [...new Set(meses)] : [],
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
