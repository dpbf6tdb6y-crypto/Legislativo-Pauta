// Seção "Dinheiro do projeto" da ficha: orçado × contratado × empenhado × pago, contratos e ações ligados, alertas.
import Link from 'next/link';
import { brl, brlCurto } from '@/lib/financas/dinheiro';
import type { CandidatoAcao, CandidatoContrato, FinanceiroCompleto } from '@/lib/financas/projetos/vinculos';
import FormAcao, { Enviar } from '../documentos/FormAcao';
import { acaoVinculo } from './acoes';
import { fmtData, isoLocal } from './Selos';

const SEP = '␟';
const pct = (a: bigint, b: bigint | null) => (b && b > 0n ? Math.round(Number((a * 1000n) / b) / 10) : null);

function Desligar({ id, vinculoId }: { id: number; vinculoId: number }) {
  return (
    <details>
      <summary className="text-xs text-[#0f4c81] cursor-pointer">desligar</summary>
      <FormAcao acao={acaoVinculo} className="flex gap-1 mt-1">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="acao" value="desfazer" /><input type="hidden" name="vinculoId" value={vinculoId} />
        <input name="motivo" required placeholder="Por quê" className="campo text-xs w-40" />
        <Enviar className="btn-sec text-xs">Desligar</Enviar>
      </FormAcao>
    </details>
  );
}

export default function Dinheiro({ p, fin, cand, mexe, verContratos, desligaveis }: {
  p: { id: number; orcamento: bigint | null; avanco: number | null; fase: string; inicioPrevisto: Date | null };
  fin: FinanceiroCompleto;
  cand: { contratos: CandidatoContrato[]; acoes: CandidatoAcao[] } | null; // null = quem vê não liga
  mexe: boolean; verContratos: boolean;
  desligaveis: number[]; // ligações que este usuário pode desfazer
}) {
  const ex = fin.execucao;
  const tem = fin.contratos.length + fin.acoes.length > 0;
  const pagoPct = pct(ex.pago, p.orcamento), empPct = pct(ex.empenhado, p.orcamento);
  const livresC = (cand?.contratos ?? []).filter((c) => !fin.contratos.some((x) => x.id === c.id));
  const livresA = (cand?.acoes ?? []).filter((a) => !fin.acoes.some((x) => x.acao === a.acao && x.programa === a.programa && x.orgaoEmpenho === a.orgaoEmpenho));
  const desdePadrao = isoLocal(p.inicioPrevisto ?? new Date(new Date().getFullYear(), 0, 1));

  return (
    <section className="cartao space-y-3">
      <div>
        <h2 className="font-semibold">Dinheiro do projeto</h2>
        <p className="text-xs text-slate-500">Valores do portal da transparência, pelos contratos e ações de despesa ligados a este projeto. Cada empenho é contado uma só vez.</p>
      </div>

      {fin.alertas.length > 0 && <p className="text-xs text-amber-800">{fin.alertas.length} alerta(s) sobre o gasto no quadro de alertas, no alto da página.</p>}

      {tem && (
        <>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-5 text-sm">
            {([
              ['Orçamento do projeto', p.orcamento !== null ? brlCurto(p.orcamento) : '—', p.orcamento !== null ? brl(p.orcamento) : 'não informado'],
              ['Contratado', brlCurto(fin.contratado), `${fin.contratos.length} contrato(s)`],
              ['Empenhado', brlCurto(ex.empenhado), empPct !== null ? `${empPct}% do orçamento` : `${ex.empenhos} empenho(s)`],
              ['Liquidado', brlCurto(ex.liquidado), 'serviço ou bem entregue'],
              ['Pago', brlCurto(ex.pago), pagoPct !== null ? `${pagoPct}% do orçamento` : ''],
            ] as const).map(([r, v, sub]) => (
              <div key={r} className="rounded border border-slate-200 p-2" title={sub}><div className="text-xs text-slate-500">{r}</div><div className="text-lg font-bold">{v}</div><div className="text-xs text-slate-500">{sub}</div></div>
            ))}
          </div>
          {pagoPct !== null && (
            <div className="text-xs text-slate-600">
              <div className="flex items-center gap-2">pago <div className="h-2 flex-1 max-w-md rounded bg-slate-200 overflow-hidden"><div className={`h-full ${pagoPct > 100 ? 'bg-red-600' : 'bg-sky-600'}`} style={{ width: `${Math.min(100, pagoPct)}%` }} /></div>{pagoPct}%</div>
              {p.avanco !== null && <div className="flex items-center gap-2">avanço <div className="h-2 flex-1 max-w-md rounded bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${p.avanco}%` }} /></div>{p.avanco}%</div>}
            </div>
          )}
        </>
      )}
      {!tem && <p className="text-sm text-slate-600">Nenhum contrato ou ação de despesa ligado. {mexe ? 'Ligue abaixo para o sistema mostrar quanto já foi empenhado e pago.' : ''}</p>}

      {fin.contratos.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold mb-1">Contratos ligados</h3>
          <table className="tabela">
            <thead><tr><th>Contrato</th><th>Vigência até</th><th className="n">Valor atual</th><th className="n">Empenhado</th><th className="n">Pago</th><th>Ligação</th>{mexe && <th></th>}</tr></thead>
            <tbody>
              {fin.contratos.map((c) => (
                <tr key={c.vinculoId}>
                  <td>
                    {verContratos ? <Link href={`/dashboard/fazenda/contratos/${c.id}`} className="text-[#0f4c81] hover:underline">{c.numero}/{c.ano}</Link> : <>{c.numero}/{c.ano}</>} · {c.fornecedorNome}
                    <div className="text-xs text-slate-500 max-w-md">{c.objeto.slice(0, 140)}</div>
                  </td>
                  <td className="whitespace-nowrap text-xs">{fmtData(c.fim)}<div className="text-slate-500">{c.situacao}</div></td>
                  <td className="n">{brlCurto(c.valorAtual)}</td><td className="n">{brlCurto(c.execucao.empenhado)}</td><td className="n">{brlCurto(c.execucao.pago)}</td>
                  <td><span className={`selo ${c.certeza === 'alta' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{c.certeza}</span></td>
                  {mexe && <td>{desligaveis.includes(c.vinculoId) && <Desligar id={p.id} vinculoId={c.vinculoId} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fin.acoes.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold mb-1">Ações de despesa ligadas</h3>
          <table className="tabela">
            <thead><tr><th>Ação (programa)</th><th>Desde</th><th className="n">Empenhado</th><th className="n">Liquidado</th><th className="n">Pago</th>{mexe && <th></th>}</tr></thead>
            <tbody>
              {fin.acoes.map((a) => (
                <tr key={a.vinculoId}>
                  <td>{a.acao}<div className="text-xs text-slate-500">{a.programa}</div></td>
                  <td className="whitespace-nowrap text-xs">{fmtData(a.desde)}</td>
                  <td className="n">{brlCurto(a.execucao.empenhado)}</td><td className="n">{brlCurto(a.execucao.liquidado)}</td><td className="n">{brlCurto(a.execucao.pago)}</td>
                  {mexe && <td>{desligaveis.includes(a.vinculoId) && <Desligar id={p.id} vinculoId={a.vinculoId} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tem && <p className="text-xs text-slate-500">Um contrato e uma ação podem alcançar os mesmos empenhos: por isso as linhas não precisam somar o total do projeto, que não repete empenho. Pago = pagamentos listados no portal (líquido, sem os descontos retidos).</p>}

      {mexe && cand && (
        <div className="grid gap-3 md:grid-cols-2 border-t border-slate-100 pt-3">
          <details>
            <summary className="text-xs text-[#0f4c81] cursor-pointer">+ ligar um contrato</summary>
            {livresC.length === 0 ? <p className="text-xs text-slate-500 mt-2">Nenhum contrato disponível: cada secretaria vê só os próprios; a gestão vê os de todas as do projeto.</p> : (
              <FormAcao acao={acaoVinculo} className="space-y-2 mt-2 text-sm">
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="acao" value="contrato" />
                <select name="contratoId" required defaultValue="" className="campo w-full">
                  <option value="" disabled>escolha o contrato</option>
                  {livresC.map((c) => <option key={c.id} value={c.id}>{c.numero}/{c.ano} · {c.fornecedorNome} · {brlCurto(c.valorAtual)}{c.situacao.includes('Vigente') ? '' : ' · ' + c.situacao}{c.certeza === 'media' ? ' · ligação provável' : ''}</option>)}
                </select>
                <Enviar className="btn-sec">Ligar contrato</Enviar>
              </FormAcao>
            )}
          </details>
          <details>
            <summary className="text-xs text-[#0f4c81] cursor-pointer">+ ligar uma ação de despesa (programa/projeto do orçamento)</summary>
            {livresA.length === 0 ? <p className="text-xs text-slate-500 mt-2">Nenhuma ação disponível nas secretarias do projeto.</p> : (
              <FormAcao acao={acaoVinculo} className="space-y-2 mt-2 text-sm">
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="acao" value="acao" />
                <select name="chave" required defaultValue="" className="campo w-full">
                  <option value="" disabled>escolha a ação</option>
                  {livresA.map((a) => <option key={`${a.orgaoEmpenho}${SEP}${a.programa}${SEP}${a.acao}`} value={`${a.orgaoEmpenho}${SEP}${a.programa}${SEP}${a.acao}`}>{a.acao} · {a.programa.slice(0, 60)} · {brlCurto(a.empenhado)}</option>)}
                </select>
                <label className="block text-xs">Contar os empenhos a partir de<input type="date" name="desde" required defaultValue={desdePadrao} className="campo block mt-1" /></label>
                <Enviar className="btn-sec">Ligar ação</Enviar>
              </FormAcao>
            )}
          </details>
        </div>
      )}
    </section>
  );
}
