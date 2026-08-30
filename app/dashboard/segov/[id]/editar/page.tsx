'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/contexts/toast'
import { buscarVereadorPorNome, splitAutoresTexto } from '@/lib/vereador-match'

const TIPOS = ['PL', 'PLC', 'PDL', 'RES', 'PELO']
const STATUS_LIST = ['Aguardando', 'Com Parecer', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado']

type Autor = { id?: string; nome: string; isPE: boolean; ativo?: boolean }

type StepData = {
  comissaoId?: string
  comissaoNome?: string
  nome1?: string
  nome2?: string
  nome3?: string
  data?: string
  resultado?: string
}
type StepState = { done: boolean; doneAt?: string; data?: StepData }
type FluxoState = Record<string, StepState>
type StepTipo = 'simples' | 'comissao' | 'comissao3nomes' | 'nome1' | 'data' | 'resultado' | 'sancao'
type StepDef = { key: string; label: string; labelCurto: string; tipo: StepTipo }

const FLUXO_DEF: StepDef[] = [
  { key: 'protocolado',        label: 'Protocolado',                    labelCurto: 'Prot.',      tipo: 'simples' },
  { key: 'pautado',            label: 'Pautado',                        labelCurto: 'Pautado',    tipo: 'data' },
  { key: 'comissao1',          label: 'Comissão 1',                     labelCurto: 'Com. 1',     tipo: 'comissao' },
  { key: 'comissao2',          label: 'Comissão 2',                     labelCurto: 'Com. 2',     tipo: 'comissao' },
  { key: 'comissao3',          label: 'Comissão 3',                     labelCurto: 'Com. 3',     tipo: 'comissao' },
  { key: 'comissaoEspecial',   label: 'Comissão Especial',              labelCurto: 'C. Esp.',    tipo: 'comissao3nomes' },
  { key: 'comissaoConjunta',   label: 'Comissão Conjunta',              labelCurto: 'C. Conj.',   tipo: 'simples' },
  { key: 'dispensaParecer',    label: 'Dispensa de Parecer',            labelCurto: 'D. Par.',    tipo: 'simples' },
  { key: 'dispensaIntersticio',label: 'Dispensa de Interstício',        labelCurto: 'D. Int.',    tipo: 'simples' },
  { key: 'pedidoVista',        label: 'Pedido de Vista',                labelCurto: 'P. Vista',   tipo: 'nome1' },
  { key: 'pedidoAdiamento',    label: 'Pedido de Adiamento de Votação', labelCurto: 'P. Adj.',    tipo: 'nome1' },
  { key: 'emenda',             label: 'Emenda(s)',                      labelCurto: 'Emenda',     tipo: 'resultado' },
  { key: 'emendaVotacao1',     label: '1ª Votação da Emenda',           labelCurto: '1ª V. Emd.', tipo: 'resultado' },
  { key: 'emendaVotacao2',     label: '2ª Votação da Emenda',           labelCurto: '2ª V. Emd.', tipo: 'resultado' },
  { key: 'emendaResultado',    label: 'Resultado da Emenda',            labelCurto: 'Res. Emd.',  tipo: 'resultado' },
  { key: 'votacao1',           label: '1ª Votação do Projeto de Lei',   labelCurto: '1ª Vot.',    tipo: 'resultado' },
  { key: 'votacao2',           label: '2ª Votação do Projeto de Lei',   labelCurto: '2ª Vot.',    tipo: 'resultado' },
  { key: 'resultadoFinal',     label: 'Resultado Final do Projeto',     labelCurto: 'Resultado',  tipo: 'resultado' },
  { key: 'sancaoVeto',         label: 'Sanção / Veto',                  labelCurto: 'Sanção/Veto',tipo: 'sancao' },
  { key: 'vetoManutencao',     label: 'Votação de Manutenção do Veto',  labelCurto: 'V. Veto',    tipo: 'resultado' },
  { key: 'promulgacao',        label: 'Promulgação',                    labelCurto: 'Promul.',    tipo: 'data' },
]

const NEGATIVOS = new Set(['reprovado', 'vetado'])
const CHAVES_COMISSAO = ['comissao1', 'comissao2', 'comissao3']
// Etapas em que a cor da bolinha no fluxograma já é o próprio veredito
// (verde = aprovado, vermelho = reprovado — ver graficoCor), então a
// etiqueta de texto embaixo do nó fica redundante.
const PILL_RESULTADO_OCULTA = new Set([...CHAVES_COMISSAO, 'comissaoEspecial', 'resultadoFinal'])
const OPCOES_POR_CHAVE: Record<string, { valores: [string, string]; labels: [string, string] }> = {
  sancaoVeto: { valores: ['sancionado', 'vetado'], labels: ['Sancionado', 'Vetado'] },
  vetoManutencao: { valores: ['aprovado', 'reprovado'], labels: ['Manter Veto', 'Derrubar Veto'] },
}
function getOpcoes(key: string) {
  return OPCOES_POR_CHAVE[key] || { valores: ['aprovado', 'reprovado'] as [string, string], labels: ['Aprovado', 'Reprovado'] as [string, string] }
}
function labelResultado(key: string, valor?: string) {
  if (!valor) return ''
  const { valores, labels } = getOpcoes(key)
  const i = valores.indexOf(valor)
  return i >= 0 ? labels[i] : valor
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0]
}

function formatNumero(n: string) {
  return n.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtData(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function EditarSeggovPage() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useParams<{ id: string }>()
  const [vereadores, setVereadores] = useState<any[]>([])
  const [comissoes, setComissoes] = useState<any[]>([])
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [form, setForm] = useState({
    numero: '', ano: String(new Date().getFullYear()), tipo: 'PL',
    ementa: '', status: 'Aguardando', dataEnvio: '',
    observacao: '', parecerComissao: '', proxComissao: '',
  })
  const [autores, setAutores] = useState<Autor[]>([])
  const [fluxo, setFluxo] = useState<FluxoState>({})
  const [pending, setPendingState] = useState<Record<string, StepData>>({})
  // Controle único de Aprovado/Reprovado pra Comissão 1/2/3 e Comissão
  // Especial — fica no final do quadrante Comissões em vez de repetir os
  // mesmos botões em cada card. Vale pra comissão marcada no momento em que
  // "Marcar" é clicado, e é limpo em seguida.
  const [resultadoComissao, setResultadoComissao] = useState<string>('')

  useEffect(() => {
    Promise.all([
      fetch('/api/vereadores?poder=legislativo&ativo=false').then(r => r.json()),
      fetch('/api/segov').then(r => r.json()),
      fetch('/api/comissoes').then(r => r.json()),
    ]).then(([vers, todos, coms]) => {
      setVereadores(vers)
      setComissoes(coms)
      const item = todos.find((i: any) => i.id === id)
      if (item) {
        setUpdatedAt(item.updatedAt || '')
        setForm({
          numero: item.numero,
          ano: String(item.ano),
          tipo: item.tipo,
          ementa: item.ementa,
          status: item.status,
          dataEnvio: item.dataEnvio ? item.dataEnvio.split('T')[0] : '',
          observacao: item.observacao || '',
          parecerComissao: item.parecerComissao || '',
          proxComissao: item.proxComissao || '',
        })
        if (item.fluxo && typeof item.fluxo === 'object') {
          setFluxo(item.fluxo as FluxoState)
        }
        const lista: Autor[] = []
        if (item.vereadorId) {
          const v = vers.find((v: any) => v.id === item.vereadorId)
          if (v) lista.push({ id: v.id, nome: v.nome, isPE: false, ativo: v.ativo })
        }
        splitAutoresTexto(item.autorNome).forEach((nome: string) => {
          const lower = nome.toLowerCase()
          if (lower.includes('executivo') || lower.includes('prefeitura') || lower.includes('prefeito')) {
            if (!lista.some(a => a.isPE)) lista.push({ nome: 'Poder Executivo', isPE: true })
            return
          }
          // Usa o mesmo casamento da listagem (primeiro nome igual + sobrenome
          // presente). O critério antigo — "qualquer palavra do autor aparece no
          // nome de qualquer vereador" — casava, por exemplo, "Nilton da Cruz
          // Oliveira" com "José Carlos de Oliveira", criando um autor fantasma
          // que voltava a cada recarga mesmo depois de removido e salvo.
          const v: any = buscarVereadorPorNome(nome, vers as any[])
          if (v) {
            if (!lista.some(a => a.id === v.id))
              lista.push({ id: v.id, nome: v.nome, isPE: false, ativo: v.ativo })
          } else if (!lista.some(a => a.nome === nome)) {
            lista.push({ nome, isPE: false })
          }
        })
        setAutores(lista)
      }
      setCarregando(false)
    })
  }, [id])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function adicionarAutor(valor: string) {
    if (!valor) return
    if (valor === 'executivo') {
      if (!autores.some(a => a.isPE))
        setAutores(prev => [...prev, { nome: 'Poder Executivo', isPE: true }])
      return
    }
    const v = vereadores.find((v: any) => v.id === valor)
    if (v && !autores.some(a => a.id === v.id))
      setAutores(prev => [...prev, { id: v.id, nome: v.nome, isPE: false }])
  }

  function removerAutor(idx: number) {
    setAutores(prev => prev.filter((_, i) => i !== idx))
  }

  function setPendingData(key: string, field: keyof StepData, value: string) {
    setPendingState(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  function marcar(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const p = pending[key] || {}
    let data: StepData = {}
    let doneAt = new Date().toISOString()

    if (def.tipo === 'comissao') {
      if (!p.comissaoId) { toast.error('Selecione uma comissão antes de marcar.'); return }
      // O Aprovado/Reprovado das comissões (Com.1/2/3 e Comissão Especial) fica
      // num único controle no final do quadrante Comissões, em vez de repetir
      // os mesmos botões em cada card — vale para a que for marcada agora.
      if (!resultadoComissao) { toast.error('Escolha Aprovado ou Reprovado (no final do quadrante Comissões) antes de marcar.'); return }
      const com = comissoes.find((c: any) => c.id === p.comissaoId)
      data = { comissaoId: p.comissaoId, comissaoNome: com?.sigla || com?.nome, resultado: resultadoComissao }
    } else if (def.tipo === 'comissao3nomes') {
      if (!resultadoComissao) { toast.error('Escolha Aprovado ou Reprovado (no final do quadrante Comissões) antes de marcar.'); return }
      data = { nome1: p.nome1 || '', nome2: p.nome2 || '', nome3: p.nome3 || '', resultado: resultadoComissao }
    } else if (def.tipo === 'nome1') {
      data = { nome1: p.nome1 || '' }
    } else if (def.tipo === 'resultado' || def.tipo === 'sancao') {
      data = { resultado: p.resultado || getOpcoes(def.key).valores[0] }
    } else if (def.tipo === 'data') {
      if (!p.data) { toast.error('Selecione a data antes de marcar.'); return }
    }

    // Qualquer etapa aceita data informada — necessário para cadastrar
    // proposições antigas, cujas etapas ocorreram no passado. Sem data
    // informada, vale a de hoje.
    if (p.data) doneAt = p.data + 'T12:00:00.000Z'

    setFluxo(prev => {
      const next = { ...prev, [key]: { done: true, doneAt, data } }
      if (key === 'pautado' && !prev['protocolado']?.done) {
        next['protocolado'] = { done: true, doneAt, data: {} }
      }
      return next
    })
    setPendingState(prev => { const n = { ...prev }; delete n[key]; return n })
    if (def.tipo === 'comissao' || def.tipo === 'comissao3nomes') setResultadoComissao('')
  }

  function desmarcar(key: string) {
    setFluxo(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  /** Troca a data de uma etapa já marcada (proposições antigas, correções). */
  function alterarData(key: string, valor: string) {
    if (!valor) return
    setFluxo(prev => prev[key]
      ? { ...prev, [key]: { ...prev[key], doneAt: valor + 'T12:00:00.000Z' } }
      : prev)
  }

  /**
   * Informa (ou corrige) o Aprovado/Reprovado de uma comissão que já está
   * marcada, sem precisar desmarcar e marcar de novo — evita ter que
   * reescolher a comissão e reinformar a data original só pra acrescentar o
   * resultado (caso das proposições antigas, importadas antes desse campo
   * existir).
   */
  function alterarResultadoComissao(key: string, resultado: string) {
    setFluxo(prev => prev[key]
      ? { ...prev, [key]: { ...prev[key], data: { ...(prev[key].data || {}), resultado } } }
      : prev)
  }

  const marcados = useMemo(() =>
    FLUXO_DEF
      .filter(d => fluxo[d.key]?.done)
      .map(d => ({ ...d, ...(fluxo[d.key] || {}) })),
    [fluxo]
  )

  /**
   * Quando o parecer é conjunto, as comissões que o emitiram são mostradas
   * dentro de uma faixa única, sem setas entre elas — enfileirá-las daria a
   * entender que a proposição passou por uma comissão de cada vez, quando na
   * verdade foi um ato só. O nó avulso "C. Conj." sai do gráfico nesse caso,
   * porque a faixa já comunica isso (ele continua marcável no formulário).
   */
  const segmentos = useMemo(() => {
    type No = typeof marcados[number]
    const doGrupo = fluxo['comissaoConjunta']?.done
      ? marcados.filter(m => CHAVES_COMISSAO.includes(m.key))
      : []
    const agrupar = doGrupo.length >= 2

    const out: ({ tipo: 'no'; step: No } | { tipo: 'grupo'; steps: No[] })[] = []
    let grupoInserido = false
    marcados.forEach(step => {
      if (agrupar && CHAVES_COMISSAO.includes(step.key)) {
        if (!grupoInserido) { out.push({ tipo: 'grupo', steps: doGrupo }); grupoInserido = true }
        return
      }
      if (agrupar && step.key === 'comissaoConjunta') return
      out.push({ tipo: 'no', step })
    })
    return out
  }, [marcados, fluxo])

  const ultimaChaveMarcada = marcados.length ? marcados[marcados.length - 1].key : null

  function renderNoFluxo(step: typeof marcados[number]) {
    const isLast = step.key === ultimaChaveMarcada
    return (
      <div className="flex flex-col items-center" style={{ width: '56px' }}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${
          graficoCor === 'vermelho' ? 'bg-red-500' :
          (graficoCor === 'normal' && isLast) ? 'bg-blue-500' :
          'bg-green-500'
        }`}>
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className={`text-xs font-semibold mt-1 text-center leading-tight px-1 ${
          graficoCor === 'vermelho' ? 'text-red-700' :
          (graficoCor === 'normal' && isLast) ? 'text-blue-600' :
          'text-gray-700'
        }`}>{step.labelCurto}</p>
        <p className="text-xs text-gray-400 text-center mt-0.5">{fmtData(step.doneAt)}</p>
        {step.data?.comissaoNome && (
          <span className="mt-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium text-center leading-snug break-words">{step.data.comissaoNome}</span>
        )}
        {/* Nas comissões e no Resultado Final a cor da bolinha (verde/vermelho)
            já entrega o veredito — escrever "Aprovado"/"Reprovado" embaixo
            seria repetir a mesma informação. Nas demais etapas (votações,
            emenda, sanção/veto) a cor da bolinha segue o estado geral do
            fluxo, não o resultado individual, então o texto continua
            necessário ali. */}
        {step.data?.resultado && !PILL_RESULTADO_OCULTA.has(step.key) && (
          <span className={`mt-1 text-xs px-1.5 py-0.5 rounded font-semibold text-center ${NEGATIVOS.has(step.data.resultado) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {labelResultado(step.key, step.data.resultado)}
          </span>
        )}
        {/* Comissão Especial guarda nome1/2/3 (membros) E resultado ao mesmo
            tempo — não pode depender de !resultado, senão o badge de membros
            some quando a etiqueta de Aprovado/Reprovado é ocultada acima. */}
        {step.data?.nome1 && !step.data?.comissaoNome && (
          <span className="mt-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-center leading-snug break-words">{step.data.nome1}</span>
        )}
      </div>
    )
  }

  // Comissões (1, 2, 3 e Especial) têm veredito próprio (Aprovado/Reprovado).
  // Uma reprovação em qualquer uma delas já pinta o fluxo de vermelho, mesmo
  // com as demais etapas em aberto. Passar aprovado pelas três sequenciais OU
  // ser aprovado pela Comissão Especial (caminho alternativo, não cumulativo
  // com 1/2/3) já pinta tudo de verde, sem esperar o Resultado Final.
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

  const diasEmAberto = useMemo(() => {
    const st = fluxo['pautado']
    if (!st?.done || !st.doneAt) return null
    return Math.floor((Date.now() - new Date(st.doneAt).getTime()) / 86400000)
  }, [fluxo])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const autorNome = autores.map(a => a.nome).join(' e ') || null
    const vereadorId = autores.find(a => !a.isPE && a.id)?.id || null
    const res = await fetch(`/api/segov/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, autorNome, vereadorId, fluxo }),
    })
    if (res.ok) { router.refresh(); router.push('/dashboard/segov') }
    else { toast.error('Erro ao salvar'); setSalvando(false) }
  }

  if (carregando) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-4 border-red-800 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"
  const inpSm = "w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400/60 bg-white"

  function renderStepCard(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const state = fluxo[def.key]
    const done = !!state?.done
    const p = pending[def.key] || {}
    const destaque = ['resultadoFinal', 'emendaResultado', 'sancaoVeto', 'vetoManutencao'].includes(def.key)
    const negativo = NEGATIVOS.has(state?.data?.resultado || '')

    const cardClass = !done
      ? 'border-gray-200 bg-white'
      : negativo
        ? 'border-red-500 bg-red-50'
        : destaque
          ? 'border-green-500 bg-green-100'
          : 'border-green-300 bg-green-50'

    const circle = (
      <button type="button"
        onClick={() => done ? desmarcar(def.key) : marcar(def.key)}
        title={done ? 'Clique para desmarcar' : 'Clique para marcar'}
        className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition ${
          done ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-white border border-gray-300 hover:border-green-400'
        }`}>
        {done && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
      </button>
    )

    const btnMarcar = done
      ? <button type="button" onClick={() => desmarcar(def.key)}
          className="text-[10px] text-red-400 hover:text-red-600 transition px-1 py-0.5 rounded border border-red-200 hover:border-red-300 hover:bg-red-50 flex-shrink-0">✕</button>
      : <button type="button" onClick={() => marcar(def.key)}
          className="text-[10px] px-2 py-0.5 rounded-md bg-green-500 text-white hover:bg-green-600 transition font-medium whitespace-nowrap flex-shrink-0">Marcar</button>

    return (
      <div key={def.key} className={`rounded-lg border shadow-sm transition-all p-2 ${cardClass}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <div className="mt-0.5">{circle}</div>
            <span className={`text-xs font-medium leading-tight ${done ? 'text-green-700' : 'text-gray-700'}`}>{def.label}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Data editável mesmo depois de marcada — permite lançar
                proposições antigas e corrigir datas erradas. */}
            {done && (
              <input type="date"
                value={(state.doneAt || '').split('T')[0]}
                onChange={e => alterarData(def.key, e.target.value)}
                title="Clique para alterar a data desta etapa"
                className="text-[10px] text-gray-500 bg-transparent border border-transparent hover:border-gray-300 focus:border-green-400 rounded px-0.5 py-0.5 cursor-pointer focus:outline-none" />
            )}
            {btnMarcar}
          </div>
        </div>

        {/* Toda etapa aceita data — em branco, assume hoje (exceto as do tipo
            'data', em que informar é obrigatório). */}
        {!done && (
          <input type="date" value={p.data || ''}
            onChange={e => setPendingData(def.key, 'data', e.target.value)}
            title={def.tipo === 'data' ? 'Informe a data' : 'Data da etapa (em branco = hoje)'}
            className={`mt-1.5 w-full ${inpSm}`} />
        )}

        {!done && def.tipo === 'comissao3nomes' && (
          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {(['nome1', 'nome2', 'nome3'] as const).map((campo, i) => (
              <select key={campo} value={p[campo] || ''} onChange={e => setPendingData(def.key, campo, e.target.value)} className={inpSm}>
                <option value="">— Membro {i + 1} —</option>
                {vereadores.map((v: any) => <option key={v.id} value={primeiroNome(v.nome)}>{primeiroNome(v.nome)}{!v.ativo && ' (inativo)'}</option>)}
              </select>
            ))}
          </div>
        )}

        {!done && (def.tipo === 'resultado' || def.tipo === 'sancao') && (
          <div className="mt-1.5 flex gap-1 flex-wrap">
            {getOpcoes(def.key).valores.map((r, i) => (
              <button key={r} type="button"
                onClick={() => setPendingData(def.key, 'resultado', r)}
                className={`text-[10px] px-2 py-0.5 rounded-md border transition font-medium ${
                  p.resultado === r
                    ? NEGATIVOS.has(r) ? 'border-red-400 bg-red-50 text-red-700' : 'border-green-400 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}>
                {getOpcoes(def.key).labels[i]}
              </button>
            ))}
          </div>
        )}

        {!done && def.tipo === 'comissao' && (
          <select value={p.comissaoId || ''} onChange={e => setPendingData(def.key, 'comissaoId', e.target.value)} className={`mt-1.5 w-full ${inpSm}`}>
            <option value="">— Selecionar comissão —</option>
            {comissoes.map((c: any) => <option key={c.id} value={c.id}>{c.sigla ? `${c.sigla} — ${c.nome}` : c.nome}</option>)}
          </select>
        )}

        {!done && def.tipo === 'nome1' && (
          <select value={p.nome1 || ''} onChange={e => setPendingData(def.key, 'nome1', e.target.value)} className={`mt-1.5 w-full ${inpSm}`}>
            <option value="">— Selecionar vereador —</option>
            {vereadores.map((v: any) => <option key={v.id} value={primeiroNome(v.nome)}>{primeiroNome(v.nome)}</option>)}
          </select>
        )}

        {/* Comissão já marcada mas sem Aprovado/Reprovado gravado — caso das
            proposições antigas, cadastradas antes desse campo existir. Aqui dá
            pra informar sem precisar desmarcar (o que perderia a data). */}
        {done && (def.tipo === 'comissao' || def.tipo === 'comissao3nomes') && !state.data?.resultado && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-amber-600 font-medium">Falta o parecer:</span>
            {getOpcoes('comissao1').valores.map((r, i) => (
              <button key={r} type="button"
                onClick={() => alterarResultadoComissao(def.key, r)}
                className={`text-[10px] px-2 py-0.5 rounded-md border transition font-medium ${
                  NEGATIVOS.has(r) ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-700 hover:bg-green-50'
                }`}>
                {getOpcoes('comissao1').labels[i]}
              </button>
            ))}
          </div>
        )}

        {done && (state.data?.resultado || state.data?.comissaoNome || state.data?.nome1) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {state.data?.resultado && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${NEGATIVOS.has(state.data.resultado) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {labelResultado(def.key, state.data.resultado)}
              </span>
            )}
            {state.data?.comissaoNome && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{state.data.comissaoNome}</span>}
            {[state.data?.nome1, state.data?.nome2, state.data?.nome3].filter(Boolean).map((n, i) => (
              <span key={i} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{n}</span>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderIdentificacaoCard() {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100 text-blue-600">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold leading-tight">Identificação</p>
          <p className="text-xs font-semibold text-gray-700 leading-tight">{form.tipo} {formatNumero(form.numero)}/{form.ano}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      <div className="flex items-center">
        <Link href="/dashboard/segov"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition w-24">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-gray-800">Editar</h1>
          <p className="text-sm text-gray-500">{form.tipo} {formatNumero(form.numero)}/{form.ano}</p>
        </div>
        <div className="w-24" />
      </div>

      <form onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        <div className="flex gap-3 items-end">
          <div className="w-24 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Número</label>
            <input required value={formatNumero(form.numero)}
              onChange={e => set('numero', e.target.value.replace(/\./g, ''))}
              className={inp} />
          </div>
          <div className="w-20 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ano</label>
            <input value={form.ano} onChange={e => set('ano', e.target.value)} className={inp} />
          </div>
          <div className="w-24 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</label>
            <select required value={form.tipo} onChange={e => set('tipo', e.target.value)} className={inp}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Autor</label>
            <select onChange={e => { adicionarAutor(e.target.value); e.target.value = '' }} className={inp}>
              <option value="">— Selecionar —</option>
              <option value="executivo">⚡ Executivo</option>
              <optgroup label="Vereadores">
                {vereadores.map((v: any) => <option key={v.id} value={v.id}>{v.nome}{!v.ativo && ' (inativo)'}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="w-64 flex-shrink-0">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dias em Aberto</label>
            {diasEmAberto !== null ? (
              <div className="rounded-lg border px-3 py-2 bg-blue-50 border-blue-200">
                <p className="text-2xl font-bold tabular-nums leading-none text-blue-600">
                  {diasEmAberto} <span className="text-sm font-normal">dias</span></p>
                <p className="text-xs text-gray-400 mt-1">desde {fmtData(fluxo['pautado']?.doneAt)}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                Pautado não marcado
              </div>
            )}
          </div>
        </div>

        {autores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {autores.map((a, i) => (
              <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                a.isPE ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}>
                {a.isPE && <span>⚡</span>}
                {a.nome}
                {a.ativo === false && <span className="text-gray-400 font-normal">(inativo)</span>}
                <button type="button" onClick={() => removerAutor(i)} className="text-gray-400 hover:text-red-500 transition">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {updatedAt && (
          <div className="text-xs text-gray-400">
            Última movimentação: <span className="font-medium text-gray-600">{fmtData(updatedAt)}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ementa</label>
          <textarea required rows={6} value={form.ementa} onChange={e => set('ementa', e.target.value)}
            className={`${inp} resize-none`} />
        </div>

        {/* ─── FLUXO DE TRAMITAÇÃO ─── */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-5 flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Fluxo de Tramitação
          </h3>

          {marcados.length > 0 && (
            <div className="mb-6 bg-gray-50 rounded-xl border border-gray-200 p-4 pt-8 overflow-x-auto">
              <div className="flex items-start" style={{ gap: 0 }}>
                {segmentos.map((seg, i) => {
                  const ultimoSegmento = i === segmentos.length - 1
                  return (
                    <div key={i} className="flex items-start flex-shrink-0">
                      {seg.tipo === 'no' ? (
                        renderNoFluxo(seg.step)
                      ) : (
                        /* Parecer conjunto: as comissões aparecem lado a lado dentro
                           de uma faixa, SEM setas entre elas — foi um ato único.
                           Marcadas por um colchete lilás flutuante por cima, sem caixa
                           ao redor e sem empurrar as bolinhas pra baixo (ficam na mesma
                           linha dos outros passos do fluxo). */
                        <div className="relative flex items-start self-start px-1">
                          <p className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-purple-600 text-center uppercase tracking-wide whitespace-nowrap">
                            Parecer Conjunto
                          </p>
                          <div className="absolute -top-1 left-0 right-0 h-2">
                            <div className="absolute inset-x-0 top-0 border-t-2 border-purple-300" />
                            <div className="absolute left-0 top-0 w-0.5 h-2 bg-purple-300" />
                            <div className="absolute right-0 top-0 w-0.5 h-2 bg-purple-300" />
                          </div>
                          <div className="flex items-start">
                            {seg.steps.map(s => <div key={s.key}>{renderNoFluxo(s)}</div>)}
                          </div>
                        </div>
                      )}
                      {!ultimoSegmento && (
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

          {marcados.length === 0 && (
            <div className="mb-5 text-xs text-gray-400 italic bg-gray-50 rounded-lg border border-dashed border-gray-200 p-3 text-center">
              Nenhuma etapa marcada ainda. Marque as etapas abaixo para construir o fluxo.
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 items-start">
              {renderStepCard('protocolado')}
              {renderStepCard('pautado')}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch">
              <div className="flex flex-col gap-2 rounded-xl border border-green-200 p-2 h-full">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Comissões</h4>
                {renderStepCard('comissao1')}
                {renderStepCard('comissao2')}
                {renderStepCard('comissao3')}
                {renderStepCard('comissaoConjunta')}
                {renderStepCard('comissaoEspecial')}

                {/* Controle único de Aprovado/Reprovado pra Com.1/2/3 e Comissão
                    Especial — evita repetir os mesmos botões em cada card.
                    Escolha aqui e depois clique em "Marcar" na comissão desejada. */}
                <div className="mt-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2">
                  <p className="text-[10px] font-semibold text-gray-500 leading-tight">Parecer da comissão a marcar</p>
                  <p className="text-[9px] text-gray-400 leading-tight mb-1">Escolha antes de clicar em "Marcar" — vale para Com. 1/2/3 e Comissão Especial</p>
                  <div className="flex gap-1 flex-wrap">
                    {getOpcoes('comissao1').valores.map((r, i) => (
                      <button key={r} type="button"
                        onClick={() => setResultadoComissao(r)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition font-medium ${
                          resultadoComissao === r
                            ? NEGATIVOS.has(r) ? 'border-red-400 bg-red-50 text-red-700' : 'border-green-400 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}>
                        {getOpcoes('comissao1').labels[i]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-green-200 p-2 h-full">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Dispensas e Pedidos</h4>
                {renderStepCard('dispensaParecer')}
                {renderStepCard('dispensaIntersticio')}
                {renderStepCard('pedidoVista')}
                {renderStepCard('pedidoAdiamento')}
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-green-200 p-2 h-full">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Emenda</h4>
                {renderStepCard('emenda')}
                {renderIdentificacaoCard()}
                <div className="grid grid-cols-2 gap-2">
                  {renderStepCard('emendaVotacao1')}
                  {renderStepCard('emendaVotacao2')}
                </div>
                {renderStepCard('emendaResultado')}
              </div>
            </div>

            <div className="rounded-xl border border-green-200 p-2">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Projeto de Lei</h4>
              <div className="space-y-2">
                {renderIdentificacaoCard()}
                <div className="grid grid-cols-2 gap-2">
                  {renderStepCard('votacao1')}
                  {renderStepCard('votacao2')}
                </div>
                {renderStepCard('resultadoFinal')}
              </div>
            </div>

            <div className="rounded-xl border border-green-200 p-2">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Sanção e Promulgação</h4>
              <div className="space-y-2">
                {renderStepCard('sancaoVeto')}
                {fluxo['sancaoVeto']?.data?.resultado === 'vetado' && renderStepCard('vetoManutencao')}
                {renderStepCard('promulgacao')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link href="/dashboard/segov"
            className="px-5 py-2.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </Link>
          <button type="submit" disabled={salvando}
            className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: '#8B0000' }}>
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
