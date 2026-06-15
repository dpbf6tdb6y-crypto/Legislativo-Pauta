"use client";
import { useEffect, useState, useCallback } from "react";

type Vereador = { id: string; nome: string; cargo?: string };
type Membro = { id: string; vereador: Vereador; papel: string };
type Analista = { id: string; nome: string };
type Comissao = { id: string; nome: string; sigla?: string; membros: Membro[]; analistas: Analista[] };
type Voto = { id: string; vereador: Vereador; aprovado: boolean };
type ProposicaoComissao = {
  id: string; ordem: number; status: string;
  parecer?: string; parecerTexto?: string; parecerConjunto: boolean;
  comissao: Comissao; analista?: Analista; votos: Voto[];
};
type Proposicao = {
  id: string; numero: string; ano: number; tipo: string; ementa: string;
  etapaAtual: string; numVotacoes: number;
  origemTipo: string; autores: { vereador: Vereador }[]; autorExterno?: string;
  comissoes: ProposicaoComissao[];
};

const tipoLabel: Record<string, string> = { pl: "PL", resolucao: "Res.", requerimento: "Req.", mocao: "Moção" };
const parecerLabel: Record<string, string> = {
  favoravel: "Favorável",
  contrario: "Contrário",
  favoravel_com_emenda: "Favorável com Emenda",
};
const statusColor: Record<string, string> = {
  aguardando: "bg-gray-100 text-gray-600",
  em_analise: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-green-100 text-green-700",
  rejeitado: "bg-red-100 text-red-700",
};
const statusLabel: Record<string, string> = {
  aguardando: "Aguardando", em_analise: "Em análise", aprovado: "Aprovado", rejeitado: "Rejeitado",
};

export default function ParecerPage() {
  const [lista, setLista] = useState<Proposicao[]>([]);
  const [selecionada, setSelecionada] = useState<Proposicao | null>(null);
  const [modalParecer, setModalParecer] = useState<ProposicaoComissao | null>(null);
  const [parecerForm, setParecerForm] = useState({ parecer: "favoravel", parecerTexto: "", analistaId: "" });

  // Estado local de votos — comissão ativa
  const [votosLocais, setVotosLocais] = useState<Record<string, boolean | null>>({});
  const [modoEditar, setModoEditar] = useState(false);
  const [salvandoVotos, setSalvandoVotos] = useState(false);
  const [comEmenda, setComEmenda] = useState(false);

  // Estado para comissões concluídas (expandir / editar)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [votosEdicao, setVotosEdicao] = useState<Record<string, boolean | null>>({});
  const [parecerEdicao, setParecerEdicao] = useState("favoravel");
  const [parecerTextoEdicao, setParecerTextoEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const etapasComissao = ["comissao1","comissao2","comissao3","comissao4","comissao5","parecer_conjunto"];

  async function carregar() {
    const res = await fetch("/api/proposicoes");
    const data = await res.json();
    const filtradas = data.filter((p: Proposicao) => etapasComissao.includes(p.etapaAtual));
    setLista(filtradas);
    // Não sobrescreve selecionada com dados incompletos da lista (sem votos/analistas)
    // Apenas nulifica se a proposição saiu das etapas de comissão
    if (selecionada && !filtradas.find((p: Proposicao) => p.id === selecionada.id)) {
      setSelecionada(null);
    }
  }

  async function carregarDetalhe(id: string) {
    const res = await fetch(`/api/proposicoes/${id}`);
    setSelecionada(await res.json());
  }

  useEffect(() => { carregar(); }, []);

  async function registrarParecer() {
    if (!modalParecer) return;
    const propId = selecionada?.id;
    await fetch("/api/tramitacao/parecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposicaoComissaoId: modalParecer.id,
        parecer: parecerForm.parecer,
        parecerTexto: parecerForm.parecerTexto,
        analistaId: parecerForm.analistaId || modalParecer.analista?.id || undefined,
      }),
    });
    setModalParecer(null);
    await carregar();
    // Recarrega detalhe completo (com votos/analistas) após atualizar a lista
    if (propId) carregarDetalhe(propId);
  }


  const comissaoAtiva = selecionada?.comissoes.find(
    c => c.status === "em_analise" || c.status === "aguardando"
  );

  // Inicializa votos locais a partir dos votos salvos sempre que a comissão ativa muda
  const inicializarVotos = useCallback((comissao: ProposicaoComissao | undefined) => {
    if (!comissao) return;
    const init: Record<string, boolean | null> = {};
    comissao.comissao.membros.forEach(m => {
      const voto = comissao.votos.find(v => v.vereador.id === m.vereador.id);
      init[m.vereador.id] = voto !== undefined ? voto.aprovado : null;
    });
    setVotosLocais(init);
    // Abre em modo edição se ainda não há votos salvos
    setModoEditar(comissao.votos.length === 0);
  }, []);

  useEffect(() => {
    inicializarVotos(comissaoAtiva);
  }, [comissaoAtiva?.id, inicializarVotos]);

  function marcarVotoLocal(vereadorId: string, aprovado: boolean) {
    setVotosLocais(prev => ({
      ...prev,
      [vereadorId]: prev[vereadorId] === aprovado ? null : aprovado,
    }));
  }

  async function salvarVotos() {
    if (!comissaoAtiva) return;
    setSalvandoVotos(true);
    for (const [vereadorId, aprovado] of Object.entries(votosLocais)) {
      if (aprovado !== null) {
        await fetch("/api/tramitacao/voto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposicaoComissaoId: comissaoAtiva.id, vereadorId, aprovado }),
        });
      }
    }
    setSalvandoVotos(false);
    setModoEditar(false);
    if (selecionada) carregarDetalhe(selecionada.id);
  }

  function cancelarEdicao() {
    inicializarVotos(comissaoAtiva);
  }

  function toggleExpandida(id: string) {
    setExpandidas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function iniciarEdicao(c: ProposicaoComissao) {
    const init: Record<string, boolean | null> = {};
    c.comissao.membros.forEach(m => {
      const voto = c.votos.find(v => v.vereador.id === m.vereador.id);
      init[m.vereador.id] = voto !== undefined ? voto.aprovado : null;
    });
    setVotosEdicao(init);
    setParecerEdicao(c.parecer || "favoravel");
    setParecerTextoEdicao(c.parecerTexto || "");
    setEditandoId(c.id);
    setExpandidas(prev => new Set(prev).add(c.id));
  }

  function cancelarEdicaoComissao() {
    setEditandoId(null);
  }

  async function salvarEdicaoComissao(c: ProposicaoComissao) {
    setSalvandoEdicao(true);
    // Salva votos
    for (const [vereadorId, aprovado] of Object.entries(votosEdicao)) {
      if (aprovado !== null) {
        await fetch("/api/tramitacao/voto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposicaoComissaoId: c.id, vereadorId, aprovado }),
        });
      }
    }
    // Salva parecer
    await fetch("/api/tramitacao/parecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposicaoComissaoId: c.id,
        parecer: parecerEdicao,
        parecerTexto: parecerTextoEdicao,
      }),
    });
    setSalvandoEdicao(false);
    setEditandoId(null);
    if (selecionada) carregarDetalhe(selecionada.id);
  }

  const autorNome = (p: Proposicao) =>
    p.origemTipo === "vereador" ? (p.autores?.map((a: any) => a.vereador.nome).join(", ") || "—") : (p.autorExterno || "Executivo");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Parecer de Comissão</h1>
        <p className="text-gray-500 text-sm">{lista.length} proposição(ões) aguardando parecer</p>
      </div>

      <div className="flex gap-6">
        {/* Lista */}
        <div className="w-80 flex-shrink-0 space-y-3">
          {lista.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
              Nenhuma proposição aguardando parecer de comissão.
            </div>
          )}
          {lista.map((p) => {
            const comissaoAtualCard = p.comissoes.find(c => `comissao${c.ordem}` === p.etapaAtual);
            return (
              <button key={p.id} onClick={() => carregarDetalhe(p.id)}
                className={`w-full text-left bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition ${selecionada?.id === p.id ? "ring-2 ring-amber-500" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{tipoLabel[p.tipo]} {p.numero}/{p.ano}</p>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{p.ementa}</p>
                  </div>
                </div>
                {comissaoAtualCard && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      {comissaoAtualCard.comissao.sigla || comissaoAtualCard.comissao.nome}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor[comissaoAtualCard.status] || "bg-gray-100 text-gray-600"}`}>
                      {statusLabel[comissaoAtualCard.status] || comissaoAtualCard.status}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Detalhe */}
        {selecionada && (
          <div className="flex-1 space-y-4">
            {/* Cabeçalho da proposição */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">
                    {tipoLabel[selecionada.tipo]} {selecionada.numero}/{selecionada.ano}
                  </h2>
                  <p className="text-gray-600 text-sm mt-1 max-w-2xl">{selecionada.ementa}</p>
                  <p className="text-xs text-gray-400 mt-1">Autor: {autorNome(selecionada)}</p>
                </div>
              </div>

              {/* Progresso das comissões */}
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {selecionada.comissoes.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      c.status === "aprovado" ? "bg-green-50 border-green-200 text-green-700" :
                      c.status === "rejeitado" ? "bg-red-50 border-red-200 text-red-700" :
                      c.status === "em_analise" ? "bg-amber-50 border-amber-300 text-amber-800" :
                      "bg-gray-50 border-gray-200 text-gray-500"
                    }`}>
                      {c.status === "aprovado" && <span>✓</span>}
                      {c.status === "rejeitado" && <span>✗</span>}
                      {c.status === "em_analise" && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" />}
                      {c.comissao.sigla || c.comissao.nome}
                      {c.parecerConjunto && <span className="ml-1 opacity-60">CONJ.</span>}
                    </div>
                    {i < selecionada.comissoes.length - 1 && <span className="text-gray-300">→</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Comissão ativa — painel principal */}
            {comissaoAtiva && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between"
                  style={{ background: "#fffbeb" }}>
                  <div>
                    <p className="font-bold text-amber-900">
                      {comissaoAtiva.ordem}ª Comissão: {comissaoAtiva.comissao.nome}
                    </p>
                    {comissaoAtiva.comissao.sigla && (
                      <p className="text-xs text-amber-700">{comissaoAtiva.comissao.sigla}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[comissaoAtiva.status] || "bg-gray-100 text-gray-600"}`}>
                      {statusLabel[comissaoAtiva.status] || comissaoAtiva.status}
                    </span>
                  </div>
                </div>

                <div className="p-5 grid grid-cols-2 gap-6">
                  {/* Membros da comissão */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-gray-700">Membros da Comissão</p>
                      {!comissaoAtiva.parecer && !modoEditar && comissaoAtiva.votos.length > 0 && (
                        <button
                          onClick={() => setModoEditar(true)}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition"
                        >
                          ✏️ Editar votos
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {comissaoAtiva.comissao.membros.map((m) => {
                        const votoLocal = votosLocais[m.vereador.id];
                        return (
                          <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div>
                              <p className="text-sm text-gray-800 font-medium">{m.vereador.nome}</p>
                              <p className="text-xs text-gray-500 capitalize">{m.papel}</p>
                            </div>
                            {/* Modo edição: botões Sim/Não */}
                            {!comissaoAtiva.parecer && modoEditar && (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => marcarVotoLocal(m.vereador.id, true)}
                                  className={`text-xs px-3 py-1 rounded-lg font-medium transition border ${
                                    votoLocal === true
                                      ? "bg-green-500 text-white border-green-500"
                                      : "bg-white text-gray-600 border-gray-300 hover:bg-green-50 hover:border-green-400"
                                  }`}
                                >
                                  ✓ Sim
                                </button>
                                <button
                                  onClick={() => marcarVotoLocal(m.vereador.id, false)}
                                  className={`text-xs px-3 py-1 rounded-lg font-medium transition border ${
                                    votoLocal === false
                                      ? "bg-red-500 text-white border-red-500"
                                      : "bg-white text-gray-600 border-gray-300 hover:bg-red-50 hover:border-red-400"
                                  }`}
                                >
                                  ✗ Não
                                </button>
                              </div>
                            )}
                            {/* Modo leitura: badge do voto */}
                            {(!modoEditar || comissaoAtiva.parecer) && votoLocal !== null && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${votoLocal ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {votoLocal ? "✓ Sim" : "✗ Não"}
                              </span>
                            )}
                            {(!modoEditar || comissaoAtiva.parecer) && votoLocal === null && !comissaoAtiva.parecer && (
                              <span className="text-xs px-2 py-0.5 rounded-full text-gray-400 bg-gray-100">
                                Não votou
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {comissaoAtiva.comissao.membros.length === 0 && (
                        <p className="text-xs text-gray-400">Nenhum membro cadastrado nesta comissão.</p>
                      )}
                    </div>

                    {/* Resumo de votos */}
                    {!comissaoAtiva.parecer && (
                      <p className="text-xs text-gray-400 mt-2">
                        {Object.values(votosLocais).filter(v => v === true).length} sim ·{" "}
                        {Object.values(votosLocais).filter(v => v === false).length} não ·{" "}
                        {Object.values(votosLocais).filter(v => v === null).length} sem voto
                      </p>
                    )}

                    {/* Checkbox emenda — aparece quando 2+ votos Sim */}
                    {!comissaoAtiva.parecer && modoEditar && Object.values(votosLocais).filter(v => v === true).length >= 2 && (
                      <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={comEmenda}
                          onChange={e => setComEmenda(e.target.checked)}
                          className="w-4 h-4 accent-amber-600"
                        />
                        <span className="text-xs text-gray-600">Incluir emenda da comissão</span>
                      </label>
                    )}

                    {/* Botões Cancelar / Registrar Parecer */}
                    {!comissaoAtiva.parecer && modoEditar && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={cancelarEdicao}
                          className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-1.5 text-xs hover:bg-gray-50 transition"
                        >
                          Cancelar
                        </button>
                        <button
                          disabled={salvandoVotos}
                          onClick={async () => {
                            const propId = selecionada?.id;
                            const comissaoId = comissaoAtiva.id;
                            const analistaId = comissaoAtiva.analista?.id || comissaoAtiva.comissao.analistas?.[0]?.id;
                            const sim = Object.values(votosLocais).filter(v => v === true).length;
                            const nao = Object.values(votosLocais).filter(v => v === false).length;
                            const parecerAuto = nao > sim
                              ? "contrario"
                              : comEmenda ? "favoravel_com_emenda" : "favoravel";

                            setSalvandoVotos(true);
                            // Salva votos
                            for (const [vereadorId, aprovado] of Object.entries(votosLocais)) {
                              if (aprovado !== null) {
                                await fetch("/api/tramitacao/voto", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ proposicaoComissaoId: comissaoId, vereadorId, aprovado }),
                                });
                              }
                            }
                            // Registra parecer automaticamente
                            await fetch("/api/tramitacao/parecer", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                proposicaoComissaoId: comissaoId,
                                parecer: parecerAuto,
                                parecerTexto: "",
                                ...(analistaId ? { analistaId } : {}),
                              }),
                            });
                            setSalvandoVotos(false);
                            setModoEditar(false);
                            setComEmenda(false);
                            await carregar();
                            if (propId) carregarDetalhe(propId);
                          }}
                          className="flex-1 text-white rounded-lg py-1.5 text-xs font-semibold transition"
                          style={{ background: "#8B0000" }}
                        >
                          {salvandoVotos ? "Registrando..." : "Registrar Parecer"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Analista e Parecer */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">Analista Responsável</p>
                    {comissaoAtiva.analista ? (
                      <div className="bg-indigo-50 rounded-lg px-3 py-2 mb-4">
                        <p className="text-sm font-medium text-indigo-800">{comissaoAtiva.analista.nome}</p>
                        <p className="text-xs text-indigo-600">Analista</p>
                      </div>
                    ) : comissaoAtiva.comissao.analistas?.length > 0 ? (
                      <div className="bg-indigo-50 rounded-lg px-3 py-2 mb-4">
                        <p className="text-sm font-medium text-indigo-800">{comissaoAtiva.comissao.analistas[0].nome}</p>
                        <p className="text-xs text-indigo-600">Analista da comissão</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mb-4">Nenhum analista atribuído.</p>
                    )}

                    {comissaoAtiva.parecer && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Parecer Registrado</p>
                        <div className={`rounded-lg p-3 ${
                          comissaoAtiva.parecer === "contrario" ? "bg-red-50 border border-red-200" :
                          "bg-green-50 border border-green-200"
                        }`}>
                          <p className={`text-sm font-bold ${comissaoAtiva.parecer === "contrario" ? "text-red-800" : "text-green-800"}`}>
                            {parecerLabel[comissaoAtiva.parecer] || comissaoAtiva.parecer}
                          </p>
                          {comissaoAtiva.parecerTexto && (
                            <p className={`text-xs mt-1 ${comissaoAtiva.parecer === "contrario" ? "text-red-700" : "text-green-700"}`}>
                              {comissaoAtiva.parecerTexto}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Comissões concluídas */}
            {selecionada.comissoes.filter(c => c.status === "aprovado" || c.status === "rejeitado").map((c) => {
              const aberta = expandidas.has(c.id);
              const editando = editandoId === c.id;
              return (
                <div key={c.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => !editando && toggleExpandida(c.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{aberta ? "▲" : "▼"}</span>
                      <p className="font-medium text-gray-700 text-sm">{c.ordem}ª Comissão: {c.comissao.nome}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.parecer && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.parecer === "contrario" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {parecerLabel[c.parecer]}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[c.status]}`}>
                        {statusLabel[c.status]}
                      </span>
                      {!editando && (
                        <button
                          onClick={e => { e.stopPropagation(); iniciarEdicao(c); }}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition ml-1"
                        >
                          ✏️ Editar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Conteúdo expandido */}
                  {aberta && (
                    <div className="border-t border-gray-100 px-4 py-4 grid grid-cols-2 gap-6">
                      {/* Votos dos membros */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-3">Votos dos Membros</p>
                        <div className="space-y-2">
                          {c.comissao.membros.map(m => {
                            const votoEd = editando ? votosEdicao[m.vereador.id] : (c.votos.find(v => v.vereador.id === m.vereador.id)?.aprovado ?? null);
                            return (
                              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <div>
                                  <p className="text-sm text-gray-800 font-medium">{m.vereador.nome}</p>
                                  <p className="text-xs text-gray-500 capitalize">{m.papel}</p>
                                </div>
                                {editando ? (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => setVotosEdicao(prev => ({ ...prev, [m.vereador.id]: prev[m.vereador.id] === true ? null : true }))}
                                      className={`text-xs px-3 py-1 rounded-lg font-medium border transition ${votoEd === true ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-600 border-gray-300 hover:bg-green-50"}`}>
                                      ✓ Sim
                                    </button>
                                    <button
                                      onClick={() => setVotosEdicao(prev => ({ ...prev, [m.vereador.id]: prev[m.vereador.id] === false ? null : false }))}
                                      className={`text-xs px-3 py-1 rounded-lg font-medium border transition ${votoEd === false ? "bg-red-500 text-white border-red-500" : "bg-white text-gray-600 border-gray-300 hover:bg-red-50"}`}>
                                      ✗ Não
                                    </button>
                                  </div>
                                ) : (
                                  votoEd !== null ? (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${votoEd ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                      {votoEd ? "✓ Sim" : "✗ Não"}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Não votou</span>
                                  )
                                )}
                              </div>
                            );
                          })}
                          {c.comissao.membros.length === 0 && <p className="text-xs text-gray-400">Sem membros cadastrados.</p>}
                        </div>
                      </div>

                      {/* Parecer */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-3">Parecer</p>
                        {editando ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-2">
                              {[
                                { value: "favoravel", label: "Favorável", color: "#16a34a" },
                                { value: "favoravel_com_emenda", label: "Favorável c/ Emenda", color: "#ca8a04" },
                                { value: "contrario", label: "Contrário", color: "#dc2626" },
                              ].map(opt => (
                                <button key={opt.value} type="button"
                                  onClick={() => setParecerEdicao(opt.value)}
                                  className="py-2 px-3 rounded-xl border-2 text-xs font-semibold transition text-left"
                                  style={parecerEdicao === opt.value
                                    ? { borderColor: opt.color, background: opt.color + "15", color: opt.color }
                                    : { borderColor: "#e5e7eb", color: "#374151" }}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={parecerTextoEdicao}
                              onChange={e => setParecerTextoEdicao(e.target.value)}
                              rows={3} placeholder="Texto do parecer (opcional)..."
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button onClick={cancelarEdicaoComissao}
                                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-1.5 text-xs hover:bg-gray-50 transition">
                                Cancelar
                              </button>
                              <button onClick={() => salvarEdicaoComissao(c)}
                                disabled={salvandoEdicao}
                                className="flex-1 text-white rounded-lg py-1.5 text-xs font-semibold transition"
                                style={{ background: "#8B0000" }}>
                                {salvandoEdicao ? "Salvando..." : "Salvar"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`rounded-lg p-3 ${c.parecer === "contrario" ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                            <p className={`text-sm font-bold ${c.parecer === "contrario" ? "text-red-800" : "text-green-800"}`}>
                              {parecerLabel[c.parecer || ""] || c.parecer}
                            </p>
                            {c.parecerTexto && (
                              <p className={`text-xs mt-1 ${c.parecer === "contrario" ? "text-red-700" : "text-green-700"}`}>
                                {c.parecerTexto}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Proposição pronta para pautar */}
            {selecionada.etapaAtual === "pronto_votar" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                <p className="font-bold text-emerald-800 text-lg">✓ Parecer(es) concluído(s)</p>
                <p className="text-emerald-700 text-sm mt-1">
                  Esta proposição está pronta para ser incluída na pauta de votação.
                </p>
                <p className="text-emerald-600 text-xs mt-2">
                  Acesse a tela de Proposições, selecione-a e envie para a próxima sessão.
                </p>
              </div>
            )}
          </div>
        )}

        {!selecionada && lista.length > 0 && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecione uma proposição para ver os detalhes.
          </div>
        )}
      </div>

      {/* Modal Registrar Parecer */}
      {modalParecer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="font-bold text-lg text-gray-800 mb-1">Registrar Parecer</h2>
            <p className="text-sm text-gray-500 mb-4">{modalParecer.comissao.nome}</p>

            <div className="space-y-4">
              {/* Analista */}
              {modalParecer.comissao.analistas?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Analista</label>
                  <select value={parecerForm.analistaId} onChange={(e) => setParecerForm({ ...parecerForm, analistaId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    {modalParecer.comissao.analistas.map(a => (
                      <option key={a.id} value={a.id}>{a.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conclusão */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Conclusão do Parecer</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "favoravel", label: "Favorável", color: "#16a34a" },
                    { value: "favoravel_com_emenda", label: "Favorável c/ Emenda", color: "#ca8a04" },
                    { value: "contrario", label: "Contrário", color: "#dc2626" },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setParecerForm({ ...parecerForm, parecer: opt.value })}
                      className="py-2 px-3 rounded-xl border-2 text-xs font-semibold transition text-center"
                      style={parecerForm.parecer === opt.value
                        ? { borderColor: opt.color, background: opt.color + "15", color: opt.color }
                        : { borderColor: "#e5e7eb", color: "#374151" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Texto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Texto do Parecer</label>
                <textarea value={parecerForm.parecerTexto}
                  onChange={(e) => setParecerForm({ ...parecerForm, parecerTexto: e.target.value })}
                  rows={4} placeholder="Redija o texto do parecer..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalParecer(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={registrarParecer}
                className="flex-1 text-white rounded-lg py-2 text-sm font-semibold"
                style={{ background: parecerForm.parecer === "contrario" ? "#dc2626" : "#8B0000" }}>
                Confirmar Parecer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
