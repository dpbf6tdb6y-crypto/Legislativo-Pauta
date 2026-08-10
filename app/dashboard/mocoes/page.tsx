import ListaRequerimentos from '../requerimentos/_components/ListaRequerimentos'

export default function MocoesPage() {
  return (
    <ListaRequerimentos
      titulo="Moções"
      subtitulo="Moções de aplausos, pesar e repúdio"
      modo="apenas"
      tiposFiltro={['MOC']}
      novoHref="/dashboard/requerimentos/novo?tipo=MOC"
      editarHrefBase="/dashboard/requerimentos"
      corPrimaria="#6d28d9"
    />
  )
}
