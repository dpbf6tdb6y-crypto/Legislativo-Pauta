"use client";
import { useEffect, useState } from "react";

type Vereador = { id: string; nome: string };
type Membro = { id: string; vereador: Vereador; papel: string };
type Comissao = { id: string; nome: string; membros: Membro[] };
type Voto = { id: string; vereador: Vereador; aprovado: boolean };
type Tramitacao = {
  id: string; ordem: number; status: string; parecer?: string; parecerTexto?: string;
  comissao: Comissao; analista?: { id: string; nome: string };
  votos: Voto[];
};
type Proposicao = {
  id: string; numero: string; ano: number; tipo: string; ementa: string; status: string;
  dispensaParecer: boolean;
  comissoes: Tramitacao[];
};

const parecerLabel: Record<string, string> = { favoravel: "Favorável", contrario: "Contrário", favoravel_com_emenda: "Favorável c/ Emenda" };
const statusLabel: Record<string, string> = { aguardando: "Aguardando", em_analise: "Em análise", aprovado: "Aprovado", rejeitado: "Rejeitado" };
const statusColor: Record<string, string> = {
  aguardando: "bg-gray-100 text-gray-600", em_analise: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-green-100 text-green-700", rejeitado: "bg-red-100 text-red-700",
};

export default function TramitacaoPage() {
  const [lista, setLista] = useState<Proposicao[]>([]);
  const [selecionada, setSelecionada] = useState<Proposicao | null>(null);
  const [modalParecer, setModalParecer] = useState<{ tramitacaoId: string; analistaId: string } | null>(null);
  const [parecerForm, setParecerForm] = useState({ parecer: "favoravel", parecerTexto: "" });

  async function carregar() {
    const res = await fetch("/api/proposicoes?status=em_tramitacao");
    const data = await res.json();
    setLista(data.filter((p: Proposicao) => !p.dispensaParecer));
  }

  async function carregarDetalhe(id: string) {
    const res = await fetch(`/api/proposicoes/${id}`);
    const data = await res.json();
    setSelecionada(data);
  }

  useEffect(() => { carregar(); }, []);

  async function votar(proposicaoComissaoId: string, vereadorId: string, aprovado: boolean) {
    await fetch("/api/tramitacao/voto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposicaoComissaoId, vereadorId, aprovado }),
    });
    if (selecionada) carregarDetalhe(selecionada.id);
    carregar();
  }

  async function registrarParecer() {
    if (!modalParecer) return;
    await fetch("/api/tramitacao/parecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposicaoComissaoId: modalParecer.tramitacaoId, ...parecerForm, analistaId: modalParecer.analistaId }),
    });
    setModalParecer(null);
    if (selecionada) carregarDetalhe(selecionada.id);
  }

  const comissaoAtiva = selecionada?.comissoes.find((c) => c.status !== "aprovado");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Tramitação nas Comissões</h1>
        <p className="text-gray-500 text-sm">{lista.length} proposição(ões) em tramitação</p>
      </div>

      <div className="flex gap-6">
        {/* Lista */}
        <div className="w-80 flex-shrink-0 space-y-3">
          {lista.map((p) => {
            const atual = p.comissoes.find(c => c.status !== "aprovado");
            return (
              <button key={p.id} onClick={() => carregarDetalhe(p.id)} className={`w-full text-left bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition ${selecionada?.id === p.id ? "ring-2 ring-blue-500" : ""}`}>
                <p className="font-medium text-gray-800 text-sm">{p.tipo.toUpperCase()} {p.numero}/{p.ano}</p>
                <p className="text-xs text-gray-500 line-clamp-2 mt-1">{p.ementa}</p>
                {atual && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-xs text-blue-600">📋 {atual.comissao.nome}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor[atual.status]}`}>{statusLabel[atual.status]}</span>
                  </div>
                )}
              </button>
            );
          })}
          {lista.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Nenhuma proposição em tramitação.</p>}
        </div>

        {/* Detalhe */}
        {selecionada && (
          <div className="flex-1 space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="font-bold text-gray-800">{selecionada.tipo.toUpperCase()} {selecionada.numero}/{selecionada.ano}</h2>
              <p className="text-gray-600 text-sm mt-1">{selecionada.ementa}</p>
            </div>

            {selecionada.comissoes.map((tram) => (
              <div key={tram.id} className={`bg-white rounded-xl shadow-sm p-5 ${tram.status === "aprovado" ? "opacity-70" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{tram.ordem}ª Comissão: {tram.comissao.nome}</p>
                    {tram.analista && <p className="text-xs text-gray-500">Analista: {tram.analista.nome}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[tram.status]}`}>{statusLabel[tram.status]}</span>
                </div>

                {/* Parecer */}
                {tram.status === "aguardando" && tram.analista && (
                  <button
                    onClick={() => { setModalParecer({ tramitacaoId: tram.id, analistaId: tram.analista!.id }); setParecerForm({ parecer: "favoravel", parecerTexto: "" }); }}
                    className="mb-3 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700"
                  >
                    Registrar Parecer do Analista
                  </button>
                )}

                {tram.parecer && (
                  <div className="mb-3 bg-blue-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-800">Parecer: {parecerLabel[tram.parecer]}</p>
                    {tram.parecerTexto && <p className="text-xs text-blue-700 mt-1">{tram.parecerTexto}</p>}
                  </div>
                )}

                {/* Votação dos vereadores */}
                {(tram.status === "em_analise" || tram.status === "aguardando") && (
                  <div>
                    <p className="text-xs font-medium text-gray-700 mb-2">Votação dos Vereadores ({tram.votos.filter(v => v.aprovado).length}/3 aprovações):</p>
                    <div className="space-y-2">
                      {tram.comissao.membros.map((m) => {
                        const voto = tram.votos.find((v) => v.vereador.id === m.vereador.id);
                        return (
                          <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-sm text-gray-700">{m.vereador.nome}</span>
                              <span className="text-xs text-gray-400 ml-2">({m.papel})</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => votar(tram.id, m.vereador.id, true)}
                                className={`text-xs px-2 py-1 rounded font-medium transition ${voto?.aprovado === true ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-green-100"}`}
                              >Aprovar</button>
                              <button
                                onClick={() => votar(tram.id, m.vereador.id, false)}
                                className={`text-xs px-2 py-1 rounded font-medium transition ${voto?.aprovado === false ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-red-100"}`}
                              >Rejeitar</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Mínimo de 2 aprovações para liberar para próxima etapa.</p>
                  </div>
                )}

                {tram.status === "aprovado" && (
                  <p className="text-green-600 text-sm font-medium">✓ Aprovado — pronto para próxima etapa</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalParecer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="font-bold text-lg text-gray-800 mb-4">Registrar Parecer</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conclusão do Parecer</label>
                <select value={parecerForm.parecer} onChange={(e) => setParecerForm({ ...parecerForm, parecer: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="favoravel">Favorável</option>
                  <option value="contrario">Contrário</option>
                  <option value="favoravel_com_emenda">Favorável com Emenda</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Texto do Parecer</label>
                <textarea value={parecerForm.parecerTexto} onChange={(e) => setParecerForm({ ...parecerForm, parecerTexto: e.target.value })} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Redija o texto do parecer..." />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalParecer(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={registrarParecer} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700">Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
