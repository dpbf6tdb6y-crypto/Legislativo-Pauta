import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { pode } from '@/lib/financas/perfis';
import { classificarApontamento } from '../acoes';
import { acaoCriarPonto } from '../auditoria/acoes';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { sugerirOrgao } from '@/lib/financas/auditoria/regras';
import AbasAuditoriaInterna from '@/app/dashboard/fazenda/_componentes/AbasAuditoriaInterna';

const ROT: Record<string, string> = { para_analise: 'para análise', procedente: 'procedente', improcedente: 'improcedente' };

export default async function Apontamentos({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status ?? 'para_analise';
  const { s, db } = await exigir('apontamentos', 'Apontamentos', { detalhe: `status=${status}` });
  const lista = await db.apontamento.findMany({ where: status === 'todos' ? {} : { status }, orderBy: { id: 'desc' }, take: 300 });
  const regras = await db.regra.findMany();
  const podeClassificar = pode(s.perfil, 'apontamentos_classificar');

  // encaminhar à secretaria (auditoria): sugere o órgão pelo empenho do apontamento
  const podeEncaminhar = pode(s.perfil, 'auditoria_gerir');
  const { orgaos } = podeEncaminhar ? await orgaosExecutivo(db, new Date()) : { orgaos: [] };
  const jaEncaminhados = podeEncaminhar
    ? new Map((await db.pontoAuditoria.findMany({ where: { origem: 'apontamento' }, select: { origemRef: true, orgaoCod: true, id: true } })).map((p) => [p.origemRef, p]))
    : new Map();
  async function orgaoSugerido(a: { entidade: string; entidadeId: string }) {
    let empId: number | undefined;
    if (a.entidade === 'empenho') empId = Number(a.entidadeId);
    if (a.entidade === 'contrato') empId = (await db.ligacaoContratoEmpenho.findFirst({ where: { contratoId: Number(a.entidadeId) } }))?.empenhoId;
    if (!empId) return null;
    const e = await db.empenho.findFirst({ where: { id: empId }, select: { orgao: true } });
    return e ? sugerirOrgao(e.orgao, orgaos) : null;
  }
  const sugestao = new Map<number, string | null>();
  if (podeEncaminhar) for (const a of lista) if (!jaEncaminhados.has(`apontamento:${a.id}`)) sugestao.set(a.id, await orgaoSugerido(a));
  const prazoPadrao = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      <AbasAuditoriaInterna atual="apontamentos" />
      <div className="flex flex-wrap gap-2 items-center">
        <h1 className="text-lg font-semibold mr-auto">Auditoria interna · apontamentos</h1>
        {['para_analise', 'procedente', 'improcedente', 'todos'].map((x) => (
          <Link key={x} href={`?status=${x}`} className={x === status ? 'btn' : 'btn-sec'}>{ROT[x] ?? x}</Link>
        ))}
      </div>
      <p className="text-xs text-slate-500">Apontamento não é conclusão de irregularidade: é um ponto para análise, gerado por regra aprovada. Quem classifica fica registrado.</p>
      {lista.length === 0 && <div className="cartao text-sm text-slate-500">Nenhum apontamento nesta situação. (Regras ainda não aprovadas não geram apontamentos.)</div>}
      {lista.map((a) => {
        const r = regras.find((x) => x.codigo === a.regraCodigo);
        return (
          <div key={a.id} className="cartao text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-mono text-xs bg-slate-100 rounded px-1">{a.regraCodigo}</span>
              <b>{r?.titulo}</b>
              <span className="text-xs text-slate-500">#{a.id} · {a.criadoEm.toLocaleString('pt-BR')}</span>
              {a.entidade === 'contrato' && <Link className="text-xs text-emerald-700 hover:underline" href={`/dashboard/fazenda/contratos/${a.entidadeId}`}>abrir contrato</Link>}
            </div>
            <p className="mt-1">{a.resumo}</p>
            <p className="text-xs text-slate-500">Base legal: {r?.baseLegal}</p>
            {a.analisadoPor && <p className="text-xs mt-1">Classificado como <b>{ROT[a.status]}</b> por {a.analisadoPor} em {a.analisadoEm?.toLocaleString('pt-BR')}{a.nota ? `: ${a.nota}` : ''}</p>}
            {podeClassificar && (
              <form action={classificarApontamento} className="flex flex-wrap gap-2 mt-2">
                <input type="hidden" name="id" value={a.id} />
                <input name="nota" placeholder="justificativa" defaultValue={a.nota ?? ''} className="campo w-80" />
                <button name="status" value="procedente" className="btn-sec">Procedente</button>
                <button name="status" value="improcedente" className="btn-sec">Improcedente</button>
                {a.status !== 'para_analise' && <button name="status" value="para_analise" className="btn-sec">Reabrir</button>}
              </form>
            )}
            {podeEncaminhar && a.status !== 'improcedente' && (() => {
              const ja = jaEncaminhados.get(`apontamento:${a.id}`);
              if (ja) return <p className="text-xs mt-2">Encaminhado à secretaria · <Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/auditoria/${ja.orgaoCod}`}>ponto #{ja.id}</Link></p>;
              return (
                <form action={acaoCriarPonto} className="flex flex-wrap items-end gap-2 mt-2 border-t border-slate-100 pt-2">
                  <input type="hidden" name="origemRef" value={`apontamento:${a.id}`} />
                  <input type="hidden" name="titulo" value={`${a.regraCodigo} · ${r?.titulo ?? ''}`} />
                  <input type="hidden" name="descricao" value={a.resumo} />
                  <input type="hidden" name="baseLegal" value={r?.baseLegal ?? ''} />
                  <label className="text-xs">Secretaria{!sugestao.get(a.id) && ' (escolha)'}
                    <select name="orgaoCod" required defaultValue={sugestao.get(a.id) ?? ''} className="campo block py-1 max-w-[22rem]">
                      <option value="" disabled>—</option>
                      {orgaos.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
                    </select>
                  </label>
                  <label className="text-xs">prazo<input type="date" name="prazo" defaultValue={prazoPadrao} className="campo block py-1" /></label>
                  <button className="btn-sec">Encaminhar à secretaria</button>
                </form>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
