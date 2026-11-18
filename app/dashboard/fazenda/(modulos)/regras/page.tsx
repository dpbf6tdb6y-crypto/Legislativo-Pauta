import { exigir } from '@/lib/financas/auth';
import { pode } from '@/lib/financas/perfis';
import { REGRAS, previaRegra, registrarRegras } from '@/lib/financas/regras/motor';
import { decidirRegra } from '../acoes';
import AbasAuditoriaInterna from '@/app/dashboard/fazenda/_componentes/AbasAuditoriaInterna';

const COR: Record<string, string> = { proposta: 'bg-slate-100 text-slate-700', aprovada: 'bg-emerald-100 text-emerald-900', desligada: 'bg-red-100 text-red-900' };

export default async function Regras({ searchParams }: { searchParams: { previa?: string } }) {
  const { s, db } = await exigir('apontamentos', 'Regras', { detalhe: searchParams.previa ? `prévia ${searchParams.previa}` : '' });
  await registrarRegras(s.prefeituraId);
  const regs = await db.regra.findMany({ orderBy: { codigo: 'asc' } });
  const podeAprovar = pode(s.perfil, 'regras_aprovar');
  const previa = searchParams.previa && REGRAS.some((r) => r.codigo === searchParams.previa) ? await previaRegra(s.prefeituraId, searchParams.previa) : null;

  return (
    <div className="space-y-4">
      <AbasAuditoriaInterna atual="regras" />
      <h1 className="text-lg font-semibold">Auditoria interna · regras de conferência</h1>
      <p className="text-sm text-slate-600">
        O sistema não decide o que é irregular. Cada regra nasce como <b>proposta</b> e só gera apontamentos depois de <b>aprovada</b> pelo controlador.
        Apontamento = &quot;para análise&quot;, com a base legal; quem classifica é uma pessoa.
      </p>
      {regs.map((r) => {
        const def = REGRAS.find((x) => x.codigo === r.codigo);
        const params = JSON.parse(r.parametros);
        return (
          <div key={r.codigo} className="cartao">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs bg-slate-100 rounded px-1">{r.codigo}</span>
              <b>{r.titulo}</b>
              <span className={`selo ${COR[r.estado]}`}>{r.estado}</span>
              {r.decididoPor && <span className="text-xs text-slate-500">por {r.decididoPor} em {r.decididoEm?.toLocaleString('pt-BR')}</span>}
              <a className="text-xs text-emerald-700 hover:underline ml-auto" href={`?previa=${r.codigo}`}>ver prévia</a>
            </div>
            <p className="text-sm mt-1">{r.descricao}</p>
            <p className="text-xs text-slate-500">Base legal: {r.baseLegal}</p>
            {podeAprovar && def && (
              <form action={decidirRegra} className="flex flex-wrap items-end gap-2 mt-2 text-sm">
                <input type="hidden" name="codigo" value={r.codigo} />
                {Object.keys(def.parametrosPadrao).map((k) => (
                  <label key={k} className="text-xs">{k}{def.exigeParametro?.includes(k) && ' (obrigatório)'}
                    <input name={`p_${k}`} defaultValue={params[k] ?? ''} className="campo w-24 block" />
                  </label>
                ))}
                <button name="estado" value="aprovada" className="btn">Aprovar</button>
                <button name="estado" value="desligada" className="btn-sec">Desligar</button>
                <button name="estado" value="proposta" className="btn-sec">Voltar a proposta</button>
              </form>
            )}
            {previa && searchParams.previa === r.codigo && (
              <div className="mt-3 border-t border-slate-100 pt-2">
                <p className="text-sm font-semibold">Prévia: {previa.length} caso(s) com os dados atuais {r.estado !== 'aprovada' && '(nada é gravado enquanto a regra não for aprovada)'}</p>
                <ul className="text-xs list-disc pl-5 max-h-64 overflow-auto">
                  {previa.slice(0, 50).map((a) => <li key={a.chaveUnica}>{a.resumo}</li>)}
                </ul>
                {previa.length > 50 && <p className="text-xs text-slate-500">… e mais {previa.length - 50}.</p>}
              </div>
            )}
          </div>
        );
      })}
      <div className="cartao text-sm">
        <b>Regras que dependem de informação sua</b> (PLANO §14, ❓): % de suplementação da LOA (O4), limite de repasse à Câmara (O6), metas da LDO (F2),
        limites de dispensa do ano (C5), regulamento municipal da ordem cronológica (C6), subsídio do prefeito como teto (P1). Ainda não implementadas.
      </div>
    </div>
  );
}
