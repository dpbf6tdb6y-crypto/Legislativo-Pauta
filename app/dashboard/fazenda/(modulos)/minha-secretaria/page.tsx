// Tela do usuário de secretaria: só os pontos cobrados da própria secretaria, com o campo de resposta.
// Não mostra sugestões nem apontamentos (material interno de quem audita) nem outras secretarias.
import { exigir, usuarioDaSessao } from '@/lib/financas/auth';
import { brlCurto, pctBp } from '@/lib/financas/dinheiro';
import { fichaSecretaria } from '@/lib/financas/auditoria/dados';
import { ordenarPontos, situacaoPrazo } from '@/lib/financas/auditoria/regras';
import { SeloPonto } from '@/app/dashboard/fazenda/_componentes/CartaoPonto';
import { acaoResponderSecretaria } from './acoes';

const ROT: Record<string, string> = { criado: 'Ponto aberto', resposta: 'Resposta', cobranca: 'Cobrança', status: 'Situação', prazo: 'Prazo' };

export default async function MinhaSecretaria() {
  const { s, db } = await exigir('secretaria_responder', 'Minha secretaria');
  const u = (await usuarioDaSessao(s))!;
  const hoje = new Date();
  const f = u.orgaoCod ? await fichaSecretaria(db, u.orgaoCod, hoje) : null;
  if (!f) return <div className="cartao text-sm">Seu usuário ainda não está ligado a uma secretaria. Fale com o administrador do sistema.</div>;

  const pontos = ordenarPontos(f.pontos, hoje);
  const pendentes = pontos.filter((p) => p.status === 'aberto');
  const atrasados = pendentes.filter((p) => situacaoPrazo(p, hoje) === 'atrasado').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{f.orgao.orgaoNome}</h1>
        <p className="text-sm text-slate-600">
          {pendentes.length
            ? <>Há <b>{pendentes.length}</b> ponto(s) aguardando a sua resposta{atrasados ? <>, <b className="text-red-700">{atrasados} com prazo vencido</b></> : ''}.</>
            : 'Nenhum ponto aguardando a sua resposta.'}
          {' '}As respostas ficam registradas com o seu nome e a data.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {([
          ['Orçamento empenhado', pctBp(f.empenhadoBp), `${pctBp(f.tempoBp)} do ano já passou`],
          ['Saldo da dotação', brlCurto(f.saldo), f.saldo < BigInt(0) ? 'empenhado acima da dotação' : 'disponível para empenhar'],
          ['Liquidado e não pago', brlCurto(f.liquidadoNaoPago), 'entregue, ainda sem pagamento'],
          ['Contratos vencendo', String(f.vencendo.length), 'em até 90 dias'],
        ] as const).map(([r, v, sub]) => (
          <div key={r} className="cartao"><div className="text-xs text-slate-500">{r}</div><div className="text-2xl font-bold">{v}</div><div className="text-xs text-slate-500">{sub}</div></div>
        ))}
      </div>

      {pontos.length === 0 && <div className="cartao text-sm text-slate-500">Nenhum ponto cobrado desta secretaria até agora.</div>}
      {pontos.map((p) => {
        const podeResponder = p.status === 'aberto' || p.status === 'respondido';
        return (
          <div key={p.id} className={`cartao ${situacaoPrazo(p, hoje) === 'atrasado' ? 'border-red-300' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <SeloPonto p={p} hoje={hoje} />
              <b>{p.titulo}</b>
              <span className="text-xs text-slate-500 ml-auto">#{p.id} · aberto em {p.criadoEm.toLocaleDateString('pt-BR')}{p.prazo ? ` · prazo ${p.prazo.toLocaleDateString('pt-BR')}` : ''}</span>
            </div>
            {p.descricao && <p className="text-sm mt-1">{p.descricao}</p>}
            {p.baseLegal && <p className="text-xs text-slate-500">Base legal: {p.baseLegal}</p>}
            <ol className="mt-2 border-l-2 border-slate-200 pl-3 space-y-1">
              {p.eventos.filter((e) => e.tipo !== 'nota').map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-xs text-slate-500">{e.quando.toLocaleString('pt-BR')} · {e.por}</span>
                  <div><b>{ROT[e.tipo] ?? e.tipo}:</b> {e.texto}</div>
                </li>
              ))}
            </ol>
            {podeResponder && (
              <form action={acaoResponderSecretaria} className="mt-3 space-y-2">
                <input type="hidden" name="pontoId" value={p.id} />
                <textarea name="texto" required rows={3} placeholder="Sua resposta: o que foi feito, o que falta e até quando" className="campo w-full" />
                <button className="btn">{p.status === 'respondido' ? 'Complementar resposta' : 'Enviar resposta'}</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
