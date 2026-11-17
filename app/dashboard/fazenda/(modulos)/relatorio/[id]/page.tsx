import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigir } from '@/lib/financas/auth';
import { lerRelatorio, type Situacao } from '@/lib/financas/auditoria/relatorio';
import Imprimir from './Imprimir';

const NOME: Record<Situacao, string> = { critico: 'Crítico', atencao: 'Atenção', ordem: 'Em ordem', sem_dado: 'Sem avaliação' };
const COR: Record<Situacao, string> = { critico: 'bg-red-100 text-red-900', atencao: 'bg-amber-100 text-amber-900', ordem: 'bg-emerald-100 text-emerald-900', sem_dado: 'bg-slate-200 text-slate-700' };
const dh = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'nunca coletado');

export default async function RelatorioVer({ params }: { params: { id: string } }) {
  const { db } = await exigir('apontamentos', 'Relatório de auditoria', { detalhe: `#${params.id}` });
  const r = await db.relatorioAuditoria.findFirst({ where: { id: Number(params.id) || 0 } });
  if (!r) notFound();
  const { conteudo: c, integro } = lerRelatorio(r);
  const n = (x: Situacao) => c.itens.filter((i) => i.situacao === x);
  const recs = [...n('critico'), ...n('atencao')];
  return (
    <div className="space-y-4 relatorio-impressao">
      <div className="flex items-center gap-2 print:hidden">
        <Link href="/dashboard/fazenda/relatorio" className="btn-sec">← Relatórios</Link>
        <span className="mr-auto" />
        <Imprimir />
      </div>
      {!integro && <p className="cartao text-sm text-red-700 font-semibold">Atenção: o conteúdo gravado não confere com o SHA-256 deste relatório.</p>}
      <div className="cartao space-y-4">
        <div className="text-center">
          <p className="text-xs tracking-wide text-slate-500">PREFEITURA MUNICIPAL DE NOVA LIMA · MINAS GERAIS</p>
          <h1 className="text-xl font-bold">RELATÓRIO DE AUDITORIA INTERNA Nº {r.id}</h1>
          <p className="text-sm text-slate-600">Acompanhamento da gestão fiscal, orçamentária e contratual</p>
        </div>
        <table className="tabela">
          <tbody>
            <tr><td className="w-48 text-slate-500">Gerado em</td><td>{dh(c.geradoEm)} por {c.geradoPor}</td></tr>
            <tr><td className="text-slate-500">SHA-256 do conteúdo</td><td className="font-mono text-xs break-all">{r.sha256}</td></tr>
            <tr><td className="text-slate-500">Natureza</td><td>Pontos de controle gerenciais calculados a partir dos dados públicos (Portal da Transparência e SICONFI)</td></tr>
          </tbody>
        </table>

        <section>
          <h2 className="font-semibold">1. Resumo</h2>
          <p className="text-sm">
            Foram avaliados <b>{c.itens.length} pontos de controle</b>: <b className="text-red-700">{n('critico').length} crítico(s)</b>,{' '}
            <b className="text-amber-700">{n('atencao').length} de atenção</b>, <b className="text-emerald-700">{n('ordem').length} em ordem</b> e{' '}
            {n('sem_dado').length} sem avaliação. Apontamentos: {c.apontamentos.paraAnalise} para análise, {c.apontamentos.procedentes} procedentes,{' '}
            {c.apontamentos.improcedentes} improcedentes. Cobranças às secretarias: {c.secretarias.abertos} em aberto ({c.secretarias.atrasados} atrasadas),{' '}
            {c.secretarias.respondidos} respondidas aguardando validação, {c.secretarias.resolvidos} resolvidas.
          </p>
        </section>

        <section>
          <h2 className="font-semibold mb-1">2. Quadro de achados</h2>
          <table className="tabela">
            <thead><tr><th>Ponto de controle</th><th>Situação</th><th>Base legal</th></tr></thead>
            <tbody>
              {c.itens.map((i) => (
                <tr key={i.codigo}>
                  <td>
                    <b>{i.codigo} · {i.titulo}</b>
                    <span className="text-xs text-slate-400"> (regra {i.estadoRegra})</span>
                    {i.observacao && <div className="text-xs text-slate-500">{i.observacao}</div>}
                    {i.achados.length > 0 && (
                      <ul className="text-xs text-slate-700 list-disc ml-4 mt-1">
                        {i.achados.map((a, k) => <li key={k}>{a.resumo}</li>)}
                        {i.totalAchados > i.achados.length && <li className="text-slate-500">… e mais {i.totalAchados - i.achados.length}</li>}
                      </ul>
                    )}
                  </td>
                  <td><span className={`selo ${COR[i.situacao]}`}>{NOME[i.situacao]}</span>{i.totalAchados > 0 && <div className="text-xs text-slate-500">{i.totalAchados} achado(s)</div>}</td>
                  <td className="text-xs">{i.baseLegal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="font-semibold">3. Recomendações</h2>
          {recs.length === 0 ? <p className="text-sm">Não há recomendações: nenhum ponto crítico ou de atenção.</p> : (
            <ol className="text-sm list-decimal ml-5">{recs.map((i) => <li key={i.codigo}>{i.recomendacao} <span className="text-slate-500">({i.codigo} · {NOME[i.situacao].toLowerCase()})</span></li>)}</ol>
          )}
        </section>

        <section>
          <h2 className="font-semibold">4. Limitações do trabalho</h2>
          <ul className="text-sm list-disc ml-5">{c.limitacoes.map((l, k) => <li key={k}>{l}</li>)}</ul>
        </section>

        <section>
          <h2 className="font-semibold">5. Fontes dos dados (data em que cada uma foi baixada)</h2>
          <ul className="text-sm list-disc ml-5">{c.fontes.map((f) => <li key={f.nome}>{f.nome}: {dh(f.baixadoEm)}</li>)}</ul>
        </section>

        <div className="grid grid-cols-2 gap-8 pt-10 text-center text-sm">
          <div className="border-t border-slate-400 pt-1">Elaborado por</div>
          <div className="border-t border-slate-400 pt-1">Responsável técnico</div>
        </div>
      </div>
    </div>
  );
}
