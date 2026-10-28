'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type LogImportacao = {
  id: string; origem: string; arquivoNome: string | null
  criados: number; atualizados: number; ignorados: number; erros: number
  usuarioNome: string | null; createdAt: string
}

const ORIGEM_LABEL: Record<string, string> = {
  segov_pauta: 'Importar Pauta', segov_arquivo: 'Atualizar por arquivo', segov_texto: 'Colar texto',
}

type Modo = 'texto' | 'pdf' | 'word' | 'excel'
type Etapa = 'upload' | 'revisao' | 'sucesso'

type ItemProposicao = {
  tipo: string; sigla: string; numero: string; ano: number; ementa: string
  jaExiste: { id: string; autorNome: string | null; ementa: string; status: string; quantidade: number } | null
  incluir: boolean
  repetidoNaPauta: string[]; autoresSemVinculo: string[]
  observacao?: string; dataEnvio?: string; autorNome?: string; vereadorId?: string | null
}

type ItemIgnorado = { tipo: string; numero: string; ano: number; autorNome?: string; motivo: string }

type ResultadoImportacao = {
  criados: number; ignorados: number; erros: number
  jaExistiam: string[]; errosDetalhe: { ref: string; motivo: string }[]
}

const MODOS: { id: Modo; label: string; accept: string; ext: string }[] = [
  { id: 'texto', label: 'Colar Texto', accept: '', ext: '' },
  { id: 'pdf',   label: 'PDF',         accept: 'application/pdf,.pdf', ext: '.pdf' },
  { id: 'word',  label: 'Word',        accept: '.docx,.doc', ext: '.docx' },
  { id: 'excel', label: 'Excel',       accept: '.xlsx,.xls', ext: '.xlsx' },
]

const TIPO_COR: Record<string, string> = {
  PL: 'bg-blue-100 text-blue-800', PLC: 'bg-indigo-100 text-indigo-800',
  PDL: 'bg-violet-100 text-violet-800', REQ: 'bg-amber-100 text-amber-800',
  IND: 'bg-teal-100 text-teal-800', MOC: 'bg-pink-100 text-pink-800',
}

export default function ImportarSeggovPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [modo, setModo] = useState<Modo>('pdf')
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [extraindo, setExtraindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [proposicoes, setProposicoes] = useState<ItemProposicao[]>([])
  const [ignorados, setIgnorados] = useState<ItemIgnorado[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [historico, setHistorico] = useState<LogImportacao[]>([])
  const [mostrarHistorico, setMostrarHistorico] = useState(false)

  useEffect(() => {
    fetch('/api/log-importacao').then(r => r.json()).then(d => Array.isArray(d) && setHistorico(d))
  }, [])
  const [dataEnvio, setDataEnvio] = useState<string | undefined>()
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  function trocarModo(m: Modo) {
    setModo(m); setArquivo(null); setErro('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function extrair() {
    setExtraindo(true); setErro('')
    try {
      let res: Response
      if (modo === 'texto') {
        res = await fetch('/api/segov/extrair', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
      } else {
        if (!arquivo) { setExtraindo(false); return }
        const form = new FormData()
        form.append('file', arquivo)
        res = await fetch('/api/segov/extrair', { method: 'POST', body: form })
      }

      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro ao extrair'); setExtraindo(false); return }

      if (!data.proposicoes?.length && !data.ignorados?.length) {
        setErro((data.avisos && data.avisos[0]) || 'Nenhuma proposição nova encontrada na seção "Apresentação de proposições".')
        setExtraindo(false); return
      }

      setDataEnvio(data.dataEnvio)
      setProposicoes((data.proposicoes || []).map((p: any) => ({ ...p, incluir: !p.jaExiste })))
      setIgnorados(data.ignorados || [])
      setAvisos(data.avisos || [])
      setEtapa('revisao')
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    }
    setExtraindo(false)
  }

  const novasProposicoes = proposicoes.filter(p => p.incluir && !p.jaExiste)
  const jaExistem = proposicoes.filter(p => p.jaExiste)

  async function cadastrar() {
    setSalvando(true)
    const res = await fetch('/api/segov/criar-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposicoes: novasProposicoes.map(p => ({ ...p, dataEnvio: p.dataEnvio ?? dataEnvio })),
      }),
    })
    const data = await res.json()
    if (!res.ok) { setErro(data.error || 'Erro ao importar'); setSalvando(false); return }
    setResultado(data); setEtapa('sucesso'); setSalvando(false)
    fetch('/api/log-importacao').then(r => r.json()).then(d => Array.isArray(d) && setHistorico(d))
  }

  const podaExtrair = modo === 'texto' ? texto.trim().length > 0 : arquivo !== null
  const dataLabel = dataEnvio
    ? new Date(dataEnvio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/segov" className="text-gray-400 hover:text-gray-600 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">Importar Pauta</h1>
          <p className="text-sm text-gray-500">Lê a pauta da Câmara e cadastra as proposições novas (Apresentação de proposições)</p>
        </div>
        {historico.length > 0 && (
          <button onClick={() => setMostrarHistorico(v => !v)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition">
            {mostrarHistorico ? 'Ocultar histórico' : `Histórico de importações (${historico.length})`}
          </button>
        )}
      </div>

      {mostrarHistorico && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 font-semibold">Data</th>
                <th className="text-left px-3 py-2 font-semibold">Origem</th>
                <th className="text-left px-3 py-2 font-semibold">Arquivo</th>
                <th className="text-left px-3 py-2 font-semibold">Criados</th>
                <th className="text-left px-3 py-2 font-semibold">Atualizados</th>
                <th className="text-left px-3 py-2 font-semibold">Ignorados</th>
                <th className="text-left px-3 py-2 font-semibold">Erros</th>
                <th className="text-left px-3 py-2 font-semibold">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historico.map(h => (
                <tr key={h.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                    {new Date(h.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{ORIGEM_LABEL[h.origem] || h.origem}</td>
                  <td className="px-3 py-2 text-gray-500">{h.arquivoNome || '—'}</td>
                  <td className="px-3 py-2 text-green-700 font-semibold">{h.criados || 0}</td>
                  <td className="px-3 py-2 text-blue-700 font-semibold">{h.atualizados || 0}</td>
                  <td className="px-3 py-2 text-gray-500">{h.ignorados || 0}</td>
                  <td className="px-3 py-2 text-red-600 font-semibold">{h.erros || 0}</td>
                  <td className="px-3 py-2 text-gray-500">{h.usuarioNome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ETAPA 1 — Upload */}
      {etapa === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Formato</p>
            <div className="grid grid-cols-4 gap-3">
              {MODOS.map(m => (
                <button key={m.id} onClick={() => trocarModo(m.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition text-sm font-semibold ${
                    modo === m.id ? 'border-red-800 text-red-800 bg-red-50' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {modo === 'texto' ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Texto da Pauta</label>
                {texto && (
                  <button onClick={() => setTexto('')} className="text-xs text-gray-400 hover:text-red-600 transition">
                    Limpar
                  </button>
                )}
              </div>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={14}
                placeholder="Cole aqui o texto completo da pauta..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30 resize-none font-mono" />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Arquivo {MODOS.find(m2 => m2.id === modo)?.label}
              </label>
              <div onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
                  arquivo ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}>
                {arquivo ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-green-700">{arquivo.name}</p>
                    <p className="text-xs text-green-600">{(arquivo.size / 1024).toFixed(1)} KB — clique para trocar</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <svg className="w-12 h-12 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <p className="text-sm font-medium text-gray-500">Clique para selecionar</p>
                    <p className="text-xs text-gray-400">{MODOS.find(m2 => m2.id === modo)?.ext}</p>
                  </div>
                )}
              </div>
              <input ref={inputRef} type="file" accept={MODOS.find(m2 => m2.id === modo)?.accept} className="hidden"
                onChange={e => { setArquivo(e.target.files?.[0] ?? null); setErro('') }} />
            </div>
          )}

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={extrair} disabled={extraindo || !podaExtrair}
              className="flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
              style={{ background: '#8B0000' }}>
              {extraindo ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>Analisando pauta...</>
              ) : 'Analisar Pauta'}
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 2 — Revisão */}
      {etapa === 'revisao' && (
        <div className="space-y-5">
          {/* Cabeçalho resumo */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-gray-800 flex items-center gap-2">
                Pauta analisada
                {dataLabel && (
                  <span className="text-sm font-normal text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    Sessão de {dataLabel}
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="text-green-700 font-medium">{novasProposicoes.length} nova(s)</span> para cadastrar
                {jaExistem.length > 0 && <> · <span className="text-amber-700 font-medium">{jaExistem.length} já existe(m)</span> (não serão gravadas)</>}
                {ignorados.length > 0 && <> · <span className="text-gray-600 font-medium">{ignorados.length} ignorada(s)</span></>}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEtapa('upload'); setErro('') }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Voltar
              </button>
              <button onClick={cadastrar} disabled={salvando || novasProposicoes.length === 0}
                className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: '#8B0000' }}>
                {salvando ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>Importando...</>
                ) : `Cadastrar ${novasProposicoes.length} proposição(ões)`}
              </button>
            </div>
          </div>

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {avisos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 space-y-1">
              {avisos.map((a, i) => <p key={i}>⚠ {a}</p>)}
            </div>
          )}

          {/* Seção: Apresentação de Proposições */}
          {proposicoes.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span className="text-sm font-semibold text-gray-700">c) Apresentação de Proposições</span>
                <span className="text-xs text-gray-400 ml-auto">{proposicoes.length} item(s)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="w-10 px-3 py-2">
                      <input type="checkbox"
                        checked={proposicoes.filter(p => !p.jaExiste).every(p => p.incluir)}
                        onChange={e => setProposicoes(prev => prev.map(p => p.jaExiste ? p : { ...p, incluir: e.target.checked }))}
                        className="w-4 h-4 accent-red-800" />
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 text-xs">Proposição</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 text-xs">Ementa</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 text-xs">Comissão destino</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {proposicoes.map((item, idx) => (
                    <tr key={idx} className={item.jaExiste ? 'bg-amber-50/40' : item.incluir ? '' : 'opacity-40'}>
                      <td className="px-3 py-2 text-center">
                        {item.jaExiste
                          ? <span className="text-xs text-amber-600 font-medium">Já existe</span>
                          : <input type="checkbox" checked={item.incluir}
                              onChange={() => setProposicoes(prev => prev.map((p, i) => i === idx ? { ...p, incluir: !p.incluir } : p))}
                              className="w-4 h-4 accent-red-800" />
                        }
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap align-top">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded mr-1 ${TIPO_COR[item.sigla] || 'bg-gray-100 text-gray-700'}`}>{item.sigla}</span>
                        <span className="font-semibold text-gray-800">{item.numero}/{item.ano}</span>
                        {item.autorNome && <p className="text-xs text-gray-400 mt-0.5">{item.autorNome}</p>}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs max-w-xs align-top">
                        <span className="line-clamp-2">{item.ementa || <em className="text-gray-400">sem ementa</em>}</span>
                        {item.jaExiste && (
                          <p className="mt-1 text-amber-700">
                            Já cadastrada{item.jaExiste.quantidade > 1 ? ` (${item.jaExiste.quantidade} registros com esta numeração)` : ''}
                            {item.jaExiste.autorNome ? ` — autoria ${item.jaExiste.autorNome}` : ''}, situação {item.jaExiste.status}.
                          </p>
                        )}
                        {item.repetidoNaPauta.length > 0 && (
                          <p className="mt-1 text-red-700 font-medium">
                            ⚠ Numeração repetida na pauta: este número também aparece em {item.repetidoNaPauta.join('; ')}.
                          </p>
                        )}
                        {item.autoresSemVinculo.length > 0 && (
                          <p className="mt-1 text-gray-500">Autor sem vínculo com vereador cadastrado: {item.autoresSemVinculo.join(', ')} (fica só como texto).</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 align-top">
                        {item.observacao && <span className="bg-gray-100 px-2 py-0.5 rounded">{item.observacao}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Itens que a pauta traz, mas que não entram no sistema */}
          {ignorados.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                <span className="text-sm font-semibold text-gray-700">Ignorados (não serão cadastrados)</span>
                <span className="text-xs text-gray-400 ml-auto">{ignorados.length} item(s)</span>
              </div>
              <ul className="divide-y divide-gray-50 text-sm">
                {ignorados.map((i, idx) => (
                  <li key={idx} className="px-4 py-2 text-gray-600">
                    <span className="font-semibold text-gray-800">{i.tipo} {i.numero}/{i.ano}</span>
                    {i.autorNome && <span className="text-gray-400"> — {i.autorNome}</span>}
                    <span className="block text-xs text-gray-500">{i.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ETAPA 3 — Sucesso */}
      {etapa === 'sucesso' && resultado && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">Pauta importada</p>
            <div className="flex justify-center gap-6 mt-3 text-sm flex-wrap">
              <span className="text-blue-700"><strong>{resultado.criados}</strong> proposição(ões) criada(s)</span>
              {resultado.ignorados > 0 && (
                <span className="text-amber-700"><strong>{resultado.ignorados}</strong> já existia(m), não gravada(s)</span>
              )}
              {resultado.erros > 0 && (
                <span className="text-red-600"><strong>{resultado.erros}</strong> erro(s)</span>
              )}
            </div>
            {resultado.errosDetalhe?.length > 0 && (
              <ul className="mt-3 text-xs text-red-600 space-y-0.5">
                {resultado.errosDetalhe.map((e, i) => <li key={i}>{e.ref}: {e.motivo}</li>)}
              </ul>
            )}
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={() => { setEtapa('upload'); setProposicoes([]); setIgnorados([]); setAvisos([]); setArquivo(null); setTexto(''); setResultado(null); setDataEnvio(undefined) }}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
              Nova Importação
            </button>
            <Link href="/dashboard/segov"
              className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition"
              style={{ background: '#8B0000' }}>
              Ver Proposições
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
