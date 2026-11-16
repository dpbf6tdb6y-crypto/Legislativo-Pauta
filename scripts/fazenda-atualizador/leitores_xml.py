# -*- coding: utf-8 -*-
"""Leitura dos XML exportados pelo Portal da Transparência (Ábaco): despesa por órgão e receita.

O XML vem com os valores já como números ("1576815000.00"), sem "R$" e sem PDF para decifrar. Regras de segurança:
- o nome do arquivo no portal é fixo por tipo e dia (outro visitante pode gerar o mesmo nome com outro filtro):
  por isso o filtro gravado DENTRO do arquivo (<Filtros>) é conferido e, se não bater, o arquivo é descartado;
- arquivo sem registros é erro, não "zero".
"""
import hashlib
import xml.etree.ElementTree as ET
from decimal import Decimal

MESES = ['TODOS', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO',
         'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']


def sha256(conteudo):
    return hashlib.sha256(conteudo if isinstance(conteudo, bytes) else conteudo.encode('utf-8')).hexdigest()


def _local(tag):
    return tag.rsplit('}', 1)[-1]


def _filhos(no):
    return {_local(c.tag): (c.text or '').strip() for c in no}


def _num(s):
    return float(Decimal(s)) if s else 0.0


def _raiz(conteudo, ano, mes, tipo):
    r = ET.fromstring(conteudo)
    f = r.find('Filtros')
    filtros = _filhos(f) if f is not None else {}
    ano_arq, mes_arq = filtros.get('Ano', ''), (filtros.get('Mes') or 'TODOS').upper()
    if ano_arq != str(ano) or mes_arq != MESES[mes]:
        raise ValueError('%s: arquivo veio com filtro %s/%s, pedido %s/%s (descartado)' % (tipo, ano_arq, mes_arq, ano, MESES[mes]))
    return r


def _itens(raiz, nome_item):
    return [_filhos(n) for n in raiz.iter() if _local(n.tag) == nome_item]


def _data_br(iso):
    """'2026-05-26' -> '26/05/2026' (o formato que o painel já usa)."""
    p = (iso or '').split('-')
    return '%s/%s/%s' % (p[2][:2], p[1], p[0]) if len(p) == 3 and len(p[0]) == 4 else ''


def situacao_contrato(ini, fim, hoje):
    """Vigente/encerrado/a iniciar pelas datas (critério estável; o status do portal só serve de conferência)."""
    if ini is None or fim is None:
        return 'sem data'
    if ini > hoje:
        return 'a iniciar'
    if fim < hoje:
        return 'encerrado'
    return 'vigente'


def ler_contratos(conteudo, hoje=None):
    """Contratos: XML da lista inteira (sem filtro). -> lista no formato do painel (num, ini, fim, credor, desc, tipo,
    valor, sit, dias) mais campos que o PDF não trazia (nome completo do credor, CNPJ, modalidade, processo, status do
    portal). Pessoa física (CPF) não leva documento: só CNPJ é guardado."""
    import datetime
    hoje = hoje or datetime.date.today()
    r = ET.fromstring(conteudo)
    itens = _itens(r, 'SDTContrato')
    if not itens:
        raise ValueError('contratos: arquivo sem registros')
    out = []
    for d in itens:
        def dia(s):
            try:
                return datetime.date.fromisoformat((s or '')[:10])
            except ValueError:
                return None
        ini, fim = dia(d.get('ContratoDataIni')), dia(d.get('ContratoDataFim'))
        doc = ''.join(c for c in d.get('ContratoFornecedorDoc', '') if c.isdigit())
        pn, pa = d.get('ContratoProcessoNumero', ''), d.get('ContratoProcessoAno', '')
        num, ano = d.get('ContratoNumero', ''), d.get('ContratoAno', '')
        if not num or not ano:
            raise ValueError('contratos: registro %s sem número/ano' % d.get('ContratoId', '?'))
        out.append({
            'id': int(d.get('ContratoId') or 0),
            'num': '%s/%s' % (num, ano),
            'ini': _data_br(d.get('ContratoDataIni')), 'fim': _data_br(d.get('ContratoDataFim')),
            'credor': d.get('ContratoFornecedorRazao') or d.get('ContratoFornecedorNome', ''),
            'cnpj': doc if len(doc) == 14 else '',
            'desc': d.get('ContratoDsc', ''),
            'tipo': d.get('ContratoTipoNome', ''),
            'valor': _num(d.get('ContratoValorAtual') or d.get('ContratoValor')),
            'valor_inicial': _num(d.get('ContratoValor')),
            'modalidade': d.get('ContratoLicitacaoModalidade', ''),
            'processo': '%s/%s' % (pn, pa) if pn and pn != '0' else '',
            'status_portal': d.get('ContratoStatusDesc', ''),
            'sit': situacao_contrato(ini, fim, hoje),
            'dias': (fim - hoje).days if fim else None,
        })
    return out


def ler_despesa_orgao(conteudo, ano, mes):
    """-> [{cod, nome, ini, atual, emp, liq, pag}] (valores do mês filtrado; mês 0 = ano inteiro)."""
    r = _raiz(conteudo, ano, mes, 'despesa_orgao')
    itens = _itens(r, 'SDTDespesaOrcamento')
    if not itens:
        raise ValueError('despesa_orgao: arquivo sem registros')
    return [{
        'cod': d.get('DespesaOrcOrgaoCodigo', ''), 'nome': d.get('DespesaOrcOrgaoNome', ''),
        'ini': _num(d.get('DespesaOrcValorInicial')), 'atual': _num(d.get('DespesaOrcValorValorAtual')),
        'emp': _num(d.get('DespesaOrcValorEmpenhadoTot')), 'liq': _num(d.get('DespesaOrcValorLiquidadoTot')),
        'pag': _num(d.get('DespesaOrcValorPagoTot')),
    } for d in itens]


def ler_receita(conteudo, ano, mes):
    """-> [{cod, pai, nome, redutora, orc_ini, orc_atual, ate_ant, no_per, ate_per}] (acumulado até o mês)."""
    r = _raiz(conteudo, ano, mes, 'receitas')
    itens = _itens(r, 'SDTReceitaOrcamento')
    if not itens:
        raise ValueError('receitas: arquivo sem registros')
    return [{
        'cod': d.get('ReceitaOrcContaCod', ''), 'pai': d.get('ReceitaOrcContaCodPai', ''), 'nome': d.get('ReceitaOrcContaNome', ''),
        'redutora': d.get('ReceitaOrcContaRedutora') == 'true',
        'orc_ini': _num(d.get('ReceitaOrcValorInicial')), 'orc_atual': _num(d.get('ValorValorAtual')),
        'ate_ant': _num(d.get('ArrecadadoAnt')), 'no_per': _num(d.get('ArrecadadoMes')), 'ate_per': _num(d.get('ArrecadadoAteMes')),
    } for d in itens]


def conferir_receita(contas, tolerancia=0.01):
    """Soma das contas analíticas (sem filhas) de cada raiz contra o total publicado da raiz.
    -> [{raiz, soma_folhas, totalizador, diferenca, confere}] (a soma deve fechar com o total publicado)."""
    pais = {c['pai'] for c in contas}
    cods = {c['cod'] for c in contas}
    raizes = [c for c in contas if not c['pai'] or c['pai'] not in cods]
    out = []
    for raiz in raizes:
        folhas = [c for c in contas if c['cod'] not in pais and c['cod'][0] == raiz['cod'][0]]
        soma = round(sum(c['ate_per'] for c in folhas), 2)
        dif = round(soma - raiz['ate_per'], 2)
        out.append({'raiz': raiz['cod'], 'soma_folhas': soma, 'totalizador': raiz['ate_per'], 'diferenca': dif, 'confere': abs(dif) <= tolerancia})
    return out
