import { notFound } from 'next/navigation';
import { exigir } from '@/lib/financas/auth';
import { brl } from '@/lib/financas/dinheiro';
import { prismaSistema } from '@/lib/financas/db';

const d = (x: Date | null) => (x ? x.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

type Evento = { data: Date | null; tipo: string; numero: string; valor: bigint | null; empenho?: string; certeza?: string; obs?: string };

export default async function Contrato({ params }: { params: { id: string } }) {
  const { s, db } = await exigir('contratos', 'Contrato', { detalhe: `contrato id=${params.id}`, modulo: 'contratos' });
  const c = await db.contrato.findFirst({ where: { id: Number(params.id) } });
  if (!c) notFound();
  const pref = await prismaSistema.prefeitura.findUnique({ where: { id: s.prefeituraId } });
  const base = JSON.parse(pref?.conectorConfig ?? '{}').base as string | undefined;

  const ligs = await db.ligacaoContratoEmpenho.findMany({ where: { contratoId: c.id } });
  const emps = await db.empenho.findMany({ where: { id: { in: ligs.map((l) => l.empenhoId) } }, include: { liquidacoes: true, pagamentos: true }, orderBy: { data: 'asc' } });

  const eventos: Evento[] = [
    { data: c.assinatura, tipo: 'Assinatura', numero: `${c.numero}/${c.ano}`, valor: c.valorInicial },
    { data: c.publicacaoData, tipo: 'Publicação', numero: c.publicacaoVeiculo, valor: null },
  ];
  for (const e of emps) {
    const cert = ligs.find((l) => l.empenhoId === e.id)!.certeza;
    eventos.push({ data: e.data, tipo: 'Empenho', numero: e.numero, valor: e.valor, empenho: e.numero, certeza: cert, obs: e.anulado ? `anulado ${brl(e.anulado)}` : '' });
    for (const l of e.liquidacoes) eventos.push({ data: l.data, tipo: 'Liquidação', numero: l.numero, valor: l.valor, empenho: e.numero, certeza: cert });
    for (const p of e.pagamentos) eventos.push({ data: p.data, tipo: 'Pagamento', numero: p.numero, valor: p.valor, empenho: e.numero, certeza: cert });
  }
  const ordem: Record<string, number> = { Assinatura: 0, Publicação: 1, Empenho: 2, Liquidação: 3, Pagamento: 4 };
  eventos.sort((a, b) => (a.data?.getTime() ?? 0) - (b.data?.getTime() ?? 0) || ordem[a.tipo] - ordem[b.tipo]);

  const soma = (t: string) => eventos.filter((e) => e.tipo === t).reduce((a, e) => a + (e.valor ?? BigInt(0)), BigInt(0));
  const anulado = emps.reduce((a, e) => a + e.anulado, BigInt(0));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Contrato {c.numero}/{c.ano} · {c.fornecedorNome}</h1>
        <p className="text-sm text-slate-600">{c.objeto}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4 text-sm">
        <div className="cartao"><div className="text-xs text-slate-500">Situação</div>{c.situacao}<div className="text-xs text-slate-500 mt-1">Vigência {d(c.inicio)} → {d(c.fim)}</div></div>
        <div className="cartao"><div className="text-xs text-slate-500">Valor inicial / atual</div>{brl(c.valorInicial)} / <b>{brl(c.valorAtual)}</b></div>
        <div className="cartao"><div className="text-xs text-slate-500">Empenhado líquido / liquidado / pago (ligados)</div>{brl(soma('Empenho') - anulado)} / {brl(soma('Liquidação'))} / <b>{brl(soma('Pagamento'))}</b></div>
        <div className="cartao"><div className="text-xs text-slate-500">Credor · processo · modalidade</div>{c.fornecedorDoc} · {c.processo || '—'} · {c.modalidade || '—'}</div>
      </div>
      {base && <a className="text-sm text-emerald-700 hover:underline" href={`${base}/wpinfocontrato?${c.idOrigem}`} target="_blank" rel="noreferrer">Abrir este contrato no portal ↗</a>}

      <div className="cartao overflow-x-auto">
        <h2 className="font-semibold mb-1">Linha do tempo: assinatura → empenho → liquidação → pagamento</h2>
        <p className="text-xs text-slate-500 mb-2">Empenhos ligados por dedução (o portal não traz o vínculo). Certeza mostrada em cada linha. Só empenhos já coletados aparecem.</p>
        <table className="tabela">
          <thead><tr><th>Data</th><th>Etapa</th><th>Número</th><th>Empenho</th><th className="n">Valor</th><th>Certeza da ligação</th><th>Obs.</th></tr></thead>
          <tbody>
            {eventos.map((e, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap">{d(e.data)}</td><td>{e.tipo}</td><td>{e.numero}</td><td>{e.empenho ?? ''}</td>
                <td className="n">{e.valor === null ? '' : brl(e.valor)}</td>
                <td>{e.certeza ? <span className={`selo ${e.certeza === 'alta' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{e.certeza}</span> : ''}</td>
                <td className="text-xs text-slate-500">{e.obs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
