'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { GrupoMenu, ItemMenu } from '@/lib/financas/menu';

const casa = (rota: string, caminho: string) => caminho === rota || caminho.startsWith(`${rota}/`);
const doItem = (i: ItemMenu, caminho: string) => [i.href, ...(i.rotas ?? [])].some((r) => casa(r, caminho));

/** No modelo do painel anterior: logo da prefeitura, áreas em pílulas (a aberta em rosa) e, abaixo, as opções da área em abas sublinhadas. */
export default function MenuCompliance({ grupos }: { grupos: GrupoMenu[] }) {
  const caminho = usePathname();
  const aberto = grupos.find((g) => g.itens.some((i) => doItem(i, caminho)));
  return (
    <nav aria-label="Compliance">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fazenda/nova-lima.png" alt="Prefeitura de Nova Lima" className="h-11 w-auto shrink-0" />
        <ul className="flex flex-wrap items-center gap-1">
          {grupos.map((g) => {
            const ativo = g === aberto;
            return (
              <li key={g.rotulo}>
                <Link href={g.itens[0].href} aria-current={ativo ? 'page' : undefined}
                  className={`inline-block text-[13.5px] px-3.5 py-1.5 rounded-full ${ativo ? 'bg-[#E10C8C] text-white font-semibold' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                  {g.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {aberto && aberto.itens.length > 1 && (
        <ul className="flex flex-wrap gap-5 px-6 border-t border-slate-100">
          {aberto.itens.map((i) => {
            const ativo = doItem(i, caminho);
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={ativo ? 'page' : undefined}
                  className={`inline-block text-[13px] py-2.5 border-b-2 ${ativo ? 'border-[#1F6FEB] text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {i.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
