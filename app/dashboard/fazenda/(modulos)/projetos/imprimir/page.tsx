// Carteira de projetos em folha para imprimir ou salvar em PDF (mesmos filtros da lista).
import { brl, brlCurto } from '@/lib/financas/dinheiro';
import { ROTULO_FASE, ROTULO_SAUDE, TIPOS, type Fase } from '@/lib/financas/projetos/regras';
import { acessoProjetos } from '../acesso';
import BotaoImprimir from '../BotaoImprimir';
import { lerCarteira, type ParamsCarteira } from '../carteira';
import { fmtData } from '../Selos';

export default async function ImprimirCarteira({ searchParams }: { searchParams: ParamsCarteira }) {
  const { db, ator, s } = await acessoProjetos('Projetos (impressão)', { detalhe: `impressão filtros=${JSON.stringify(searchParams)}`, acao: 'exportar' });
  const hoje = new Date();
  const c = await lerCarteira(db, ator, hoje, searchParams);
  const filtros = [searchParams.q && `busca “${searchParams.q}”`, searchParams.fase && `fase ${searchParams.fase === 'abertos' ? 'em aberto' : ROTULO_FASE[searchParams.fase as Fase] ?? searchParams.fase}`, searchParams.saude && `situação ${ROTULO_SAUDE[searchParams.saude as keyof typeof ROTULO_SAUDE] ?? searchParams.saude}`, searchParams.eixo && `eixo ${searchParams.eixo}`, searchParams.bairro && `bairro ${searchParams.bairro}`, searchParams.secretaria && `secretaria ${searchParams.secretaria}`, c.soAlerta && 'só com alertas'].filter(Boolean);
  const volta = `/dashboard/fazenda/projetos?${new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]).toString()}`;

  return (
    <div className="text-sm">
      <style>{'@page { size: A4 landscape; margin: 10mm; } @media print { aside, header, nav { display: none !important; } html, body, div, main { height: auto !important; overflow: visible !important; position: static !important; } body { background: white; } }'}</style>
      <BotaoImprimir voltar={volta} />
      <h1 className="text-xl font-semibold">Carteira de projetos</h1>
      <p className="text-xs text-slate-600 mb-2">
        Emitido em {hoje.toLocaleString('pt-BR')} por {s.nome}{filtros.length ? ` · filtros: ${filtros.join(', ')}` : ' · todos os projetos'}.
        {' '}Valores do portal da transparência, conforme os contratos e ações ligados a cada projeto.
      </p>
      <p className="text-xs text-slate-500">Quadros abaixo: carteira inteira (sem os filtros).</p>
      <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
        {([['Em execução', c.ind.emExecucao], ['Atrasados', c.ind.atrasados], ['Atenção', c.ind.atencao], ['Orçamento ativo', brlCurto(c.ind.orcamentoAtivo)], ['Pago nos projetos', brlCurto(c.gasto.total.pago)], ['Alertas', c.nAlertas], ['Aguardando decisão', c.ind.aguardandoAprovacao], ['Concluídos no ano', c.ind.concluidosNoAno]] as const).map(([r, v]) => (
          <div key={r} className="border border-slate-300 rounded px-2 py-1"><div className="text-slate-500">{r}</div><div className="text-base font-bold">{v}</div></div>
        ))}
      </div>
      <table className="tabela w-full text-xs">
        <thead><tr><th>Projeto</th><th>Fase</th><th>Situação e alertas</th><th>Secretarias</th><th className="n">Avanço</th><th>Prazo</th><th className="n">Orçamento</th><th className="n">Pago</th></tr></thead>
        <tbody>
          {c.filtrados.map((p) => {
            const f = c.gasto.porProjeto.get(p.id);
            const lider = p.secretarias.find((x) => x.papel === 'lider');
            const curto = (n: string) => n.replace(/^SECRETARIA MUNICIPAL DE /i, '');
            return (
              <tr key={p.id} style={{ breakInside: 'avoid' }}>
                <td><b>{p.titulo}</b><div className="text-slate-500">{TIPOS[p.tipo] ?? p.tipo}{p.bairro ? ` · ${p.bairro}` : ''}{p.eixo ? ` · ${p.eixo}` : ''}</div></td>
                <td>{ROTULO_FASE[p.fase as Fase]}</td>
                <td>
                  <b>{p.saude === 'atrasado' ? `atrasado ${p.diasAtraso} d` : ROTULO_SAUDE[p.saude]}</b>
                  {p.motivos.map((m) => <div key={m}>• {m}</div>)}
                  {c.alertasDe(p.id).filter((a) => a.nivel !== 'info').map((a) => <div key={a.codigo} className="text-red-800">⚠ {a.texto}</div>)}
                </td>
                <td>{lider ? curto(lider.orgaoNome) : '—'}{p.secretarias.length > 1 ? <div className="text-slate-500">com {p.secretarias.filter((x) => x.papel !== 'lider').map((x) => curto(x.orgaoNome)).join(', ')}</div> : null}</td>
                <td className="n">{p.avanco === null ? '—' : `${p.avanco}%`}</td>
                <td className="whitespace-nowrap">{fmtData(p.inicioPrevisto)} → {fmtData(p.fimPrevisto)}</td>
                <td className="n" title={p.orcamento !== null ? brl(p.orcamento) : ''}>{p.orcamento !== null ? brlCurto(p.orcamento) : '—'}</td>
                <td className="n">{f && f.contratos.length + f.acoes.length > 0 ? brlCurto(f.execucao.pago) : '—'}</td>
              </tr>
            );
          })}
          {c.filtrados.length === 0 && <tr><td colSpan={8} className="text-slate-500">Nenhum projeto com esses filtros.</td></tr>}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-2">{c.filtrados.length} projeto(s). Situação: atrasado = prazo, etapa ou início vencidos; atenção = ritmo abaixo do calendário, etapa prestes a vencer sem começar ou sem atualização há mais de 30 dias.</p>
    </div>
  );
}
