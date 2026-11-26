'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const B = '/dashboard/governanca';
const ABAS = [
  { href: B, rotulo: 'Sala de Situação' },
  { href: `${B}/projetos`, rotulo: 'Secretarias e etapas' },
  { href: `${B}/relatorio`, rotulo: 'Relatório de reunião' },
];

export default function AbasGovernanca() {
  const caminho = usePathname();
  return (
    <nav aria-label="Governança" className="bg-white border border-slate-200 rounded-xl mb-4 px-4 print:hidden">
      <ul className="flex flex-wrap gap-6">
        {ABAS.map((a) => {
          const ativo = a.href === B ? caminho === B : caminho === a.href || caminho.startsWith(`${a.href}/`);
          return (
            <li key={a.href}>
              <Link href={a.href} aria-current={ativo ? 'page' : undefined}
                className={`inline-block text-sm py-3 border-b-2 ${ativo ? 'border-[#1F6FEB] text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {a.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
