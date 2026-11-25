import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brl } from '@/lib/financas/dinheiro';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { fichaProjeto } from '@/lib/financas/projetos/dados';
import { diasEntre, FONTES, PRIORIDADES, ROTULO_ETAPA, ROTULO_FASE, TIPOS, transicoesPermitidas, type Fase, type StatusEtapa } from '@/lib/financas/projetos/regras';
import FormAcao, { Enviar } from '../../documentos/FormAcao';
import { acessoProjetos } from '../acesso';
import { acaoAdicionarEtapa, acaoAtualizacao, acaoEditarProjeto, acaoEtapa, acaoMudarFase, acaoParceira } from '../acoes';
import CamposProjeto from '../CamposProjeto';
import Dinheiro from '../Dinheiro';
import { candidatosVinculo, carregarFinanceiro } from '@/lib/financas/projetos/vinculos';
import { acompanhamento, juntarAlertas } from '@/lib/financas/projetos/dados';
import { alertasRisco } from '@/lib/financas/projetos/riscos';
import { alertasResultado } from '@/lib/financas/projetos/indicadores';
import Riscos from '../Riscos';
import Resultados from '../Resultados';
import { BarraAvanco, fmtData, QuadroAlertas, SeloFase, SeloSaude } from '../Selos';

const ROT_EVENTO: Record<string, string> = { criado: 'Cadastro', fase: 'Fase', etapa: 'Etapa', prazo: 'Prazo', dados: 'Dados', atualizacao: 'Andamento', parceria: 'Secretarias', vinculo: 'Despesa', risco: 'Risco', resultado: 'Resultado' };
const ROT_PASSO: Record<string, [string, boolean]> = {
  ideia: ['Voltar para ideia', false], estudo: ['Passar para estudo', false], aprovado: ['Aprovar projeto', true], execucao: ['Iniciar / retomar execução', true],
  paralisado: ['Paralisar', false], concluido: ['Concluir projeto', true], cancelado: ['Cancelar projeto', false],
};
const cod = (id: number) => <input type="hidden" name="id" value={id} />;

export default async function FichaProjeto({ params }: { params: { id: string } }) {
  const { db, ator, verContratos } = await acessoProjetos('Projeto', { detalhe: `projeto id=${params.id}` });
  const hoje = new Date();
  const p = await fichaProjeto(db, ator, Number(params.id), hoje);
  if (!p) notFound();
  const { orgaos } = await orgaosExecutivo(db, hoje);
  const lider = p.secretarias.find((s) => s.papel === 'lider');
  const encerrado = p.fase === 'concluido' || p.fase === 'cancelado';
  const mexe = (ator.gerir || ator.secretaria) && !encerrado;
  const { porProjeto } = await carregarFinanceiro(db, ator, [{ id: p.id, fase: p.fase, orcamento: p.orcamento, inicioPrevisto: p.inicioPrevisto, fimPrevisto: p.fimPrevisto, inicioReal: p.inicioReal, avanco: p.avanco }], hoje);
  const fin = porProjeto.get(p.id)!;
  // a lista do que se pode ligar é pesada: só busca para quem vai ligar
  const cand = mexe ? await candidatosVinculo(db, p.secretarias.map((s) => s.orgaoCod), hoje) : null;
  const ac = await acompanhamento(db, [p.id]);
  const riscos = ac.riscosDe(p.id), indicadores = ac.indicadoresDe(p.id);
  const alertas = juntarAlertas(fin.alertas, alertasRisco(riscos, hoje), alertasResultado(p.fase, indicadores, hoje));
  const mexeResultado = (ator.gerir || ator.secretaria) && p.fase !== 'cancelado'; // o resultado se mede também depois de concluído
  const passos = mexe ? transicoesPermitidas(p.fase, ator.aprovar) : [];
  const aprovado = !['ideia', 'estudo'].includes(p.fase);
  const livres = orgaos.filter((o) => !p.secretarias.some((s) => s.orgaoCod === o.orgaoCod));
  const replanejado = p.fimPrevistoOriginal && p.fimPrevisto && p.fimPrevistoOriginal.getTime() !== p.fimPrevisto.getTime() ? diasEntre(p.fimPrevistoOriginal, p.fimPrevisto) : 0;
  const abertas = p.etapas.filter((e) => e.status === 'pendente' || e.status === 'andamento').length;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/fazenda/projetos" className="text-xs text-[#0f4c81] hover:underline">← projetos</Link>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <h1 className="text-xl font-semibold mr-2">{p.titulo}</h1>
          <SeloFase fase={p.fase} /><SeloSaude saude={p.saude} diasAtraso={p.diasAtraso} />
          <span className="text-xs text-slate-500 ml-auto">#{p.id} · cadastrado por {p.criadoPor} em {fmtData(p.criadoEm)} · <Link href={`/dashboard/fazenda/projetos/${p.id}/imprimir`} className="text-[#0f4c81] hover:underline">🖨 imprimir / PDF</Link></span>
        </div>
        <p className="text-sm text-slate-600">{TIPOS[p.tipo] ?? p.tipo} · prioridade {PRIORIDADES[p.prioridade]?.toLowerCase()}{p.bairro ? ` · ${p.bairro}` : ''}{p.eixo ? ` · ${p.eixo}` : ''}</p>
      </div>

      {(p.motivos.length > 0 || (p.fase === 'paralisado' && p.motivoFase) || (p.fase === 'cancelado' && p.motivoFase)) && (
        <div className={`rounded-lg border p-3 text-sm ${p.saude === 'atrasado' ? 'border-red-300 bg-red-50' : p.saude === 'atencao' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
          <b>{p.fase === 'paralisado' ? 'Motivo da pausa' : p.fase === 'cancelado' ? 'Motivo do cancelamento' : 'Por que a situação é “' + (p.saude === 'atrasado' ? 'atrasado' : 'atenção') + '”'}</b>
          <ul className="list-disc pl-5">
            {p.motivoFase && (p.fase === 'paralisado' || p.fase === 'cancelado') && <li>{p.motivoFase}</li>}
            {p.motivos.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      <QuadroAlertas alertas={alertas} />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="cartao"><div className="text-xs text-slate-500">Avanço</div><div className="mt-1"><BarraAvanco pct={p.avanco} saude={p.saude} /></div><div className="text-xs text-slate-500 mt-1">{p.etapas.filter((e) => e.status === 'concluida').length} de {p.etapas.filter((e) => e.status !== 'cancelada').length} etapas</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Previsto</div><div className="font-semibold">{fmtData(p.inicioPrevisto)} → {fmtData(p.fimPrevisto)}</div>
          <div className="text-xs text-slate-500">{replanejado ? <span className="text-amber-700">replanejado: {replanejado > 0 ? '+' : ''}{replanejado} dia(s) sobre o prazo aprovado ({fmtData(p.fimPrevistoOriginal)})</span> : p.inicioReal || p.fimReal ? '' : 'ainda não começou'}</div>
          {(p.inicioReal || p.fimReal) && <div className="text-xs text-slate-500">real: {fmtData(p.inicioReal)} → {fmtData(p.fimReal)}</div>}</div>
        <div className="cartao"><div className="text-xs text-slate-500">Orçamento estimado</div><div className="text-xl font-bold">{p.orcamento !== null ? brl(p.orcamento) : '—'}</div><div className="text-xs text-slate-500">{p.fonteRecurso ? FONTES[p.fonteRecurso] ?? p.fonteRecurso : 'fonte não informada'}</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Aprovação</div><div className="font-semibold">{p.aprovadoEm ? `${p.aprovadoPor}, ${fmtData(p.aprovadoEm)}` : 'ainda não aprovado'}</div><div className="text-xs text-slate-500">última atualização: {fmtData(p.atualizadoEm)}</div></div>
      </div>
      {p.objetivo && <div className="cartao text-sm whitespace-pre-wrap"><div className="text-xs text-slate-500 mb-1">Objetivo</div>{p.objetivo}</div>}

      {/* fase */}
      {mexe && (
        <section className="cartao">
          <h2 className="font-semibold mb-1">Fase do projeto</h2>
          {passos.length > 0 ? (
            <FormAcao acao={acaoMudarFase} className="space-y-2 text-sm">
              {cod(p.id)}
              <textarea name="motivo" rows={2} placeholder="Motivo ou observação (obrigatório para paralisar e cancelar)" className="campo w-full max-w-xl" />
              <div className="flex flex-wrap gap-2">
                {passos.map((f) => <Enviar key={f} name="para" value={f} className={ROT_PASSO[f][1] ? 'btn' : 'btn-sec'}>{p.fase === 'paralisado' && f === 'execucao' ? 'Retomar execução' : ROT_PASSO[f][0]}</Enviar>)}
              </div>
            </FormAcao>
          ) : <p className="text-sm text-slate-500">Nenhum passo disponível para a sua função nesta fase.</p>}
          <p className="text-xs text-slate-500 mt-2">
            {p.fase === 'ideia' || p.fase === 'estudo' ? 'Aprovar exige orçamento, início e fim previstos. A aprovação é do prefeito ou do controlador.' : ''}
            {p.fase === 'execucao' ? `Concluir exige as etapas fechadas${abertas ? ` (faltam ${abertas})` : ''}; concluir e cancelar são do prefeito ou do controlador.` : ''}
            {p.fase === 'aprovado' ? 'A secretaria inicia a execução; cancelar é do prefeito ou do controlador.' : ''}
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* etapas */}
          <section className="cartao overflow-x-auto">
            <h2 className="font-semibold mb-2">Etapas e marcos</h2>
            {p.etapas.length === 0 && <p className="text-sm text-slate-500">Nenhuma etapa ainda. Sem etapas o sistema não consegue medir o avanço.</p>}
            {p.etapas.length > 0 && (
              <table className="tabela">
                <thead><tr><th>#</th><th>Etapa</th><th>Prazo</th><th>Situação</th>{mexe && <th></th>}</tr></thead>
                <tbody>
                  {p.etapas.map((e) => {
                    const aberta = e.status === 'pendente' || e.status === 'andamento';
                    const vencida = aberta && e.fimPrevisto && e.fimPrevisto < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
                    return (
                      <tr key={e.id} className={e.status === 'cancelada' ? 'text-slate-400' : ''}>
                        <td>{e.ordem}</td>
                        <td><span className={e.status === 'cancelada' ? 'line-through' : ''}>{e.marco ? '◆ ' : ''}{e.titulo}</span>{!e.marco && <span className="text-xs text-slate-500"> · peso {e.peso}</span>}</td>
                        <td className="whitespace-nowrap text-xs">{e.marco ? fmtData(e.fimPrevisto) : `${fmtData(e.inicioPrevisto)} → ${fmtData(e.fimPrevisto)}`}</td>
                        <td className="whitespace-nowrap text-xs">
                          <span className={vencida ? 'text-red-700 font-semibold' : ''}>{vencida ? 'vencida' : ROTULO_ETAPA[e.status as StatusEtapa]}</span>
                          {e.concluidaEm && <div className="text-slate-500">em {fmtData(e.concluidaEm)}</div>}
                        </td>
                        {mexe && (
                          <td>
                            <div className="flex flex-wrap gap-1 items-start">
                              {e.status === 'pendente' && (
                                <FormAcao acao={acaoEtapa}>{cod(p.id)}<input type="hidden" name="etapaId" value={e.id} /><input type="hidden" name="acao" value="iniciar" /><Enviar className="btn-sec text-xs">Iniciar</Enviar></FormAcao>
                              )}
                              {aberta && (
                                <FormAcao acao={acaoEtapa}>{cod(p.id)}<input type="hidden" name="etapaId" value={e.id} /><input type="hidden" name="acao" value="concluir" /><Enviar className="btn text-xs">Concluir</Enviar></FormAcao>
                              )}
                              {aberta && (
                                <details>
                                  <summary className="btn-sec text-xs cursor-pointer list-none">Prazo / cancelar</summary>
                                  <FormAcao acao={acaoEtapa} className="mt-2 space-y-2 w-72 text-xs">
                                    {cod(p.id)}<input type="hidden" name="etapaId" value={e.id} />
                                    {!e.marco && <label className="block">Início<input type="date" name="inicioPrevisto" defaultValue={e.inicioPrevisto ? e.inicioPrevisto.toISOString().slice(0, 10) : ''} className="campo block w-full" /></label>}
                                    <label className="block">{e.marco ? 'Data' : 'Prazo'}<input type="date" name="fimPrevisto" defaultValue={e.fimPrevisto ? e.fimPrevisto.toISOString().slice(0, 10) : ''} className="campo block w-full" /></label>
                                    <input name="motivo" placeholder={aprovado ? 'Motivo (obrigatório)' : 'Motivo'} className="campo w-full" />
                                    <div className="flex gap-2"><Enviar name="acao" value="datas" className="btn text-xs">Salvar prazo</Enviar><Enviar name="acao" value="cancelar" className="btn-sec text-xs">Cancelar etapa</Enviar></div>
                                  </FormAcao>
                                </details>
                              )}
                              {!aberta && (
                                <details>
                                  <summary className="btn-sec text-xs cursor-pointer list-none">Reabrir</summary>
                                  <FormAcao acao={acaoEtapa} className="mt-2 space-y-2 w-72 text-xs">
                                    {cod(p.id)}<input type="hidden" name="etapaId" value={e.id} /><input type="hidden" name="acao" value="reabrir" />
                                    <input name="motivo" required placeholder="Por que reabrir" className="campo w-full" />
                                    <Enviar className="btn text-xs">Reabrir etapa</Enviar>
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
            )}
            {mexe && (
              <details className="mt-3" open={p.etapas.length === 0}>
                <summary className="text-xs text-[#0f4c81] cursor-pointer">+ incluir etapa ou marco</summary>
                <FormAcao acao={acaoAdicionarEtapa} className="grid gap-2 sm:grid-cols-2 mt-2 text-sm">
                  {cod(p.id)}
                  <label className="sm:col-span-2">Nome<input name="titulo" required maxLength={200} placeholder="Ex.: Licitação da obra" className="campo w-full mt-1" /></label>
                  <label>Início <span className="text-slate-500">(não vale para marco)</span><input type="date" name="inicioPrevisto" className="campo w-full mt-1" /></label>
                  <label>Prazo{aprovado ? ' (obrigatório)' : ''}<input type="date" name="fimPrevisto" required={aprovado} className="campo w-full mt-1" /></label>
                  <label>Peso no avanço (1 a 100)<input type="number" name="peso" min={1} max={100} defaultValue={1} className="campo w-full mt-1" /></label>
                  <label className="flex items-center gap-2 mt-6"><input type="checkbox" name="marco" /> é um marco (entrega pontual, como a inauguração)</label>
                  <div className="sm:col-span-2"><Enviar className="btn-sec">Incluir</Enviar></div>
                </FormAcao>
              </details>
            )}
          </section>

          <Dinheiro p={p} fin={fin} cand={cand} mexe={mexe} verContratos={verContratos} />
          <Riscos projetoId={p.id} riscos={riscos} mexe={mexe} hoje={hoje} />
          <Resultados projetoId={p.id} indicadores={indicadores} mexe={mexeResultado} />

          {/* andamento + histórico */}
          <section className="cartao">
            <h2 className="font-semibold mb-2">Andamento e histórico</h2>
            {mexe && (
              <FormAcao acao={acaoAtualizacao} className="space-y-2 text-sm mb-3">
                {cod(p.id)}
                <textarea name="texto" required rows={2} maxLength={3000} placeholder="O que aconteceu desde a última atualização? (aparece no histórico e zera o aviso de “sem atualização”)" className="campo w-full" />
                <Enviar className="btn-sec">Registrar andamento</Enviar>
              </FormAcao>
            )}
            <ol className="border-l-2 border-slate-200 pl-3 space-y-1.5">
              {p.eventos.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-xs text-slate-500">{e.quando.toLocaleString('pt-BR')} · {e.por}</span>
                  <div><b>{ROT_EVENTO[e.tipo] ?? e.tipo}:</b> {e.texto}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          {/* secretarias */}
          <section className="cartao">
            <h2 className="font-semibold mb-2">Secretarias envolvidas</h2>
            <ul className="space-y-2 text-sm">
              {p.secretarias.map((s) => (
                <li key={s.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0">
                  <div><b>{s.orgaoNome}</b> <span className={`selo ${s.papel === 'lider' ? 'bg-sky-100 text-sky-900' : 'bg-slate-100 text-slate-700'}`}>{s.papel === 'lider' ? 'líder' : 'parceira'}</span></div>
                  {mexe ? (
                    <FormAcao acao={acaoParceira} className="flex gap-1 mt-1">
                      {cod(p.id)}<input type="hidden" name="orgaoCod" value={s.orgaoCod} /><input type="hidden" name="acao" value="responsavel" />
                      <input name="responsavel" defaultValue={s.responsavel} maxLength={120} placeholder="Responsável (nome e cargo)" className="campo text-xs flex-1 min-w-0" />
                      <Enviar className="btn-sec text-xs">Salvar</Enviar>
                    </FormAcao>
                  ) : <div className="text-xs text-slate-600">Responsável: {s.responsavel || 'não definido'}</div>}
                  {mexe && ator.gerir && s.papel !== 'lider' && (
                    <details className="mt-1">
                      <summary className="text-xs text-[#0f4c81] cursor-pointer">retirar do projeto</summary>
                      <FormAcao acao={acaoParceira} className="flex gap-1 mt-1">
                        {cod(p.id)}<input type="hidden" name="orgaoCod" value={s.orgaoCod} /><input type="hidden" name="acao" value="remover" />
                        <input name="motivo" required placeholder="Por quê" className="campo text-xs flex-1 min-w-0" />
                        <Enviar className="btn-sec text-xs">Retirar</Enviar>
                      </FormAcao>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {mexe && livres.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-[#0f4c81] cursor-pointer">+ incluir secretaria parceira</summary>
                <FormAcao acao={acaoParceira} className="space-y-2 mt-2 text-sm">
                  {cod(p.id)}<input type="hidden" name="acao" value="adicionar" />
                  <select name="orgaoCod" required defaultValue="" className="campo w-full">
                    <option value="" disabled>—</option>
                    {livres.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
                  </select>
                  <input name="responsavel" maxLength={120} placeholder="Responsável (opcional)" className="campo w-full" />
                  <Enviar className="btn-sec">Incluir</Enviar>
                </FormAcao>
              </details>
            )}
            {!lider && <p className="text-xs text-red-700 mt-2">Projeto sem secretaria líder.</p>}
          </section>

          {mexe && (
            <section className="cartao">
              <details>
                <summary className="font-semibold cursor-pointer">Editar dados do projeto</summary>
                <FormAcao acao={acaoEditarProjeto} className="grid gap-3 mt-3 text-sm">
                  {cod(p.id)}
                  <CamposProjeto v={p} travarOrcamento={aprovado && !ator.aprovar} />
                  {aprovado && <label>Motivo da mudança de data <span className="text-slate-500">(obrigatório se mudar início ou fim)</span><input name="motivo" className="campo w-full mt-1" /></label>}
                  <div><Enviar>Salvar alterações</Enviar></div>
                </FormAcao>
              </details>
            </section>
          )}
          <p className="text-xs text-slate-500">
            Fase atual: {ROTULO_FASE[p.fase as Fase]}. O histórico não se apaga: toda mudança de fase, prazo, etapa e secretaria fica registrada com quem fez e quando.
          </p>
        </div>
      </div>
    </div>
  );
}
