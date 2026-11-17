import Link from 'next/link';
import type { ReactNode } from 'react';
import { sessaoAtual } from '@/lib/financas/auth';
import { dbDa } from '@/lib/financas/db';
import { PERFIS } from '@/lib/financas/perfis';
import { menuDoPerfil } from '@/lib/financas/menu';
import { dataCurta, frescorFontes, idadeDias, STATUS_TERMINADA } from '@/lib/financas/coleta/frescor';

// Módulos da Gestão $$$ (vindos do compliance.gavix). Fica dentro do layout do SEGOV (menu lateral);
// aqui só o submenu e a faixa com a data dos dados do portal. Cada página confere a própria permissão.
export const dynamic = 'force-dynamic';


export default async function LayoutModulos({ children }: { children: ReactNode }) {
  const s = await sessaoAtual();
  // sem perfil da Gestão: só a página (a de "sem permissão" explica o que falta)
  if (!s) return <div className="max-w-7xl mx-auto">{children}</div>;

  const db = dbDa(s.prefeituraId);
  const ultima = await db.coleta.findFirst({ where: { status: { in: STATUS_TERMINADA } }, orderBy: { id: 'desc' } });
  // a data que vale é a de cada fonte (arquivo baixado), não a da última coleta: coleta parcial ou travada não atualiza o resto
  const fontes = await frescorFontes(db);
  const hoje = new Date();
  const diarias = fontes.filter((f) => f.diaria && f.baixadoEm);
  const velha = diarias.some((f) => idadeDias(f.baixadoEm, hoje) > 1.5);
  const cor = !diarias.length || ultima?.status === 'falha' ? 'bg-red-100 text-red-900' : velha || ultima?.status === 'divergencia' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
  const desp = fontes.find((f) => f.chave === 'despesa')?.baixadoEm;
  const resumoFontes = fontes.filter((f) => f.baixadoEm && f.chave !== 'despesa' && f.chave !== 'receita' && f.chave !== 'restos')
    .map((f) => `${f.nome.replace(' (SICONFI)', '')} ${dataCurta(f.baixadoEm!)}`).join(' · ');
  const itens = menuDoPerfil(s.perfil);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
        <div className={`text-xs px-4 py-1.5 ${cor}`}>
          <span className="float-right opacity-80 ml-3">{s.nome} · {PERFIS[s.perfil]?.nome}</span>
          {desp
            ? <>Despesa e receita baixadas em <b>{dataCurta(desp)}</b>{velha && <b> · dados do portal desatualizados</b>}{resumoFontes && <> · {resumoFontes}</>}{ultima && <> · última coleta: <b>{ultima.status === 'ok' ? 'ok' : ultima.status === 'divergencia' ? 'com divergência na conferência' : 'falhou'}</b></>}</>
            : <>Ainda não há dados do portal coletados.</>}
        </div>
        <nav className="flex flex-wrap gap-1 px-2 py-1.5">
          {itens.map((m) => (
            <Link key={m.href} href={m.href} className="text-sm px-2 py-1 rounded text-slate-700 hover:bg-emerald-50 hover:text-emerald-800">{m.rotulo}</Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
