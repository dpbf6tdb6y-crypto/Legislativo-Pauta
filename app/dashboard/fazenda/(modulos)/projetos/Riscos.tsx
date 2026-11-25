// Seção "Riscos" da ficha do projeto.
import type { RiscoProjeto } from '@prisma/client';
import { gravidade, riscoAtivo, ROT_GRAVIDADE, ROT_IMPACTO, ROT_NIVEL3, STATUS_RISCO, type Gravidade, type StatusRisco } from '@/lib/financas/projetos/riscos';
import FormAcao, { Enviar } from '../documentos/FormAcao';
import { acaoRisco } from './acoes';
import { fmtData } from './Selos';

const COR_GRAV: Record<Gravidade, string> = { alta: 'bg-red-100 text-red-900 border border-red-300', media: 'bg-amber-100 text-amber-900 border border-amber-300', baixa: 'bg-slate-100 text-slate-700 border border-slate-200' };
const ORDEM: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

function Nivel({ nome, atual, rotulos }: { nome: string; atual?: number; rotulos: Record<number, string> }) {
  return (
    <select name={nome} required defaultValue={atual ?? ''} className="campo">
      <option value="" disabled>—</option>
      {[1, 2, 3].map((n) => <option key={n} value={n}>{rotulos[n]}</option>)}
    </select>
  );
}

export default function Riscos({ projetoId, riscos, mexe, hoje }: { projetoId: number; riscos: RiscoProjeto[]; mexe: boolean; hoje: Date }) {
  const ativos = riscos.filter(riscoAtivo).sort((a, b) => ORDEM[gravidade(a.probabilidade, a.impacto)] - ORDEM[gravidade(b.probabilidade, b.impacto)] || a.id - b.id);
  const encerrados = riscos.filter((r) => !riscoAtivo(r));
  const oculto = <input type="hidden" name="id" value={projetoId} />;

  return (
    <section className="cartao space-y-3">
      <div>
        <h2 className="font-semibold">Riscos <span className="text-xs font-normal text-slate-500">· {ativos.length} em aberto</span></h2>
        <p className="text-xs text-slate-500">O que pode dar errado, com a gravidade (probabilidade × impacto) e o plano de resposta. Risco não se apaga: encerra-se com o motivo.</p>
      </div>
      {ativos.length === 0 && <p className="text-sm text-slate-500">Nenhum risco registrado. {mexe ? 'Registre os que a equipe já enxerga (verba, licitação, chuva, fornecedor…).' : ''}</p>}
      <ul className="space-y-3">
        {ativos.map((r) => {
          const g = gravidade(r.probabilidade, r.impacto);
          const venceu = r.prazoMitigacao && r.status !== 'ocorreu' && r.prazoMitigacao < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
          return (
            <li key={r.id} className="border-t border-slate-100 pt-2 first:border-0 first:pt-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`selo ${COR_GRAV[g]}`}>gravidade {ROT_GRAVIDADE[g]}</span>
                <b>{r.titulo}</b>
                <span className={`selo ${r.status === 'ocorreu' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>{STATUS_RISCO[r.status as StatusRisco]}</span>
                <span className="text-xs text-slate-500">probabilidade {ROT_NIVEL3[r.probabilidade]} · impacto {ROT_IMPACTO[r.impacto]}</span>
              </div>
              {r.descricao && <p className="text-xs text-slate-600 whitespace-pre-wrap">{r.descricao}</p>}
              <p className="text-xs mt-0.5">
                {r.mitigacao ? <><b>Plano:</b> {r.mitigacao}{r.responsavel ? ` · ${r.responsavel}` : ''}{r.prazoMitigacao ? <span className={venceu ? 'text-red-700 font-semibold' : ''}> · prazo {fmtData(r.prazoMitigacao)}{venceu ? ' (vencido)' : ''}</span> : ''}</> : <span className="text-amber-800">Sem plano de resposta.</span>}
              </p>
              {mexe && (
                <div className="flex flex-wrap gap-2 mt-1">
                  <details>
                    <summary className="text-xs text-[#0f4c81] cursor-pointer">plano de resposta</summary>
                    <FormAcao acao={acaoRisco} className="space-y-2 mt-1 w-80 text-xs">
                      {oculto}<input type="hidden" name="acao" value="plano" /><input type="hidden" name="riscoId" value={r.id} />
                      <textarea name="mitigacao" required rows={2} defaultValue={r.mitigacao} placeholder="O que será feito" className="campo w-full" />
                      <input name="responsavel" defaultValue={r.responsavel} placeholder="Responsável" className="campo w-full" />
                      <label className="block">Prazo<input type="date" name="prazoMitigacao" defaultValue={r.prazoMitigacao ? r.prazoMitigacao.toISOString().slice(0, 10) : ''} className="campo block w-full" /></label>
                      <Enviar className="btn-sec text-xs">Salvar plano</Enviar>
                    </FormAcao>
                  </details>
                  <details>
                    <summary className="text-xs text-[#0f4c81] cursor-pointer">reavaliar</summary>
                    <FormAcao acao={acaoRisco} className="space-y-2 mt-1 w-64 text-xs">
                      {oculto}<input type="hidden" name="acao" value="reavaliar" /><input type="hidden" name="riscoId" value={r.id} />
                      <label className="block">Probabilidade<Nivel nome="probabilidade" atual={r.probabilidade} rotulos={ROT_NIVEL3} /></label>
                      <label className="block">Impacto<Nivel nome="impacto" atual={r.impacto} rotulos={ROT_IMPACTO} /></label>
                      <input name="motivo" placeholder="O que mudou" className="campo w-full" />
                      <Enviar className="btn-sec text-xs">Reavaliar</Enviar>
                    </FormAcao>
                  </details>
                  <details>
                    <summary className="text-xs text-[#0f4c81] cursor-pointer">mudar situação</summary>
                    <FormAcao acao={acaoRisco} className="space-y-2 mt-1 w-72 text-xs">
                      {oculto}<input type="hidden" name="acao" value="status" /><input type="hidden" name="riscoId" value={r.id} />
                      <input name="motivo" placeholder="Motivo (obrigatório para “ocorreu” e “encerrado”)" className="campo w-full" />
                      <div className="flex flex-wrap gap-1">
                        {(['aberto', 'mitigando', 'ocorreu', 'encerrado'] as const).filter((s) => s !== r.status).map((s) => <Enviar key={s} name="status" value={s} className="btn-sec text-xs">{STATUS_RISCO[s]}</Enviar>)}
                      </div>
                    </FormAcao>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {encerrados.length > 0 && (
        <details>
          <summary className="text-xs text-slate-600 cursor-pointer">{encerrados.length} risco(s) encerrado(s)</summary>
          <ul className="mt-1 space-y-1 text-xs text-slate-600">
            {encerrados.map((r) => (
              <li key={r.id}>
                <span className="line-through">{r.titulo}</span> · {r.motivoEncerra}
                {mexe && (
                  <details className="inline ml-1"><summary className="inline text-[#0f4c81] cursor-pointer">reabrir</summary>
                    <FormAcao acao={acaoRisco} className="flex gap-1 mt-1">
                      {oculto}<input type="hidden" name="acao" value="status" /><input type="hidden" name="riscoId" value={r.id} /><input type="hidden" name="status" value="aberto" />
                      <input name="motivo" required placeholder="Por que reabrir" className="campo text-xs flex-1" /><Enviar className="btn-sec text-xs">Reabrir</Enviar>
                    </FormAcao>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {mexe && (
        <details open={riscos.length === 0}>
          <summary className="text-xs text-[#0f4c81] cursor-pointer">+ registrar um risco</summary>
          <FormAcao acao={acaoRisco} className="grid gap-2 sm:grid-cols-2 mt-2 text-sm">
            {oculto}<input type="hidden" name="acao" value="criar" />
            <label className="sm:col-span-2">O que pode dar errado<input name="titulo" required maxLength={200} placeholder="Ex.: Licitação deserta" className="campo w-full mt-1" /></label>
            <label>Probabilidade<Nivel nome="probabilidade" rotulos={ROT_NIVEL3} /></label>
            <label>Impacto se acontecer<Nivel nome="impacto" rotulos={ROT_IMPACTO} /></label>
            <label className="sm:col-span-2">Detalhes (opcional)<textarea name="descricao" rows={2} className="campo w-full mt-1" /></label>
            <label className="sm:col-span-2">Plano de resposta (opcional)<textarea name="mitigacao" rows={2} className="campo w-full mt-1" placeholder="O que será feito para evitar ou responder" /></label>
            <label>Responsável<input name="responsavel" className="campo w-full mt-1" /></label>
            <label>Prazo do plano<input type="date" name="prazoMitigacao" className="campo w-full mt-1" /></label>
            <div className="sm:col-span-2"><Enviar className="btn-sec">Registrar risco</Enviar></div>
          </FormAcao>
        </details>
      )}
    </section>
  );
}
