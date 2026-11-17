import { exigir } from '@/lib/financas/auth';

export default async function Acessos({ searchParams }: { searchParams: { usuario?: string; tela?: string } }) {
  const { db } = await exigir('acessos', 'Registro de acessos', { detalhe: JSON.stringify(searchParams) });
  const where: any = {};
  if (searchParams.usuario) where.usuarioNome = { contains: searchParams.usuario };
  if (searchParams.tela) where.tela = searchParams.tela;
  const lista = await db.registroAcesso.findMany({ where, orderBy: { id: 'desc' }, take: 500 });
  const telas = (await db.registroAcesso.findMany({ distinct: ['tela'], select: { tela: true } })).map((t) => t.tela).sort();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-lg font-semibold mr-auto">Registro de acessos</h1>
        <form className="flex gap-2">
          <input name="usuario" defaultValue={searchParams.usuario ?? ''} placeholder="usuário" className="campo" />
          <select name="tela" defaultValue={searchParams.tela ?? ''} className="campo"><option value="">todas as telas</option>{telas.map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn-sec">Filtrar</button>
        </form>
      </div>
      <p className="text-xs text-slate-500">Quem consultou o quê, quando. Inclui buscas por nome na folha (com o termo pesquisado) e toda alteração. Últimos 500 registros.</p>
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead><tr><th>Quando</th><th>Usuário</th><th>Perfil</th><th>Ação</th><th>Tela</th><th>Detalhe</th></tr></thead>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap">{r.quando.toLocaleString('pt-BR')}</td><td>{r.usuarioNome}</td><td>{r.perfil}</td><td>{r.acao}</td><td>{r.tela}</td><td className="text-xs">{r.detalhe}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
