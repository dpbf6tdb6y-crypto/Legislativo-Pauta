import ListaRequerimentos from './_components/ListaRequerimentos'

export default function RequerimentosPage() {
  return (
    <ListaRequerimentos
      titulo="Requerimentos"
      subtitulo="Requerimentos e Indicações"
      modo="todos-exceto"
      tiposFiltro={['MOC']}
      novoHref="/dashboard/requerimentos/novo"
      editarHrefBase="/dashboard/requerimentos"
    />
  )
}
