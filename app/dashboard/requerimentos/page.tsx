import ListaRequerimentos from './_components/ListaRequerimentos'

export default function RequerimentosPage() {
  return (
    <ListaRequerimentos
      titulo="Requerimentos"
      subtitulo="Requerimentos e Indicações"
      tiposExibidos={['REQ', 'IND']}
      novoHref="/dashboard/requerimentos/novo"
      editarHrefBase="/dashboard/requerimentos"
    />
  )
}
