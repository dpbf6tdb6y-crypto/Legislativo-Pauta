// Modo reunião: tela limpa, letra grande, uma secretaria por vez (para projetar na reunião).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigir } from '@/lib/financas/auth';
import { brlCurto, pctBp } from '@/lib/financas/dinheiro';
import { pode } from '@/lib/financas/perfis';
import { fichaSecretaria, visaoGeral } from '@/lib/financas/auditoria/dados';
import { mudancasDesde, ordenarPontos } from '@/lib/financas/auditoria/regras';
import CartaoPonto from '@/app/dashboard/fazenda/_componentes/CartaoPonto';
import { acaoCriarPonto, acaoReuniao } from '@/app/dashboard/fazenda/(modulos)/auditoria/acoes';

export const dynamic = 'force-dynamic';
const ROT: Record<string, string> = { criado: 'novo ponto', resposta: 'respondeu', cobranca: 'cobrado', status: 'mudou a situação', prazo: 'mudou o prazo', nota: 'nota' };

export default async function Reuniao({ params }: { params: { orgao: string } }) {
  const { s, db } = await exigir('auditoria', 'Modo reunião', { detalhe: `secretaria ${params.orgao}` });
  const hoje = new Date();
  const [f, v] = await Promise.all([fichaSecretaria(db, params.orgao, hoje), visaoGeral(db, hoje)]);
  if (!f) notFound();
  const gerir = pode(s.perfil, 'auditoria_gerir');

  // mesma ordem da lista: quem tem atraso e mais pendências primeiro
  const ordem = [...v.linhas].sort((a, b) => b.pontos.atrasados - a.pontos.atrasados || b.pontos.abertos + b.pontos.respondidos - (a.pontos.abertos + a.pontos.respondidos) || a.orgaoCod.localeCompare(b.orgaoCod));
  const i = ordem.findIndex((l) => l.orgaoCod === f.orgao.orgaoCod);
  const ant = ordem[i - 1], prox = ordem[i + 1];

  const ativos = ordenarPontos(f.pontos.filter((p) => p.status === 'aberto' || p.status === 'respondido'), hoje);
  const eventos = mudancasDesde(f.pontos.flatMap((p) => p.eventos.map((e) => ({ ...e, titulo: p.titulo }))), f.ultimaReuniao);
  const prazoPadrao = new Date(hoje.getTime() + 15 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-emerald-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
          <b>Reunião com as secretarias</b>
          <span className="opacity-80">{i + 1} de {ordem.length}</span>
          <span className="ml-auto flex gap-2">
            {ant && <Link href={`/dashboard/fazenda/reuniao/${ant.orgaoCod}`} className="rounded bg-white/15 px-3 py-1 hover:bg-white/25">← {ant.orgaoCod}</Link>}
            {prox && <Link href={`/dashboard/fazenda/reuniao/${prox.orgaoCod}`} className="rounded bg-white/15 px-3 py-1 hover:bg-white/25">{prox.orgaoCod} →</Link>}
            <Link href={`/dashboard/fazenda/auditoria/${f.orgao.orgaoCod}`} className="rounded bg-white px-3 py-1 text-emerald-700 font-semibold">Sair</Link>
          </span>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header>
          <h1 className="text-3xl font-bold">{f.orgao.orgaoNome}</h1>
          <p className="text-lg text-slate-600">
            {f.responsavel ? `${f.responsavel.nome}${f.responsavel.cargo ? ` · ${f.responsavel.cargo}` : ''}` : 'Responsável não definido'}
            {' · '}{f.ultimaReuniao ? `última reunião em ${f.ultimaReuniao.toLocaleDateString('pt-BR')}` : 'primeira reunião registrada'}
          </p>
        </header>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {([
            ['Atrasados', String(f.resumo.atrasados), f.resumo.atrasados ? 'text-red-700' : 'text-slate-900'],
            ['Aguardando resposta', String(f.resumo.abertos), 'text-slate-900'],
            ['Respondidos para validar', String(f.resumo.respondidos), 'text-sky-800'],
            ['Orçamento empenhado', pctBp(f.empenhadoBp), f.saldo < BigInt(0) ? 'text-red-700' : 'text-slate-900'],
          ] as const).map(([r, n, c]) => (
            <div key={r} className="rounded-lg bg-white border border-slate-200 p-4">
              <div className="text-sm text-slate-500">{r}</div>
              <div className={`text-5xl font-bold ${c}`}>{n}</div>
            </div>
          ))}
        </div>
        <p className="text-base text-slate-600 -mt-3">
          Saldo da dotação {brlCurto(f.saldo)} · liquidado e não pago {brlCurto(f.liquidadoNaoPago)} · {f.vencendo.length} contrato(s) vencendo em 90 dias · {pctBp(f.tempoBp)} do ano já passou
        </p>

        <section>
          <h2 className="text-xl font-semibold mb-2">{f.ultimaReuniao ? `O que mudou desde ${f.ultimaReuniao.toLocaleDateString('pt-BR')}` : 'Histórico'}</h2>
          {eventos.length === 0 ? <p className="text-lg text-slate-500">Nada registrado{f.ultimaReuniao ? ' desde a última reunião' : ''}.</p> : (
            <ul className="space-y-1 text-lg">
              {eventos.slice(-12).map((e) => (
                <li key={e.id}><span className="text-slate-500 text-base">{e.quando.toLocaleDateString('pt-BR')}</span> · <b>{e.titulo}</b>: {ROT[e.tipo] ?? e.tipo}{e.texto && e.tipo !== 'criado' ? ` — ${e.texto}` : ''}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pontos em aberto ({ativos.length})</h2>
          {ativos.length === 0 && <p className="text-lg text-slate-500">Nenhum ponto em aberto com esta secretaria.</p>}
          {ativos.map((p) => <CartaoPonto key={p.id} p={p} hoje={hoje} podeGerir={gerir} grande desde={f.ultimaReuniao} />)}
        </section>

        {gerir && (
          <section className="rounded-lg bg-white border border-slate-200 p-4">
            <h2 className="text-lg font-semibold mb-2">Nova cobrança nesta reunião</h2>
            <form action={acaoCriarPonto} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="orgaoCod" value={f.orgao.orgaoCod} />
              <input type="hidden" name="volta" value={`/dashboard/fazenda/reuniao/${f.orgao.orgaoCod}`} />
              <input name="titulo" required placeholder="O que está sendo cobrado" className="campo flex-1 min-w-[16rem] text-base" />
              <label className="text-xs">prazo<input type="date" name="prazo" defaultValue={prazoPadrao} className="campo block text-base" /></label>
              <button className="btn text-base">Cobrar</button>
            </form>
            {f.sugestoes.length > 0 && <p className="text-sm text-slate-500 mt-2">Há {f.sugestoes.length} assunto(s) sugerido(s) pelos dados na <Link href={`/dashboard/fazenda/auditoria/${f.orgao.orgaoCod}`} className="text-emerald-700 hover:underline">ficha da secretaria</Link>.</p>}
          </section>
        )}

        {gerir && (
          <section className="rounded-lg bg-white border-2 border-emerald-600 p-4">
            <h2 className="text-lg font-semibold mb-2">Encerrar a reunião com esta secretaria</h2>
            <form action={acaoReuniao} className="space-y-2">
              <input type="hidden" name="orgaoCod" value={f.orgao.orgaoCod} />
              <input type="hidden" name="proxima" value={prox ? `/dashboard/fazenda/reuniao/${prox.orgaoCod}` : '/dashboard/fazenda/auditoria'} />
              <input name="participantes" placeholder="Participantes" className="campo w-full text-base" />
              <textarea name="notas" rows={2} placeholder="Combinados" className="campo w-full text-base" />
              <button className="btn text-base">Registrar reunião{prox ? ' e ir para a próxima' : ' e terminar'}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
