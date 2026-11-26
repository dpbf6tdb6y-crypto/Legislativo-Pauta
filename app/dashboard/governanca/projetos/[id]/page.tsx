import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brl } from '@/lib/financas/dinheiro';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { fichaProjeto } from '@/lib/financas/projetos/dados';
import { coordena, ehParteDe, executaEtapa } from '@/lib/financas/projetos/acoes';
import { ATUACOES, bloqueios, criaCiclo, estadoEtapa, impedimentoPorDependencia, projecaoPrazo } from '@/lib/financas/projetos/etapas';
import FormAcao, { Enviar } from '../../../fazenda/(modulos)/documentos/FormAcao';
import { acessoProjetos } from '../../../fazenda/(modulos)/projetos/acesso';
import { acaoAdicionarEtapa, acaoEtapa, acaoParceira } from '../../../fazenda/(modulos)/projetos/acoes';
import { fmtData, SeloFase, SeloSaude } from '../../../fazenda/(modulos)/projetos/Selos';
import { acaoEtapaCooperacao, acaoParticipacao } from '../../acoes';
import { nomesDasSecretarias } from '../../leitura';
import { Cartao, Fluxo, QuemEsperaQuem, SeloEstado } from '../../Pecas';

const oculto = (nome: string, valor: string | number) => <input type="hidden" name={nome} value={valor} />;
const valorEmCampo = (c: bigint | null) => (c === null ? '' : (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

export default async function SecretariasDoProjeto({ params }: { params: { id: string } }) {
  const { db, ator } = await acessoProjetos('Governança · Projeto', { detalhe: `projeto id=${params.id}` });
  const hoje = new Date();
  const p = await fichaProjeto(db, ator, Number(params.id), hoje);
  if (!p) notFound();
  const { orgaos } = await orgaosExecutivo(db, hoje);
  const nomeDe = nomesDasSecretarias([p]);
  const encerrado = p.fase === 'concluido' || p.fase === 'cancelado';
  const mexe = (ator.gerir || ator.secretaria) && !encerrado;
  const gestao = mexe && ator.gerir; // o plano do projeto é só do prefeito, do controlador e do Master
  const aprovado = !['ideia', 'estudo'].includes(p.fase);
  const esperas = bloqueios([p], hoje);
  const projecao = encerrado ? null : projecaoPrazo(p.etapas, p.fimPrevisto, hoje);
  const livres = orgaos.filter((o) => !p.secretarias.some((s) => s.orgaoCod === o.orgaoCod));
  const responsaveis = p.secretarias.filter((s) => s.papel === 'lider' || s.atuacao !== 'apoio');
  const secretarias = [...p.secretarias].sort((a, b) => (a.papel === 'lider' ? -1 : 0) - (b.papel === 'lider' ? -1 : 0));
  const rateio = p.secretarias.reduce((t, s) => t + (s.aporte ?? 0n), 0n);
  const numeros = (ids: number[] | null) => p.etapas.filter((e) => (ids ?? []).includes(e.id)).map((e) => e.ordem).sort((a, b) => a - b).join(', ');

  return (
    <div className="space-y-4">
      <header>
        <Link href="/dashboard/governanca/projetos" className="text-xs text-[#0f4c81] hover:underline">← secretarias e etapas</Link>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <h1 className="text-xl font-semibold mr-2">{p.titulo}</h1>
          <SeloFase fase={p.fase} /><SeloSaude saude={p.saude} diasAtraso={p.diasAtraso} />
          <span className="ml-auto flex flex-wrap gap-2">
            <Link href={`/dashboard/fazenda/projetos/${p.id}`} className="btn-sec">Ficha completa no Compliance</Link>
            <Link href={`/dashboard/fazenda/projetos/${p.id}/imprimir`} className="btn-sec">🖨 Ficha em PDF</Link>
          </span>
        </div>
        <p className="text-sm text-slate-600">Prazo: {fmtData(p.inicioPrevisto)} → {fmtData(p.fimPrevisto)}{p.orcamento !== null ? ` · orçamento ${brl(p.orcamento)}` : ''}</p>
      </header>

      {(esperas.length > 0 || (projecao && projecao.diasAlem > 0)) && (
        <section className="rounded-lg border border-amber-400 bg-amber-50 p-4">
          <h2 className="font-semibold mb-2">Quem está esperando por quem</h2>
          <QuemEsperaQuem lista={esperas} nomeDe={nomeDe} comProjeto={false} />
          {projecao && projecao.diasAlem > 0 && (
            <p className="text-sm mt-2">Pelas etapas, o término mais cedo possível é <b>{fmtData(projecao.termino)}</b>: {projecao.diasAlem} dia(s) depois do prazo do projeto. A estimativa supõe concluir hoje o que está vencido e manter as durações.</p>
          )}
        </section>
      )}

      {p.etapas.some((e) => e.status !== 'cancelada') && (
        <Cartao titulo="Fluxo de execução" nota="da 1ª ordem em diante">
          <Fluxo etapas={p.etapas} hoje={hoje} nomeDe={nomeDe} />
        </Cartao>
      )}

      {mexe && !ator.gerir && (
        <p className="text-sm rounded-md border border-sky-300 bg-sky-50 p-3">
          {coordena(ator, p)
            ? 'Sua secretaria coordena este projeto: você acompanha tudo e altera as próprias etapas, as que estão sem responsável e o próprio contato. O plano do projeto é alterado pelo prefeito ou pelo controlador.'
            : 'Sua secretaria participa deste projeto: você altera as próprias etapas e o próprio contato. O restante é só para consulta.'}
        </p>
      )}

      <Cartao titulo="Etapas, responsáveis e dependências">
        {p.etapas.length === 0 ? <p className="text-sm text-slate-500">Nenhuma etapa ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>#</th><th>Etapa</th><th>Secretaria responsável</th><th>Depende de</th><th>Prazo</th><th>Situação</th>{mexe && <th>Ações</th>}</tr></thead>
              <tbody>
                {p.etapas.map((e) => {
                  const aberta = e.status === 'pendente' || e.status === 'andamento';
                  const presa = impedimentoPorDependencia(p.etapas, e);
                  const candidatas = p.etapas.filter((x) => x.status !== 'cancelada' && !criaCiclo(p.etapas, e.id, [x.id]));
                  const executa = executaEtapa(ator, p, e);
                  return (
                    <tr key={e.id} className={e.status === 'cancelada' ? 'text-slate-400' : ''}>
                      <td>{e.ordem}</td>
                      <td>{e.marco ? '◆ ' : ''}{e.titulo}</td>
                      <td className="text-xs">{nomeDe(e.orgaoCod)}</td>
                      <td className="text-xs">{numeros(e.dependeDe) || 'nenhuma'}</td>
                      <td className="text-xs whitespace-nowrap">{e.marco ? fmtData(e.fimPrevisto) : `${fmtData(e.inicioPrevisto)} → ${fmtData(e.fimPrevisto)}`}</td>
                      <td><SeloEstado estado={estadoEtapa(p.etapas, e, hoje)} /></td>
                      {mexe && (
                        <td>
                          <div className="flex flex-wrap items-start gap-1">
                            {executa && aberta && !presa && e.status === 'pendente' && (
                              <FormAcao acao={acaoEtapa}>{oculto('id', p.id)}{oculto('etapaId', e.id)}{oculto('acao', 'iniciar')}<Enviar className="btn-sec text-xs">Iniciar</Enviar></FormAcao>
                            )}
                            {executa && aberta && !presa && (
                              <FormAcao acao={acaoEtapa}>{oculto('id', p.id)}{oculto('etapaId', e.id)}{oculto('acao', 'concluir')}<Enviar className="btn text-xs">Concluir</Enviar></FormAcao>
                            )}
                            {aberta && presa && <span className="text-xs text-amber-800 max-w-[220px]">{presa}</span>}
                            {!executa && aberta && !presa && <span className="text-xs text-slate-500 max-w-[220px]">Só a secretaria responsável inicia ou conclui.</span>}
                            {gestao && e.status !== 'cancelada' && (
                              <details>
                                <summary className="btn-sec text-xs cursor-pointer list-none">Responsável e dependências</summary>
                                <FormAcao acao={acaoEtapaCooperacao} className="mt-2 w-72 space-y-2 text-xs">
                                  {oculto('id', p.id)}{oculto('etapaId', e.id)}
                                  <label className="block">Secretaria responsável
                                    <select name="orgaoCod" defaultValue={e.orgaoCod} className="campo block w-full mt-1">
                                      <option value="">não definida</option>
                                      {responsaveis.map((s) => <option key={s.orgaoCod} value={s.orgaoCod}>{s.orgaoNome}</option>)}
                                    </select>
                                  </label>
                                  <fieldset>
                                    <legend>Depende de (precisa terminar antes)</legend>
                                    {candidatas.length === 0 && <p className="text-slate-500">Nenhuma etapa pode ser escolhida sem criar um ciclo.</p>}
                                    {candidatas.map((x) => (
                                      <label key={x.id} className="flex gap-2 items-start mt-1">
                                        <input type="checkbox" name="dependeDe" value={x.id} defaultChecked={(e.dependeDe ?? []).includes(x.id)} />
                                        <span>{x.ordem}. {x.titulo}</span>
                                      </label>
                                    ))}
                                  </fieldset>
                                  <Enviar className="btn text-xs">Salvar</Enviar>
                                </FormAcao>
                              </details>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {gestao && (
          <details className="mt-3">
            <summary className="text-xs text-[#0f4c81] cursor-pointer">+ incluir etapa ou marco</summary>
            <FormAcao acao={acaoAdicionarEtapa} className="grid gap-2 sm:grid-cols-2 mt-2 text-sm max-w-2xl">
              {oculto('id', p.id)}
              <label className="sm:col-span-2">Nome<input name="titulo" required maxLength={200} className="campo w-full mt-1" /></label>
              <label>Início<input type="date" name="inicioPrevisto" className="campo w-full mt-1" /></label>
              <label>Prazo{aprovado ? ' (obrigatório)' : ''}<input type="date" name="fimPrevisto" required={aprovado} className="campo w-full mt-1" /></label>
              <label>Peso no avanço (1 a 100)<input type="number" name="peso" min={1} max={100} defaultValue={1} className="campo w-full mt-1" /></label>
              <label className="flex items-center gap-2 mt-6"><input type="checkbox" name="marco" /> é um marco</label>
              <div className="sm:col-span-2"><Enviar className="btn-sec">Incluir</Enviar></div>
            </FormAcao>
          </details>
        )}
        <p className="text-xs text-slate-500 mt-3">Para mudar prazo, cancelar ou reabrir uma etapa, use a ficha completa no Compliance. As dependências não alteram o avanço nem a regra de atraso do projeto.</p>
      </Cartao>

      <Cartao titulo="Secretarias envolvidas e responsabilidades" nota="somente uma coordena">
        <ul className="grid gap-3 md:grid-cols-2">
          {secretarias.map((s) => {
            const lider = s.papel === 'lider';
            const quantas = p.etapas.filter((e) => e.orgaoCod === s.orgaoCod && e.status !== 'cancelada').length;
            return (
              <li key={s.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{s.orgaoNome}</b>
                  <span className={`selo ${lider ? 'bg-sky-100 text-sky-900' : 'bg-slate-100 text-slate-700'}`}>{lider ? 'Coordenadora' : ATUACOES[s.atuacao] ?? 'papel não informado'}</span>
                  <span className="text-xs text-slate-500 ml-auto">{quantas} etapa(s)</span>
                </div>
                <p className="mt-1">{s.atribuicao || <span className="text-slate-500">{lider ? 'Responde pelo resultado do projeto.' : 'Ainda não foi informado o que deve fazer.'}</span>}</p>
                <p className="text-xs text-slate-600 mt-1">Contato: {s.responsavel || 'não definido'}{s.aporte !== null ? ` · aporte ${brl(s.aporte)}` : ''}</p>
                {mexe && ehParteDe(ator, s.orgaoCod) && (
                  <details className="mt-2">
                    <summary className="text-xs text-[#0f4c81] cursor-pointer">{gestao ? 'editar responsabilidade e contato' : 'editar meu contato'}</summary>
                    {gestao && (
                    <FormAcao acao={acaoParticipacao} className="mt-2 space-y-2 text-xs">
                      {oculto('id', p.id)}{oculto('orgaoCod', s.orgaoCod)}
                      {!lider && (
                        <label className="block">Papel
                          <select name="atuacao" defaultValue={s.atuacao} className="campo block w-full mt-1">
                            <option value="">não informado</option>
                            {Object.entries(ATUACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </label>
                      )}
                      <label className="block">O que deve fazer<textarea name="atribuicao" rows={2} maxLength={500} defaultValue={s.atribuicao} className="campo w-full mt-1" /></label>
                      {!lider && ator.gerir && (
                        <label className="block">Aporte desta secretaria (opcional; não muda o orçamento)<input name="aporte" inputMode="decimal" defaultValue={valorEmCampo(s.aporte)} placeholder="1.500.000,00" className="campo w-full mt-1" /></label>
                      )}
                      <Enviar className="btn text-xs">Salvar</Enviar>
                    </FormAcao>
                    )}
                    {ehParteDe(ator, s.orgaoCod) && (
                    <FormAcao acao={acaoParceira} className="flex gap-1 mt-2">
                      {oculto('id', p.id)}{oculto('orgaoCod', s.orgaoCod)}{oculto('acao', 'responsavel')}
                      <input name="responsavel" defaultValue={s.responsavel} maxLength={120} aria-label={`Contato em ${s.orgaoNome}`} placeholder="Contato (nome e cargo)" className="campo text-xs flex-1 min-w-0" />
                      <Enviar className="btn-sec text-xs">Salvar contato</Enviar>
                    </FormAcao>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {rateio > 0n && <p className="text-xs text-slate-600 mt-2">Rateio informado: {brl(rateio)}. O orçamento do projeto é contado uma única vez.</p>}
        {gestao && livres.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-[#0f4c81] cursor-pointer">+ incluir secretaria</summary>
            <FormAcao acao={acaoParceira} className="flex flex-wrap gap-2 mt-2 text-sm">
              {oculto('id', p.id)}{oculto('acao', 'adicionar')}
              <select name="orgaoCod" required defaultValue="" aria-label="Secretaria" className="campo">
                <option value="" disabled>escolha a secretaria</option>
                {livres.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
              </select>
              <input name="responsavel" maxLength={120} placeholder="Contato (opcional)" className="campo" />
              <Enviar className="btn-sec">Incluir</Enviar>
            </FormAcao>
          </details>
        )}
        {ator.gerir && <p className="text-xs text-slate-500 mt-2">Para retirar uma secretaria, use a ficha completa no Compliance. Quem tem etapa em aberto precisa passá-la a outra antes de sair.</p>}
      </Cartao>
    </div>
  );
}
