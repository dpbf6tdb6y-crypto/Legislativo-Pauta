import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { todasChaves } from '@/lib/financas/chaves';
import { PERFIS } from '@/lib/financas/perfis';
import { prisma } from '@/lib/prisma';
import { alternarChave } from '../acoes';

// Chaves liga/desliga dos módulos e quem tem qual perfil da Gestão. Os perfis são dados no cadastro
// de usuários do SEGOV (Usuários), não aqui.
export default async function Admin() {
  const { s, db } = await exigir('chaves', 'Chaves e perfis');
  const chaves = await todasChaves(s.prefeituraId);
  const hist = await db.chaveHistorico.findMany({ orderBy: { id: 'desc' }, take: 30 });
  const usuarios = await prisma.user.findMany({
    where: { OR: [{ gestaoPerfil: { not: null } }, { perfil: { in: ['master', 'admin'] } }] },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, email: true, perfil: true, ativo: true, gestaoPerfil: true, gestaoOrgaoCod: true },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Chaves e perfis do Compliance</h1>
      <div className="cartao">
        <h2 className="font-semibold mb-2">Chaves liga/desliga</h2>
        <table className="tabela">
          <thead><tr><th>Chave</th><th>Descrição</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {chaves.map((c) => (
              <tr key={c.nome}>
                <td className="font-mono text-xs">{c.nome}</td><td>{c.descricao}</td>
                <td>{c.ligada ? <span className="selo bg-emerald-100 text-emerald-900">ligada</span> : <span className="selo bg-slate-200">desligada</span>}</td>
                <td><form action={alternarChave}><input type="hidden" name="nome" value={c.nome} /><input type="hidden" name="ligada" value={String(!c.ligada)} /><button className="btn-sec">{c.ligada ? 'Desligar' : 'Ligar'}</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="text-sm font-semibold mt-3">Histórico</h3>
        <ul className="text-xs text-slate-600">{hist.map((h) => <li key={h.id}>{h.quando.toLocaleString('pt-BR')} · {h.nome}: {h.de ? 'ligada' : 'desligada'} → {h.para ? 'ligada' : 'desligada'} · {h.por}</li>)}</ul>
      </div>
      <div className="cartao">
        <h2 className="font-semibold">Perfis do Compliance</h2>
        <p className="text-xs text-slate-500 mb-2">
          O perfil é escolhido no cadastro de cada usuário do SEGOV (<Link href="/dashboard/usuarios" className="text-emerald-700 hover:underline">Usuários</Link>),
          junto com o menu &quot;Compliance&quot;. O perfil Secretaria vê e responde só a própria secretaria. Master e Admin sem perfil do Compliance
          só configuram as chaves e veem o registro de acessos.
        </p>
        <table className="tabela">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil do Compliance</th><th>Ativo</th></tr></thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td><td>{u.email}</td>
                <td>{u.gestaoPerfil ? `${PERFIS[u.gestaoPerfil]?.nome ?? u.gestaoPerfil}${u.gestaoOrgaoCod ? ` · secretaria ${u.gestaoOrgaoCod}` : ''}` : <span className="text-slate-400">({u.perfil}: só administração)</span>}</td>
                <td>{u.ativo ? 'sim' : 'não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
