// Os quatro medidores do Painel de Comando anterior: folha de pessoal, educação, saúde e repasse à Câmara.
// Cada um mostra o valor apurado e o traço do limite da lei. Só descreve; a leitura jurídica é de quem analisa.
import Link from 'next/link';
import Medidor from './Medidor';
import { nivelDoLRF, type Nivel, type PessoalLRF, type ResumoRREO } from '@/lib/financas/painel/fiscal';

const pct1 = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const pctNum = (bp: bigint) => Number(bp) / 100;
const MES_ABREV = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

interface Item { chave: string; titulo: string; periodo: string; valor: number; escala: number; marcas: { valor: number; rotulo: string }[]; nivel: Nivel }

export default function MedidoresLimites({ pes, rreo, camaraPct, camaraAte, camaraAno }: {
  pes: PessoalLRF | null;
  rreo: ResumoRREO | null;
  camaraPct: number | null;      // % do teto do art. 29-A já empenhado
  camaraAte: number;             // mês até o qual o empenhado foi lido
  camaraAno: number;
}) {
  const itens: Item[] = [];
  if (pes) {
    const max = pes.limites.find((l) => l.nome === 'maximo');
    itens.push({
      chave: 'folha', titulo: 'Folha de pessoal · Executivo',
      periodo: `12 meses até o ${pes.quadrimestre}º quadrimestre/${pes.ano} · RGF oficial (SICONFI)`,
      valor: pctNum(pes.pctBp), escala: Math.ceil(((max ? pctNum(max.pctBp) : 60) * 1.25) / 5) * 5,
      marcas: [{ valor: max ? pctNum(max.pctBp) : 60, rotulo: 'Limite máximo da LRF' }], nivel: nivelDoLRF(pes.nivel),
    });
  }
  for (const [chave, titulo] of [['mde', 'Educação'], ['asps', 'Saúde']] as const) {
    const m = rreo?.minimos.find((x) => x.chave === chave);
    if (!m || !rreo) continue;
    const min = pctNum(m.minimoBp);
    itens.push({
      chave, titulo: `${titulo} · mín. ${min.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`,
      periodo: `jan a ${MES_ABREV[Math.min(rreo.bimestre * 2, 12)]}/${rreo.ano} · relatório oficial (RREO)`,
      valor: pctNum(m.pctBp), escala: Math.max(Math.ceil((min * 2) / 5) * 5, Math.ceil((pctNum(m.pctBp) * 1.2) / 5) * 5),
      marcas: [{ valor: min, rotulo: `Mínimo ${min}%` }], nivel: m.nivel,
    });
  }
  if (camaraPct !== null) {
    itens.push({
      chave: 'camara', titulo: 'Câmara · do teto',
      periodo: `jan a ${MES_ABREV[camaraAte]}/${camaraAno} · empenhado`,
      valor: camaraPct, escala: Math.max(120, Math.ceil((camaraPct * 1.1) / 10) * 10),
      marcas: [{ valor: 100, rotulo: 'Teto do art. 29-A' }], nivel: camaraPct > 100 ? 'atencao' : camaraPct >= 90 ? 'observacao' : 'ok',
    });
  }
  if (!itens.length) return null;
  return (
    <section aria-label="Limites da lei" className="cartao" style={{ padding: '6px 10px' }}>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {itens.map((i) => (
          <Link key={i.chave} href="/dashboard/fazenda/limites" className="flex flex-col items-center text-center rounded-lg px-1 py-0.5 hover:bg-slate-50">
            <Medidor valor={i.valor} escala={i.escala} marcas={i.marcas} nivel={i.nivel} texto={pct1(i.valor)} largura="max-w-[118px]" />
            <div className="text-xs font-semibold text-slate-700 leading-tight">{i.titulo}</div>
            <div className="text-[10.5px] text-slate-500 leading-tight max-w-[190px]">{i.periodo}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
