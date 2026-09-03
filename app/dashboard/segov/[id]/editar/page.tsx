'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/contexts/toast'
import { buscarVereadorPorNome, splitAutoresTexto } from '@/lib/vereador-match'
import { derivarStatusSegov } from '@/lib/segov-status'

const TIPOS = ['PL', 'PLC', 'PDL', 'RES', 'PELO']
const STATUS_LIST = ['Aguardando', 'Em análise', 'Aprovado', 'Sancionado', 'Promulgado', 'Rejeitado', 'Arquivado', 'Retirado']
// Mesma paleta da lista de Proposições — usada no resumo compacto da barra
// fixa do topo desta tela.
const STATUS_COR: Record<string, string> = {
  'Aguardando':   'bg-yellow-100 text-yellow-800',
  'Em análise':   'bg-blue-100 text-blue-800',
  'Aprovado':     'bg-green-100 text-green-800',
  'Sancionado':   'bg-cyan-100 text-cyan-800',
  'Promulgado':   'bg-emerald-100 text-emerald-800',
  'Rejeitado':    'bg-red-100 text-red-800',
  'Arquivado':    'bg-gray-100 text-gray-700',
  'Retirado':     'bg-orange-100 text-orange-800',
}

type Autor = { id?: string; nome: string; isPE: boolean; ativo?: boolean }

type StepData = {
  comissaoId?: string
  comissaoNome?: string
  nome1?: string
  nome2?: string
  nome3?: string
  autores?: string[]
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
  { key: 'retiradoPauta',      label: 'Retirado de Pauta',              labelCurto: 'Retirado',   tipo: 'nome1' },
  { key: 'comissao1',          label: 'Comissão 1',                     labelCurto: 'Com. 1',     tipo: 'comissao' },
  { key: 'comissao2',          label: 'Comissão 2',                     labelCurto: 'Com. 2',     tipo: 'comissao' },
  { key: 'comissao3',          label: 'Comissão 3',                     labelCurto: 'Com. 3',     tipo: 'comissao' },
  { key: 'comissaoEspecial',   label: 'Comissão Especial',              labelCurto: 'C. Esp.',    tipo: 'comissao3nomes' },
  { key: 'comissaoConjunta',   label: 'Comissão Conjunta',              labelCurto: 'C. Conj.',   tipo: 'nome1' },
  { key: 'dispensaParecer',    label: 'Dispensa de Parecer',            labelCurto: 'D. Par.',    tipo: 'nome1' },
  { key: 'dispensaIntersticio',label: 'Dispensa de Interstício',        labelCurto: 'D. Int.',    tipo: 'nome1' },
  { key: 'pedidoVista',        label: 'Pedido de Vista',                labelCurto: 'P. Vista',   tipo: 'nome1' },
  { key: 'pedidoAdiamento',    label: 'Pedido de Adiamento de Votação', labelCurto: 'P. Adj.',    tipo: 'nome1' },
  { key: 'emenda',             label: 'Emenda(s)',                      labelCurto: 'Emenda',     tipo: 'resultado' },
  { key: 'emendaVotacao1',     label: '1ª Votação da Emenda',           labelCurto: '1º V.Emd.',  tipo: 'resultado' },
  { key: 'emendaVotacao2',     label: '2ª Votação da Emenda',           labelCurto: '2º V.Emd.',  tipo: 'resultado' },
  { key: 'emendaResultado',    label: 'Resultado da Emenda',            labelCurto: 'Res. Emd.',  tipo: 'resultado' },
  { key: 'votacao1',           label: '1ª Votação do Projeto de Lei',   labelCurto: '1ª Vot.',    tipo: 'resultado' },
  { key: 'votacao2',           label: '2ª Votação do Projeto de Lei',   labelCurto: '2ª Vot.',    tipo: 'resultado' },
  { key: 'resultadoFinal',     label: 'Resultado Final do Projeto',     labelCurto: 'Resultado',  tipo: 'resultado' },
  { key: 'sancaoVeto',         label: 'Sanção / Veto',                  labelCurto: 'Sanção/Veto',tipo: 'sancao' },
  { key: 'vetoManutencao',     label: 'Votação de Manutenção do Veto',  labelCurto: 'V. Veto',    tipo: 'resultado' },
  { key: 'promulgacao',        label: 'Promulgação',                    labelCurto: 'Promul.',    tipo: 'sancao' },
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
  promulgacao: { valores: ['promulgado', 'vetado'], labels: ['Promulgado', 'Vetado'] },
}
/** Etapas tipo 'sancao' cujo resultado costuma só ser sabido depois de
 * marcadas (igual comissão) — Sanção/Veto e Promulgação são escolhidas como
 * caminho primeiro, e o resultado é preenchido quando sai a decisão. */
const CHAVES_SANCAO = ['sancaoVeto', 'promulgacao']
/** Etapas que podem acontecer a qualquer momento da tramitação — reposiciona
 * pela DATA real delas em vez da ordem fixa do array, pra aparecer no fluxo
 * exatamente onde aconteceram. Dispensa de Interstício, por exemplo, pode
 * valer só pra pular o intervalo antes da 2ª Votação — nesse caso aparece
 * logo antes dela, não lá atrás perto das comissões. Não inclui Comissões
 * nem Votação/Emenda: a ordem dessas é regra do processo legislativo, não
 * coincidência de data, e mexer nelas quebraria o colchete do "Parecer
 * Conjunto" (que assume Com. 1/2/3 sempre juntas). */
const CHAVES_REPOSICIONAR_POR_DATA = ['retiradoPauta', 'dispensaIntersticio', 'dispensaParecer', 'pedidoVista', 'pedidoAdiamento']
/** Etapas em que dá pra informar o(s) vereador(es) que propuseram — hoje só
 * Emenda(s), que pode ter um autor só ou vários. */
const CHAVES_COM_AUTORES = new Set(['emenda'])
/** Etapas tipo 'nome1' em que o Poder Executivo também pode ser quem pediu —
 * Retirado de Pauta pode partir do prefeito/vice, não só de um vereador.
 * As demais (Comissão Conjunta, Dispensa de Interstício, Pedido de Vista/
 * Adiamento) continuam só com vereadores. */
const CHAVES_NOME1_COM_EXECUTIVO = new Set(['retiradoPauta'])
/** "SIGLA — Nome completo da comissão" quando ambos existem, pra não perder
 * a referência de qual comissão é quando só a sigla aparecia. */
function nomeComissao(com: any): string | undefined {
  if (!com) return undefined
  return com.sigla && com.nome ? `${com.sigla} — ${com.nome}` : (com.sigla || com.nome)
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
  const [pessoasExecutivo, setPessoasExecutivo] = useState<any[]>([])
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
  // Etapa selecionada em cada um dos 3 quadrantes de preenchimento (lista +
  // painel de edição). null = segue a seleção automática (primeira etapa
  // ainda não marcada do quadrante); um valor aqui é porque o usuário clicou
  // manualmente em algum item da lista.
  const [selManual1, setSelManual1] = useState<string | null>(null)
  const [selManual2, setSelManual2] = useState<string | null>(null)
  const [selManual3, setSelManual3] = useState<string | null>(null)
  const [selManual4, setSelManual4] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/vereadores?poder=legislativo&ativo=false').then(r => r.json()),
      fetch('/api/segov').then(r => r.json()),
      fetch('/api/comissoes').then(r => r.json()),
      fetch('/api/vereadores?poder=executivo&ativo=false').then(r => r.json()),
    ]).then(([vers, todos, coms, execs]) => {
      setVereadores(vers)
      setComissoes(coms)
      setPessoasExecutivo(execs)
      const todosCadastrados = [...vers, ...execs]
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
          const v = todosCadastrados.find((v: any) => v.id === item.vereadorId)
          if (v) lista.push({ id: v.id, nome: v.nome, isPE: v.poder === 'executivo', ativo: v.ativo })
        }
        splitAutoresTexto(item.autorNome).forEach((nome: string) => {
          // Usa o mesmo casamento da listagem (primeiro nome igual + sobrenome
          // presente). O critério antigo — "qualquer palavra do autor aparece no
          // nome de qualquer vereador" — casava, por exemplo, "Nilton da Cruz
          // Oliveira" com "José Carlos de Oliveira", criando um autor fantasma
          // que voltava a cada recarga mesmo depois de removido e salvo.
          // Tenta achar a pessoa certa (vereador OU prefeito/vice) pelo nome
          // antes de cair no rótulo genérico "Poder Executivo" sem vínculo.
          const v: any = buscarVereadorPorNome(nome, todosCadastrados as any[])
          if (v) {
            if (!lista.some(a => a.id === v.id))
              lista.push({ id: v.id, nome: v.nome, isPE: v.poder === 'executivo', ativo: v.ativo })
            return
          }
          const lower = nome.toLowerCase()
          if (lower.includes('executivo') || lower.includes('prefeitura') || lower.includes('prefeito')) {
            if (!lista.some(a => a.isPE && !a.id)) lista.push({ nome: 'Poder Executivo', isPE: true })
            return
          }
          if (!lista.some(a => a.nome === nome)) {
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
    const v = vereadores.find((v: any) => v.id === valor) || pessoasExecutivo.find((v: any) => v.id === valor)
    if (v && !autores.some(a => a.id === v.id))
      setAutores(prev => [...prev, { id: v.id, nome: v.nome, isPE: v.poder === 'executivo' }])
  }

  function removerAutor(idx: number) {
    setAutores(prev => prev.filter((_, i) => i !== idx))
  }

  function setPendingData(key: string, field: keyof StepData, value: string) {
    setPendingState(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }))
  }

  /** Adiciona/remove um nome da lista de autores de uma etapa ainda não
   * marcada (ex.: Emenda) — pode ter um autor só ou vários. */
  function togglePendingAutor(key: string, nome: string) {
    setPendingState(prev => {
      const atual = prev[key]?.autores || []
      const novo = atual.includes(nome) ? atual.filter(n => n !== nome) : [...atual, nome]
      return { ...prev, [key]: { ...(prev[key] || {}), autores: novo } }
    })
  }

  /** Mesma coisa, mas pra uma etapa já marcada — corrige sem precisar
   * desmarcar (o que perderia a data/resultado já lançados). */
  function alterarAutores(key: string, nome: string) {
    setFluxo(prev => {
      if (!prev[key]) return prev
      const atual = prev[key].data?.autores || []
      const novo = atual.includes(nome) ? atual.filter(n => n !== nome) : [...atual, nome]
      return { ...prev, [key]: { ...prev[key], data: { ...(prev[key].data || {}), autores: novo } } }
    })
  }

  function marcar(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const p = pending[key] || {}
    let data: StepData = {}
    let doneAt = new Date().toISOString()

    if (def.tipo === 'comissao') {
      if (!p.comissaoId) { toast.error('Selecione uma comissão antes de marcar.'); return }
      // O parecer (Aprovado/Reprovado) normalmente ainda não existe no
      // momento de encaminhar pra comissão — só se sabe na sessão em que ele é
      // lido. Por isso é opcional aqui: se já tiver escolhido no painel da
      // etapa, grava junto; senão, fica em aberto e é informado depois pelo
      // mesmo bloco de resultado, que continua disponível após marcar.
      const com = comissoes.find((c: any) => c.id === p.comissaoId)
      data = { comissaoId: p.comissaoId, comissaoNome: nomeComissao(com), ...(p.resultado ? { resultado: p.resultado } : {}) }
    } else if (def.tipo === 'comissao3nomes') {
      data = { nome1: p.nome1 || '', nome2: p.nome2 || '', nome3: p.nome3 || '', ...(p.resultado ? { resultado: p.resultado } : {}) }
    } else if (def.tipo === 'nome1') {
      data = { nome1: p.nome1 || '' }
    } else if (def.tipo === 'sancao') {
      // Sanção/Veto e Promulgação: igual comissão, o resultado normalmente só
      // é sabido depois de marcar o caminho (o Executivo/a Mesa ainda vai se
      // manifestar) — marcar aqui só reserva a escolha; se já souber o
      // resultado, grava junto, senão completa depois pelo aviso "Falta o
      // parecer" no próprio card.
      data = { ...(p.resultado ? { resultado: p.resultado } : {}) }
    } else if (def.tipo === 'resultado') {
      // Diferente de comissão/sanção, aqui o resultado já é conhecido no
      // momento de marcar (a votação aconteceu naquele dia) — por isso não
      // pode ter um valor padrão silencioso, tem que ser escolhido.
      if (!p.resultado) { toast.error(`Escolha ${getOpcoes(def.key).labels.join(' ou ')} antes de marcar.`); return }
      data = { resultado: p.resultado, ...(p.autores?.length ? { autores: p.autores } : {}) }
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
  }

  /**
   * Calcula o que uma etapa ainda pendente (campos preenchidos, mas sem
   * clicar em "Marcar") viraria se fosse marcada — usado no Salvar geral pra
   * não perder o que a pessoa digitou. Ao contrário de marcar(), nunca
   * mostra erro nem assume um resultado sozinho: se faltar algo obrigatório,
   * só devolve null (a etapa continua pendente, nada é perdido nem forçado).
   */
  function computarEtapaPendente(key: string): StepState | null {
    const def = FLUXO_DEF.find(d => d.key === key)
    const p = pending[key]
    if (!def || !p) return null

    let data: StepData = {}
    if (def.tipo === 'comissao') {
      if (!p.comissaoId) return null
      const com = comissoes.find((c: any) => c.id === p.comissaoId)
      data = { comissaoId: p.comissaoId, comissaoNome: nomeComissao(com), ...(p.resultado ? { resultado: p.resultado } : {}) }
    } else if (def.tipo === 'comissao3nomes') {
      if (!p.nome1 && !p.nome2 && !p.nome3 && !p.data) return null
      data = { nome1: p.nome1 || '', nome2: p.nome2 || '', nome3: p.nome3 || '', ...(p.resultado ? { resultado: p.resultado } : {}) }
    } else if (def.tipo === 'nome1') {
      if (!p.nome1) return null
      data = { nome1: p.nome1 }
    } else if (def.tipo === 'sancao') {
      if (!p.resultado && !p.data) return null
      data = { ...(p.resultado ? { resultado: p.resultado } : {}) }
    } else if (def.tipo === 'resultado') {
      // Nunca assume Aprovado/Reprovado sozinho — sem escolha explícita,
      // a etapa continua pendente (não marca, não perde o que já tinha).
      if (!p.resultado) return null
      data = { resultado: p.resultado, ...(p.autores?.length ? { autores: p.autores } : {}) }
    } else if (def.tipo === 'data') {
      if (!p.data) return null
    } else {
      return null
    }

    const doneAt = p.data ? p.data + 'T12:00:00.000Z' : new Date().toISOString()
    return { done: true, doneAt, data }
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
   * Informa (ou corrige) o resultado de uma etapa que já está marcada mas
   * ficou pendente — comissão (Aprovado/Reprovado), Sanção/Veto (Sancionado/
   * Vetado) ou Promulgação (Promulgado/Vetado) — sem precisar desmarcar e
   * marcar de novo, o que perderia a data original.
   */
  function alterarResultado(key: string, resultado: string) {
    setFluxo(prev => prev[key]
      ? { ...prev, [key]: { ...prev[key], data: { ...(prev[key].data || {}), resultado } } }
      : prev)
  }

  const marcados = useMemo(() => {
    const base = FLUXO_DEF
      // Sanção/Veto e Promulgação marcados mas sem resultado ainda são só um
      // caminho reservado (igual comissão sem parecer) — não entram no fluxo
      // como nó normal, viram a bolinha fantasma abaixo até ter resultado.
      .filter(d => fluxo[d.key]?.done && !(d.tipo === 'sancao' && !fluxo[d.key]?.data?.resultado))
      .map(d => ({ ...d, ...(fluxo[d.key] || {}) }))

    // Reposiciona as etapas "livres" (ver CHAVES_REPOSICIONAR_POR_DATA) pela
    // data real, em vez da ordem fixa do array — mesclando-as entre as fixas
    // (que mantêm a ordem original entre si). As livres são ordenadas pela
    // própria data ANTES de mesclar, pra garantir um resultado consistente
    // (mesclar direto na ordem do array — comparando cada uma com a data
    // *antiga* das outras que ainda não foram tratadas — jogava a etapa lá
    // pro final ou de volta pro lugar de origem, dependendo de qual vinha
    // primeiro no array). Em caso de empate (mesma data), a livre entra
    // ANTES da fixa/livre vizinha — ex.: dispensa de interstício no mesmo
    // dia da 2ª votação normalmente foi concedida antes dela acontecer.
    const fixas = base.filter(m => !CHAVES_REPOSICIONAR_POR_DATA.includes(m.key))
    const livres = base
      .filter(m => CHAVES_REPOSICIONAR_POR_DATA.includes(m.key))
      .sort((a, b) => (a.doneAt || '').localeCompare(b.doneAt || ''))

    const resultado = [...fixas]
    livres.forEach(item => {
      let posicao = resultado.findIndex(m => (m.doneAt || '') >= (item.doneAt || ''))
      if (posicao === -1) posicao = resultado.length
      resultado.splice(posicao, 0, item)
    })
    return resultado
  }, [fluxo])

  /** Move uma etapa "livre" (ver CHAVES_REPOSICIONAR_POR_DATA) exatamente uma
   * posição pra frente ou pra trás no fluxo, sem precisar calcular uma data
   * manual. Troca ela de lugar com o vizinho e, se não sobrar espaço entre
   * as datas pra refletir a nova ordem (comum: várias etapas marcadas no
   * mesmo dia, com o mesmo horário-fantasma T12:00:00 — não existe um valor
   * "entre" duas datas idênticas), redistribui em passos de 1 minuto a
   * partir dali só o necessário pra abrir espaço. Nunca muda a data de quem
   * já tinha espaço de sobra, e nunca troca a ordem relativa de duas etapas
   * fixas entre si — só empurra o suficiente pra caber a que está sendo
   * movida. Isso não aparece pro usuário, já que a data só é exibida em
   * dia/mês/ano. */
  function moverEtapa(key: string, direcao: 'antes' | 'depois') {
    const idx = marcados.findIndex(m => m.key === key)
    if (idx === -1) return
    const alvo = direcao === 'antes' ? idx - 1 : idx + 1
    if (alvo < 0 || alvo >= marcados.length) return

    const nova = [...marcados]
    ;[nova[idx], nova[alvo]] = [nova[alvo], nova[idx]]

    const atualizacoes: Record<string, string> = {}
    let anteriorMs = nova[0]?.doneAt ? new Date(nova[0].doneAt).getTime() : 0
    for (let i = 1; i < nova.length; i++) {
      const atualMs = nova[i].doneAt ? new Date(nova[i].doneAt as string).getTime() : anteriorMs + 60000
      const novoMs = atualMs > anteriorMs ? atualMs : anteriorMs + 60000
      if (novoMs !== atualMs) atualizacoes[nova[i].key] = new Date(novoMs).toISOString()
      anteriorMs = novoMs
    }
    if (!Object.keys(atualizacoes).length) return

    setFluxo(prev => {
      const next = { ...prev }
      Object.entries(atualizacoes).forEach(([k, doneAt]) => {
        if (next[k]) next[k] = { ...next[k], doneAt }
      })
      return next
    })
  }

  /**
   * Quando o parecer é conjunto, as comissões que o emitiram são mostradas
   * dentro de uma faixa única, sem setas entre elas — enfileirá-las daria a
   * entender que a proposição passou por uma comissão de cada vez, quando na
   * verdade foi um ato só. O nó avulso "C. Conj." sai do gráfico nesse caso,
   * porque a faixa já comunica isso (ele continua marcável no formulário).
   */
  // Depois do Resultado Final aprovado, falta ao Executivo/à Mesa se
  // manifestar. Três estados: (1) nada escolhido ainda → fantasma genérico
  // "Aguard. Sanção"; (2) Sanção/Veto ou Promulgação já escolhida como
  // caminho mas sem resultado → fantasma específico daquela etapa; (3) com
  // resultado → vira nó normal (colorido) no fluxo, não precisa de fantasma.
  const chaveSancaoIncompleta = CHAVES_SANCAO.find(k => fluxo[k]?.done && !fluxo[k]?.data?.resultado)
  const labelFantasmaSancao = chaveSancaoIncompleta
    ? FLUXO_DEF.find(d => d.key === chaveSancaoIncompleta)!.labelCurto
    : 'Sanção'
  const aguardandoSancao =
    fluxo['resultadoFinal']?.done &&
    fluxo['resultadoFinal']?.data?.resultado === 'aprovado' &&
    (!!chaveSancaoIncompleta || (!fluxo['sancaoVeto']?.done && !fluxo['promulgacao']?.done))

  const segmentos = useMemo(() => {
    type No = typeof marcados[number]
    const doGrupo = fluxo['comissaoConjunta']?.done
      ? marcados.filter(m => CHAVES_COMISSAO.includes(m.key))
      : []
    const agrupar = doGrupo.length >= 2

    const out: ({ tipo: 'no'; step: No } | { tipo: 'grupo'; steps: No[] } | { tipo: 'fantasma'; label: string })[] = []
    let grupoInserido = false
    marcados.forEach(step => {
      if (agrupar && CHAVES_COMISSAO.includes(step.key)) {
        if (!grupoInserido) { out.push({ tipo: 'grupo', steps: doGrupo }); grupoInserido = true }
        return
      }
      if (agrupar && step.key === 'comissaoConjunta') return
      out.push({ tipo: 'no', step })
    })
    if (aguardandoSancao) out.push({ tipo: 'fantasma', label: labelFantasmaSancao })
    return out
  }, [marcados, fluxo, aguardandoSancao, labelFantasmaSancao])

  const ultimaChaveMarcada = marcados.length ? marcados[marcados.length - 1].key : null

  function renderNoFluxo(step: typeof marcados[number]) {
    const isLast = step.key === ultimaChaveMarcada
    // Sanção/Veto (e outras etapas de resultado que não entram no cálculo
    // geral do fluxo) precisam da própria cor: sem isso, um Veto marcado
    // depois do Resultado Final aprovado apareceria verde do mesmo jeito,
    // porque o gráfico já estava "verde" globalmente.
    const negativoLocal = !!step.data?.resultado && NEGATIVOS.has(step.data.resultado)
    // Retirado de Pauta é sempre laranja, a mesma cor do status "Retirado" —
    // independe do resto do fluxo estar verde/vermelho/azul.
    const isRetirado = step.key === 'retiradoPauta'
    return (
      <div className="flex flex-col items-center" style={{ width: '68px' }}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${
          isRetirado ? 'bg-orange-500' :
          negativoLocal || graficoCor === 'vermelho' ? 'bg-red-500' :
          (graficoCor === 'normal' && isLast) ? 'bg-blue-500' :
          'bg-green-500'
        }`}>
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className={`text-xs font-semibold mt-1 text-center leading-tight px-1 ${
          isRetirado ? 'text-orange-600' :
          negativoLocal || graficoCor === 'vermelho' ? 'text-red-700' :
          (graficoCor === 'normal' && isLast) ? 'text-blue-600' :
          'text-gray-700'
        }`}>{step.labelCurto}</p>
        <p className="text-xs text-gray-400 text-center mt-0.5">{fmtData(step.doneAt)}</p>
        {/* No fluxo só a sigla — o nome completo da comissão (guardado junto
            em "SIGLA — Nome") fica só no painel de edição, onde tem espaço;
            aqui embaixo do nó, o nome inteiro quebrava em várias linhas e
            distorcia o gráfico. */}
        {step.data?.comissaoNome && (
          <span className="mt-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium text-center leading-snug break-words">{step.data.comissaoNome.split(' — ')[0]}</span>
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
        {step.data?.autores && step.data.autores.length > 0 && (
          <span className="mt-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-center leading-snug break-words">{step.data.autores.join(' e ')}</span>
        )}
      </div>
    )
  }

  /** Bolinha tracejada azul indicando a próxima etapa esperada, ainda não
   * marcada (hoje só usada para "Aguardando Sanção" após o Resultado Final
   * aprovado) — não é clicável, é só um indicativo visual. */
  function renderNoFantasma(label: string) {
    // Largura maior que os outros nós (56px) porque "Sanção/Veto" não cabe
    // nesse espaço numa linha só — este é sempre o último item da fileira,
    // então sobra espaço. "Aguardando" fica numa legenda curta separada, em
    // vez de grudada no nome (evita estourar a borda do fluxo).
    return (
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: '84px' }}>
        <div className="w-5 h-5 rounded-full border-2 border-dashed border-blue-400 bg-blue-50" />
        <p className="text-[9px] font-bold mt-1 text-center leading-tight text-blue-400 uppercase tracking-wide">Aguardando</p>
        <p className="text-xs font-semibold text-center leading-tight px-1 text-blue-500">{label}</p>
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

  // Quando sanciona, o "Dias em Aberto" (que conta pra sempre) vira um total
  // fixo do processo inteiro — do Protocolado até a data da Sanção.
  const diasProcessoConcluido = useMemo(() => {
    const sancao = fluxo['sancaoVeto']
    if (!sancao?.done || sancao.data?.resultado !== 'sancionado') return null
    const protocolado = fluxo['protocolado']
    if (!protocolado?.done || !protocolado.doneAt || !sancao.doneAt) return null
    return Math.floor((new Date(sancao.doneAt).getTime() - new Date(protocolado.doneAt).getTime()) / 86400000)
  }, [fluxo])

  // Resumo do(s) autor(es) pra barra fixa do topo — nome de quem é o único,
  // ou a contagem quando são vários (o nome completo continua no corpo da
  // página, no chip de autor de sempre).
  const autorResumo = autores.length === 1
    ? (autores[0].isPE ? `Poder Executivo - ${autores[0].nome}` : autores[0].nome)
    : autores.length > 1 ? `${autores.length} autores` : null

  /** Recarrega a proposição do servidor, descartando qualquer edição local
   * não salva — útil se alguém mais mexeu nela nesse meio-tempo. */
  function atualizarPagina() {
    window.location.reload()
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const autorNome = autores.map(a => a.nome).join(' e ') || null
    // Antes só vinculava vereador legislativo — agora o Poder Executivo pode
    // ser uma pessoa cadastrada (prefeito/vice) também, então qualquer autor
    // com id real (isPE ou não) pode ocupar o vínculo.
    const vereadorId = autores.find(a => a.id)?.id || null
    // O status deixa de ser escolhido à mão e passa a ser calculado a partir
    // do próprio fluxo — exceto Arquivado/Retirado, que são decisões
    // administrativas que a função preserva sem alteração.

    // Se alguma etapa tem campos preenchidos mas ninguém clicou em "Marcar"
    // (ex.: preencheu a Comissão Especial inteira e foi direto pro Salvar),
    // aplica automaticamente aqui — sem isso, o que foi digitado se perdia
    // silenciosamente, porque só o fluxo já marcado é enviado ao servidor.
    let fluxoFinal = fluxo
    const autoMarcados: string[] = []
    Object.keys(pending).forEach(key => {
      const etapa = computarEtapaPendente(key)
      if (etapa) {
        fluxoFinal = { ...fluxoFinal, [key]: etapa }
        autoMarcados.push(FLUXO_DEF.find(d => d.key === key)?.label || key)
      }
    })
    if (autoMarcados.length) {
      setFluxo(fluxoFinal)
      setPendingState({})
      toast.info(`Marcado automaticamente ao salvar: ${autoMarcados.join(', ')}`)
    }

    const status = derivarStatusSegov(fluxoFinal, form.status)
    const res = await fetch(`/api/segov/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, status, autorNome, vereadorId, fluxo: fluxoFinal }),
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

  /** Uma linha da lista de etapas (lado esquerdo de cada quadrante). */
  function renderLinhaLista(key: string, ativo: boolean, onClick: () => void) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const state = fluxo[key]
    const done = !!state?.done
    const negativo = NEGATIVOS.has(state?.data?.resultado || '')
    const reservado = done && (def.tipo === 'sancao' || def.tipo === 'comissao' || def.tipo === 'comissao3nomes') && !state?.data?.resultado
    const sufixo = state?.data?.resultado ? ` — ${labelResultado(key, state.data.resultado)}` : ''
    // Selecionar uma etapa não pode apagar a cor do próprio status dela — uma
    // já concluída (verde) continua verde mesmo selecionada; azul fica só
    // pra quem ainda está pendente (é a etapa "sendo preenchida agora").
    const corSelecionada = !done
      ? 'bg-blue-100 text-blue-800'
      : negativo ? 'bg-red-100 text-red-800'
      : reservado ? 'bg-blue-100 text-blue-800'
      : 'bg-green-100 text-green-800'
    return (
      <button key={key} type="button" onClick={onClick}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition ${
          ativo ? corSelecionada : done ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 hover:bg-gray-100'
        }`}>
        <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
          !done ? 'border border-gray-300 bg-white' : negativo ? 'bg-red-500' : reservado ? 'bg-blue-400' : 'bg-green-500'
        }`}>
          {done && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </span>
        <span className="font-medium leading-tight whitespace-nowrap">{def.label}{sufixo}</span>
      </button>
    )
  }

  /** Painel de edição da etapa selecionada (lado direito de cada quadrante). */
  function renderPainelDetalhe(key: string) {
    const def = FLUXO_DEF.find(d => d.key === key)!
    const state = fluxo[key]
    const done = !!state?.done
    const p = pending[key] || {}
    const negativo = NEGATIVOS.has(state?.data?.resultado || '')
    const reservado = done && (def.tipo === 'sancao' || def.tipo === 'comissao' || def.tipo === 'comissao3nomes') && !state?.data?.resultado
    // Votações, emenda etc.: o resultado já é sabido na hora (a votação
    // aconteceu naquele dia), então marcar sem escolher Aprovado/Reprovado
    // explicitamente não pode virar "Aprovado" por padrão.
    const faltaEscolhaResultado = !done && def.tipo === 'resultado' && !p.resultado

    return (
      <div key={key}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-base font-semibold text-gray-800">{def.label}</p>
            {done ? (
              <p className={`text-xs mt-0.5 flex items-center gap-1 ${negativo ? 'text-red-600' : reservado ? 'text-blue-600' : 'text-green-600'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                {reservado ? 'Marcada — falta o resultado' : state?.data?.resultado ? `Marcada — ${labelResultado(key, state.data.resultado)}` : 'Marcada'}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">Ainda não marcada</p>
            )}
          </div>
          {done && (
            <button type="button" onClick={() => desmarcar(def.key)}
              className="text-[11px] text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 hover:bg-red-50 rounded-md px-2 py-1 transition flex-shrink-0">
              Desmarcar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-4 mb-4">
          {/* Toda etapa aceita data — em branco, assume hoje. Editável mesmo
              depois de marcada, pra lançar proposições antigas e corrigir
              datas erradas. */}
          <div className="w-40">
            <label className="block text-xs text-gray-500 mb-1">Data</label>
            <input type="date"
              value={done ? (state!.doneAt || '').split('T')[0] : (p.data || '')}
              onChange={e => done ? alterarData(def.key, e.target.value) : setPendingData(def.key, 'data', e.target.value)}
              title={def.tipo === 'data' && !done ? 'Informe a data' : undefined}
              className={inpSm} />
          </div>

          {/* Mover no fluxo é mais prático que calcular uma data manualmente
              — os botões ajustam a data por trás das cortinas (1 minuto antes/
              depois do vizinho, sem aparecer pro usuário), então a ordem
              continua vindo só da data, e a bolinha pula pra posição certa
              com um clique. Só pras etapas "livres" já marcadas. */}
          {done && CHAVES_REPOSICIONAR_POR_DATA.includes(def.key) && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Posição no fluxo</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => moverEtapa(def.key, 'antes')}
                  disabled={marcados.findIndex(m => m.key === def.key) <= 0}
                  title="Mover uma posição antes no fluxo"
                  className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">◀</button>
                <button type="button" onClick={() => moverEtapa(def.key, 'depois')}
                  disabled={marcados.findIndex(m => m.key === def.key) >= marcados.length - 1}
                  title="Mover uma posição depois no fluxo"
                  className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition">▶</button>
              </div>
            </div>
          )}

          {def.tipo === 'comissao' && (
            <div className="w-64">
              <label className="block text-xs text-gray-500 mb-1">Comissão</label>
              {done ? (
                <p className="text-sm text-gray-700 px-0.5 py-1.5">{state?.data?.comissaoNome || '—'}</p>
              ) : (
                <select value={p.comissaoId || ''} onChange={e => setPendingData(def.key, 'comissaoId', e.target.value)} className={inpSm}>
                  <option value="">— Selecionar comissão —</option>
                  {comissoes.map((c: any) => <option key={c.id} value={c.id}>{c.sigla ? `${c.sigla} — ${c.nome}` : c.nome}</option>)}
                </select>
              )}
            </div>
          )}

          {def.tipo === 'nome1' && (() => {
            const comExecutivo = CHAVES_NOME1_COM_EXECUTIVO.has(def.key)
            return (
              <div className="w-56">
                <label className="block text-xs text-gray-500 mb-1">{comExecutivo ? 'Vereador ou Executivo' : 'Vereador'}</label>
                {done ? (
                  <p className="text-sm text-gray-700 px-0.5 py-1.5">{state?.data?.nome1 || '—'}</p>
                ) : (
                  <select value={p.nome1 || ''} onChange={e => setPendingData(def.key, 'nome1', e.target.value)} className={inpSm}>
                    <option value="">— Selecionar —</option>
                    {comExecutivo ? (
                      <>
                        <optgroup label="Poder Executivo">
                          {pessoasExecutivo.map((v: any) => <option key={v.id} value={v.nome}>{v.nome}</option>)}
                        </optgroup>
                        <optgroup label="Vereadores">
                          {vereadores.map((v: any) => <option key={v.id} value={primeiroNome(v.nome)}>{primeiroNome(v.nome)}</option>)}
                        </optgroup>
                      </>
                    ) : (
                      vereadores.map((v: any) => <option key={v.id} value={primeiroNome(v.nome)}>{primeiroNome(v.nome)}</option>)
                    )}
                  </select>
                )}
              </div>
            )
          })()}

          {def.tipo === 'comissao3nomes' && (
            <div className="w-full">
              <label className="block text-xs text-gray-500 mb-1">Membros</label>
              {done ? (
                <div className="flex flex-wrap gap-1">
                  {[state?.data?.nome1, state?.data?.nome2, state?.data?.nome3].filter(Boolean).map((n, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{n}</span>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-md">
                  {(['nome1', 'nome2', 'nome3'] as const).map((campo, i) => (
                    <select key={campo} value={p[campo] || ''} onChange={e => setPendingData(def.key, campo, e.target.value)} className={inpSm}>
                      <option value="">— Membro {i + 1} —</option>
                      {vereadores.map((v: any) => <option key={v.id} value={primeiroNome(v.nome)}>{primeiroNome(v.nome)}{!v.ativo && ' (inativo)'}</option>)}
                    </select>
                  ))}
                </div>
              )}
            </div>
          )}

          {CHAVES_COM_AUTORES.has(def.key) && (() => {
            const listaAtual = (done ? state?.data?.autores : p.autores) || []
            const disponiveis = vereadores.filter((v: any) => !listaAtual.includes(primeiroNome(v.nome)))
            return (
              <div className="w-full">
                <label className="block text-xs text-gray-500 mb-1">Vereador(es) que propuseram (opcional)</label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {listaAtual.map((nome: string) => (
                    <span key={nome} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {nome}
                      <button type="button"
                        onClick={() => done ? alterarAutores(def.key, nome) : togglePendingAutor(def.key, nome)}
                        className="text-gray-400 hover:text-red-500 transition">×</button>
                    </span>
                  ))}
                  <select value=""
                    onChange={e => { if (e.target.value) { done ? alterarAutores(def.key, e.target.value) : togglePendingAutor(def.key, e.target.value) } }}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-green-400/60">
                    <option value="">— Adicionar vereador —</option>
                    {disponiveis.map((v: any) => <option key={v.id} value={primeiroNome(v.nome)}>{primeiroNome(v.nome)}{!v.ativo && ' (inativo)'}</option>)}
                  </select>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Resultado: obrigatório em votações (já se sabe na hora); opcional
            em comissão/comissão especial/sanção/promulgação, que podem ser
            marcadas reservando o caminho e completadas depois — os mesmos
            botões continuam disponíveis após marcar, pra informar o
            resultado quando ele sair. */}
        {(def.tipo === 'resultado' || def.tipo === 'sancao' || def.tipo === 'comissao' || def.tipo === 'comissao3nomes') && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">
              Resultado {def.tipo === 'resultado' ? '(obrigatório)' : '(opcional agora)'}
            </label>
            <div className="flex gap-2 max-w-xs">
              {getOpcoes(def.key).valores.map((r, i) => {
                const ativo = done ? state?.data?.resultado === r : p.resultado === r
                return (
                  <button key={r} type="button"
                    onClick={() => done ? alterarResultado(def.key, r) : setPendingData(def.key, 'resultado', r)}
                    className={`flex-1 text-xs px-3 py-1.5 rounded-md border transition font-medium ${
                      ativo
                        ? NEGATIVOS.has(r) ? 'border-red-400 bg-red-50 text-red-700' : 'border-green-400 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    }`}>
                    {getOpcoes(def.key).labels[i]}
                  </button>
                )
              })}
            </div>
            {def.tipo !== 'resultado' && (
              <p className="text-[11px] text-gray-400 mt-1.5">Pode marcar sem escolher e completar quando sair a decisão.</p>
            )}
          </div>
        )}

        {!done && (
          <button type="button"
            onClick={() => marcar(def.key)}
            disabled={faltaEscolhaResultado}
            title={faltaEscolhaResultado ? `Escolha ${getOpcoes(def.key).labels.join(' ou ')} antes` : undefined}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition ${
              faltaEscolhaResultado ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'
            }`}>
            Marcar {def.label.toLowerCase()}
          </button>
        )}
      </div>
    )
  }

  /** Um quadrante completo: lista de etapas agrupadas à esquerda, painel de
      edição da etapa selecionada à direita. */
  function renderQuadrante(grupos: { titulo: string; keys: string[] }[], selecionado: string, onSelecionar: (k: string) => void) {
    return (
      // min-h fixo e igual nos 4 quadrantes — pedido do usuário pra ficarem
      // do mesmo tamanho (largura já vem igual pela grade 2 colunas). Com
      // 380px cabe a lista mais longa (Início e Comissões) e o painel mais
      // cheio sem precisar de rolagem interna; quadrantes com menos itens
      // (Situações Especiais, Emendas) só sobram com espaço em branco.
      <div className="rounded-xl border-2 border-blue-300 bg-white overflow-hidden flex flex-col md:flex-row min-h-[380px]">
        <div className="w-full md:w-[308px] flex-shrink-0 border-b md:border-b-0 md:border-r border-blue-100 bg-gray-50 p-1.5 overflow-x-auto">
          {grupos.map(g => (
            <div key={g.titulo}>
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide px-2.5 pt-2.5 pb-1">{g.titulo}</p>
              {g.keys.map(k => renderLinhaLista(k, k === selecionado, () => onSelecionar(k)))}
            </div>
          ))}
        </div>
        <div className="flex-1 p-4 min-w-0">
          {renderPainelDetalhe(selecionado)}
        </div>
      </div>
    )
  }

  // Agrupamento das 21 etapas em 4 quadrantes (lista + painel de edição
  // cada um), em grade 2x2. Retirado de Pauta saiu do quadrante "Início"
  // (onde ficava meio perdido junto de Protocolado/Pautado) e foi pro
  // mesmo quadrante das outras etapas "livres" (Interstício, Vista,
  // Adiamento) — todas compartilham a mesma natureza de poder acontecer a
  // qualquer momento da tramitação. Vetação de Manutenção do Veto só entra
  // na lista quando faz sentido preenchê-la (depois de Sanção/Veto marcado
  // como "Vetado").
  const quad1Grupos = [
    { titulo: 'Início', keys: ['protocolado', 'pautado'] },
    { titulo: 'Comissões', keys: ['comissao1', 'comissao2', 'comissao3', 'comissaoEspecial', 'comissaoConjunta', 'dispensaParecer'] },
  ]
  const quad2Grupos = [
    { titulo: 'Situações especiais', keys: ['retiradoPauta', 'dispensaIntersticio', 'pedidoVista', 'pedidoAdiamento'] },
  ]
  const quad3Grupos = [
    { titulo: 'Emendas', keys: ['emenda', 'emendaVotacao1', 'emendaVotacao2', 'emendaResultado'] },
  ]
  const quad4Grupos = [
    { titulo: 'Votação e sanção', keys: ['votacao1', 'votacao2', 'resultadoFinal', 'sancaoVeto', 'promulgacao',
      ...(fluxo['sancaoVeto']?.data?.resultado === 'vetado' ? ['vetoManutencao'] : [])] },
  ]
  const quad1Keys = quad1Grupos.flatMap(g => g.keys)
  const quad2Keys = quad2Grupos.flatMap(g => g.keys)
  const quad3Keys = quad3Grupos.flatMap(g => g.keys)
  const quad4Keys = quad4Grupos.flatMap(g => g.keys)
  // Seleção automática: a primeira etapa ainda não marcada do quadrante (ou
  // a última, se já estiver tudo feito) — até o usuário clicar em outra.
  function selecaoPadrao(keys: string[]) {
    return keys.find(k => !fluxo[k]?.done) || keys[keys.length - 1]
  }
  const selQuad1 = selManual1 && quad1Keys.includes(selManual1) ? selManual1 : selecaoPadrao(quad1Keys)
  const selQuad2 = selManual2 && quad2Keys.includes(selManual2) ? selManual2 : selecaoPadrao(quad2Keys)
  const selQuad3 = selManual3 && quad3Keys.includes(selManual3) ? selManual3 : selecaoPadrao(quad3Keys)
  const selQuad4 = selManual4 && quad4Keys.includes(selManual4) ? selManual4 : selecaoPadrao(quad4Keys)

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* Barra fixa ao rolar a página (mesmo mecanismo da barra de filtros da
          lista de Proposições), compacta: número/status/dias/autor resumidos
          numa linha só, e Atualizar/Cancelar/Salvar sempre à mão — sem
          precisar rolar até o fim do formulário. Status e Dias em Aberto/
          Duração saem da linha de campos logo abaixo (esse resumo já cobre)
          — o campo Status em si (editável, pra Arquivado/Retirado) continua
          lá. O botão Salvar submete o <form> de baixo via o atributo form=,
          mesmo estando fora dele visualmente. */}
      <div className="sticky top-12 z-30 flex items-center gap-4 bg-gray-100 py-2 will-change-transform">
        <Link href="/dashboard/segov"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>

        <div className="flex-1 flex items-center gap-2.5 min-w-0 overflow-x-auto whitespace-nowrap">
          <span className="font-bold text-gray-800">{form.tipo} {formatNumero(form.numero)}/{form.ano}</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_COR[form.status] || 'bg-gray-100 text-gray-700'}`}>
            {form.status}
          </span>
          {diasProcessoConcluido !== null ? (
            <span className="text-xs text-green-600 font-medium flex-shrink-0">Concluído em {diasProcessoConcluido} dias</span>
          ) : diasEmAberto !== null && (
            <span className="text-xs text-gray-400 flex-shrink-0">{diasEmAberto} dias em aberto</span>
          )}
          {autorResumo && <span className="text-xs text-gray-400 flex-shrink-0">· {autorResumo}</span>}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={atualizarPagina}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 border border-gray-300 hover:bg-gray-50 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Atualizar
          </button>
          <Link href="/dashboard/segov"
            className="px-4 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Cancelar
          </Link>
          <button type="submit" form="form-editar-segov" disabled={salvando}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
            style={{ background: '#8B0000' }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <form id="form-editar-segov" onSubmit={salvar} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

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
              <optgroup label="Poder Executivo">
                {pessoasExecutivo.map((v: any) => <option key={v.id} value={v.id}>⚡ {v.nome}{v.cargo ? ` (${v.cargo})` : ''}</option>)}
              </optgroup>
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
            <p className="text-[10px] text-gray-400 mt-1 leading-tight">
              Calculado automaticamente pelo fluxo ao salvar — só fica como escolhido aqui se for Arquivado ou Retirado.
            </p>
          </div>
        </div>

        {autores.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {autores.map((a, i) => (
              <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                a.isPE ? 'bg-orange-100 text-orange-800 border border-orange-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}>
                {a.isPE && <span>⚡</span>}
                {a.isPE ? `Poder Executivo - ${a.nome}` : a.nome}
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
                  const proximoEhFantasma = segmentos[i + 1]?.tipo === 'fantasma'
                  return (
                    <div key={i} className="flex items-start flex-shrink-0">
                      {seg.tipo === 'no' ? (
                        renderNoFluxo(seg.step)
                      ) : seg.tipo === 'fantasma' ? (
                        renderNoFantasma(seg.label)
                      ) : (
                        /* Parecer conjunto: as comissões aparecem lado a lado dentro
                           de uma faixa, SEM setas entre elas — foi um ato único.
                           Marcadas por um colchete lilás flutuante por cima, sem caixa
                           ao redor e sem empurrar as bolinhas pra baixo (ficam na mesma
                           linha dos outros passos do fluxo). */
                        <div className="relative flex items-start self-start px-1">
                          <p className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-purple-600 text-center uppercase tracking-wide whitespace-nowrap">
                            Parecer Conjunto{fluxo['comissaoConjunta']?.data?.nome1 ? ` — ${fluxo['comissaoConjunta']?.data?.nome1}` : ''}
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
                      {!ultimoSegmento && proximoEhFantasma && (
                        <div className="flex-shrink-0 mt-2.5 border-t-2 border-dashed border-blue-300 w-4 h-0" />
                      )}
                      {!ultimoSegmento && !proximoEhFantasma && (
                        <div className="flex-shrink-0 mt-2.5">
                          <div className={`h-0.5 w-4 ${graficoCor === 'vermelho' ? 'bg-red-400' : 'bg-green-400'}`} />
                          <div className={`w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] -mt-[2.5px] ml-4 ${graficoCor === 'vermelho' ? 'border-l-red-400' : 'border-l-green-400'}`} />
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderQuadrante(quad1Grupos, selQuad1, k => setSelManual1(k))}
            {renderQuadrante(quad2Grupos, selQuad2, k => setSelManual2(k))}
            {renderQuadrante(quad3Grupos, selQuad3, k => setSelManual3(k))}
            {renderQuadrante(quad4Grupos, selQuad4, k => setSelManual4(k))}
          </div>
        </div>

      </form>
    </div>
  )
}
