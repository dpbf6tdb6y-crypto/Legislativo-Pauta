'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { exportarSegovExcel, exportarSegovPDF, COLUNAS_RELATORIO, type ColunasKey } from '@/lib/segov-export'
import { useTopbar } from '@/contexts/topbar'
import { resolverAutores, situacaoAutores, ehPoderExecutivo } from '@/lib/vereador-match'
import FiltroSituacaoAutor, { SituacaoAutor } from '@/app/components/FiltroSituacaoAutor'
import FiltroVereadorSelect from '@/app/components/FiltroVereadorSelect'
import FiltroPoder, { Poder } from '@/app/components/FiltroPoder'
import { usePermissao } from '@/lib/usePermissao'

const FLUXO_DEF = [
  { key: 'protocolado',         labelCurto: 'Prot.'    },
  { key: 'pautado',             labelCurto: 'Pautado'  },
  { key: 'comissao1',           labelCurto: 'Com. 1'   },
  { key: 'comissao2',           labelCurto: 'Com. 2'   },
  { key: 'comissao3',           labelCurto: 'Com. 3'   },
  { key: 'comissaoEspecial',    labelCurto: 'C. Esp.'  },
  { key: 'comissaoConjunta',    labelCurto: 'C. Conj.' },
  { key: 'dispensaParecer',     labelCurto: 'D. Par.'  },
  { key: 'dispensaIntersticio', labelCurto: 'D. Int.'  },
  { key: 'pedidoVista',         labelCurto: 'P. Vista' },
  { key: 'pedidoAdiamento',     labelCurto: 'P. Adj.'  },
  { key: 'emenda',              labelCurto: 'Emenda'    },
  { key: 'emendaVotacao1',      labelCurto: '1ª V. Emd.' },
  { key: 'emendaVotacao2',      labelCurto: '2ª V. Emd.' },
  { key: 'emendaResultado',     labelCurto: 'Res. Emd.'  },
  { key: 'votacao1',            labelCurto: '1ª Vot.'   },
  { key: 'votacao2',            labelCurto: '2ª Vot.'   },
  { key: 'resultadoFinal',      labelCurto: 'Resultado'  },
  { key: 'sancaoVeto',          labelCurto: 'Sanção/Veto' },
  { key: 'vetoManutencao',      labelCurto: 'V. Veto'    },
  { key: 'promulgacao',         labelCurto: 'Promul.'    },
]

const NEGATIVOS = new Set(['reprovado', 'vetado'])
const CHAVES_COMISSAO = ['comissao1', 'comissao2', 'comissao3']
// Etapas em que a cor da bolinha já é o próprio veredito — ver graficoCor.
const PILL_RESULTADO_OCULTA = new Set([...CHAVES_COMISSAO, 'comissaoEspecial', 'resultadoFinal'])
const OPCOES_POR_CHAVE: Record<string, { valores: [string, string]; labels: [string, string] }> = {
  sancaoVeto: { valores: ['sancionado', 'vetado'], labels: ['Sancionado', 'Vetado'] },
  vetoManutencao: { valores: ['aprovado', 'reprovado'], labels: ['Manter Veto', 'Derrubar Veto'] },
  promulgacao: { valores: ['promulgado', 'vetado'], labels: ['Promulgado', 'Vetado'] },
}
// Sanção/Veto e Promulgação são escolhidas como caminho primeiro (igual
// comissão) — o resultado só chega depois, então marcadas sem resultado
// ainda não valem como nó normal do fluxo, viram a bolinha fantasma.
const CHAVES_SANCAO = ['sancaoVeto', 'promulgacao']
function labelResultadoCurto(key: string, valor?: string) {
  if (!valor) return ''
  const { valores, labels } = OPCOES_POR_CHAVE[key] || { valores: ['aprovado', 'reprovado'], labels: ['Aprov.', 'Reprov.'] }
  const i = valores.indexOf(valor)
  return i >= 0 ? labels[i] : valor
}

function fmtFluxoData(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const STATUS_LIST = ['Aguardando', 'Em análise', 'Com Parecer', 'Aprovado', 'Sancionado', 'Promulgado', 'Rejeitado', 'Arquivado', 'Retirado']

const STATUS_COR: Record<string, string> = {
  'Aguardando':   'bg-yellow-100 text-yellow-800',
  'Com Parecer':  'bg-purple-100 text-purple-800',
  'Em análise':   'bg-blue-100 text-blue-800',
  'Aprovado':     'bg-green-100 text-green-800',
  'Sancionado':   'bg-cyan-100 text-cyan-800',
  'Promulgado':   'bg-emerald-100 text-emerald-800',
  'Rejeitado':    'bg-red-100 text-red-800',
  'Arquivado':    'bg-gray-100 text-gray-700',
  'Retirado':     'bg-orange-100 text-orange-800',
}

export default function SeggovPage() {
  const { setLeftContent, setRightContent } = useTopbar()
  const router = useRouter()
  const podeCriar = usePermissao('podeCriar')
  const podeImportar = usePermissao('podeImportar')
  const podeExportar = usePermissao('podeExportar')
  const podeExcluir = usePermissao('podeExcluir')
  const [itens, setItens] = useState<any[]>([])
  const [vereadores, setVereadores] = useState<any[]>([])
  const [tiposProposicao, setTiposProposicao] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluindo, setExcluindo] = useState(false)
  const [menuRelatorios, setMenuRelatorios] = useState(false)
  const [modalRelatorio, setModalRelatorio] = useState(false)
  const [formatoRelatorio, setFormatoRelatorio] = useState<'excel' | 'pdf'>('pdf')
  const [colunasSel, setColunasSel] = useState<Set<ColunasKey>>(
    new Set(COLUNAS_RELATORIO.map(c => c.key))
  )

  // Filtros por coluna (busca livre, aplicados sobre os itens já carregados)
  const [colProposicao, setColProposicao] = useState('')
  const [colEmenta, setColEmenta] = useState('')
  const [colVereador, setColVereador] = useState('')
  const [colStatus, setColStatus] = useState('')
  const [colTipo, setColTipo] = useState('')
  const [colAno, setColAno] = useState('')
  const [filtroSituacaoAutor, setFiltroSituacaoAutor] = useState<SituacaoAutor>('ativos')
  const [filtroPoder, setFiltroPoder] = useState<Poder>('')

  const vereadoresParaFiltro = useMemo(() => vereadores.filter(v =>
    filtroSituacaoAutor === 'todos' ? true : filtroSituacaoAutor === 'ativos' ? v.ativo !== false : v.ativo === false
  ), [vereadores, filtroSituacaoAutor])

  useEffect(() => {
    // Só limpa se os vereadores já carregaram — sem essa checagem, o filtro
    // restaurado do sessionStorage (ver abaixo) era apagado antes da lista de
    // vereadores chegar da API, porque nesse instante vereadoresParaFiltro
    // ainda está vazio.
    if (colVereador && vereadores.length > 0 && !vereadoresParaFiltro.some(v => v.id === colVereador)) setColVereador('')
  }, [vereadoresParaFiltro]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lembra o filtro aplicado (busca, ano, status, vereador etc.) entre uma
  // visita e outra desta tela — principalmente ao abrir uma proposição pra
  // editar e depois clicar em Voltar ou Salvar: sem isso, a lista sempre
  // voltava zerada, sem o filtro que o usuário tinha aplicado.
  const FILTROS_SEGOV_KEY = 'segov-filtros-lista'
  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(FILTROS_SEGOV_KEY)
      if (!salvo) return
      const f = JSON.parse(salvo)
      if (f.colProposicao) setColProposicao(f.colProposicao)
      if (f.colEmenta) setColEmenta(f.colEmenta)
      if (f.colVereador) setColVereador(f.colVereador)
      if (f.colStatus) setColStatus(f.colStatus)
      if (f.colTipo) setColTipo(f.colTipo)
      if (f.colAno) setColAno(f.colAno)
      if (f.filtroSituacaoAutor) setFiltroSituacaoAutor(f.filtroSituacaoAutor)
      if (f.filtroPoder) setFiltroPoder(f.filtroPoder)
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTROS_SEGOV_KEY, JSON.stringify({
        colProposicao, colEmenta, colVereador, colStatus, colTipo, colAno, filtroSituacaoAutor, filtroPoder,
      }))
    } catch {}
  }, [colProposicao, colEmenta, colVereador, colStatus, colTipo, colAno, filtroSituacaoAutor, filtroPoder])

  async function carregar() {
    setLoading(true)
    setSelecionados(new Set())
    const res = await fetch('/api/segov')
    setItens(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/vereadores?poder=legislativo&ativo=false').then(r => r.json()).then(setVereadores)
    fetch('/api/config-opcoes?tipo=tipo_proposicao').then(r => r.json()).then(setTiposProposicao)
    carregar()
  }, [])

  function toggleItem(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados(prev => {
        const next = new Set(prev)
        itensExibidos.forEach(i => next.delete(i.id))
        return next
      })
    } else {
      setSelecionados(prev => new Set([...Array.from(prev), ...itensExibidos.map(i => i.id)]))
    }
  }

  async function excluirSelecionados() {
    if (!confirm(`Excluir ${selecionados.size} item(s) selecionado(s)?`)) return
    setExcluindo(true)
    await Promise.all(Array.from(selecionados).map(id => fetch(`/api/segov/${id}`, { method: 'DELETE' })))
    setExcluindo(false)
    carregar()
  }

  function passaFiltrosBase(item: any, exceto?: 'status' | 'tipo') {
    if (colProposicao) {
      const ref = `${item.tipo} ${item.numero}/${item.ano}`.toLowerCase()
      if (!ref.includes(colProposicao.toLowerCase())) return false
    }
    if (colEmenta && !(item.ementa || '').toLowerCase().includes(colEmenta.toLowerCase())) return false
    if (filtroPoder) {
      const exec = ehPoderExecutivo(item)
      if (filtroPoder === 'executivo' && !exec) return false
      if (filtroPoder === 'legislativo' && exec) return false
    }
    if (colVereador || filtroSituacaoAutor !== 'todos') {
      const autores = resolverAutores(item.vereador, item.autorNome, vereadores)
      if (colVereador && !autores.some(a => a.vereadorId === colVereador)) return false
      if (filtroSituacaoAutor !== 'todos' && situacaoAutores(autores) !== filtroSituacaoAutor) return false
    }
    if (exceto !== 'status' && colStatus && item.status !== colStatus) return false
    if (exceto !== 'tipo' && colTipo && item.tipo !== colTipo) return false
    if (colAno && String(item.ano) !== colAno) return false
    return true
  }

  const anosDisponiveis = useMemo(
    () => Array.from(new Set(itens.map(i => i.ano))).sort((a, b) => b - a),
    [itens]
  )

  const itensExibidos = useMemo(() => itens.filter(item => passaFiltrosBase(item)),
    [itens, colProposicao, colEmenta, colVereador, colStatus, colTipo, colAno, filtroSituacaoAutor, filtroPoder, vereadores])

  const contagemPorStatus = useMemo(() => {
    const mapa: Record<string, number> = {}
    itens.forEach(item => { if (passaFiltrosBase(item, 'status')) mapa[item.status] = (mapa[item.status] || 0) + 1 })
    return mapa
  }, [itens, colProposicao, colEmenta, colVereador, colTipo, colAno, filtroSituacaoAutor, filtroPoder, vereadores])

  const contagemPorTipo = useMemo(() => {
    const mapa: Record<string, number> = {}
    itens.forEach(item => { if (passaFiltrosBase(item, 'tipo')) mapa[item.tipo] = (mapa[item.tipo] || 0) + 1 })
    return mapa
  }, [itens, colProposicao, colEmenta, colVereador, colStatus, colAno, filtroSituacaoAutor, filtroPoder, vereadores])

  const filtrosColunaAtivos = colProposicao || colEmenta || colVereador || colStatus || colTipo || colAno || filtroSituacaoAutor !== 'ativos' || filtroPoder

  function limparFiltrosColuna() {
    setColProposicao(''); setColEmenta(''); setColVereador(''); setColStatus(''); setColTipo(''); setColAno(''); setFiltroSituacaoAutor('ativos'); setFiltroPoder('')
  }

  const todosSelecionados = itensExibidos.length > 0 && itensExibidos.every(i => selecionados.has(i.id))
  const algunsSelecionados = itensExibidos.some(i => selecionados.has(i.id)) && !todosSelecionados

  const itensParaExportar = selecionados.size > 0
    ? itensExibidos.filter(i => selecionados.has(i.id))
    : itensExibidos

  // Injeta título + botões no topbar global
  useEffect(() => {
    const btn = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-normal leading-5 transition"
    setLeftContent(
      <div className="flex items-center justify-between w-full pr-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Secretaria de Governo</span>
        </div>
        <div className="flex items-center gap-2">
          {podeCriar && (
            <Link href="/dashboard/segov/novo"
              className={`${btn} text-white`}
              style={{ background: '#8B0000' }}>
              + Nova Proposição
            </Link>
          )}
          {podeImportar && (
            <Link href="/dashboard/segov/importar"
              className={`${btn} text-white bg-green-600 hover:bg-green-700`}>
              Importar Pauta
            </Link>
          )}
          {podeExportar && (
            <button onClick={() => setModalRelatorio(true)}
              className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}>
              {selecionados.size > 0 ? `Relatório (${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''})` : 'Relatórios'}
            </button>
          )}
        </div>
      </div>
    )
    return () => setLeftContent(null)
  }, [itensExibidos, selecionados, podeCriar, podeImportar, podeExportar])

  // Botão Excluir no lado direito do topbar (antes do Atualizar)
  useEffect(() => {
    if (selecionados.size === 0 || !podeExcluir) {
      setRightContent(null)
      return
    }
    setRightContent(
      <button onClick={excluirSelecionados} disabled={excluindo}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-normal leading-5 text-white bg-red-400 hover:bg-red-500 transition disabled:opacity-60">
        {excluindo
          ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        }
        Excluir {selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}
      </button>
    )
    return () => setRightContent(null)
  }, [selecionados, excluindo, podeExcluir])

  function toggleColuna(key: ColunasKey) {
    setColunasSel(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function exportar() {
    if (formatoRelatorio === 'excel') {
      const cols = COLUNAS_RELATORIO.map(c => c.key).filter(k => colunasSel.has(k))
      if (cols.length === 0) return
      exportarSegovExcel(itensParaExportar, cols, 'segov.xlsx')
    } else {
      // O PDF reproduz o cartão da tela inteiro — não depende da seleção de colunas.
      exportarSegovPDF(itensParaExportar, undefined, 'segov.pdf')
    }
    setModalRelatorio(false)
  }

  return (
    <div className="space-y-2">

      {/* Barra de filtros — fixa logo abaixo do cabeçalho do sistema (48px de
          altura) enquanto rola só a lista de proposições. */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-1.5 items-center flex-nowrap overflow-x-auto sticky top-12 z-30">
        {filtrosColunaAtivos && (
          <button onClick={limparFiltrosColuna} title="Limpar filtros"
            className="text-gray-400 hover:text-red-600 transition flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <input value={colProposicao} onChange={e => setColProposicao(e.target.value)}
          placeholder="Buscar nº..."
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-20 flex-shrink-0" />
        <input value={colEmenta} onChange={e => setColEmenta(e.target.value)}
          placeholder="Buscar palavra na ementa..."
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 flex-1 min-w-[120px]" />
        <FiltroPoder value={filtroPoder} onChange={setFiltroPoder} className="flex-shrink-0" />
        <FiltroVereadorSelect vereadores={vereadoresParaFiltro} value={colVereador} onChange={setColVereador} className="w-32 flex-shrink-0" />
        <FiltroSituacaoAutor value={filtroSituacaoAutor} onChange={setFiltroSituacaoAutor} className="flex-shrink-0" />
        <select value={colAno} onChange={e => setColAno(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-16 flex-shrink-0">
          <option value="">Ano</option>
          {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={colTipo} onChange={e => setColTipo(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-800/30 w-36 flex-shrink-0">
          <option value="">Todos os tipos ({Object.values(contagemPorTipo).reduce((a, b) => a + b, 0)})</option>
          {tiposProposicao.map(t => <option key={t.id} value={t.nome}>{t.nome} ({contagemPorTipo[t.nome] || 0})</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          <input type="checkbox"
            checked={todosSelecionados}
            ref={el => { if (el) el.indeterminate = algunsSelecionados }}
            onChange={toggleTodos}
            className="w-4 h-4 accent-red-800 cursor-pointer" />
          <span className="text-xs text-gray-500">
            {!loading && `${itensExibidos.length}${filtrosColunaAtivos && itensExibidos.length !== itens.length ? ` de ${itens.length}` : ''} item(s)`}
          </span>
          {selecionados.size > 0 && (
            <button onClick={() => setSelecionados(new Set())}
              className="text-xs text-red-600 font-medium hover:underline">
              · {selecionados.size} selecionado(s) ✕
            </button>
          )}
        </div>
      </div>

      {/* Facetas de status — fixas logo abaixo da barra de filtros (48px do
          cabeçalho + 57px da barra de filtros + 8px do espaçamento entre elas). */}
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex gap-1.5 items-center flex-wrap sticky top-[113px] z-20">
        <button onClick={() => setColStatus('')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
            colStatus === '' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}>
          Todos ({Object.values(contagemPorStatus).reduce((a, b) => a + b, 0)})
        </button>
        {STATUS_LIST.map(s => {
          const ativo = colStatus === s
          const cor = STATUS_COR[s]
          return (
            <button key={s} onClick={() => setColStatus(ativo ? '' : s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
                ativo ? `${cor} border-transparent ring-2 ring-offset-1 ring-gray-300` : `${cor} border-transparent opacity-60 hover:opacity-100`
              }`}>
              {s} ({contagemPorStatus[s] || 0})
            </button>
          )
        })}
      </div>

      {/* Lista de cards */}
      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : itens.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="font-medium">Nenhum item encontrado</p>
          <p className="text-sm mt-1">Cadastre um novo item ou ajuste os filtros</p>
        </div>
      ) : itensExibidos.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border border-gray-200 text-sm">
          Nenhum item corresponde aos filtros.{' '}
          <button onClick={limparFiltrosColuna} className="text-red-700 hover:underline">Limpar filtros</button>
        </div>
      ) : (
        <div className="space-y-2">
          {itensExibidos.map((item: any) => {
            const sel = selecionados.has(item.id)
            const fluxo = (item.fluxo || {}) as Record<string, { done: boolean; doneAt?: string; data?: any }>
            const marcados = FLUXO_DEF
              // Sanção/Veto e Promulgação marcadas mas sem resultado ainda são
              // só um caminho reservado — não entram como nó normal, viram a
              // bolinha fantasma mais abaixo.
              .filter(d => fluxo[d.key]?.done && !(CHAVES_SANCAO.includes(d.key) && !fluxo[d.key]?.data?.resultado))
              .map(d => ({ ...d, doneAt: fluxo[d.key]?.doneAt, data: fluxo[d.key]?.data }))
            // Mesma regra da tela de edição: reprovação em qualquer comissão (1/2/3
            // ou Especial) já pinta tudo de vermelho; aprovação nas três sequenciais
            // OU na Especial já pinta tudo de verde, sem esperar o Resultado Final.
            const algumaComissaoReprovada = [...CHAVES_COMISSAO, 'comissaoEspecial'].some(k => fluxo[k]?.data?.resultado === 'reprovado')
            const todasComissoesAprovadas =
              CHAVES_COMISSAO.every(k => fluxo[k]?.done && fluxo[k]?.data?.resultado === 'aprovado')
              || (fluxo['comissaoEspecial']?.done && fluxo['comissaoEspecial']?.data?.resultado === 'aprovado')
            const graficoCor: 'verde' | 'vermelho' | 'normal' =
              fluxo['resultadoFinal']?.done
                ? fluxo['resultadoFinal'].data?.resultado === 'aprovado' ? 'verde' : 'vermelho'
                : algumaComissaoReprovada
                  ? 'vermelho'
                  : todasComissoesAprovadas
                    ? 'verde'
                    : 'normal'
            const pautadoDoneAt = fluxo['pautado']?.doneAt
            const diasAberto = pautadoDoneAt
              ? Math.floor((Date.now() - new Date(pautadoDoneAt).getTime()) / 86400000)
              : null

            // Parecer conjunto: as comissões entram numa faixa única, sem setas
            // entre elas — enfileirá-las sugeriria tramitação sequencial.
            const doGrupo = fluxo['comissaoConjunta']?.done
              ? marcados.filter(m => CHAVES_COMISSAO.includes(m.key))
              : []
            const agrupar = doGrupo.length >= 2
            const segmentos: ({ tipo: 'no'; step: typeof marcados[number] } | { tipo: 'grupo'; steps: typeof marcados } | { tipo: 'fantasma'; label: string })[] = []
            let grupoInserido = false
            marcados.forEach(step => {
              if (agrupar && CHAVES_COMISSAO.includes(step.key)) {
                if (!grupoInserido) { segmentos.push({ tipo: 'grupo', steps: doGrupo }); grupoInserido = true }
                return
              }
              if (agrupar && step.key === 'comissaoConjunta') return
              segmentos.push({ tipo: 'no', step })
            })
            // Depois do Resultado Final aprovado, falta o Executivo/a Mesa se
            // manifestar. Três estados: nada escolhido ainda → fantasma
            // genérico "Aguard. Sanção"; Sanção/Veto ou Promulgação já
            // escolhida como caminho mas sem resultado → fantasma específico
            // daquela etapa; com resultado → nó normal, sem fantasma.
            const chaveSancaoIncompleta = CHAVES_SANCAO.find(k => fluxo[k]?.done && !fluxo[k]?.data?.resultado)
            const labelFantasmaSancao = chaveSancaoIncompleta
              ? FLUXO_DEF.find(d => d.key === chaveSancaoIncompleta)!.labelCurto
              : 'Sanção'
            const aguardandoSancao =
              fluxo['resultadoFinal']?.done &&
              fluxo['resultadoFinal']?.data?.resultado === 'aprovado' &&
              (!!chaveSancaoIncompleta || (!fluxo['sancaoVeto']?.done && !fluxo['promulgacao']?.done))
            if (aguardandoSancao) segmentos.push({ tipo: 'fantasma', label: labelFantasmaSancao })
            const ultimaChave = marcados.length ? marcados[marcados.length - 1].key : null

            const renderNo = (step: typeof marcados[number]) => {
              const isLast = step.key === ultimaChave
              // Sanção/Veto (e outras etapas de resultado fora do cálculo geral
              // do fluxo) precisam da própria cor: sem isso, um Veto marcado
              // depois do Resultado Final aprovado apareceria verde do mesmo
              // jeito, porque o gráfico já estava "verde" globalmente.
              const negativoLocal = !!step.data?.resultado && NEGATIVOS.has(step.data.resultado)
              return (
                <div className="flex flex-col items-center" style={{ width: '56px' }}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${
                    negativoLocal || graficoCor === 'vermelho' ? 'bg-red-500' :
                    (graficoCor === 'normal' && isLast) ? 'bg-blue-500' :
                    'bg-green-500'
                  }`}>
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className={`text-xs font-semibold mt-1 text-center leading-tight px-1 ${
                    negativoLocal || graficoCor === 'vermelho' ? 'text-red-700' :
                    (graficoCor === 'normal' && isLast) ? 'text-blue-600' :
                    'text-gray-700'
                  }`}>{step.labelCurto}</p>
                  <p className="text-xs text-gray-400 text-center mt-0.5">{fmtFluxoData(step.doneAt)}</p>
                  {step.data?.comissaoNome && (
                    <span className="mt-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium text-center leading-snug break-words">{step.data.comissaoNome}</span>
                  )}
                  {/* Nas comissões e no Resultado Final a cor da bolinha já é o
                      veredito (verde = aprovado, vermelho = reprovado), então o
                      texto embaixo do nó fica redundante ali. */}
                  {step.data?.resultado && !PILL_RESULTADO_OCULTA.has(step.key) && (
                    <span className={`mt-1 text-xs px-1.5 py-0.5 rounded font-semibold text-center ${NEGATIVOS.has(step.data.resultado) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {labelResultadoCurto(step.key, step.data.resultado)}
                    </span>
                  )}
                  {step.data?.numero && (
                    <span className="mt-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-center leading-snug break-words">
                      {step.data.emendaTipo ? `${step.data.emendaTipo} ` : ''}{step.data.numero}{step.data.ano ? `/${step.data.ano}` : ''}
                    </span>
                  )}
                  {/* Comissão Especial guarda nome1/2/3 (membros) E resultado ao
                      mesmo tempo — não pode depender de !resultado. */}
                  {step.data?.nome1 && !step.data?.comissaoNome && !step.data?.numero && (
                    <span className="mt-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-center leading-snug break-words">{step.data.nome1}</span>
                  )}
                </div>
              )
            }

            // Bolinha tracejada azul indicando a próxima etapa esperada, ainda
            // não marcada — só indicativo visual, não é clicável. Largura
            // maior que os outros nós porque "Sanção/Veto" não cabe numa
            // linha só nos 56px padrão; "Aguardando" fica numa legenda curta
            // separada, em vez de grudada no nome.
            const renderNoFantasma = (label: string) => (
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: '84px' }}>
                <div className="w-5 h-5 rounded-full border-2 border-dashed border-blue-400 bg-blue-50" />
                <p className="text-[9px] font-bold mt-1 text-center leading-tight text-blue-400 uppercase tracking-wide">Aguardando</p>
                <p className="text-xs font-semibold text-center leading-tight px-1 text-blue-500">{label}</p>
              </div>
            )

            return (
              <div key={item.id}
                className={`rounded-xl border-2 transition-all ${sel ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-white hover:border-blue-300'}`}>
                {/* Cabeçalho do card */}
                <div className="flex items-start gap-3 p-4 cursor-pointer"
                  onClick={() => router.push(`/dashboard/segov/${item.id}/editar`)}>
                  <div onClick={e => e.stopPropagation()} className="mt-0.5 flex-shrink-0">
                    <input type="checkbox" checked={sel} onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 accent-red-800 cursor-pointer" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Linha 1: tipo, número, status, datas */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-red-100 text-red-800 rounded px-1.5 py-0.5 font-medium">{item.tipo}</span>
                      <span className="font-bold text-gray-800">{item.numero}/{item.ano}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COR[item.status] || 'bg-gray-100 text-gray-700'}`}>
                        {item.status}
                      </span>
                      {pautadoDoneAt && (
                        <span className="text-xs text-gray-400">Pautado: {new Date(pautadoDoneAt).toLocaleDateString('pt-BR')}</span>
                      )}
                      {diasAberto !== null && (
                        <span className={`text-xs font-bold ${diasAberto > 30 ? 'text-red-600' : diasAberto > 15 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {diasAberto} dias em aberto
                        </span>
                      )}
                    </div>
                    {/* Ementa */}
                    <p className="text-sm text-gray-600 mt-1.5 leading-snug">{item.ementa}</p>
                    {/* Autores */}
                    {(() => {
                      const autores = resolverAutores(item.vereador, item.autorNome, vereadores)
                      if (!autores.length) return null
                      return (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                          <span className="text-xs font-semibold text-gray-400">
                            {autores.length} autor{autores.length > 1 ? 'es' : ''}:
                          </span>
                          {autores.map((a, i) => (
                            <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded ${
                              a.ativo ? 'text-indigo-700 bg-indigo-50' : 'text-gray-500 bg-gray-100'
                            }`}>
                              {a.label}{!a.ativo && ' (inativo)'}
                            </span>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* Gráfico de tramitação — idêntico à tela de edição */}
                {marcados.length > 0 && (
                  <div className="border-t border-blue-100 px-4 pb-4 pt-6 overflow-x-auto cursor-pointer"
                    onClick={() => router.push(`/dashboard/segov/${item.id}/editar`)}>
                    <div className="flex items-start" style={{ gap: 0 }}>
                      {segmentos.map((seg, i) => {
                        const ultimoSegmento = i === segmentos.length - 1
                        const proximoEhFantasma = segmentos[i + 1]?.tipo === 'fantasma'
                        return (
                          <div key={i} className="flex items-start flex-shrink-0">
                            {seg.tipo === 'no' ? (
                              renderNo(seg.step)
                            ) : seg.tipo === 'fantasma' ? (
                              renderNoFantasma(seg.label)
                            ) : (
                              <div className="relative flex items-start self-start px-1">
                                <p className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold text-purple-600 text-center uppercase tracking-wide whitespace-nowrap">
                                  Parecer Conjunto
                                </p>
                                <div className="absolute -top-1 left-0 right-0 h-2">
                                  <div className="absolute inset-x-0 top-0 border-t-2 border-purple-300" />
                                  <div className="absolute left-0 top-0 w-0.5 h-2 bg-purple-300" />
                                  <div className="absolute right-0 top-0 w-0.5 h-2 bg-purple-300" />
                                </div>
                                <div className="flex items-start">
                                  {seg.steps.map(s => <div key={s.key}>{renderNo(s)}</div>)}
                                </div>
                              </div>
                            )}
                            {!ultimoSegmento && proximoEhFantasma && (
                              <div className="flex-shrink-0 mt-2.5 border-t-2 border-dashed border-blue-300 w-2 h-0" />
                            )}
                            {!ultimoSegmento && !proximoEhFantasma && (
                              <div className="flex-shrink-0 mt-2.5">
                                <div className={`h-0.5 w-2 ${graficoCor === 'vermelho' ? 'bg-red-400' : 'bg-green-400'}`} />
                                <div className={`w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] -mt-[2.5px] ml-2 ${graficoCor === 'vermelho' ? 'border-l-red-400' : 'border-l-green-400'}`} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de seleção de colunas para relatório */}
      {modalRelatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">Configurar Relatório</h2>
              <button onClick={() => setModalRelatorio(false)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
              {/* Formato */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formato</p>
                <div className="flex gap-3">
                  {(['excel', 'pdf'] as const).map(f => (
                    <button key={f} onClick={() => setFormatoRelatorio(f)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${
                        formatoRelatorio === f
                          ? 'border-red-800 bg-red-50 text-red-800'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {f === 'excel' ? '📊 Excel (.xlsx)' : '📄 PDF'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Colunas — só valem no Excel; o PDF reproduz o cartão inteiro */}
              {formatoRelatorio === 'excel' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Colunas</p>
                    <div className="flex gap-3">
                      <button onClick={() => setColunasSel(new Set(COLUNAS_RELATORIO.map(c => c.key)))}
                        className="text-xs text-blue-600 hover:underline">Todas</button>
                      <button onClick={() => setColunasSel(new Set())}
                        className="text-xs text-gray-400 hover:underline">Limpar</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {COLUNAS_RELATORIO.map(col => (
                      <label key={col.key}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                        <input type="checkbox" checked={colunasSel.has(col.key)}
                          onChange={() => toggleColuna(col.key)}
                          className="w-4 h-4 accent-red-800" />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formatoRelatorio === 'pdf' && (
                <p className="text-xs text-gray-500">
                  O PDF reproduz o mesmo cartão exibido na tela (número, status, ementa,
                  autores e fluxo de tramitação), em retrato, com o Poder Executivo primeiro.
                </p>
              )}

              <p className="text-xs text-gray-400">
                {itensParaExportar.length} item(ns) serão exportados
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModalRelatorio(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={exportar} disabled={formatoRelatorio === 'excel' && colunasSel.size === 0}
                className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: '#8B0000' }}>
                Exportar {formatoRelatorio === 'excel' ? 'Excel' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
