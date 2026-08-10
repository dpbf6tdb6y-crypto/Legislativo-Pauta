import ListaRequerimentos from '../requerimentos/_components/ListaRequerimentos'

export default function MocoesPage() {
  return (
    <ListaRequerimentos
      titulo="Moções"
      subtitulo="Moções de aplausos, pesar e repúdio"
      tiposExibidos={['MOC']}
      novoHref="/dashboard/requerimentos/novo?tipo=MOC"
      editarHrefBase="/dashboard/requerimentos"
      corPrimaria="#6d28d9"
    />
  )
}
