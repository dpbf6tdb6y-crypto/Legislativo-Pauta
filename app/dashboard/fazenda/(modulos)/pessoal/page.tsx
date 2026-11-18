import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl } from '@/lib/financas/dinheiro';
import { nomeExibido, podeVerNomes } from '@/lib/financas/folha';
import { resumirFolha } from '@/lib/financas/painel/compliance';
import { BarrasH, Numero } from '@/app/dashboard/fazenda/_componentes/BlocosFinancas';

const nomeSecretaria = (n: string) => n.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /, '');

export default async function Pessoal({ searchParams }: { searchParams: { q?: string; mes?: string; vinculo?: string } }) {
  const q = (searchParams.q ?? '').trim().toUpperCase();
  const { s, db } = await exigir('folha', 'Pessoal', { detalhe: q ? `busca="${q}" mês=${searchParams.mes ?? ''}` : `mês=${searchParams.mes ?? ''}`, acao: q ? 'buscar' : 'ver', modulo: 'folha' });

  const meses = await db.folhaMes.findMany({ orderBy: { anoMes: 'desc' }, take: 12 });
  const mes = searchParams.mes ?? meses[0]?.anoMes ?? '';
  const totais = await db.folhaLinha.groupBy({
    by: ['anoMes'], where: { anoMes: { in: meses.map((m) => m.anoMes) } },
    _sum: { bruto: true, previdencia: true, desconto: true, irrf: true, liquido: true }, _count: { _all: true },
  });
  const servidores = await db.folhaLinha.groupBy({ by: ['anoMes', 'matricula'], where: { anoMes: { in: meses.map((m) => m.anoMes) } } });
  const nServ = (am: string) => servidores.filter((s) => s.anoMes === am).length;

  // LGPD: sem permissão para nomes, a busca é só por matrícula e a lista sai na ordem da matrícula
  const verNomes = await podeVerNomes(s);
  const vinculo = searchParams.vinculo ?? '';
  const where: any = { anoMes: mes, ...(vinculo ? { tipoVinculo: vinculo } : {}) };
  if (q) where.OR = verNomes ? [{ nome: { contains: q } }, { matricula: q }] : [{ matricula: q }];
  const linhas = q || mes ? await db.folhaLinha.findMany({ where, orderBy: verNomes ? [{ nome: 'asc' }, { seq: 'asc' }] : [{ matricula: 'asc' }, { seq: 'asc' }], take: q ? 200 : 100 }) : [];

  // quadro do mês: totais, secretarias e vínculos (o vínculo escolhido filtra tudo, menos a própria lista de vínculos)
  const campos = { matricula: true, lotacao: true, tipoVinculo: true, vencimentos: true, bruto: true, liquido: true } as const;
  const doMes = mes ? await db.folhaLinha.findMany({ where: { anoMes: mes }, select: campos }) : [];
  const geral = resumirFolha(doMes);
  const r = vinculo ? resumirFolha(doMes.filter((l) => l.tipoVinculo === vinculo)) : geral;
  const linkVinculo = (v: string) => `?${new URLSearchParams({ mes, ...(searchParams.q ? { q: searchParams.q } : {}), ...(v && v !== vinculo ? { vinculo: v } : {}) })}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Pessoal · folha de {mes || '—'}</h1>
        <p className="text-xs text-slate-500">Portal da Transparência, tela completa de servidores.{vinculo && <> Filtro: <b>{vinculo}</b>.</>}</p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Numero titulo="Servidores" valor={r.servidores.toLocaleString('pt-BR')} detalhe={`${r.comVencimento.toLocaleString('pt-BR')} com vencimento no mês`} />
        <Numero titulo="Vencimentos" valor={brl(r.vencimentos)} detalhe="base da folha" />
        <Numero titulo="Bruto" valor={brl(r.bruto)} detalhe="com vantagens, adicionais e lançamentos sem vencimento" />
        <Numero titulo="Vencimento médio" valor={brl(r.mediaVencimento)} detalhe="por servidor com vencimento" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="cartao">
          <h2 className="font-semibold mb-2">Folha por secretaria</h2>
          <BarrasH total={r.vencimentos} formato={brl} itens={r.porLotacao.map((l) => ({ nome: nomeSecretaria(l.nome), valor: l.valor }))} />
          <p className="text-xs text-slate-500 mt-2">As 8 maiores, pelos vencimentos.</p>
        </section>
        <section className="cartao">
          <h2 className="font-semibold mb-2">Vínculo dos servidores</h2>
          <BarrasH formato={(v) => Number(v).toLocaleString('pt-BR')} itens={geral.porVinculo.map((v) => ({ nome: v.nome, valor: BigInt(v.servidores), href: linkVinculo(v.nome), ativo: v.nome === vinculo }))} />
          <p className="text-xs text-slate-500 mt-2">Clique em um vínculo para filtrar a tela. Clique de novo para limpar.</p>
        </section>
      </div>

      <div className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Últimos 12 meses</h2>
        <table className="tabela">
          <thead><tr><th>Mês</th><th className="n">Servidores</th><th className="n">Linhas</th><th className="n">Bruto</th><th className="n">Previdência</th><th className="n">Desconto</th><th className="n">IRRF</th><th className="n">Líquido</th><th>Conferência</th></tr></thead>
          <tbody>
            {meses.map((m) => {
              const t = totais.find((x) => x.anoMes === m.anoMes);
              return (
                <tr key={m.anoMes} className={m.anoMes === mes ? 'bg-sky-50' : ''}>
                  <td><Link className="text-emerald-700 hover:underline" href={{ query: { mes: m.anoMes, q: searchParams.q ?? '' } }}>{m.anoMes}</Link></td>
                  <td className="n">{nServ(m.anoMes)}</td><td className="n">{t?._count._all ?? 0}</td>
                  <td className="n">{brl(t?._sum.bruto ?? BigInt(0))}</td><td className="n">{brl(t?._sum.previdencia ?? BigInt(0))}</td><td className="n">{brl(t?._sum.desconto ?? BigInt(0))}</td><td className="n">{brl(t?._sum.irrf ?? BigInt(0))}</td><td className="n">{brl(t?._sum.liquido ?? BigInt(0))}</td>
                  <td className="text-xs">{m.linhasColetadas === m.linhasPortal ? `✔ ${m.linhasPortal} linhas = portal` : `✘ ${m.linhasColetadas} de ${m.linhasPortal}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500 mt-2">Totais = soma das linhas exibidas na tela do portal (o portal não publica total da folha). Alguns servidores têm 2 linhas no mês (pergunta Q8 em aberto). Outros descontos (consignados, pensão etc.) não são publicados.</p>
      </div>

      <form className="flex flex-wrap gap-2 items-end">
        <input type="hidden" name="mes" value={mes} />
        {vinculo && <input type="hidden" name="vinculo" value={vinculo} />}
        <label className="text-sm">Buscar por {verNomes ? 'nome ou matrícula' : 'matrícula'} · {mes}
          <input name="q" defaultValue={searchParams.q ?? ''} className="campo w-72 block mt-1" placeholder={verNomes ? 'nome ou matrícula' : 'matrícula'} />
        </label>
        <button className="btn-sec">Buscar</button>
        <span className="text-xs text-slate-500">Toda busca fica registrada com o termo pesquisado.</span>
      </form>

      {linhas.length > 0 && (
        <div className="cartao overflow-x-auto p-0">
          <table className="tabela">
            <thead><tr><th>Matrícula</th><th>Nome</th><th>Cargo</th><th>Vínculo</th><th>Situação</th><th>Lotação</th><th className="n">Bruto</th><th className="n">Previdência</th><th className="n">Desconto</th><th className="n">IRRF</th><th className="n">Líquido</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td><Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/pessoal/${encodeURIComponent(l.matricula)}`}>{l.matricula}</Link></td>
                  <td>{nomeExibido(l, verNomes)}</td><td className="text-xs">{l.cargo}</td><td className="text-xs">{l.tipoVinculo}</td><td className="text-xs">{l.situacao}</td><td className="text-xs">{l.lotacao}</td>
                  <td className="n">{brl(l.bruto)}</td><td className="n">{brl(l.previdencia)}</td><td className="n">{brl(l.desconto)}</td><td className="n">{brl(l.irrf)}</td><td className="n">{brl(l.liquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q && <p className="text-xs text-slate-500 p-2">Mostrando as 100 primeiras linhas do mês {verNomes ? 'em ordem alfabética' : 'por matrícula'}. Use a busca.</p>}
          {!verNomes && <p className="text-xs text-slate-500 p-2">Nomes ocultos (LGPD): aparecem só para prefeito, controlador, RH e auditor, com a chave folha_nomes ligada.</p>}
        </div>
      )}
    </div>
  );
}
