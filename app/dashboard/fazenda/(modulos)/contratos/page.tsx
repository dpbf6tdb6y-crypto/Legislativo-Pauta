import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl, brlCurto, pct } from '@/lib/financas/dinheiro';
import {
  agregarLigacoes, COLUNAS, filtrarContratos, ordenarContratos, prazoContrato, resumoContratos, SITUACAO_VIGENTE,
  type Coluna, type EmpenhoLigavel, type LinhaContrato, type Tom,
} from '@/lib/financas/painel/contratos';

const d = (x: Date | null) => (x ? x.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const TAM_PAGINA = 50;
const SELO: Record<Tom, string> = { vermelho: 'bg-red-100 text-red-900', ambar: 'bg-amber-100 text-amber-900', cinza: 'bg-slate-100 text-slate-700', verde: 'bg-emerald-100 text-emerald-900' };
type Params = { [k: string]: string | undefined };
const CAMPOS = ['contrato', 'situacao', 'secretaria', 'credor', 'objeto', 'prazo', 'valorMin'] as const;

export default async function Contratos({ searchParams }: { searchParams: Params }) {
  const pg = Math.max(1, Number(searchParams.pg ?? 1));
  const filtros = {
    contrato: searchParams.contrato ?? '', secretaria: searchParams.secretaria ?? '', credor: searchParams.credor ?? '', objeto: searchParams.objeto ?? '',
    prazo: searchParams.prazo ?? '', valorMin: searchParams.valorMin ?? '', ligacao: searchParams.ligacao ?? '',
    situacao: (searchParams.situacao ?? SITUACAO_VIGENTE) === 'todas' ? '' : (searchParams.situacao ?? SITUACAO_VIGENTE), // sem escolha: só os vigentes
  };
  const coluna: Coluna = (COLUNAS as readonly string[]).includes(searchParams.ord ?? '') ? (searchParams.ord as Coluna) : 'contrato';
  const dir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : 'desc';
  const filtrando = !!(filtros.contrato || filtros.secretaria || filtros.credor || filtros.objeto || filtros.prazo || filtros.valorMin || filtros.ligacao);
  // fora do padrão (só vigentes, sem outros filtros) = há o que limpar
  const alterado = filtrando || filtros.situacao !== SITUACAO_VIGENTE;
  const { db } = await exigir('contratos', 'Contratos', {
    detalhe: `filtros=${JSON.stringify(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)))} ordem=${coluna} ${dir}`,
    acao: filtrando ? 'buscar' : 'ver', modulo: 'contratos',
  });

  const hoje = new Date();
  // todos os contratos + empenhos ligados (a secretaria e os valores ligados vêm dos empenhos; o portal não liga contrato a secretaria)
  const [contratos, ligs, emps, pags, liqs] = await Promise.all([
    db.contrato.findMany({ select: { id: true, numero: true, ano: true, situacao: true, objeto: true, fornecedorNome: true, fornecedorDoc: true, inicio: true, fim: true, valorAtual: true } }),
    db.ligacaoContratoEmpenho.findMany({ select: { contratoId: true, empenhoId: true, certeza: true } }),
    db.empenho.findMany({ select: { id: true, orgao: true, valor: true, anulado: true } }),
    db.pagamento.groupBy({ by: ['empenhoId'], _sum: { valor: true } }),
    db.liquidacao.groupBy({ by: ['empenhoId'], _sum: { valor: true } }),
  ]);
  const pagoDe = new Map(pags.map((p) => [p.empenhoId, p._sum.valor ?? BigInt(0)]));
  const liqDe = new Map(liqs.map((p) => [p.empenhoId, p._sum.valor ?? BigInt(0)]));
  const empDe = new Map<number, EmpenhoLigavel>(emps.map((e) => [e.id, { orgao: e.orgao, liquido: e.valor - e.anulado, liquidado: liqDe.get(e.id) ?? BigInt(0), pago: pagoDe.get(e.id) ?? BigInt(0) }]));
  const ligsDe = new Map<number, { certeza: string; empenho: EmpenhoLigavel }[]>();
  for (const l of ligs) {
    const e = empDe.get(l.empenhoId);
    if (e) ligsDe.set(l.contratoId, [...(ligsDe.get(l.contratoId) ?? []), { certeza: l.certeza, empenho: e }]);
  }
  const todas: LinhaContrato[] = contratos.map((c) => {
    const a = agregarLigacoes(ligsDe.get(c.id) ?? []);
    return { ...c, secretaria: a.secretaria, outrasSecretarias: a.outras, empenhado: a.empenhado, liquidado: a.liquidado, pago: a.pago, alta: a.alta, media: a.media };
  });
  const situacoes = [...new Set(todas.map((c) => c.situacao))].sort();
  const secretarias = [...new Set(todas.map((c) => c.secretaria).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filtradas = ordenarContratos(filtrarContratos(todas, filtros, hoje), coluna, dir);
  const resumo = resumoContratos(filtradas, hoje);
  const z = BigInt(0);
  const soma = (f: (c: LinhaContrato) => bigint) => filtradas.reduce((s, c) => s + f(c), z);
  const totEmp = soma((c) => c.empenhado), totLiq = soma((c) => c.liquidado), totPago = soma((c) => c.pago);
  // contagens dos botões que são eles mesmos filtros: calculadas sem o próprio filtro, para o número não mudar quando o botão é clicado
  const nVigentes = filtrarContratos(todas, { ...filtros, situacao: SITUACAO_VIGENTE }, hoje).length;
  const venc90 = resumoContratos(filtrarContratos(todas, { ...filtros, situacao: SITUACAO_VIGENTE, prazo: '' }, hoje), hoje);
  const maior = resumo.fornecedores[0];
  const lista = filtradas.slice((pg - 1) * TAM_PAGINA, pg * TAM_PAGINA);

  // link que mantém filtros e ordem atuais
  const href = (mud: Params) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...mud })) if (v) q.set(k, v);
    return `?${q.toString()}`;
  };
  const Cab = ({ col, children, n }: { col: Coluna; children: React.ReactNode; n?: boolean }) => (
    <th className={n ? 'n' : ''}>
      <span className="inline-flex items-center gap-1">
        {children}
        <span className="inline-flex flex-col leading-none text-[9px]">
          <Link href={href({ ord: col, dir: 'asc', pg: undefined })} title="Ordenar do menor para o maior (A → Z)" className={coluna === col && dir === 'asc' ? 'text-emerald-700' : 'text-slate-300 hover:text-slate-600'}>▲</Link>
          <Link href={href({ ord: col, dir: 'desc', pg: undefined })} title="Ordenar do maior para o menor (Z → A)" className={coluna === col && dir === 'desc' ? 'text-emerald-700' : 'text-slate-300 hover:text-slate-600'}>▼</Link>
        </span>
      </span>
    </th>
  );

  // botão de filtro: clicar aplica; clicar de novo no botão ativo desfaz
  const Botao = ({ ativo, aplicar, desfazer, titulo, children }: { ativo: boolean; aplicar: Params; desfazer: Params; titulo: string; children: React.ReactNode }) => (
    <Link href={href({ ...(ativo ? desfazer : aplicar), pg: undefined })} title={titulo} aria-pressed={ativo}
      className={`cartao block min-w-0 px-3 py-2 transition hover:border-emerald-500 hover:shadow ${ativo ? 'ring-2 ring-emerald-600 bg-emerald-50' : ''}`}>{children}</Link>
  );
  const Rotulo = ({ children }: { children: React.ReactNode }) => <div className="text-xs text-slate-500 truncate">{children}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold mr-auto">Contratos</h1>
        <Link href={`?${new URLSearchParams({ ord: coluna, dir }).toString()}`} title="Volta ao padrão: só contratos vigentes, sem outros filtros"
          className={`btn-sec ${alterado ? 'border-emerald-600 text-emerald-800 font-medium' : 'opacity-60'}`}>✕ Limpar filtros</Link>
      </div>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <Botao ativo={filtros.situacao === SITUACAO_VIGENTE} aplicar={{ situacao: SITUACAO_VIGENTE }} desfazer={{ situacao: 'todas' }} titulo="Mostrar só os contratos vigentes">
          <Rotulo>Contratos vigentes</Rotulo><div className="text-xl font-bold">{nVigentes}</div><Rotulo>de {todas.length} no total</Rotulo>
        </Botao>
        <div className="cartao min-w-0 px-3 py-2" title={brl(resumo.valorTotal)}>
          <Rotulo>Valor contratado</Rotulo><div className="text-xl font-bold tabular-nums">{brlCurto(resumo.valorTotal)}</div><Rotulo>soma dos {resumo.quantidade} na tabela</Rotulo>
        </div>
        <Botao ativo={filtros.prazo === '90' && filtros.situacao === SITUACAO_VIGENTE} aplicar={{ situacao: SITUACAO_VIGENTE, prazo: '90' }} desfazer={{ prazo: undefined }} titulo="Mostrar os vigentes que vencem em até 90 dias">
          <Rotulo>Vencendo em 90 dias</Rotulo><div className={`text-xl font-bold ${venc90.vencimentos.length ? 'text-amber-700' : ''}`}>{venc90.vencimentos.length}</div><Rotulo>{venc90.vencimentos.length ? `${brlCurto(venc90.valorVencendo)} em jogo` : 'nenhum'}</Rotulo>
        </Botao>
        <Botao ativo={!!maior && filtros.credor === maior.nome} aplicar={{ credor: maior?.nome }} desfazer={{ credor: undefined }} titulo={maior ? `Filtrar os contratos de ${maior.nome}` : 'Sem contratos'}>
          <Rotulo>Maior fornecedor</Rotulo><div className="text-sm font-semibold leading-tight truncate">{maior?.nome ?? '—'}</div><Rotulo>{maior ? `${brlCurto(maior.valor)} · ${pct(maior.valor, resumo.valorTotal)}` : ''}</Rotulo>
        </Botao>
        <Botao ativo={filtros.ligacao === 'empenhado'} aplicar={{ ligacao: 'empenhado' }} desfazer={{ ligacao: undefined }} titulo={`Empenhado nos contratos da tabela: ${brl(totEmp)}. Clique para ver só os que têm empenho ligado`}>
          <Rotulo>Empenhado</Rotulo><div className="text-xl font-bold tabular-nums">{brlCurto(totEmp)}</div><Rotulo>{pct(totEmp, resumo.valorTotal)} do contratado</Rotulo>
        </Botao>
        <Botao ativo={filtros.ligacao === 'liquidado'} aplicar={{ ligacao: 'liquidado' }} desfazer={{ ligacao: undefined }} titulo={`Liquidado nos contratos da tabela: ${brl(totLiq)}. Clique para ver só os que têm liquidação`}>
          <Rotulo>Liquidado</Rotulo><div className="text-xl font-bold tabular-nums">{brlCurto(totLiq)}</div><Rotulo>{pct(totLiq, totEmp)} do empenhado</Rotulo>
        </Botao>
        <Botao ativo={filtros.ligacao === 'pago'} aplicar={{ ligacao: 'pago' }} desfazer={{ ligacao: undefined }} titulo={`Pago nos contratos da tabela: ${brl(totPago)}. Clique para ver só os que têm pagamento`}>
          <Rotulo>Pago</Rotulo><div className="text-xl font-bold tabular-nums">{brlCurto(totPago)}</div><Rotulo>{pct(totPago, totEmp)} do empenhado</Rotulo>
        </Botao>
      </div>

      <p className="text-xs text-slate-500">
        {filtradas.length} contrato(s). Clique nos botões acima para filtrar, use as setas ▲▼ do título para ordenar e a linha de campos abaixo dos títulos para filtrar (Enter ou botão Filtrar).
        {' '}<b>Secretaria</b> e <b>empenhado/pago</b> vêm dos empenhos ligados ao contrato: o portal não informa essa ligação, ela é deduzida
        (<b>alta</b>: descrição do empenho cita o contrato e o CNPJ confere; <b>média</b>: único contrato vigente do credor na data). Contrato sem empenho ligado fica sem secretaria. Valores parciais: só empenhos já coletados.
      </p>
      <form method="get" className="cartao overflow-x-auto p-0">
        <input type="hidden" name="ord" value={coluna} />
        <input type="hidden" name="dir" value={dir} />
        <input type="hidden" name="ligacao" value={filtros.ligacao} />
        <table className="tabela">
          <thead>
            <tr>
              <Cab col="contrato">Contrato</Cab>
              <Cab col="secretaria">Secretaria</Cab>
              <Cab col="credor">Credor</Cab>
              <Cab col="objeto">Objeto</Cab>
              <Cab col="vigencia">Vigência</Cab>
              <Cab col="prazo">Prazo</Cab>
              <Cab col="valor" n>Valor atual</Cab>
              <Cab col="empenhado" n>Empenhado ligado</Cab>
              <Cab col="liquidado" n>Liquidado ligado</Cab>
              <Cab col="pago" n>Pago ligado</Cab>
            </tr>
            <tr className="bg-slate-50 align-top">
              <th className="normal-case font-normal">
                <input name="contrato" defaultValue={filtros.contrato} placeholder="252/2025" className="campo w-24 py-1" />
                <select name="situacao" defaultValue={filtros.situacao || 'todas'} className="campo w-28 py-1 mt-1 block">
                  <option value="todas">Todas as situações</option>
                  {situacoes.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </th>
              <th className="normal-case font-normal">
                <select name="secretaria" defaultValue={filtros.secretaria} className="campo w-44 py-1">
                  <option value="">Todas</option>
                  <option value="__sem">Sem secretaria (sem empenho)</option>
                  {secretarias.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </th>
              <th className="normal-case font-normal"><input name="credor" defaultValue={filtros.credor} placeholder="nome ou CNPJ" className="campo w-40 py-1" /></th>
              <th className="normal-case font-normal"><input name="objeto" defaultValue={filtros.objeto} placeholder="palavra do objeto" className="campo w-40 py-1" /></th>
              <th />
              <th className="normal-case font-normal">
                <select name="prazo" defaultValue={filtros.prazo} className="campo w-36 py-1">
                  <option value="">Todos</option>
                  <option value="30">Vencem em até 30 dias</option>
                  <option value="60">Vencem em até 60 dias</option>
                  <option value="90">Vencem em até 90 dias</option>
                  <option value="vencido">Já vencidos</option>
                  <option value="semfim">Sem data de fim</option>
                </select>
              </th>
              <th className="n normal-case font-normal"><input name="valorMin" defaultValue={filtros.valorMin} placeholder="mínimo R$" inputMode="decimal" className="campo w-28 py-1 text-right" /></th>
              <th colSpan={3} className="normal-case font-normal"><button className="btn-sec py-1">Filtrar</button></th>
            </tr>
          </thead>
          <tbody>
            {!lista.length && <tr><td colSpan={10} className="text-center text-slate-500 py-6">Nenhum contrato com esses filtros.</td></tr>}
            {lista.map((c) => {
              const prazo = prazoContrato(c.fim, c.situacao, hoje);
              const ligado = c.alta + c.media > 0;
              return (
                <tr key={c.id}>
                  <td className="whitespace-nowrap"><Link className="text-emerald-700 hover:underline" href={`/dashboard/fazenda/contratos/${c.id}`}>{c.numero}/{c.ano}</Link><div className="text-xs text-slate-500">{c.situacao}</div></td>
                  <td className="text-xs max-w-[14rem]">{c.secretaria ? <>{c.secretaria}{c.outrasSecretarias > 0 && <span className="text-slate-500" title="Há empenhos deste contrato em outras secretarias; aparece a que mais empenhou"> · +{c.outrasSecretarias}</span>}</> : <span className="text-slate-400">—</span>}</td>
                  <td>{c.fornecedorNome}<div className="text-xs text-slate-500">{c.fornecedorDoc}</div></td>
                  <td className="max-w-md text-xs">{c.objeto.slice(0, 160)}{c.objeto.length > 160 ? '…' : ''}</td>
                  <td className="whitespace-nowrap text-xs">{d(c.inicio)} → {d(c.fim)}</td>
                  <td className="whitespace-nowrap"><span className={`selo ${SELO[prazo.tom]}`}>{prazo.texto}</span></td>
                  <td className="n">{brl(c.valorAtual)}</td>
                  <td className="n">{ligado ? brl(c.empenhado) : '—'}</td>
                  <td className="n">{ligado ? brl(c.liquidado) : '—'}</td>
                  <td className="n">{ligado ? brl(c.pago) : '—'}<div className="text-xs text-slate-500 font-normal">{ligado ? `${c.alta} alta · ${c.media} média` : 'sem ligação'}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </form>
      <div className="flex items-center gap-2 text-sm">
        {pg > 1 && <Link className="btn-sec" href={href({ pg: String(pg - 1) })}>← anterior</Link>}
        {pg * TAM_PAGINA < filtradas.length && <Link className="btn-sec" href={href({ pg: String(pg + 1) })}>próxima →</Link>}
        {filtradas.length > TAM_PAGINA && <span className="text-xs text-slate-500">página {pg} de {Math.ceil(filtradas.length / TAM_PAGINA)}</span>}
      </div>
    </div>
  );
}
