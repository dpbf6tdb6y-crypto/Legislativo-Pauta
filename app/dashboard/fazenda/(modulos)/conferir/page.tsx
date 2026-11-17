import { exigir } from '@/lib/financas/auth';
import { conferirDocumento, type Documento } from '@/lib/financas/conferir';

const COR = { ok: 'bg-emerald-100 text-emerald-900', atencao: 'bg-amber-100 text-amber-900', sem_dado: 'bg-slate-100 text-slate-700' };
const ROT = { ok: 'ok', atencao: 'atenção', sem_dado: 'sem dado' };

export default async function Conferir({ searchParams }: { searchParams: Partial<Documento> }) {
  const doc: Documento = {
    tipo: searchParams.tipo ?? 'empenho', valor: searchParams.valor ?? '', credorDoc: searchParams.credorDoc ?? '',
    orgaoCod: searchParams.orgaoCod ?? '', contrato: searchParams.contrato ?? '', data: searchParams.data ?? new Date().toISOString().slice(0, 10),
  };
  const enviado = !!(searchParams.valor || searchParams.contrato || searchParams.credorDoc);
  const { db } = await exigir('conferir', 'Conferir antes de assinar', { detalhe: enviado ? JSON.stringify(doc) : '', acao: enviado ? 'buscar' : 'ver', modulo: 'conferir_antes_de_assinar' });
  const orgaos = await db.despesaOrgaoMes.findMany({ where: { mes: 0 }, distinct: ['orgaoCod'], orderBy: { orgaoCod: 'asc' }, select: { orgaoCod: true, orgaoNome: true } });
  const r = enviado ? await conferirDocumento(db, doc) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Conferir antes de assinar</h1>
      <p className="text-sm text-slate-600">Informe o documento que vai ser assinado. O sistema confere com os dados de ontem (última coleta do portal). Não é parecer: mostra o que encontrou para você decidir.</p>
      <form className="cartao grid gap-3 md:grid-cols-3 text-sm">
        <label>Tipo do ato
          <select name="tipo" defaultValue={doc.tipo} className="campo w-full mt-1">
            <option value="empenho">Nota de empenho</option><option value="pagamento">Ordem de pagamento</option>
            <option value="aditivo">Aditivo de valor</option><option value="contrato_novo">Contrato novo</option>
          </select>
        </label>
        <label>Valor (R$)<input name="valor" defaultValue={doc.valor} placeholder="150.000,00" className="campo w-full mt-1" /></label>
        <label>Data do ato<input name="data" type="date" defaultValue={doc.data} className="campo w-full mt-1" /></label>
        <label>CNPJ/CPF do credor<input name="credorDoc" defaultValue={doc.credorDoc} className="campo w-full mt-1" /></label>
        <label>Contrato (nº/ano)<input name="contrato" defaultValue={doc.contrato} placeholder="252/2025" className="campo w-full mt-1" /></label>
        <label>Órgão (dotação)
          <select name="orgaoCod" defaultValue={doc.orgaoCod} className="campo w-full mt-1">
            <option value="">—</option>{orgaos.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
          </select>
        </label>
        <div className="md:col-span-3"><button className="btn">Conferir</button></div>
      </form>
      {r && (
        <div className="cartao">
          <h2 className="font-semibold mb-2">Resultado · {r.dadosDe}</h2>
          <ul className="space-y-2">
            {r.checagens.map((c, i) => (
              <li key={i} className="border-b border-slate-100 pb-2">
                <span className={`selo ${COR[c.resultado]} mr-2`}>{ROT[c.resultado]}</span><b>{c.item}</b>
                <div className="text-sm">{c.detalhe}</div>
                <div className="text-xs text-slate-500">Base: {c.base}</div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 mt-3">Limite: o portal mostra o que já aconteceu até ontem. Empenhos feitos hoje e documentos em tramitação só aparecem com acesso ao sistema da prefeitura.</p>
        </div>
      )}
    </div>
  );
}
