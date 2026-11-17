// Apaga do disco os arquivos baixados do portal com mais de N dias (padrão 30).
// O registro (tipo, referência, tamanho e SHA-256) continua no banco para sempre, com a data em que o
// arquivo saiu do disco (apagadoEm). Uso: npx tsx scripts/financas/limpar-brutos.ts [--dias 30] [--simular]
import fs from 'fs';
import { PREFEITURA_PADRAO, dbDa, prismaSistema } from '../../lib/financas/db';

function arg(nome: string) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : undefined;
}

export async function limparBrutos(prefeituraId: string, dias: number, simular = false, hoje = new Date()) {
  const db = dbDa(prefeituraId);
  const limite = new Date(hoje.getTime() - dias * 86400000);
  const velhos = await db.arquivoBruto.findMany({ where: { baixadoEm: { lt: limite }, apagadoEm: null }, select: { id: true, caminho: true, bytes: true } });
  let bytes = 0;
  for (const a of velhos) {
    if (!simular) {
      fs.rmSync(a.caminho, { force: true });
      await db.arquivoBruto.updateMany({ where: { id: a.id }, data: { apagadoEm: hoje } });
    }
    bytes += a.bytes;
  }
  return { arquivos: velhos.length, mb: Math.round(bytes / 1048576) };
}

async function main() {
  const dias = Number(arg('dias') ?? 30);
  if (!(dias >= 7)) throw new Error('--dias precisa ser 7 ou mais');
  const simular = process.argv.includes('--simular');
  const r = await limparBrutos(arg('prefeitura') ?? PREFEITURA_PADRAO, dias, simular);
  console.log(`${simular ? '[simulação] ' : ''}arquivos com mais de ${dias} dias apagados do disco: ${r.arquivos} (${r.mb} MB)`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/financas/limpar-brutos.ts')) {
  main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prismaSistema.$disconnect());
}
