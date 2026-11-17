import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigir, usuarioDaSessao } from '@/lib/financas/auth';
import { brlCurto } from '@/lib/financas/dinheiro';
import { pode } from '@/lib/financas/perfis';
import { filtroVisivel, lerChecagens, ordenarFila, prazoTexto, ROTULO_STATUS_DOC, semaforo, TIPOS_DOC, type StatusDoc } from '@/lib/financas/documentos/fluxo';
import BolaSemaforo, { COR_SEMAFORO } from './Semaforo';

const ABAS: { chave: string; rotulo: string; status: StatusDoc[] }[] = [
  { chave: 'assinar', rotulo: 'Para assinar', status: ['para_assinatura'] },
  { chave: 'conferencia', rotulo: 'Em conferência', status: ['em_conferencia'] },
  { chave: 'historico', rotulo: 'Assinados e devolvidos', status: ['assinado', 'devolvido', 'cancelado'] },
];

export default async function Documentos({ searchParams }: { searchParams: { aba?: string } }) {
  const { s, db } = await exigir(null, 'Documentos para assinar');
  const u = (await usuarioDaSessao(s))!;
  const veTudo = pode(s.perfil, 'documentos');
  if (!veTudo && !pode(s.perfil, 'documentos_enviar')) redirect('/dashboard/fazenda/sem-permissao');
  const filtro = filtroVisivel({ id: u.id, nome: u.nome, perfil: u.perfil, orgaoCod: u.orgaoCod }, veTudo);
  const hoje = new Date();

  // o parecerista abre na conferência; os demais, no que está pronto para assinar
  const padrao = pode(s.perfil, 'documentos_parecer') ? 'conferencia' : 'assinar';
  const aba = ABAS.find((a) => a.chave === (searchParams.aba ?? padrao)) ?? ABAS[0];
  const contagem = Object.fromEntries(await Promise.all(ABAS.map(async (a) => [a.chave, await db.documentoAssinatura.count({ where: { ...filtro, status: { in: a.status } } })])));
  const docs = await db.documentoAssinatura.findMany({ where: { ...filtro, status: { in: aba.status } }, orderBy: { enviadoEm: 'desc' }, take: 200 });
  const lista = aba.chave === 'historico' ? docs : ordenarFila(docs);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Documentos para assinar</h1>
          <p className="text-sm text-slate-600">A secretaria envia, o sistema confere, o controlador ou o jurídico dá o parecer e o prefeito decide. Tudo fica registrado.</p>
        </div>
        {pode(s.perfil, 'documentos_enviar') && <Link href="/dashboard/fazenda/documentos/novo" className="btn">+ Enviar documento</Link>}
      </div>

      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <Link key={a.chave} href={`?aba=${a.chave}`} className={a.chave === aba.chave ? 'btn' : 'btn-sec'}>{a.rotulo} <span className="opacity-80">({contagem[a.chave]})</span></Link>
        ))}
      </div>

      {lista.length === 0 && <div className="cartao text-sm text-slate-500">Nenhum documento aqui.</div>}
      <ul className="space-y-2">
        {lista.map((d) => {
          const sem = semaforo({ parecer: d.parecer, checagens: lerChecagens(d.checagens) });
          const pz = d.status === 'para_assinatura' || d.status === 'em_conferencia' ? prazoTexto(d.prazo, hoje) : '';
          return (
            <li key={d.id}>
              <Link href={`/dashboard/fazenda/documentos/${d.id}`} className={`flex gap-3 items-start rounded-lg border bg-white p-3 hover:shadow-sm ${COR_SEMAFORO[sem.cor].borda}`}>
                <BolaSemaforo cor={aba.chave === 'historico' ? 'cinza' : sem.cor} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <b className="truncate">{d.assunto}</b>
                    <span className="text-sm tabular-nums ml-auto">{d.valor ? brlCurto(d.valor) : ''}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    #{d.id} · {TIPOS_DOC[d.tipo] ?? d.tipo} · {d.orgaoNome} · enviado por {d.enviadoPor} em {d.enviadoEm.toLocaleDateString('pt-BR')}
                    {pz && <> · <b className={pz.startsWith('prazo vencido') || pz === 'assinar hoje' ? 'text-red-700' : ''}>{pz}</b></>}
                  </div>
                  <div className="text-sm mt-0.5">
                    {aba.chave === 'historico'
                      ? <>{ROTULO_STATUS_DOC[d.status as StatusDoc]}{d.decisaoPor ? ` por ${d.decisaoPor} em ${d.decisaoEm?.toLocaleDateString('pt-BR')}` : ''}</>
                      : <span className={COR_SEMAFORO[sem.cor].texto}>{COR_SEMAFORO[sem.cor].rotulo}: {sem.frase}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
