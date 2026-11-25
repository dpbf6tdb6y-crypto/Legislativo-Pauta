// Seção "Resultados" da ficha: indicadores que dizem se o projeto mudou o que devia mudar.
import { fmtNum, progresso, ultimaLeitura, type IndicadorBase } from '@/lib/financas/projetos/indicadores';
import FormAcao, { Enviar } from '../documentos/FormAcao';
import { acaoIndicador } from './acoes';
import { fmtData, isoLocal } from './Selos';

type Ind = IndicadorBase & { leituras: (IndicadorBase['leituras'][number] & { id: number; nota: string; por: string })[] };

export default function Resultados({ projetoId, indicadores, mexe }: { projetoId: number; indicadores: Ind[]; mexe: boolean }) {
  const oculto = <input type="hidden" name="id" value={projetoId} />;
  const hojeIso = isoLocal(new Date());
  return (
    <section className="cartao space-y-3">
      <div>
        <h2 className="font-semibold">Resultados esperados</h2>
        <p className="text-xs text-slate-500">A obra pode estar pronta e o resultado não ter vindo. Defina o que deve mudar (de quanto para quanto) e registre as medições; elas não se editam.</p>
      </div>
      {indicadores.length === 0 && <p className="text-sm text-slate-500">Nenhum indicador de resultado. {mexe ? 'Ex.: alunos atendidos, tempo de espera na UBS, km pavimentados.' : ''}</p>}
      <ul className="space-y-3">
        {indicadores.map((i) => {
          const ult = ultimaLeitura(i.leituras);
          const pr = progresso(i, ult?.valor ?? null);
          const barra = Math.max(0, Math.min(100, pr ?? 0));
          return (
            <li key={i.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <b>{i.nome}</b>
                <span className="text-xs text-slate-500">de {fmtNum(i.linhaBase, i.unidade)} para {fmtNum(i.meta, i.unidade)}{i.prazoMeta ? ` até ${fmtData(i.prazoMeta)}` : ''}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-2 flex-1 max-w-sm rounded bg-slate-200 overflow-hidden"><div className={`h-full ${pr !== null && pr >= 100 ? 'bg-emerald-600' : pr !== null && pr < 0 ? 'bg-red-600' : 'bg-sky-600'}`} style={{ width: `${barra}%` }} /></div>
                <span className="text-xs tabular-nums">{pr === null ? 'sem medição' : `${pr}% do caminho`}</span>
              </div>
              <p className="text-xs text-slate-600">
                {ult ? <>Última medição: <b>{fmtNum(ult.valor, i.unidade)}</b> em {fmtData(ult.data)} ({ult.por}){ult.nota ? ` · ${ult.nota}` : ''}</> : 'Ainda não foi medido.'}
              </p>
              {i.leituras.length > 1 && (
                <details>
                  <summary className="text-xs text-[#0f4c81] cursor-pointer">{i.leituras.length} medições</summary>
                  <ul className="text-xs text-slate-600 mt-1">{[...i.leituras].reverse().map((l) => <li key={l.id}>{fmtData(l.data)} · {fmtNum(l.valor, i.unidade)}{l.nota ? ` · ${l.nota}` : ''} · {l.por}</li>)}</ul>
                </details>
              )}
              {mexe && (
                <details className="mt-1">
                  <summary className="text-xs text-[#0f4c81] cursor-pointer">+ registrar medição</summary>
                  <FormAcao acao={acaoIndicador} className="flex flex-wrap items-end gap-2 mt-1 text-xs">
                    {oculto}<input type="hidden" name="acao" value="leitura" /><input type="hidden" name="indicadorId" value={i.id} />
                    <label>Valor<input name="valor" required inputMode="decimal" className="campo block w-28" /></label>
                    <label>Data<input type="date" name="data" defaultValue={hojeIso} max={hojeIso} className="campo block" /></label>
                    <label className="flex-1 min-w-[10rem]">Nota<input name="nota" maxLength={500} className="campo block w-full" placeholder="Fonte ou observação" /></label>
                    <Enviar className="btn-sec text-xs">Registrar</Enviar>
                  </FormAcao>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {mexe && (
        <details open={indicadores.length === 0}>
          <summary className="text-xs text-[#0f4c81] cursor-pointer">+ novo indicador de resultado</summary>
          <FormAcao acao={acaoIndicador} className="grid gap-2 sm:grid-cols-2 mt-2 text-sm">
            {oculto}<input type="hidden" name="acao" value="criar" />
            <label className="sm:col-span-2">O que será medido<input name="nome" required maxLength={200} placeholder="Ex.: Alunos atendidos em tempo integral" className="campo w-full mt-1" /></label>
            <label>Unidade<input name="unidade" maxLength={40} placeholder="alunos, %, dias, km…" className="campo w-full mt-1" /></label>
            <label>Prazo da meta (opcional)<input type="date" name="prazoMeta" className="campo w-full mt-1" /></label>
            <label>Valor de hoje<input name="linhaBase" required inputMode="decimal" className="campo w-full mt-1" /></label>
            <label>Meta<input name="meta" required inputMode="decimal" className="campo w-full mt-1" /></label>
            <div className="sm:col-span-2"><Enviar className="btn-sec">Criar indicador</Enviar></div>
          </FormAcao>
        </details>
      )}
    </section>
  );
}
