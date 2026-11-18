// Conector "arquivo": lê CSVs no formato padrão a partir de uma pasta.
// Simula o "sistema interno de uma prefeitura" e prova que a fonte pode ser
// trocada sem mexer em regras nem telas.
//
// Arquivos esperados (separador ";", valores em centavos inteiros, datas aaaa-mm-dd):
//   despesa_orgao.csv  ano;mes;orgaoCod;orgaoNome;dotInicial;dotAtual;empenhado;liquidado;pago
//   receitas.csv       ano;mes;contaCod;contaPai;nome;redutora;previstoInicial;previstoAtual;arrecAnterior;arrecMes;arrecAteMes
//   contratos.csv      idOrigem;numero;ano;assinatura;inicio;fim;publicacaoData;publicacaoVeiculo;objeto;tipo;situacao;valorInicial;valorAtual;processo;modalidade;fornecedorDoc;fornecedorNome
//   empenhos.csv       idOrigem;numero;data;tipo;orgao;unidade;credorDoc;credorNome;processo;natureza;contaDespesa;fonte;funcao;subfuncao;programa;projeto;descricao;valor;anulado;aLiquidar;aPagar
//   eventos.csv        empenhoIdOrigem;tipo(L|P);idOrigem;numero;data;valor
//   folha.csv          anoMes;seq;matricula;nome;cargo;ocupacao;tipoVinculo;situacaoOriginal;lotacao;vencimentos;bruto;previdencia;desconto;irrf;liquido
import fs from 'fs';
import path from 'path';
import type { ComBruto, Conector, ContratoC, DespesaFuncaoMesC, DespesaNaturezaMesC, DespesaOrgaoMesC, EmpenhoC, EventoC, FolhaMesC, ReceitaContaMesC, RestoPagarC, RetencaoC } from './tipos';

const dt = (s: string) => (s ? new Date(`${s}T12:00:00Z`) : null);

export class ConectorArquivo implements Conector {
  nome = 'arquivo-csv';
  constructor(private pasta: string) {}
  async abrir() {
    if (!fs.existsSync(this.pasta)) throw new Error(`pasta ${this.pasta} não existe`);
  }
  async fechar() {}

  private ler(nome: string): { linhas: Record<string, string>[]; bruto: Buffer } {
    const p = path.join(this.pasta, nome);
    if (!fs.existsSync(p)) return { linhas: [], bruto: Buffer.alloc(0) };
    const bruto = fs.readFileSync(p);
    const [cab, ...resto] = bruto.toString('utf-8').split(/\r?\n/).filter((l) => l.trim() !== '');
    const campos = cab.split(';');
    return {
      bruto,
      linhas: resto.map((l) => {
        const v = l.split(';');
        return Object.fromEntries(campos.map((c, i) => [c, v[i] ?? '']));
      }),
    };
  }
  private bruto(tipo: string, ref: string, nome: string, b: Buffer) {
    return [{ tipo, referencia: ref, nomeSugerido: nome, conteudo: b }];
  }

  async ultimaAtualizacao() {
    return fs.statSync(this.pasta).mtime.toISOString();
  }

  async despesaOrgaoMes(ano: number, mes: number): Promise<ComBruto<DespesaOrgaoMesC[]>> {
    const { linhas, bruto } = this.ler('despesa_orgao.csv');
    const dados = linhas
      .filter((l) => +l.ano === ano && +l.mes === mes)
      .map((l) => ({
        ano, mes, orgaoCod: l.orgaoCod, orgaoNome: l.orgaoNome,
        dotInicial: BigInt(l.dotInicial), dotAtual: BigInt(l.dotAtual),
        empenhado: BigInt(l.empenhado), liquidado: BigInt(l.liquidado), pago: BigInt(l.pago),
      }));
    return { dados, brutos: this.bruto('despesa_orgao', `${ano}-${mes}`, 'despesa_orgao.csv', bruto) };
  }

  // a fonte por arquivo não tem os relatórios consolidados: a coleta segue sem eles
  async despesaNaturezaMes(): Promise<ComBruto<DespesaNaturezaMesC[]>> {
    return { dados: [], brutos: [] };
  }
  async despesaFuncaoMes(): Promise<ComBruto<DespesaFuncaoMesC[]>> {
    return { dados: [], brutos: [] };
  }

  async receitasMes(ano: number, mes: number): Promise<ComBruto<ReceitaContaMesC[]>> {
    const { linhas, bruto } = this.ler('receitas.csv');
    const dados = linhas
      .filter((l) => +l.ano === ano && +l.mes === mes)
      .map((l) => ({
        ano, mes, contaCod: l.contaCod, contaPai: l.contaPai, nome: l.nome, redutora: l.redutora === 'true',
        previstoInicial: BigInt(l.previstoInicial), previstoAtual: BigInt(l.previstoAtual),
        arrecAnterior: BigInt(l.arrecAnterior), arrecMes: BigInt(l.arrecMes), arrecAteMes: BigInt(l.arrecAteMes),
      }));
    return { dados, brutos: this.bruto('receitas', `${ano}-${mes}`, 'receitas.csv', bruto) };
  }

  async restosAPagar(exercicio: number): Promise<ComBruto<RestoPagarC[]>> {
    const { linhas, bruto } = this.ler('restos_a_pagar.csv');
    const dados = linhas.filter((l) => +l.exercicio === exercicio).map((l) => ({
      idOrigem: +l.idOrigem, numero: l.numero, anoOrigem: +l.anoOrigem, exercicio: +l.exercicio, tipo: l.tipo,
      empenhoIdOrigem: +l.empenhoIdOrigem, empenhoNumero: l.empenhoNumero, orgaoCod: l.orgaoCod, orgaoNome: l.orgaoNome,
      credorDoc: l.credorDoc, credorNome: l.credorNome, inscrito: BigInt(l.inscrito || 0), anulado: BigInt(l.anulado || 0),
      liquidado: BigInt(l.liquidado || 0), pago: BigInt(l.pago || 0),
    }));
    return { dados, brutos: bruto.length ? this.bruto('restos_a_pagar', String(exercicio), 'restos_a_pagar.csv', bruto) : [] };
  }

  async contratos(): Promise<ComBruto<ContratoC[]>> {
    const { linhas, bruto } = this.ler('contratos.csv');
    const dados = linhas.map((l) => ({
      idOrigem: +l.idOrigem, numero: l.numero, ano: +l.ano,
      assinatura: dt(l.assinatura), inicio: dt(l.inicio), fim: dt(l.fim), publicacaoData: dt(l.publicacaoData),
      publicacaoVeiculo: l.publicacaoVeiculo, objeto: l.objeto, tipo: l.tipo, situacao: l.situacao,
      valorInicial: BigInt(l.valorInicial), valorAtual: BigInt(l.valorAtual), processo: l.processo,
      modalidade: l.modalidade, fornecedorDoc: l.fornecedorDoc, fornecedorNome: l.fornecedorNome,
    }));
    return { dados, brutos: this.bruto('contratos', 'todos', 'contratos.csv', bruto) };
  }

  private todosEmpenhos(): EmpenhoC[] {
    const ev = this.ler('eventos.csv').linhas;
    return this.ler('empenhos.csv').linhas.map((l) => {
      const evs = (t: string): EventoC[] =>
        ev.filter((e) => e.empenhoIdOrigem === l.idOrigem && e.tipo === t)
          .map((e) => ({ idOrigem: +e.idOrigem, numero: e.numero, data: dt(e.data)!, valor: BigInt(e.valor) }));
      return {
        idOrigem: +l.idOrigem, numero: l.numero, data: dt(l.data)!, tipo: l.tipo, orgao: l.orgao, unidade: l.unidade,
        credorDoc: l.credorDoc, credorNome: l.credorNome, processo: l.processo, natureza: l.natureza,
        contaDespesa: l.contaDespesa, fonte: l.fonte, funcao: l.funcao, subfuncao: l.subfuncao,
        programa: l.programa, projeto: l.projeto, descricao: l.descricao,
        valor: BigInt(l.valor), anulado: BigInt(l.anulado), aLiquidar: BigInt(l.aLiquidar), aPagar: BigInt(l.aPagar),
        liquidacoes: evs('L'), pagamentos: evs('P'),
      };
    });
  }

  async retencoesDoPagamento(pagamentoIdOrigem: number): Promise<RetencaoC[]> {
    return this.ler('retencoes.csv').linhas
      .filter((l) => +l.pagamentoIdOrigem === pagamentoIdOrigem)
      .map((l, i) => ({ pagamentoIdOrigem, seq: i + 1, descricao: l.descricao, tipo: l.tipo, data: dt(l.data), valor: BigInt(l.valor) }));
  }

  async empenho(idOrigem: number) {
    return this.todosEmpenhos().find((e) => e.idOrigem === idOrigem) ?? null;
  }

  async empenhosDoAno(opts: Parameters<Conector['empenhosDoAno']>[0]) {
    const doAno = this.todosEmpenhos().filter((e) => e.data.getUTCFullYear() === opts.ano);
    for (const e of doAno) await opts.aoReceber(e);
    return { verificados: doAno.length, entregues: doAno.length };
  }

  async folhaMes(anoMes: string): Promise<ComBruto<FolhaMesC>> {
    const { linhas, bruto } = this.ler('folha.csv');
    const doMes = linhas.filter((l) => l.anoMes === anoMes);
    return {
      dados: {
        anoMes,
        linhasInformadasPelaFonte: doMes.length,
        linhas: doMes.map((l) => ({
          anoMes, seq: +l.seq, matricula: l.matricula, nome: l.nome, cargo: l.cargo, ocupacao: l.ocupacao,
          tipoVinculo: l.tipoVinculo, situacaoOriginal: l.situacaoOriginal, lotacao: l.lotacao,
          vencimentos: BigInt(l.vencimentos), bruto: BigInt(l.bruto), previdencia: BigInt(l.previdencia),
          desconto: BigInt(l.desconto), irrf: BigInt(l.irrf), liquido: BigInt(l.liquido),
        })),
      },
      brutos: this.bruto('folha', anoMes, 'folha.csv', bruto),
    };
  }
}
