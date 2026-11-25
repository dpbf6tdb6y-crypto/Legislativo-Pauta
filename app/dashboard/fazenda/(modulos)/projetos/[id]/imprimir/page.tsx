// Ficha de um projeto em uma folha para imprimir ou salvar em PDF (reunião, prestação de contas, pasta do projeto).
import { notFound } from 'next/navigation';
import { brl, brlCurto } from '@/lib/financas/dinheiro';
import { acompanhamento, fichaProjeto, juntarAlertas } from '@/lib/financas/projetos/dados';
import { fmtNum, progresso, ultimaLeitura, alertasResultado } from '@/lib/financas/projetos/indicadores';
import { gravidade, ROT_GRAVIDADE, riscoAtivo, alertasRisco, STATUS_RISCO, type StatusRisco } from '@/lib/financas/projetos/riscos';
import { FONTES, PRIORIDADES, ROTULO_ETAPA, ROTULO_FASE, TIPOS, type Fase, type StatusEtapa } from '@/lib/financas/projetos/regras';
import { carregarFinanceiro } from '@/lib/financas/projetos/vinculos';
import { acessoProjetos } from '../../acesso';
import BotaoImprimir from '../../BotaoImprimir';
import { fmtData } from '../../Selos';

export default async function ImprimirProjeto({ params }: { params: { id: string } }) {
  const { db, ator, s } = await acessoProjetos('Projeto (impressão)', { detalhe: `impressão projeto id=${params.id}`, acao: 'exportar' });
  const hoje = new Date();
  const p = await fichaProjeto(db, ator, Number(params.id), hoje);
  if (!p) notFound();
  const { porProjeto } = await carregarFinanceiro(db, ator, [{ id: p.id, fase: p.fase, orcamento: p.orcamento, inicioPrevisto: p.inicioPrevisto, fimPrevisto: p.fimPrevisto, inicioReal: p.inicioReal, avanco: p.avanco }], hoje);
  const fin = porProjeto.get(p.id)!;
  const ac = await acompanhamento(db, [p.id]);
  const riscos = ac.riscosDe(p.id).filter(riscoAtivo), indicadores = ac.indicadoresDe(p.id);
  const alertas = juntarAlertas(fin.alertas, alertasRisco(ac.riscosDe(p.id), hoje), alertasResultado(p.fase, indicadores, hoje)).filter((a) => a.nivel !== 'info');
  const ex = fin.execucao;
  const tem = fin.contratos.length + fin.acoes.length > 0;

  return (
    <div className="text-sm space-y-3">
      <style>{'@page { size: A4; margin: 12mm; } @media print { aside, header, nav { display: none !important; } html, body, div, main { height: auto !important; overflow: visible !important; position: static !important; } body { background: white; } }'}</style>
      <BotaoImprimir voltar={`/dashboard/fazenda/projetos/${p.id}`} />
      <div>
        <h1 className="text-xl font-semibold">{p.titulo}</h1>
        <p className="text-xs text-slate-600">
          {ROTULO_FASE[p.fase as Fase]} · {p.saude === 'atrasado' ? `atrasado ${p.diasAtraso} d` : p.saude.replace('_', ' ')} · {TIPOS[p.tipo] ?? p.tipo} · prioridade {PRIORIDADES[p.prioridade]?.toLowerCase()}{p.bairro ? ` · ${p.bairro}` : ''}{p.eixo ? ` · ${p.eixo}` : ''}
          <br />Secretarias: {p.secretarias.map((x) => `${x.orgaoNome} (${x.papel === 'lider' ? 'líder' : 'parceira'}${x.responsavel ? `, ${x.responsavel}` : ''})`).join('; ')}
          <br />Emitido em {hoje.toLocaleString('pt-BR')} por {s.nome}.
        </p>
      </div>
      {p.objetivo && <p className="whitespace-pre-wrap"><b>Objetivo:</b> {p.objetivo}</p>}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="border border-slate-300 rounded px-2 py-1"><div className="text-slate-500">Avanço</div><b className="text-base">{p.avanco === null ? 'sem etapas' : `${p.avanco}%`}</b></div>
        <div className="border border-slate-300 rounded px-2 py-1"><div className="text-slate-500">Previsto</div><b>{fmtData(p.inicioPrevisto)} → {fmtData(p.fimPrevisto)}</b></div>
        <div className="border border-slate-300 rounded px-2 py-1"><div className="text-slate-500">Orçamento</div><b className="text-base">{p.orcamento !== null ? brl(p.orcamento) : '—'}</b><div>{p.fonteRecurso ? FONTES[p.fonteRecurso] ?? p.fonteRecurso : ''}</div></div>
        <div className="border border-slate-300 rounded px-2 py-1"><div className="text-slate-500">Aprovação</div><b>{p.aprovadoEm ? `${p.aprovadoPor}, ${fmtData(p.aprovadoEm)}` : 'não aprovado'}</b></div>
      </div>
      {(p.motivos.length > 0 || alertas.length > 0) && (
        <div className="border border-slate-400 rounded p-2 text-xs">
          <b>Pontos de atenção</b>
          <ul className="list-disc pl-5">{p.motivos.map((m) => <li key={m}>{m}</li>)}{alertas.map((a) => <li key={a.codigo}>{a.texto}</li>)}</ul>
        </div>
      )}

      <section style={{ breakInside: 'avoid' }}>
        <h2 className="font-semibold">Etapas e marcos</h2>
        {p.etapas.length === 0 ? <p className="text-xs text-slate-500">Nenhuma etapa registrada.</p> : (
          <table className="tabela w-full text-xs"><thead><tr><th>#</th><th>Etapa</th><th>Prazo</th><th>Situação</th></tr></thead>
            <tbody>{p.etapas.map((e) => <tr key={e.id}><td>{e.ordem}</td><td>{e.marco ? '◆ ' : ''}{e.titulo}{!e.marco ? ` (peso ${e.peso})` : ''}</td><td>{e.marco ? fmtData(e.fimPrevisto) : `${fmtData(e.inicioPrevisto)} → ${fmtData(e.fimPrevisto)}`}</td><td>{ROTULO_ETAPA[e.status as StatusEtapa]}{e.concluidaEm ? ` em ${fmtData(e.concluidaEm)}` : ''}</td></tr>)}</tbody></table>
        )}
      </section>

      <section style={{ breakInside: 'avoid' }}>
        <h2 className="font-semibold">Dinheiro</h2>
        {!tem ? <p className="text-xs text-slate-500">Nenhum contrato ou ação de despesa ligado ao projeto.</p> : (
          <>
            <p className="text-xs">Contratado {brlCurto(fin.contratado)} · empenhado <b>{brlCurto(ex.empenhado)}</b> · liquidado {brlCurto(ex.liquidado)} · pago <b>{brlCurto(ex.pago)}</b>{p.orcamento ? ` (${Math.round(Number((ex.pago * 1000n) / p.orcamento) / 10)}% do orçamento)` : ''}. Cada empenho é contado uma vez.</p>
            <ul className="text-xs list-disc pl-5">
              {fin.contratos.map((c) => <li key={c.vinculoId}>Contrato {c.numero}/{c.ano} · {c.fornecedorNome} · {brlCurto(c.valorAtual)} · vigência até {fmtData(c.fim)}</li>)}
              {fin.acoes.map((a) => <li key={a.vinculoId}>Ação “{a.acao}” ({a.programa}) desde {fmtData(a.desde)}</li>)}
            </ul>
          </>
        )}
      </section>

      <section style={{ breakInside: 'avoid' }}>
        <h2 className="font-semibold">Riscos em aberto</h2>
        {riscos.length === 0 ? <p className="text-xs text-slate-500">Nenhum risco registrado.</p> : (
          <ul className="text-xs list-disc pl-5">{riscos.map((r) => <li key={r.id}><b>{r.titulo}</b> · gravidade {ROT_GRAVIDADE[gravidade(r.probabilidade, r.impacto)]} · {STATUS_RISCO[r.status as StatusRisco]}{r.mitigacao ? ` · plano: ${r.mitigacao}` : ' · sem plano'}</li>)}</ul>
        )}
      </section>

      <section style={{ breakInside: 'avoid' }}>
        <h2 className="font-semibold">Resultados esperados</h2>
        {indicadores.length === 0 ? <p className="text-xs text-slate-500">Nenhum indicador de resultado.</p> : (
          <ul className="text-xs list-disc pl-5">{indicadores.map((i) => { const u = ultimaLeitura(i.leituras); const pr = progresso(i, u?.valor ?? null); return <li key={i.id}><b>{i.nome}</b>: de {fmtNum(i.linhaBase, i.unidade)} para {fmtNum(i.meta, i.unidade)}{i.prazoMeta ? ` até ${fmtData(i.prazoMeta)}` : ''} · {u ? `última medição ${fmtNum(u.valor, i.unidade)} em ${fmtData(u.data)} (${pr}% do caminho)` : 'sem medição'}</li>; })}</ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Últimos registros</h2>
        <ul className="text-xs">{p.eventos.slice(0, 8).map((e) => <li key={e.id}>{e.quando.toLocaleDateString('pt-BR')} · {e.por}: {e.texto}</li>)}</ul>
      </section>
    </div>
  );
}
