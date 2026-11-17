// Coleta da Gestão $$$ (dados financeiros do Portal da Transparência).
// Uso (no servidor, roda dentro do contêiner "coletor": ver scripts/financas/coletar.sh):
//   npx tsx scripts/financas/coletar.ts                       rotina diária
//   npx tsx scripts/financas/coletar.ts --inicial             primeira carga: ano todo + 12 meses de folha
//   npx tsx scripts/financas/coletar.ts --so folha --folha 2026/10
//   npx tsx scripts/financas/coletar.ts --so contratos,despesa
//   npx tsx scripts/financas/coletar.ts --ano 2025            outro exercício
import { executarColeta, type OpcoesColeta } from '../../lib/financas/coleta/executar';
import { PREFEITURA_PADRAO, prismaSistema } from '../../lib/financas/db';

const anoMes = (a: number, m: number) => `${a}/${String(m).padStart(2, '0')}`;
function mesesAtras(base: Date, n: number) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - n, 1));
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

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

  // folha: o portal publica o mês fechado; carga inicial = 12 meses, rotina = os 2 últimos
  const folhaArg = arg('folha');
  const folha = folhaArg !== undefined
    ? folhaArg.split(',').filter(Boolean)
    : inicial
      ? Array.from({ length: 12 }, (_, i) => { const x = mesesAtras(hoje, i + 1); return anoMes(x.ano, x.mes); })
      : [1, 2].map((i) => { const x = mesesAtras(hoje, i); return anoMes(x.ano, x.mes); });

  const so = arg('so')?.split(',');
  const quer = (p: string) => !so || so.includes(p);
  const op: OpcoesColeta = {
    ano,
    meses: quer('despesa') ? [...new Set(meses)] : [],
    folha: quer('folha') ? folha : [],
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
