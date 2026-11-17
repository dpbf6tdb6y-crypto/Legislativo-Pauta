import Link from 'next/link';
import { exigir } from '@/lib/financas/auth';
import { brl, pct } from '@/lib/financas/dinheiro';
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
    prazo: searchParams.prazo ?? '', valorMin: searchParams.valorMin ?? '',
    situacao: (searchParams.situacao ?? SITUACAO_VIGENTE) === 'todas' ? '' : (searchParams.situacao ?? SITUACAO_VIGENTE), // sem escolha: só os vigentes
  };
  const coluna: Coluna = (COLUNAS as readonly string[]).includes(searchParams.ord ?? '') ? (searchParams.ord as Coluna) : 'contrato';
  const dir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : 'desc';
  const filtrando = !!(filtros.contrato || filtros.secretaria || filtros.credor || filtros.objeto || filtros.prazo || filtros.valorMin);
  const { db } = await exigir('contratos', 'Contratos', {
    detalhe: `filtros=${JSON.stringify(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)))} ordem=${coluna} ${dir}`,
    acao: filtrando ? 'buscar' : 'ver', modulo: 'contratos',
  });

  const hoje = new Date();
  // todos os contratos + empenhos ligados (a secretaria e os valores ligados vêm dos empenhos; o portal não liga contrato a secretaria)
  const [contratos, ligs, emps, pags] = await Promise.all([
    db.contrato.findMany({ select: { id: true, numero: true, ano: true, situacao: true, objeto: true, fornecedorNome: true, fornecedorDoc: true, inicio: true, fim: true, valorAtual: true } }),
    db.ligacaoContratoEmpenho.findMany({ select: { contratoId: true, empenhoId: true, certeza: true } }),
    db.empenho.findMany({ select: { id: true, orgao: true, valor: true, anulado: true } }),
    db.pagamento.groupBy({ by: ['empenhoId'], _sum: { valor: true } }),
  ]);
  const pagoDe = new Map(pags.map((p) => [p.empenhoId, p._sum.valor ?? BigInt(0)]));
  const empDe = new Map<number, EmpenhoLigavel>(emps.map((e) => [e.id, { orgao: e.orgao, liquido: e.valor - e.anulado, pago: pagoDe.get(e.id) ?? BigInt(0) }]));
  const ligsDe = new Map<number, { certeza: string; empenho: EmpenhoLigavel }[]>();
  for (const l of ligs) {
    const e = empDe.get(l.empenhoId);
    if (e) ligsDe.set(l.contratoId, [...(ligsDe.get(l.contratoId) ?? []), { certeza: l.certeza, empenho: e }]);
  }
  const todas: LinhaContrato[] = contratos.map((c) => {
    const a = agregarLigacoes(ligsDe.get(c.id) ?? []);
    return { ...c, secretaria: a.secretaria, outrasSecretarias: a.outras, empenhado: a.empenhado, pago: a.pago, alta: a.alta, media: a.media };
  });
  const situacoes = [...new Set(todas.map((c) => c.situacao))].sort();
  const secretarias = [...new Set(todas.map((c) => c.secretaria).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filtradas = ordenarContratos(filtrarContratos(todas, filtros, hoje), coluna, dir);
  const resumo = resumoContratos(filtradas, hoje);
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

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Contratos</h1>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="cartao"><div className="text-xs text-slate-500">{filtros.situacao === SITUACAO_VIGENTE ? 'Contratos vigentes' : 'Contratos no filtro'}</div><div className="text-2xl font-bold">{resumo.quantidade}</div><div className="text-xs text-slate-500">de {todas.length} no total</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Valor contratado</div><div className="text-2xl font-bold tabular-nums">{brl(resumo.valorTotal)}</div><div className="text-xs text-slate-500">soma do filtro atual (valor atual dos contratos)</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Vencendo em 90 dias</div><div className={`text-2xl font-bold ${resumo.vencimentos.length ? 'text-amber-700' : ''}`}>{resumo.vencimentos.length}</div><div className="text-xs text-slate-500">{resumo.vencimentos.length ? `${brl(resumo.valorVencendo)} em jogo` : 'nenhum no filtro atual'}</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Maior fornecedor</div><div className="text-sm font-semibold leading-tight mt-1">{resumo.fornecedores[0]?.nome ?? '—'}</div><div className="text-xs text-slate-500">{resumo.fornecedores[0] ? `${brl(resumo.fornecedores[0].valor)} · ${pct(resumo.fornecedores[0].valor, resumo.valorTotal)} do total` : ''}</div></div>
      </div>

      <p className="text-xs text-slate-500">
        {filtradas.length} contrato(s). Use as setas ▲▼ do título para ordenar e a linha de campos abaixo dos títulos para filtrar (Enter ou botão Filtrar).
        {' '}<b>Secretaria</b> e <b>empenhado/pago</b> vêm dos empenhos ligados ao contrato: o portal não informa essa ligação, ela é deduzida
        (<b>alta</b>: descrição do empenho cita o contrato e o CNPJ confere; <b>média</b>: único contrato vigente do credor na data). Contrato sem empenho ligado fica sem secretaria. Valores parciais: só empenhos já coletados.
      </p>
      <form method="get" className="cartao overflow-x-auto p-0">
        <input type="hidden" name="ord" value={coluna} />
        <input type="hidden" name="dir" value={dir} />
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
              <th colSpan={2} className="normal-case font-normal">
                <button className="btn-sec py-1">Filtrar</button>{' '}
                <Link className="btn-sec py-1" href={`?${new URLSearchParams({ ord: coluna, dir }).toString()}`} title="Volta ao padrão: só contratos vigentes">Limpar</Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {!lista.length && <tr><td colSpan={9} className="text-center text-slate-500 py-6">Nenhum contrato com esses filtros.</td></tr>}
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
