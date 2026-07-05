"use client";
import { useState, useEffect } from "react";

const FREQUENCIAS = [
  { value: "diario", label: "Todo dia às 23h" },
  { value: "a_cada_2_dias", label: "A cada 2 dias às 23h" },
  { value: "semanal", label: "Toda semana (domingo às 23h)" },
  { value: "mensal", label: "Todo mês (dia 1 às 23h)" },
  { value: "desativado", label: "Desativado" },
];

export default function BackupPage() {
  const [email, setEmail] = useState("");
  const [frequencia, setFrequencia] = useState("desativado");
  const [ultimo, setUltimo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [msgCodigo, setMsgCodigo] = useState("");
  const [erroCodigo, setErroCodigo] = useState("");

  useEffect(() => {
    fetch("/api/backup/config")
      .then(r => r.json())
      .then(d => {
        setEmail(d.email ?? "");
        setFrequencia(d.frequencia ?? "desativado");
        setUltimo(d.ultimo ?? null);
      })
      .catch(() => {});
  }, []);

  async function salvar() {
    setSalvando(true);
    setMsg(""); setErro("");
    try {
      const r = await fetch("/api/backup/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, frequencia }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.error ?? "Erro ao salvar"); return; }
      setMsg("Configurações salvas!");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAgora() {
    if (!email) { setErro("Configure o e-mail destino antes de fazer backup."); return; }
    setEnviando(true);
    setMsg(""); setErro("");
    try {
      const r = await fetch("/api/backup", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErro(d.error ?? "Erro ao iniciar backup"); return; }
      setMsg(d.message);
    } finally {
      setEnviando(false);
    }
  }

  async function baixarAgora() {
    setBaixando(true);
    setErro("");
    try {
      const r = await fetch("/api/backup");
      if (!r.ok) {
        const d = await r.json();
        setErro(d.error ?? "Erro ao gerar backup");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_legislativo-pauta_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBaixando(false);
    }
  }

  async function enviarCodigoAgora() {
    setEnviandoCodigo(true);
    setMsgCodigo(""); setErroCodigo("");
    try {
      const r = await fetch("/api/backup-codigo", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErroCodigo(d.error ?? "Erro ao enviar código-fonte"); return; }
      setMsgCodigo(d.message);
    } finally {
      setEnviandoCodigo(false);
    }
  }

  function fmtDatetime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR");
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">Backup</h1>
        <p className="text-sm text-gray-500">Backup dos dados do sistema e do código-fonte, por e-mail.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Backup Automático por E-mail</h3>
            <p className="text-sm text-gray-500">
              Gera um arquivo <strong>.xlsx</strong> com todos os dados do sistema e envia para o e-mail configurado.
            </p>
          </div>

          <div className="space-y-4 bg-gray-50 border border-gray-200 rounded-xl p-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail(s) destino <span className="font-normal text-gray-400">(separe múltiplos com ;)</span>
              </label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="exemplo@gmail.com; outro@gmail.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequência automática</label>
              <select
                value={frequencia}
                onChange={e => setFrequencia(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30 bg-white"
              >
                {FREQUENCIAS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              {frequencia !== "desativado" && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ O agendamento automático requer configuração do Cron Job no painel do Railway.
                </p>
              )}
            </div>

            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "#8B0000" }}
            >
              {salvando ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Último backup</p>
              <p className="text-xs text-gray-500">{fmtDatetime(ultimo)}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={enviarAgora}
                disabled={enviando}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {enviando ? "Enviando..." : "📧 Enviar por e-mail agora"}
              </button>

              <button
                onClick={baixarAgora}
                disabled={baixando}
                className="flex-1 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {baixando ? "Gerando..." : "⬇️ Baixar agora"}
              </button>
            </div>
          </div>

          {msg && <p className="text-sm text-green-600 font-medium">{msg}</p>}
          {erro && <p className="text-sm text-red-500">{erro}</p>}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">Backup do Código-fonte</h3>
            <p className="text-sm text-gray-500">
              Envia um <strong>.zip</strong> com o código-fonte do sistema (sem dados, sem segredos) para o seu
              próprio e-mail. É uma cópia extra, independente do GitHub.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
            <button
              onClick={enviarCodigoAgora}
              disabled={enviandoCodigo}
              className="w-full bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {enviandoCodigo ? "Gerando e enviando..." : "📦 Enviar código-fonte por e-mail"}
            </button>
            {msgCodigo && <p className="text-sm text-green-600 font-medium">{msgCodigo}</p>}
            {erroCodigo && <p className="text-sm text-red-500">{erroCodigo}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
