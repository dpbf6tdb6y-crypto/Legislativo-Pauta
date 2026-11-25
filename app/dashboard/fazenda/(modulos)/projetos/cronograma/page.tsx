import Link from 'next/link';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { carteira } from '@/lib/financas/projetos/dados';
import { montarEscala } from '@/lib/financas/projetos/gantt';
import { FASES_ABERTAS } from '@/lib/financas/projetos/regras';
import { acessoProjetos } from '../acesso';
import Gantt, { type GrupoGantt } from '../Gantt';

export default async function Cronograma({ searchParams }: { searchParams: { secretaria?: string; ano?: string; ver?: string; etapas?: string } }) {
  const { db, ator } = await acessoProjetos('Cronograma de projetos', { detalhe: `secretaria="${searchParams.secretaria ?? ''}" ano="${searchParams.ano ?? ''}"` });
  const hoje = new Date();
  const ano = /^\d{4}$/.test(searchParams.ano ?? '') ? Number(searchParams.ano) : undefined;
  const todos = searchParams.ver === 'todos';
  const mostrarEtapas = searchParams.etapas === '1';
  const [ps, { orgaos }] = await Promise.all([carteira(db, ator, hoje, { secretaria: searchParams.secretaria }), orgaosExecutivo(db, hoje)]);
  const visiveis = ps.filter((p) => todos || FASES_ABERTAS.includes(p.fase as never));

  // datas de projetos e etapas decidem o período (com ano fixo, só o ano)
  const datas = visiveis.flatMap((p) => [p.inicioPrevisto, p.fimPrevisto, ...(mostrarEtapas ? p.etapas.flatMap((e) => [e.inicioPrevisto, e.fimPrevisto]) : [])]);
  const escala = montarEscala(datas, hoje, ano);

  // um projeto em conjunto aparece sob cada secretaria que participa (quando a tela filtra uma, só sob ela)
  const mapa = new Map<string, GrupoGantt>();
  for (const p of visiveis)
    for (const s of p.secretarias) {
      if (searchParams.secretaria && s.orgaoCod !== searchParams.secretaria) continue;
      const g = mapa.get(s.orgaoCod) ?? { orgaoCod: s.orgaoCod, orgaoNome: s.orgaoNome, itens: [] };
      g.itens.push({ p, papel: s.papel });
      mapa.set(s.orgaoCod, g);
    }
  const grupos = [...mapa.values()]
    .map((g) => ({ ...g, itens: g.itens.sort((a, b) => (a.p.inicioPrevisto?.getTime() ?? Infinity) - (b.p.inicioPrevisto?.getTime() ?? Infinity) || a.p.titulo.localeCompare(b.p.titulo)) }))
    .sort((a, b) => a.orgaoCod.localeCompare(b.orgaoCod));
  const anos = Array.from({ length: 7 }, (_, i) => hoje.getFullYear() - 1 + i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link href="/dashboard/fazenda/projetos" className="text-xs text-[#0f4c81] hover:underline">← projetos</Link>
          <h1 className="text-lg font-semibold">Cronograma de projetos</h1>
          <p className="text-sm text-slate-600">Quando cada projeto começa e termina, por secretaria. A parte escura da barra é o avanço; a linha vermelha é hoje; o traço preto marca o prazo original de um projeto replanejado.</p>
        </div>
      </div>

      <form className="cartao flex flex-wrap items-end gap-3 text-sm">
        {ator.verTodos && (
          <label>Secretaria
            <select name="secretaria" defaultValue={searchParams.secretaria ?? ''} className="campo block mt-1 max-w-[16rem]">
              <option value="">todas</option>
              {orgaos.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
            </select>
          </label>
        )}
        <label>Período
          <select name="ano" defaultValue={ano ? String(ano) : ''} className="campo block mt-1">
            <option value="">do primeiro ao último prazo</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>Projetos
          <select name="ver" defaultValue={todos ? 'todos' : 'abertos'} className="campo block mt-1">
            <option value="abertos">em aberto</option>
            <option value="todos">todos (com concluídos e cancelados)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5"><input type="checkbox" name="etapas" value="1" defaultChecked={mostrarEtapas} /> mostrar etapas</label>
        <button className="btn">Atualizar</button>
      </form>

      <div className="cartao p-0 overflow-hidden">
        {grupos.length === 0
          ? <p className="p-4 text-sm text-slate-500">Nenhum projeto para mostrar com esses filtros.</p>
          : <Gantt escala={escala} grupos={grupos} mostrarEtapas={mostrarEtapas} hoje={hoje} />}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {([['bg-emerald-500', 'no prazo'], ['bg-amber-500', 'atenção'], ['bg-red-600', 'atrasado'], ['bg-slate-500', 'paralisado'], ['bg-sky-400', 'em planejamento (sem semáforo)']] as const).map(([c, r]) => (
          <span key={r} className="inline-flex items-center gap-1"><span className={`inline-block w-2.5 h-2.5 rounded-full ${c}`} />{r}</span>
        ))}
        <span>◆ marco (entrega pontual)</span>
      </div>
    </div>
  );
}
