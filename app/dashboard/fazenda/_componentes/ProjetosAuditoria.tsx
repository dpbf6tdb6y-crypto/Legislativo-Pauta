// Projetos da secretaria dentro da auditoria e do modo reunião (só para quem pode ver a carteira de projetos).
import Link from 'next/link';
import type { DbPrefeitura } from '@/lib/financas/db';
import { chaveLigada } from '@/lib/financas/chaves';
import { pode } from '@/lib/financas/perfis';
import { projetosDaSecretaria, sugestoesProjetos, type ProjetoDaSecretaria } from '@/lib/financas/projetos/dados';
import { COR_ALERTA, SeloSaude } from '@/app/dashboard/fazenda/(modulos)/projetos/Selos';
import { ROTULO_FASE, type Fase } from '@/lib/financas/projetos/regras';
import type { Sugestao } from '@/lib/financas/auditoria/regras';

/** null = o usuário não vê projetos ou o módulo está desligado (a tela simplesmente não mostra o quadro). */
export async function projetosParaAuditoria(s: { perfil: string; prefeituraId: string }, db: DbPrefeitura, orgaoCod: string, hoje: Date) {
  if (!pode(s.perfil, 'projetos') || !(await chaveLigada(s.prefeituraId, 'projetos'))) return null;
  const projetos = await projetosDaSecretaria(db, orgaoCod, hoje);
  return { projetos, sugestoes: sugestoesProjetos(projetos) as Sugestao[] };
}

export function QuadroProjetos({ projetos, grande = false }: { projetos: ProjetoDaSecretaria[]; grande?: boolean }) {
  const t = grande ? 'text-lg' : 'text-sm';
  return (
    <section className={grande ? 'space-y-2' : 'cartao'}>
      <h2 className={grande ? 'text-xl font-semibold' : 'font-semibold'}>Projetos desta secretaria ({projetos.length})</h2>
      {projetos.length === 0 && <p className={`${t} text-slate-500`}>Nenhum projeto aprovado, em execução ou pausado.</p>}
      <ul className="space-y-2">
        {projetos.map((p) => (
          <li key={p.id} className={`${t} border-t border-slate-100 pt-2 first:border-0 first:pt-0`}>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/dashboard/fazenda/projetos/${p.id}`} className="text-[#0f4c81] hover:underline font-medium">{p.titulo}</Link>
              <SeloSaude saude={p.saude} diasAtraso={p.diasAtraso} />
              <span className="text-xs text-slate-500">{ROTULO_FASE[p.fase as Fase]} · {p.papel === 'lider' ? 'líder' : 'parceira'}{p.avanco !== null ? ` · avanço ${p.avanco}%` : ''}{p.parceiras.length ? ` · com ${p.parceiras.map((x) => x.replace(/^SECRETARIA MUNICIPAL DE /i, '')).join(', ')}` : ''}</span>
            </div>
            {p.motivos.map((m) => <div key={m} className="text-xs text-slate-600">• {m}</div>)}
            {p.alertas.filter((a) => a.nivel !== 'info').map((a) => <div key={a.codigo} className={`text-xs rounded border px-1.5 py-0.5 mt-0.5 inline-block mr-1 ${COR_ALERTA[a.nivel].caixa}`}>{a.texto}</div>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
