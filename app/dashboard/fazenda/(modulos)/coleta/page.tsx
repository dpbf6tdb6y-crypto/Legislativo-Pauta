"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SituacaoColeta } from "@/lib/financas/situacao";

// Situação da coleta da Gestão $$$: mostra se a base de dados financeiros está chegando do portal
// e se os totais conferem. As telas de contratos e pagamentos vêm na fase 2.

const VERDE = "#10b981";
const STATUS: Record<string, { rotulo: string; cor: string }> = {
  ok: { rotulo: "ok", cor: "bg-green-50 text-green-700 border-green-200" },
  divergencia: { rotulo: "divergência", cor: "bg-amber-50 text-amber-700 border-amber-200" },
  falha: { rotulo: "falha", cor: "bg-red-50 text-red-700 border-red-200" },
  interrompida: { rotulo: "interrompida", cor: "bg-red-50 text-red-700 border-red-200" },
  rodando: { rotulo: "rodando", cor: "bg-blue-50 text-blue-700 border-blue-200" },
};
const MES = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const dataHora = (d: string | Date | null) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const num = (n: number) => n.toLocaleString("pt-BR");
function reais(centavos: string) {
  const v = Number(centavos) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Selo({ status }: { status: string }) {
  const s = STATUS[status] ?? { rotulo: status, cor: "bg-gray-100 text-gray-600 border-gray-200" };
  return <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cor}`}>{s.rotulo}</span>;
}

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-lg font-bold text-gray-800 tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-gray-400 mt-0.5">{detalhe}</p>}
    </div>
  );
}

export default function SituacaoColetaPage() {
  const [d, setD] = useState<SituacaoColeta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/fazenda/coleta");
        const j = await r.json();
        if (!r.ok) setErro(j.error ?? "Erro ao carregar");
        else setD(j);
      } catch {
        setErro("Erro ao carregar");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const ultima = d?.coletas[0];
  const semColeta = d && d.coletas.length === 0;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Situação da coleta</h1>
          <p className="text-sm text-gray-500">
            Dados financeiros lidos do Portal da Transparência toda madrugada: empenhos, liquidações, pagamentos, descontos retidos,
            restos a pagar e contratos.
          </p>
        </div>
        <Link href="/dashboard/fazenda" className="text-sm font-semibold px-3 py-1.5 rounded-lg border" style={{ color: VERDE, borderColor: VERDE }}>
          ← Voltar ao painel
        </Link>
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
      {carregando && <p className="text-sm text-gray-400">Carregando...</p>}

      {semColeta && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-sm text-gray-600">
          Nenhuma coleta ainda. A primeira carga roda no servidor (scripts/financas/coletar.sh --inicial) e, depois dela,
          a coleta é automática toda madrugada.
        </div>
      )}

      {d && ultima && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap text-sm">
            <span className="text-gray-500">Última coleta:</span>
            <Selo status={ultima.status} />
            <span className="text-gray-700">{dataHora(ultima.inicio)}{ultima.minutos !== null && ` · ${ultima.minutos} min`}</span>
            {ultima.portalAtualizadoEm && <span className="text-gray-500">· portal atualizado em {ultima.portalAtualizadoEm}</span>}
            {d.interrompidas > 0 && <span className="text-red-600">· {d.interrompidas} coleta(s) não terminaram nos últimos 7 dias</span>}
          </div>
          {ultima.erros && (
            <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{ultima.erros}</pre>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Cartao titulo={`Empenhos de ${d.ano}`} valor={num(d.totais.empenhos)}
              detalhe={d.totais.inconsistentes ? `${num(d.totais.inconsistentes)} com valores que não fecham no portal` : undefined} />
            <Cartao titulo="Liquidações / pagamentos" valor={`${num(d.totais.liquidacoes)} / ${num(d.totais.pagamentos)}`} />
            <Cartao titulo="Pagamentos com descontos lidos" valor={num(d.totais.retencoes)} />
            <Cartao titulo={`Restos a pagar em ${d.ano}`} valor={num(d.totais.restos)} />
            <Cartao titulo="Contratos" valor={num(d.totais.contratos)} />
            <Cartao titulo="Empenhos ligados a contrato" valor={num(d.totais.ligacoesAlta + d.totais.ligacoesMedia)}
              detalhe={`${num(d.totais.ligacoesAlta)} certeza alta · ${num(d.totais.ligacoesMedia)} média`} />
            <Cartao titulo="Arquivos do portal guardados" valor={num(d.totais.arquivosNoDisco)} detalhe={`${num(d.totais.mbNoDisco)} MB (30 dias)`} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Data de cada fonte</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {d.fontes.map((f) => (
                  <tr key={f.nome}>
                    <td className="px-4 py-2 text-gray-700">{f.nome}</td>
                    <td className={`px-4 py-2 tabular-nums ${f.atrasada ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                      {f.baixadoEm ? dataHora(f.baixadoEm) : "nunca coletado"}{f.atrasada && f.baixadoEm ? " (mais de 2 dias)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.conferencia && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <div className="px-4 py-3 border-b border-gray-200">
                <p className="text-sm font-semibold text-gray-700">Conferência com o portal ({d.ano})</p>
                <p className="text-xs text-gray-500">
                  Total do mês publicado pelo portal (aba Órgão) contra a soma do que foi lido empenho por empenho.
                  Linhas marcadas como informativas não contam como divergência.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Mês", "Item", "Portal", "Calculado", "Diferença", ""].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.conferencia.linhas.map((l, i) => {
                    const info = l.observacao.endsWith("(informativo)");
                    return (
                      <tr key={i} className={info ? "text-gray-400" : ""} title={l.observacao}>
                        <td className="px-3 py-2 whitespace-nowrap">{MES[l.mes]}</td>
                        <td className="px-3 py-2">{l.item}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{info && l.portal === "0" ? "—" : reais(l.portal)}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{reais(l.calculado)}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{info ? "" : reais(l.diferenca)}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {info ? "informativo" : l.confere ? <span className="text-green-700">confere</span> : <span className="text-amber-700 font-semibold">não confere</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Últimas coletas</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {d.coletas.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-gray-600 tabular-nums whitespace-nowrap">{dataHora(c.inicio)}</td>
                    <td className="px-4 py-2"><Selo status={c.status} /></td>
                    <td className="px-4 py-2 text-gray-500">{c.minutos !== null ? `${c.minutos} min` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
