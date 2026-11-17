// Cartão de um ponto de auditoria: situação, histórico e as ações (responder, cobrar, encerrar).
// Usado na ficha da secretaria e no modo reunião.
import type { EventoAuditoria, PontoAuditoria } from '@prisma/client';
import { diasDeAtraso, situacaoPrazo } from '@/lib/financas/auditoria/regras';
import { acaoEvento, acaoStatus } from '@/app/dashboard/fazenda/(modulos)/auditoria/acoes';

const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
const ROT_EVENTO: Record<string, string> = { criado: 'Ponto aberto', resposta: 'Resposta da secretaria', cobranca: 'Cobrança', status: 'Situação', prazo: 'Prazo', nota: 'Nota' };

export function SeloPonto({ p, hoje, grande }: { p: { status: string; prazo: Date | null }; hoje: Date; grande?: boolean }) {
  const s = situacaoPrazo(p, hoje);
  const [cls, txt] =
    p.status === 'resolvido' ? ['bg-emerald-100 text-emerald-900', 'resolvido']
    : p.status === 'cancelado' ? ['bg-slate-200 text-slate-700', 'cancelado']
    : p.status === 'respondido' ? ['bg-sky-100 text-sky-900', 'respondido · validar']
    : s === 'atrasado' ? ['bg-red-600 text-white', `atrasado há ${diasDeAtraso(p.prazo, hoje)} dia(s)`]
    : s === 'vence_em_breve' ? ['bg-amber-100 text-amber-900', `vence ${fmt(p.prazo!)}`]
    : s === 'no_prazo' ? ['bg-slate-100 text-slate-700', `prazo ${fmt(p.prazo!)}`]
    : ['bg-slate-100 text-slate-700', 'sem prazo'];
  return <span className={`inline-block rounded font-semibold ${grande ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-xs'} ${cls}`}>{txt}</span>;
}

export default function CartaoPonto({ p, hoje, podeGerir, grande, desde }: {
  p: PontoAuditoria & { eventos: EventoAuditoria[] }; hoje: Date; podeGerir: boolean; grande?: boolean; desde?: Date | null;
}) {
  const aberto = p.status === 'aberto' || p.status === 'respondido';
  const ultimaResposta = [...p.eventos].reverse().find((e) => e.tipo === 'resposta');
  const atrasado = situacaoPrazo(p, hoje) === 'atrasado';
  return (
    <div className={`rounded-lg border bg-white ${atrasado ? 'border-red-300' : 'border-slate-200'} ${grande ? 'p-5' : 'p-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeloPonto p={p} hoje={hoje} grande={grande} />
        <b className={grande ? 'text-xl' : ''}>{p.titulo}</b>
        <span className="text-xs text-slate-500 ml-auto">#{p.id} · aberto em {fmt(p.criadoEm)} por {p.criadoPor}</span>
      </div>
      {p.descricao && <p className={`mt-1 ${grande ? 'text-lg' : 'text-sm'}`}>{p.descricao}</p>}
      {p.baseLegal && <p className="text-xs text-slate-500 mt-0.5">Base legal: {p.baseLegal}</p>}
      {grande && ultimaResposta && (
        <p className="mt-2 text-base bg-sky-50 border border-sky-200 rounded p-2">
          <b>Última resposta{ultimaResposta.emNomeDe ? ` (${ultimaResposta.emNomeDe})` : ''}, {fmt(ultimaResposta.quando)}:</b> {ultimaResposta.texto}
        </p>
      )}

      <details className="mt-2" open={!grande && p.eventos.length <= 4}>
        <summary className="text-xs text-emerald-700 cursor-pointer">Histórico ({p.eventos.length})</summary>
        <ol className="mt-1 border-l-2 border-slate-200 pl-3 space-y-1">
          {p.eventos.map((e) => (
            <li key={e.id} className={`text-sm ${desde && e.quando > desde ? 'bg-yellow-50' : ''}`}>
              <span className="text-xs text-slate-500">{e.quando.toLocaleString('pt-BR')} · {e.por}{e.emNomeDe ? ` (pela secretaria: ${e.emNomeDe})` : ''}</span>
              <div><b>{ROT_EVENTO[e.tipo] ?? e.tipo}:</b> {e.texto}</div>
            </li>
          ))}
        </ol>
      </details>

      {podeGerir && aberto && (
        <div className="flex flex-wrap gap-2 mt-3">
          <details className="group">
            <summary className="btn-sec cursor-pointer list-none">Registrar resposta</summary>
            <form action={acaoEvento} className="mt-2 space-y-2 w-[min(32rem,85vw)]">
              <input type="hidden" name="pontoId" value={p.id} /><input type="hidden" name="orgaoCod" value={p.orgaoCod} /><input type="hidden" name="tipo" value="resposta" />
              <textarea name="texto" required rows={3} placeholder="O que a secretaria respondeu" className="campo w-full" />
              <input name="emNomeDe" placeholder="Quem respondeu (nome e cargo)" className="campo w-full" />
              <button className="btn">Salvar resposta</button>
            </form>
          </details>
          <details>
            <summary className="btn-sec cursor-pointer list-none">Cobrar</summary>
            <form action={acaoEvento} className="mt-2 space-y-2 w-[min(32rem,85vw)]">
              <input type="hidden" name="pontoId" value={p.id} /><input type="hidden" name="orgaoCod" value={p.orgaoCod} /><input type="hidden" name="tipo" value="cobranca" />
              <textarea name="texto" rows={2} placeholder="O que foi cobrado (opcional)" className="campo w-full" />
              <label className="text-xs block">Novo prazo (opcional)<input type="date" name="novoPrazo" className="campo block" /></label>
              <button className="btn">Registrar cobrança</button>
              {p.status === 'respondido' && <p className="text-xs text-slate-500">Cobrar de novo volta o ponto para &quot;aguardando a secretaria&quot;.</p>}
            </form>
          </details>
          <details>
            <summary className="btn-sec cursor-pointer list-none">Encerrar</summary>
            <form action={acaoStatus} className="mt-2 space-y-2 w-[min(32rem,85vw)]">
              <input type="hidden" name="pontoId" value={p.id} /><input type="hidden" name="orgaoCod" value={p.orgaoCod} />
              <textarea name="motivo" required rows={2} placeholder="O que comprovou a solução (ou por que cancelar)" className="campo w-full" />
              <div className="flex gap-2">
                <button name="status" value="resolvido" className="btn">Resolvido</button>
                <button name="status" value="cancelado" className="btn-sec">Cancelar ponto</button>
              </div>
            </form>
          </details>
        </div>
      )}
      {podeGerir && !aberto && (
        <form action={acaoStatus} className="mt-2">
          <input type="hidden" name="pontoId" value={p.id} /><input type="hidden" name="orgaoCod" value={p.orgaoCod} />
          <button name="status" value="aberto" className="text-xs text-emerald-700 hover:underline">reabrir</button>
        </form>
      )}
    </div>
  );
}
