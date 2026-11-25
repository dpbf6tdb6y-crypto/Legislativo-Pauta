// Campos de dados do projeto, iguais no cadastro e na edição.
import { FONTES, PRIORIDADES, TIPOS } from '@/lib/financas/projetos/regras';

export interface Valores {
  titulo?: string; objetivo?: string; tipo?: string; prioridade?: string; eixo?: string; bairro?: string; fonteRecurso?: string;
  orcamento?: bigint | null; inicioPrevisto?: Date | null; fimPrevisto?: Date | null;
}
const iso = (d?: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const reais = (c?: bigint | null) => (c === null || c === undefined ? '' : `${(c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(c % 100n).toString().padStart(2, '0')}`);

export default function CamposProjeto({ v = {}, travarOrcamento = false }: { v?: Valores; travarOrcamento?: boolean }) {
  return (
    <>
      <label className="md:col-span-2">Nome do projeto
        <input name="titulo" required maxLength={200} defaultValue={v.titulo} placeholder="Ex.: Escola integrada do bairro Vila Nova" className="campo w-full mt-1" />
      </label>
      <label className="md:col-span-2">Objetivo <span className="text-slate-500">· o que muda para a população</span>
        <textarea name="objetivo" rows={3} maxLength={3000} defaultValue={v.objetivo} className="campo w-full mt-1" />
      </label>
      <label>Tipo
        <select name="tipo" required defaultValue={v.tipo ?? 'obra'} className="campo w-full mt-1">
          {Object.entries(TIPOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
      </label>
      <label>Prioridade
        <select name="prioridade" defaultValue={v.prioridade ?? 'media'} className="campo w-full mt-1">
          {Object.entries(PRIORIDADES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
      </label>
      <label>Eixo do plano de governo / programa do PPA <span className="text-slate-500">(opcional)</span>
        <input name="eixo" maxLength={200} defaultValue={v.eixo} className="campo w-full mt-1" />
      </label>
      <label>Bairro ou região <span className="text-slate-500">(opcional)</span>
        <input name="bairro" maxLength={200} defaultValue={v.bairro} className="campo w-full mt-1" />
      </label>
      <label>Orçamento estimado (R$) <span className="text-slate-500">· obrigatório para aprovar</span>
        <input name="orcamento" inputMode="decimal" defaultValue={reais(v.orcamento)} readOnly={travarOrcamento} placeholder="4.500.000,00" className={`campo w-full mt-1 ${travarOrcamento ? 'bg-slate-50' : ''}`} />
        {travarOrcamento && <span className="text-xs text-slate-500">Depois de aprovado, só o prefeito ou o controlador altera.</span>}
      </label>
      <label>Fonte do recurso <span className="text-slate-500">(opcional)</span>
        <select name="fonteRecurso" defaultValue={v.fonteRecurso ?? ''} className="campo w-full mt-1">
          <option value="">—</option>
          {Object.entries(FONTES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
      </label>
      <label>Início previsto <span className="text-slate-500">· obrigatório para aprovar</span>
        <input name="inicioPrevisto" type="date" defaultValue={iso(v.inicioPrevisto)} className="campo w-full mt-1" />
      </label>
      <label>Fim previsto <span className="text-slate-500">· obrigatório para aprovar</span>
        <input name="fimPrevisto" type="date" defaultValue={iso(v.fimPrevisto)} className="campo w-full mt-1" />
      </label>
    </>
  );
}
