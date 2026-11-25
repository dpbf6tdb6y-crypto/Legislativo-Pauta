import Link from 'next/link';
import { brl, brlCurto } from '@/lib/financas/dinheiro';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { SEM_VALOR } from '@/lib/financas/projetos/dados';
import { FASES, PRIORIDADES, ROTULO_FASE, ROTULO_SAUDE, TIPOS, type Saude } from '@/lib/financas/projetos/regras';
import { acessoProjetos } from './acesso';
import { lerCarteira, type ParamsCarteira } from './carteira';
import { BarraAvanco, fmtData, SeloAlertas, SeloFase, SeloSaude } from './Selos';

export default async function Projetos({ searchParams }: { searchParams: ParamsCarteira }) {
  const q = (searchParams.q ?? '').trim();
  const { db, ator } = await acessoProjetos('Projetos', { detalhe: `busca="${q}" secretaria="${searchParams.secretaria ?? ''}" fase="${searchParams.fase ?? ''}" situação="${searchParams.saude ?? ''}" eixo="${searchParams.eixo ?? ''}" bairro="${searchParams.bairro ?? ''}"`, acao: q ? 'buscar' : 'ver' });
  const hoje = new Date();
  const [{ orgaos }, c] = await Promise.all([orgaosExecutivo(db, hoje), lerCarteira(db, ator, hoje, searchParams)]);
  const { todos, filtrados, gasto, alertasDe, soAlerta, filtrando, ind, quadro, porEixo, porBairro, nAlertas } = c;
  const imprimir = `/dashboard/fazenda/projetos/imprimir?${new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]).toString()}`;
  const podeCriar = ator.gerir || (ator.secretaria && !!ator.orgaoCod);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Projetos</h1>
          <p className="text-sm text-slate-600">
            {ator.verTodos ? 'Tudo o que as secretarias estão executando, planejando ou já entregaram.' : 'Os projetos em que a sua secretaria participa.'}
            {' '}O prazo e o avanço vêm das etapas que cada secretaria registra.
          </p>
        </div>
        <Link href="/dashboard/fazenda/projetos/cronograma" className="btn-sec">📅 Cronograma</Link>
        <Link href={imprimir} className="btn-sec">🖨 Imprimir / PDF</Link>
        {podeCriar && <Link href="/dashboard/fazenda/projetos/novo" className="btn">+ Novo projeto</Link>}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {([
          ['Em execução', String(ind.emExecucao), 'projetos andando', '', '?fase=execucao'],
          ['Atrasados', String(ind.atrasados), 'prazo ou etapa vencidos', ind.atrasados ? 'text-red-700' : '', '?saude=atrasado'],
          ['Atenção', String(ind.atencao), 'ritmo, prazo curto ou sem notícia', ind.atencao ? 'text-amber-700' : '', '?saude=atencao'],
          ['Aguardando decisão', String(ind.aguardandoAprovacao), 'ideias e estudos', '', '?fase=ideia'],
          ['Concluídos em ' + hoje.getFullYear(), String(ind.concluidosNoAno), 'entregues no ano', '', '?fase=concluido'],
          ['Orçamento ativo', brlCurto(ind.orcamentoAtivo), ind.semOrcamentoAtivo ? `${ind.semOrcamentoAtivo} sem valor informado` : 'aprovados, em execução e pausados', '', ''],
          ['Pago nos projetos', brlCurto(gasto.total.pago), `${gasto.comLigacao} projeto(s) com despesa ligada`, '', ''],
          ['Alertas', String(nAlertas), 'gasto, riscos e metas', nAlertas ? 'text-red-700' : '', '?alerta=1'],
        ] as const).map(([r, n, sub, c, href]) => {
          const corpo = <><div className="text-xs text-slate-500">{r}</div><div className={`text-2xl font-bold ${c}`}>{n}</div><div className="text-xs text-slate-500">{sub}</div></>;
          return href ? <Link key={r} href={href} className="cartao hover:bg-slate-50">{corpo}</Link> : <div key={r} className="cartao">{corpo}</div>;
        })}
      </div>

      <form className="cartao flex flex-wrap items-end gap-3 text-sm">
        {searchParams.eixo && <input type="hidden" name="eixo" value={searchParams.eixo} />}
        {searchParams.bairro && <input type="hidden" name="bairro" value={searchParams.bairro} />}
        {soAlerta && <input type="hidden" name="alerta" value="1" />}
        <label>Buscar<input name="q" defaultValue={q} placeholder="nome, bairro, eixo…" className="campo block mt-1" /></label>
        {ator.verTodos && (
          <label>Secretaria
            <select name="secretaria" defaultValue={searchParams.secretaria ?? ''} className="campo block mt-1 max-w-[16rem]">
              <option value="">todas</option>
              {orgaos.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
            </select>
          </label>
        )}
        <label>Fase
          <select name="fase" defaultValue={searchParams.fase ?? ''} className="campo block mt-1">
            <option value="">todas</option>
            <option value="abertos">em aberto (sem concluídos e cancelados)</option>
            {FASES.map((f) => <option key={f} value={f}>{ROTULO_FASE[f]}</option>)}
          </select>
        </label>
        <label>Situação
          <select name="saude" defaultValue={searchParams.saude ?? ''} className="campo block mt-1">
            <option value="">todas</option>
            {(Object.keys(ROTULO_SAUDE) as Saude[]).map((s) => <option key={s} value={s}>{ROTULO_SAUDE[s]}</option>)}
          </select>
        </label>
        <button className="btn">Filtrar</button>
        {filtrando && <Link href="/dashboard/fazenda/projetos" className="text-xs text-[#0f4c81] hover:underline">limpar</Link>}
      </form>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr><th>Projeto</th><th>Fase</th><th>Situação</th><th>Secretarias</th><th>Avanço</th><th>Início → fim previsto</th><th className="n">Orçamento</th><th className="n">Pago</th><th>Atualizado</th></tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={9} className="text-slate-500 py-4">
                {todos.length === 0 ? 'Nenhum projeto cadastrado ainda.' : 'Nenhum projeto com esses filtros.'}
                {todos.length === 0 && podeCriar && <> <Link href="/dashboard/fazenda/projetos/novo" className="text-[#0f4c81] hover:underline">Cadastrar o primeiro</Link>.</>}
              </td></tr>
            )}
            {filtrados.map((p) => {
              const lider = p.secretarias.find((s) => s.papel === 'lider');
              const parceiras = p.secretarias.filter((s) => s.papel !== 'lider');
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/dashboard/fazenda/projetos/${p.id}`} className="text-[#0f4c81] hover:underline font-medium">{p.titulo}</Link>
                    <div className="text-xs text-slate-500">{TIPOS[p.tipo] ?? p.tipo} · prioridade {PRIORIDADES[p.prioridade]?.toLowerCase()}{p.bairro ? ` · ${p.bairro}` : ''}</div>
                  </td>
                  <td><SeloFase fase={p.fase} /></td>
                  <td>
                    <SeloSaude saude={p.saude} diasAtraso={p.diasAtraso} />
                    {p.motivos[0] && <div className="text-xs text-slate-600 max-w-[16rem]">{p.motivos[0]}{p.motivos.length > 1 ? ` (+${p.motivos.length - 1})` : ''}</div>}
                    {p.fase === 'paralisado' && p.motivoFase && <div className="text-xs text-slate-600 max-w-[16rem]">{p.motivoFase}</div>}
                  </td>
                  <td className="text-xs">
                    <b>{lider?.orgaoNome.replace(/^SECRETARIA MUNICIPAL DE /i, '') ?? '—'}</b>
                    {parceiras.length > 0 && <div className="text-slate-500">com {parceiras.map((s) => s.orgaoNome.replace(/^SECRETARIA MUNICIPAL DE /i, '')).join(', ')}</div>}
                  </td>
                  <td><BarraAvanco pct={p.avanco} saude={p.saude} /></td>
                  <td className="whitespace-nowrap text-xs">{fmtData(p.inicioPrevisto)} → {fmtData(p.fimPrevisto)}</td>
                  <td className="n" title={p.orcamento !== null ? brl(p.orcamento) : ''}>{p.orcamento !== null ? brlCurto(p.orcamento) : <span className="text-slate-400">—</span>}</td>
                  <td className="n">
                    {(() => {
                      const f = gasto.porProjeto.get(p.id);
                      const als = alertasDe(p.id);
                      const tem = !!f && f.contratos.length + f.acoes.length > 0;
                      return (
                        <>
                          {tem ? <span title={`Empenhado ${brl(f!.execucao.empenhado)}`}>{brlCurto(f!.execucao.pago)}{p.orcamento ? <span className="text-xs text-slate-500"> ({Math.round(Number((f!.execucao.pago * 1000n) / p.orcamento) / 10)}%)</span> : null}</span> : <span className="text-slate-400 text-xs">sem ligação</span>}
                          {als.length > 0 && <div><SeloAlertas alertas={als} /></div>}
                        </>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-600">{fmtData(p.atualizadoEm)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-2">
          Situação: <b>atrasado</b> = prazo final, etapa ou início vencidos; <b>atenção</b> = avanço bem abaixo do calendário, etapa a até 7 dias do prazo sem começar, início já passado ou sem atualização há mais de 30 dias.
          Só projetos aprovados ou em execução têm esse semáforo. O avanço conta as etapas concluídas pelo peso de cada uma.
        </p>
      </div>

      {ator.verTodos && quadro.length > 0 && (
        <div className="cartao overflow-x-auto">
          <h2 className="font-semibold mb-2">Por secretaria <span className="text-xs font-normal text-slate-500">· projetos em aberto</span></h2>
          <table className="tabela">
            <thead><tr><th>Secretaria</th><th className="n">Lidera</th><th className="n">Em parceria</th><th className="n">Atrasados</th><th className="n">Atenção</th><th className="n">Orçamento que lidera</th><th></th></tr></thead>
            <tbody>
              {quadro.map((l) => (
                <tr key={l.orgaoCod} className="hover:bg-slate-50">
                  <td>{l.orgaoCod} · {l.orgaoNome}</td>
                  <td className="n">{l.lidera || ''}</td>
                  <td className="n">{l.parceira || ''}</td>
                  <td className={`n ${l.atrasados ? 'text-red-700 font-bold' : ''}`}>{l.atrasados || ''}</td>
                  <td className={`n ${l.atencao ? 'text-amber-700 font-semibold' : ''}`}>{l.atencao || ''}</td>
                  <td className="n">{l.orcamentoLiderado ? brlCurto(l.orcamentoLiderado) : ''}</td>
                  <td className="whitespace-nowrap"><Link href={`/dashboard/fazenda/projetos?secretaria=${l.orgaoCod}&fase=abertos`} className="btn-sec text-xs">Ver projetos</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-2">Um projeto em conjunto conta para todas as secretarias que participam; o orçamento é somado só na líder, para não contar duas vezes.</p>
        </div>
      )}

      {ator.verTodos && (porEixo.length > 1 || porBairro.length > 1) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {([['Por eixo', 'eixo', porEixo, 'Eixo do plano de governo / programa do PPA, como escrito em cada projeto'], ['Por bairro', 'bairro', porBairro, 'Onde o projeto acontece']] as const).map(([titulo, campo, linhas, nota]) => (
            <div key={campo} className="cartao overflow-x-auto">
              <h2 className="font-semibold mb-1">{titulo} <span className="text-xs font-normal text-slate-500">· projetos em aberto</span></h2>
              <table className="tabela">
                <thead><tr><th>{campo === 'eixo' ? 'Eixo' : 'Bairro'}</th><th className="n">Projetos</th><th className="n">Atrasados</th><th className="n">Orçamento</th><th className="n">Pago</th></tr></thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.chave} className="hover:bg-slate-50">
                      <td><Link href={`/dashboard/fazenda/projetos?${campo}=${encodeURIComponent(l.chave === SEM_VALOR ? SEM_VALOR : l.rotulo)}&fase=abertos`} className="text-[#0f4c81] hover:underline">{l.rotulo}</Link></td>
                      <td className="n">{l.projetos}</td>
                      <td className={`n ${l.atrasados ? 'text-red-700 font-bold' : ''}`}>{l.atrasados || ''}</td>
                      <td className="n">{l.orcamento ? brlCurto(l.orcamento) : ''}</td>
                      <td className="n">{l.pago ? brlCurto(l.pago) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500 mt-2">{nota}. Para o mapa de bairros ou a ligação formal com o PPA, o sistema ainda precisa de uma lista oficial de bairros e do PPA cadastrada.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
