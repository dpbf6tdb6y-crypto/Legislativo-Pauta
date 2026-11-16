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
