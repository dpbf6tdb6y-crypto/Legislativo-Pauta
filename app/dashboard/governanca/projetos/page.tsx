import Link from 'next/link';
import { brlCurto } from '@/lib/financas/dinheiro';
import { estadoEtapa } from '@/lib/financas/projetos/etapas';
import { acessoProjetos } from '../../fazenda/(modulos)/projetos/acesso';
import { BarraAvanco, SeloFase, SeloSaude } from '../../fazenda/(modulos)/projetos/Selos';
import { coordenadora, lerGovernanca } from '../leitura';

export default async function SecretariasEEtapas({ searchParams }: { searchParams: { secretaria?: string } }) {
  const { db, ator } = await acessoProjetos('Governança · Secretarias e etapas');
  const hoje = new Date();
  const d = await lerGovernanca(db, ator, hoje);
  const filtro = searchParams.secretaria ?? '';
  // o filtro vale para qualquer participação, não só para a coordenadora
  const lista = d.projetos.filter((p) => !filtro || p.secretarias.some((s) => s.orgaoCod === filtro));
  const opcoes = [...new Map(d.projetos.flatMap((p) => p.secretarias.map((s) => [s.orgaoCod, s.orgaoNome] as const)))].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Secretarias e etapas</h1>
        <p className="text-sm text-slate-600">Quem coordena, quem participa e a ordem de execução. Abra um projeto para ver responsabilidades e dependências.</p>
      </header>

      <form className="cartao flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm">Secretaria participante
          <select name="secretaria" defaultValue={filtro} className="campo block mt-1 min-w-[260px]">
            <option value="">todas</option>
            {opcoes.map(([cod, nome]) => <option key={cod} value={cod}>{nome}</option>)}
          </select>
        </label>
        <button className="btn">Filtrar</button>
        {filtro && <Link href="/dashboard/governanca/projetos" className="text-xs text-[#0f4c81] hover:underline">limpar</Link>}
      </form>

      <section className="cartao overflow-x-auto">
        {lista.length === 0 ? <p className="text-sm text-slate-500">Nenhum projeto para mostrar.</p> : (
          <table className="tabela">
            <thead><tr><th>Projeto</th><th>Coordenadora</th><th className="n">Envolvidas</th><th className="n">Etapas</th><th className="n">Aguardando</th><th>Situação</th><th>Avanço</th><th className="n">Orçamento</th></tr></thead>
            <tbody>
              {lista.map((p) => {
                const retidas = p.etapas.filter((e) => estadoEtapa(p.etapas, e, hoje) === 'aguardando').length;
                const encerrado = p.fase === 'concluido' || p.fase === 'cancelado';
                return (
                  <tr key={p.id}>
                    <td><Link href={`/dashboard/governanca/projetos/${p.id}`} className="text-[#0f4c81] hover:underline font-medium">{p.titulo}</Link><div className="mt-0.5"><SeloFase fase={p.fase} /></div></td>
                    <td className="text-xs">{coordenadora(p)}</td>
                    <td className="n">{p.secretarias.filter((s) => s.papel !== 'lider').length}</td>
                    <td className="n">{p.etapas.filter((e) => e.status !== 'cancelada').length}</td>
                    <td className="n">{!encerrado && retidas ? <b className="text-amber-700">{retidas}</b> : 0}</td>
                    <td><SeloSaude saude={p.saude} diasAtraso={p.diasAtraso} /></td>
                    <td><BarraAvanco pct={p.avanco} saude={p.saude} /></td>
                    <td className="n">{p.orcamento === null ? '—' : brlCurto(p.orcamento)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
