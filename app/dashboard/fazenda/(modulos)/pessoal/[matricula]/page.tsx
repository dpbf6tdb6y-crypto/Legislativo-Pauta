import { exigir } from '@/lib/financas/auth';
import { brl } from '@/lib/financas/dinheiro';
import { nomeExibido, podeVerNomes } from '@/lib/financas/folha';

export default async function Ficha({ params }: { params: { matricula: string } }) {
  const matricula = decodeURIComponent(params.matricula);
  const { s, db } = await exigir('folha', 'Ficha do servidor', { detalhe: `matrícula=${matricula}`, modulo: 'folha' });
  const meses = (await db.folhaMes.findMany({ orderBy: { anoMes: 'desc' }, take: 12 })).map((m) => m.anoMes);
  const linhas = await db.folhaLinha.findMany({ where: { matricula, anoMes: { in: meses } }, orderBy: [{ anoMes: 'desc' }, { seq: 'asc' }] });
  const atual = linhas[0];
  const verNomes = await podeVerNomes(s);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{atual ? nomeExibido(atual, verNomes) : 'Servidor não encontrado'} · matrícula {matricula}</h1>
      {atual && <p className="text-sm text-slate-600">{atual.cargo} · {atual.tipoVinculo} · {atual.lotacao} · {atual.situacao}</p>}
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead><tr><th>Mês</th><th>Cargo</th><th>Situação</th><th className="n">Vencimentos</th><th className="n">Bruto</th><th className="n">Previdência</th><th className="n">Desconto</th><th className="n">IRRF</th><th className="n">Líquido</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}><td>{l.anoMes}</td><td className="text-xs">{l.cargo}</td><td className="text-xs">{l.situacao}</td><td className="n">{brl(l.vencimentos)}</td><td className="n">{brl(l.bruto)}</td><td className="n">{brl(l.previdencia)}</td><td className="n">{brl(l.desconto)}</td><td className="n">{brl(l.irrf)}</td><td className="n">{brl(l.liquido)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Campos conforme o plano (LGPD): sem CPF, dados bancários, dependentes ou detalhe de descontos; situação resumida.</p>
    </div>
  );
}
