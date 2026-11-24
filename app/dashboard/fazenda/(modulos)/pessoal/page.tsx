import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl } from '@/lib/financas/dinheiro';
import { nomeExibido, podeVerNomes } from '@/lib/financas/folha';
import { resumirFolha } from '@/lib/financas/painel/compliance';
import { agruparServidores, filtrarServidores, lerReais, ordenarServidores, ORDENS, type OrdemServidores } from '@/lib/financas/painel/folhaServidores';
import { BarrasH, Numero } from '@/app/dashboard/fazenda/_componentes/BlocosFinancas';
import FormFiltros from '@/app/dashboard/fazenda/_componentes/FormFiltros';

const nomeSecretaria = (n: string) => n.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /, '');
const POR_PAGINA = 100;
const Z = BigInt(0);
type Params = { q?: string; nome?: string; mes?: string; vinculo?: string; secretaria?: string; min?: string; max?: string; ord?: string; pg?: string };

export default async function Pessoal({ searchParams }: { searchParams: Params }) {
  const nome = (searchParams.nome ?? searchParams.q ?? '').trim();
  const secretaria = searchParams.secretaria ?? '', vinculo = searchParams.vinculo ?? '';
  const min = searchParams.min ?? '', max = searchParams.max ?? '';
  const ord: OrdemServidores = ORDENS.includes(searchParams.ord as OrdemServidores) ? (searchParams.ord as OrdemServidores) : 'nome';
  const pg = Math.max(1, Number(searchParams.pg ?? 1) || 1);
  const filtros = [nome && `busca="${nome}"`, secretaria && `secretaria="${secretaria}"`, vinculo && `vínculo="${vinculo}"`, min && `mín=${min}`, max && `máx=${max}`].filter(Boolean).join(' ');
  const { s, db } = await exigir('folha', 'Pessoal', { detalhe: `mês=${searchParams.mes ?? ''}${filtros ? ' ' + filtros : ''}`, acao: nome ? 'buscar' : 'ver', modulo: 'folha' });

  // todos os meses coletados, do mais recente para o mais antigo
  const meses = await db.folhaMes.findMany({ orderBy: { anoMes: 'desc' } });
  const lista = meses.map((m) => m.anoMes);
  const totais = await db.folhaLinha.groupBy({
    by: ['anoMes'], where: { anoMes: { in: lista } },
    _sum: { bruto: true, previdencia: true, desconto: true, irrf: true, liquido: true }, _count: { _all: true },
  });
  const servidoresMes = await db.folhaLinha.groupBy({ by: ['anoMes', 'matricula'], where: { anoMes: { in: lista } } });
  const nServ = new Map<string, number>();
  for (const x of servidoresMes) nServ.set(x.anoMes, (nServ.get(x.anoMes) ?? 0) + 1);
  const comLinhas = (am: string) => (totais.find((x) => x.anoMes === am)?._count._all ?? 0) > 0;
  // mês aberto por padrão: o mais recente que tem linhas (mês zerado não serve de padrão)
  const mes = meses.some((m) => m.anoMes === searchParams.mes) ? searchParams.mes! : meses.find((m) => comLinhas(m.anoMes))?.anoMes ?? meses[0]?.anoMes ?? '';
  // o último mês fechado já deveria estar aqui (o portal pode demorar a publicar; a coleta da noite tenta todo dia)
  const agora = new Date();
  const anterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const ultimoFechado = `${anterior.getFullYear()}/${String(anterior.getMonth() + 1).padStart(2, '0')}`;
  const faltaFechado = !lista.some((am) => am >= ultimoFechado && comLinhas(am));

  // LGPD: sem permissão para nomes, a busca é só por matrícula e a ordem "por nome" vira a da matrícula
  const verNomes = await podeVerNomes(s);

  // quadro do mês: totais, secretarias e vínculos (o vínculo escolhido filtra tudo, menos a própria lista de vínculos)
  const campos = { matricula: true, nome: true, cargo: true, lotacao: true, tipoVinculo: true, vencimentos: true, bruto: true, liquido: true } as const;
  const doMes = mes ? await db.folhaLinha.findMany({ where: { anoMes: mes }, select: campos }) : [];
  const geral = resumirFolha(doMes);
  const doVinculo = vinculo ? doMes.filter((l) => l.tipoVinculo === vinculo) : doMes;
  const r = vinculo ? resumirFolha(doVinculo) : geral;
  const linkVinculo = (v: string) => `?${new URLSearchParams({ mes, ...(v && v !== vinculo ? { vinculo: v } : {}) })}`;

  // tabela de servidores: um por linha (a matrícula pode ter 2 linhas no mês), com filtros nas colunas; o vínculo já vem filtrado acima
  const todos = agruparServidores(doVinculo);
  const secretarias = [...new Set(todos.map((x) => x.secretaria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const vinculos = [...new Set(geral.porVinculo.map((v) => v.nome))];
  const achados = ordenarServidores(
    filtrarServidores(todos, { nome, secretaria, brutoMin: lerReais(min), brutoMax: lerReais(max), soMatricula: !verNomes }),
    ord, !verNomes,
  );
  const totalBruto = achados.reduce((t, x) => t + x.bruto, Z);
  const paginas = Math.max(1, Math.ceil(achados.length / POR_PAGINA));
  const pagina = Math.min(pg, paginas);
  const visiveis = achados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  const atuais: Record<string, string> = { mes, ...(nome && { nome }), ...(secretaria && { secretaria }), ...(vinculo && { vinculo }), ...(min && { min }), ...(max && { max }), ord };
  const link = (mudar: Record<string, string | null>) => {
    const p = new URLSearchParams({ ...atuais, ...(Object.fromEntries(Object.entries(mudar).filter(([, v]) => v !== null)) as Record<string, string>) });
    for (const [k, v] of Object.entries(mudar)) if (v === null) p.delete(k);
    return `?${p.toString()}`;
  };
  const ordenarPor = (campo: string) => link({ ord: ord === campo ? `-${campo}` : campo, pg: null });
  const seta = (campo: string) => (ord === campo ? ' ▲' : ord === `-${campo}` ? ' ▼' : '');
  const filtrando = !!(nome || secretaria || min || max);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Pessoal · folha de {mes || '—'}</h1>
        <p className="text-xs text-slate-500">Portal da Transparência, tela completa de servidores.{vinculo && <> Filtro: <b>{vinculo}</b>.</>}</p>
      </div>

      {faltaFechado && (
        <p className="rounded border border-amber-200 bg-amber-50 text-amber-900 text-sm px-3 py-2">
          A folha de {ultimoFechado} ainda não está aqui: o portal não a publicou ou a coleta ainda não passou. A coleta da noite tenta de novo todo dia.
        </p>
      )}

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
        <h2 className="font-semibold mb-1">Todos os meses ({meses.length})</h2>
        <div className={meses.length > 14 ? 'max-h-[30rem] overflow-y-auto' : ''}>
          <table className="tabela">
            <thead className="sticky top-0"><tr><th>Mês</th><th className="n">Servidores</th><th className="n">Linhas</th><th className="n">Bruto</th><th className="n">Previdência</th><th className="n">Desconto</th><th className="n">IRRF</th><th className="n">Líquido</th><th>Conferência</th></tr></thead>
            <tbody>
              {meses.length === 0 && <tr><td colSpan={9} className="text-center text-slate-500 py-4">Nenhum mês de folha coletado.</td></tr>}
              {meses.map((m) => {
                const t = totais.find((x) => x.anoMes === m.anoMes);
                const linhasGuardadas = t?._count._all ?? 0;
                return (
                  <tr key={m.anoMes} className={m.anoMes === mes ? 'bg-sky-50' : ''}>
                    <td><Link className="text-emerald-700 hover:underline" href={`?${new URLSearchParams({ mes: m.anoMes })}`} scroll={false}>{m.anoMes}</Link></td>
                    <td className="n">{(nServ.get(m.anoMes) ?? 0).toLocaleString('pt-BR')}</td><td className="n">{linhasGuardadas.toLocaleString('pt-BR')}</td>
                    <td className="n">{brl(t?._sum.bruto ?? Z)}</td><td className="n">{brl(t?._sum.previdencia ?? Z)}</td><td className="n">{brl(t?._sum.desconto ?? Z)}</td><td className="n">{brl(t?._sum.irrf ?? Z)}</td><td className="n">{brl(t?._sum.liquido ?? Z)}</td>
                    <td className="text-xs">{linhasGuardadas > 0 && linhasGuardadas === m.linhasPortal ? `✔ ${m.linhasPortal.toLocaleString('pt-BR')} linhas = portal` : <span className="text-amber-800">{`✘ ${linhasGuardadas.toLocaleString('pt-BR')} de ${m.linhasPortal.toLocaleString('pt-BR')} (a coleta da noite completa)`}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-2">Totais = soma das linhas exibidas na tela do portal (o portal não publica total da folha). Alguns servidores têm 2 linhas no mês (pergunta Q8 em aberto). Outros descontos (consignados, pensão etc.) não são publicados. Clique em um mês para ver os servidores dele abaixo.</p>
      </div>

      <section className="cartao p-0" id="servidores">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <div className="mr-auto">
            <h2 className="font-semibold">Servidores · {mes || '—'}</h2>
            <p className="text-xs text-slate-500">
              {achados.length.toLocaleString('pt-BR')} de {todos.length.toLocaleString('pt-BR')} servidores · bruto {filtrando ? 'dos filtrados' : 'total'}: <b>{brl(totalBruto)}</b>.
              Total bruto = soma de todas as linhas do servidor no mês (o portal lista o salário e os lançamentos sem vencimento em linhas separadas). Toda busca fica registrada.
            </p>
          </div>
          {(filtrando || vinculo) && <Link href={`?mes=${encodeURIComponent(mes)}&ord=${ord}`} className="btn-sec" scroll={false}>Limpar filtros</Link>}
        </div>

        <FormFiltros>
          <input type="hidden" name="mes" value={mes} />
          <input type="hidden" name="ord" value={ord} />
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th><Link href={ordenarPor('nome')} scroll={false}>{verNomes ? 'Nome' : 'Servidor'}{seta('nome')}</Link></th>
                  <th><Link href={ordenarPor('cargo')} scroll={false}>Cargo{seta('cargo')}</Link></th>
                  <th><Link href={ordenarPor('secretaria')} scroll={false}>Secretaria{seta('secretaria')}</Link></th>
                  <th><Link href={ordenarPor('vinculo')} scroll={false}>Tipo de vínculo{seta('vinculo')}</Link></th>
                  <th className="n"><Link href={ordenarPor('vencimentos')} scroll={false}>Vencimentos{seta('vencimentos')}</Link></th>
                  <th className="n"><Link href={ordenarPor('bruto')} scroll={false}>Total bruto{seta('bruto')}</Link></th>
                  <th className="n"><Link href={ordenarPor('liquido')} scroll={false}>Líquido{seta('liquido')}</Link></th>
                </tr>
                <tr>
                  <th className="bg-white normal-case"><input name="nome" defaultValue={nome} placeholder={verNomes ? 'filtrar nome ou matrícula' : 'filtrar por matrícula'} className="campo w-full font-normal" aria-label="Filtrar por nome ou matrícula" /></th>
                  <th className="bg-white normal-case" />
                  <th className="bg-white normal-case">
                    <select name="secretaria" defaultValue={secretaria} className="campo w-full font-normal" aria-label="Filtrar por secretaria">
                      <option value="">Todas as secretarias</option>
                      {secretarias.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </th>
                  <th className="bg-white normal-case">
                    <select name="vinculo" defaultValue={vinculo} className="campo w-full font-normal" aria-label="Filtrar por tipo de vínculo">
                      <option value="">Todos os vínculos</option>
                      {vinculos.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </th>
                  <th className="bg-white normal-case" />
                  <th className="bg-white normal-case">
                    <div className="flex items-center justify-end gap-1">
                      <input name="min" defaultValue={min} placeholder="de R$" inputMode="decimal" className="campo w-24 text-right font-normal" aria-label="Bruto mínimo" />
                      <input name="max" defaultValue={max} placeholder="até R$" inputMode="decimal" className="campo w-24 text-right font-normal" aria-label="Bruto máximo" />
                      <button className="btn-sec">Filtrar</button>
                    </div>
                  </th>
                  <th className="bg-white normal-case" />
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 && <tr><td colSpan={7} className="text-center text-slate-500 py-4">{todos.length ? 'Nenhum servidor com esses filtros.' : 'Sem folha neste mês.'}</td></tr>}
                {visiveis.map((x) => (
                  <tr key={x.matricula} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap">
                      <Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/pessoal/${encodeURIComponent(x.matricula)}`}>{nomeExibido(x, verNomes)}</Link>
                      {verNomes && <span className="text-xs text-slate-400"> · {x.matricula}</span>}
                    </td>
                    <td className="text-xs">{x.cargo || '—'}</td>
                    <td className="text-xs" title={x.lotacao}>{x.secretaria}</td>
                    <td className="text-xs">{x.tipoVinculo}</td>
                    <td className="n">{brl(x.vencimentos)}</td>
                    <td className="n font-semibold">{brl(x.bruto)}</td>
                    <td className="n">{brl(x.liquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormFiltros>

        {paginas > 1 && (
          <div className="flex items-center gap-2 text-sm p-3">
            {pagina > 1 && <Link className="btn-sec" href={link({ pg: String(pagina - 1) })} scroll={false}>← anterior</Link>}
            <span className="text-slate-500">página {pagina} de {paginas} · {POR_PAGINA} por página</span>
            {pagina < paginas && <Link className="btn-sec" href={link({ pg: String(pagina + 1) })} scroll={false}>próxima →</Link>}
          </div>
        )}
        {!verNomes && <p className="text-xs text-slate-500 p-3">Nomes ocultos (LGPD): aparecem só para prefeito, controlador, RH e auditor, com a chave folha_nomes ligada.</p>}
      </section>
    </div>
  );
}
