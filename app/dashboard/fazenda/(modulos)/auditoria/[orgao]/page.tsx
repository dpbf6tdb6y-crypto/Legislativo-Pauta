import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pctBp } from '@/lib/financas/dinheiro';
import { pode } from '@/lib/financas/perfis';
import { fichaSecretaria } from '@/lib/financas/auditoria/dados';
import { ordenarPontos } from '@/lib/financas/auditoria/regras';
import CartaoPonto from '@/app/dashboard/fazenda/_componentes/CartaoPonto';
import { acaoCriarPonto, acaoReuniao, acaoResponsavel } from '../acoes';

export default async function FichaSecretaria({ params, searchParams }: { params: { orgao: string }; searchParams: { ver?: string } }) {
  const { s, db } = await exigir('auditoria', 'Auditoria por secretaria', { detalhe: `secretaria ${params.orgao}` });
  const hoje = new Date();
  const f = await fichaSecretaria(db, params.orgao, hoje);
  if (!f) notFound();
  const gerir = pode(s.perfil, 'auditoria_gerir');
  const verEncerrados = searchParams.ver === 'todos';
  const pontos = ordenarPontos(f.pontos.filter((p) => verEncerrados || p.status === 'aberto' || p.status === 'respondido'), hoje);
  const encerrados = f.pontos.length - f.pontos.filter((p) => p.status === 'aberto' || p.status === 'respondido').length;
  const prazoPadrao = new Date(hoje.getTime() + 15 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link href="/dashboard/fazenda/auditoria" className="text-xs text-emerald-700 hover:underline">← todas as secretarias</Link>
          <h1 className="text-lg font-semibold">{f.orgao.orgaoCod} · {f.orgao.orgaoNome}</h1>
          <p className="text-sm text-slate-600">
            Responsável: <b>{f.responsavel ? `${f.responsavel.nome}${f.responsavel.cargo ? ` (${f.responsavel.cargo})` : ''}` : 'não definido'}</b>
            {' · '}última reunião: {f.ultimaReuniao ? f.ultimaReuniao.toLocaleDateString('pt-BR') : 'nenhuma registrada'}
          </p>
        </div>
        <Link href={`/dashboard/fazenda/reuniao/${f.orgao.orgaoCod}`} className="btn">▶ Modo reunião</Link>
      </div>

      {/* números da secretaria */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {([
          ['Empenhado', pctBp(f.empenhadoBp), `${brlCurto(f.orgao.empenhado)} de ${brlCurto(f.orgao.dotAtual)} · ano: ${pctBp(f.tempoBp)}`, ''],
          ['Saldo da dotação', brlCurto(f.saldo), f.saldo < BigInt(0) ? 'empenhado acima da dotação' : 'disponível para empenhar', f.saldo < BigInt(0) ? 'text-red-700' : ''],
          ['Liquidado e não pago', brlCurto(f.liquidadoNaoPago), 'entregue, ainda sem pagamento (ano)', ''],
          ['Restos a pagar pendentes', brlCurto(f.rpPendente), `de anos anteriores, no exercício ${f.ano}`, ''],
          ['Contratos vencendo', String(f.vencendo.length), `em até 90 dias (de ${f.contratosVinculados} ligados com certeza alta)`, f.vencendo.length ? 'text-amber-700' : ''],
        ] as const).map(([r, v, sub, c]) => (
          <div key={r} className="cartao" title={r}><div className="text-xs text-slate-500">{r}</div><div className={`text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-slate-500">{sub}</div></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold mr-auto">Pontos cobrados ({f.resumo.abertos} aguardando, {f.resumo.atrasados} atrasado(s), {f.resumo.respondidos} para validar)</h2>
            {encerrados > 0 && <Link href={verEncerrados ? '?' : '?ver=todos'} className="text-xs text-emerald-700 hover:underline">{verEncerrados ? 'esconder encerrados' : `mostrar ${encerrados} encerrado(s)`}</Link>}
          </div>
          {pontos.length === 0 && <div className="cartao text-sm text-slate-500">Nenhum ponto em aberto com esta secretaria.</div>}
          {pontos.map((p) => <CartaoPonto key={p.id} p={p} hoje={hoje} podeGerir={gerir} desde={f.ultimaReuniao} />)}
        </div>

        <div className="space-y-4">
          {/* sugestões: fatos objetivos que podem virar cobrança */}
          <section className="cartao">
            <h2 className="font-semibold">Assuntos para cobrar</h2>
            <p className="text-xs text-slate-500 mb-2">Fatos encontrados nos dados desta secretaria (contratos: os que vencem em até 30 dias). Viram cobrança só se alguém decidir.</p>
            {f.sugestoes.length === 0 && <p className="text-sm text-slate-500">Nada novo encontrado.</p>}
            <ul className="space-y-2">
              {f.sugestoes.slice(0, 15).map((sg) => (
                <li key={sg.ref} className="border-t border-slate-100 pt-2 text-sm">
                  <b>{sg.titulo}</b>
                  <p className="text-xs text-slate-600">{sg.descricao}</p>
                  {gerir && (
                    <form action={acaoCriarPonto} className="flex flex-wrap items-end gap-2 mt-1">
                      {(['titulo', 'descricao', 'baseLegal'] as const).map((k) => <input key={k} type="hidden" name={k} value={k === 'titulo' ? sg.titulo : k === 'descricao' ? sg.descricao : sg.baseLegal} />)}
                      <input type="hidden" name="orgaoCod" value={f.orgao.orgaoCod} /><input type="hidden" name="origemRef" value={sg.ref} />
                      <label className="text-xs">prazo<input type="date" name="prazo" defaultValue={prazoPadrao} className="campo block py-1" /></label>
                      <button className="btn-sec">Cobrar</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {f.sugestoes.length > 15 && <p className="text-xs text-slate-500 mt-1">… e mais {f.sugestoes.length - 15}.</p>}
          </section>

          {gerir && (
            <section className="cartao">
              <h2 className="font-semibold mb-2">Novo ponto de cobrança</h2>
              <form action={acaoCriarPonto} className="space-y-2 text-sm">
                <input type="hidden" name="orgaoCod" value={f.orgao.orgaoCod} />
                <input name="titulo" required placeholder="O que está sendo cobrado" className="campo w-full" />
                <textarea name="descricao" rows={3} placeholder="Detalhes" className="campo w-full" />
                <input name="baseLegal" placeholder="Base legal (se houver)" className="campo w-full" />
                <label className="text-xs block">Prazo para a secretaria responder<input type="date" name="prazo" defaultValue={prazoPadrao} className="campo block" /></label>
                <button className="btn">Abrir ponto</button>
              </form>
            </section>
          )}

          {gerir && (
            <section className="cartao">
              <h2 className="font-semibold mb-2">Responsável pela secretaria</h2>
              <form action={acaoResponsavel} className="space-y-2 text-sm">
                <input type="hidden" name="orgaoCod" value={f.orgao.orgaoCod} />
                <input name="nome" required defaultValue={f.responsavel?.nome ?? ''} placeholder="Nome" className="campo w-full" />
                <input name="cargo" defaultValue={f.responsavel?.cargo ?? ''} placeholder="Cargo (ex.: Secretário municipal)" className="campo w-full" />
                <button className="btn-sec">Salvar</button>
              </form>
            </section>
          )}

          <section className="cartao">
            <h2 className="font-semibold mb-2">Reuniões</h2>
            {f.reunioes.length === 0 && <p className="text-sm text-slate-500">Nenhuma registrada.</p>}
            <ul className="space-y-2 text-sm">
              {f.reunioes.map((r) => (
                <li key={r.id} className="border-t border-slate-100 pt-1">
                  <b>{r.quando.toLocaleString('pt-BR')}</b> · registrada por {r.registradoPor}
                  {r.participantes && <div className="text-xs text-slate-600">Participantes: {r.participantes}</div>}
                  {r.notas && <div className="text-xs whitespace-pre-wrap">{r.notas}</div>}
                </li>
              ))}
            </ul>
            {gerir && (
              <details className="mt-2">
                <summary className="text-xs text-emerald-700 cursor-pointer">registrar reunião</summary>
                <form action={acaoReuniao} className="space-y-2 mt-2 text-sm">
                  <input type="hidden" name="orgaoCod" value={f.orgao.orgaoCod} />
                  <input name="participantes" placeholder="Participantes" className="campo w-full" />
                  <textarea name="notas" rows={3} placeholder="Combinados da reunião" className="campo w-full" />
                  <button className="btn-sec">Registrar</button>
                </form>
              </details>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Contratos e apontamentos são ligados à secretaria pelo órgão dos empenhos (o portal não informa o órgão do contrato). Valores: {f.ano}, {brl(f.orgao.dotAtual)} de dotação atualizada.
          </p>
        </div>
      </div>
    </div>
  );
}
