'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { GrupoMenu, ItemMenu } from '@/lib/financas/menu';

const casa = (rota: string, caminho: string) => caminho === rota || caminho.startsWith(`${rota}/`);
const doItem = (i: ItemMenu, caminho: string) => [i.href, ...(i.rotas ?? [])].some((r) => casa(r, caminho));

/** Áreas do Compliance na primeira linha; as opções da área aberta na segunda. */
export default function MenuCompliance({ grupos }: { grupos: GrupoMenu[] }) {
  const caminho = usePathname();
  const aberto = grupos.find((g) => g.itens.some((i) => doItem(i, caminho)));
  return (
    <nav aria-label="Compliance">
      <ul className="flex flex-wrap gap-1 px-2 py-1.5">
        {grupos.map((g) => {
          const ativo = g === aberto;
          return (
            <li key={g.rotulo}>
              <Link href={g.itens[0].href} aria-current={ativo ? 'page' : undefined}
                className={`inline-block text-sm px-3 py-1.5 rounded-md ${ativo ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'}`}>
                {g.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
      {aberto && aberto.itens.length > 1 && (
        <ul className="flex flex-wrap gap-1 px-2 py-1 border-t border-slate-100 bg-slate-50">
          {aberto.itens.map((i) => {
            const ativo = doItem(i, caminho);
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={ativo ? 'page' : undefined}
                  className={`inline-block text-sm px-2.5 py-1 rounded border-b-2 ${ativo ? 'border-emerald-600 text-emerald-800 font-semibold' : 'border-transparent text-slate-600 hover:text-emerald-800'}`}>
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
