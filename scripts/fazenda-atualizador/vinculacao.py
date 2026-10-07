# -*- coding: utf-8 -*-
"""Vinculação legal das receitas — SÓ pelas regras definidas pelo usuário.

Sem rateio, sem estimativa e sem interpretação técnica: cada linha de receita
cai em 100% (vinculada por lei), 0% (sem vinculação legal) ou None (nenhuma
das regras abaixo cobre a linha — fica "a classificar" na tela até alguém
definir a regra; nada é chutado).

100% (vinculadas por lei)
  FUNDEB ........................ Lei 14.113/2020
  Transferências do SUS/Bloco ... LC 141/2012
  CFEM (royalties da mineração) . Lei 7.990/1989
  Taxas municipais .............. CF (vinculadas ao serviço)
  Contribuição de melhoria ...... Decreto-Lei 195/1967
  Multas de trânsito ............ CTB art. 320
  Convênios c/ finalidade espec.  regras do convênio
0% (sem vinculação legal)
  Todos os impostos (ISS, IPTU, ITBI, IRRF...) e as cotas-partes de impostos
  (ICMS, IPVA, IPI, ITR), FPM, receitas financeiras (remuneração de
  depósitos) e as restituições.

A Constituição exige 25% em educação e 15% em saúde, mas isso é vinculação
da DESPESA, não da receita — por isso não existe vinculação por fonte (ex.:
ICMS 40%).

Os nomes vindos do PDF do Portal chegam truncados (~70 caracteres), então a
detecção usa o código da receita (padrão STN) além do nome.
"""
import re
import unicodedata

LEI_FUNDEB = 'Lei 14.113/2020'
LEI_SAUDE = 'LC 141/2012'
LEI_CFEM = 'Lei 7.990/1989'
LEI_TAXAS = 'CF (vinculada ao serviço)'
LEI_MELHORIA = 'Decreto-Lei 195/1967'
LEI_TRANSITO = 'CTB art. 320'
LEI_CONVENIO = 'Regras do convênio'


def _norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).upper()


def classifica(cod, tipo, nome):
    """Devolve (pct, lei): pct = 100, 0 ou None (sem regra); lei = '' quando não há."""
    n = _norm(nome)
    cod = str(cod)

    # ---- 100% vinculadas ----
    if ('FUNDEB' in n or 'FUNDO DE MANUTENCAO E DESENVOLVI' in n
            or cod.startswith('17155') or cod.startswith('17515') or cod.startswith('17580')):
        return 100, LEI_FUNDEB
    if (cod.startswith('17135') or cod.startswith('1723') or cod in ('2411514100', '2421500100')
            or re.search(r'(^|[^A-Z])SUS([^A-Z]|$)', n)
            or 'SISTEMA UNICO DE SAUDE' in n
            or ('BLOCO' in n and 'SAUDE' in n)):
        return 100, LEI_SAUDE
    if (cod == '1712510100' or 'EXPLORACAO DE RECURSOS MINER' in n
            or ('COMPENSACAO FINANCEIRA' in n and 'RECURSOS MINERAIS' in n)):
        return 100, LEI_CFEM
    if tipo == 'Taxas':
        return 100, LEI_TAXAS
    if 'CONTRIBUICAO DE MELHORIA' in n:
        return 100, LEI_MELHORIA
    if 'MULTA' in n and 'TRANSITO' in n:
        return 100, LEI_TRANSITO
    if 'CONVENIO' in n:
        return 100, LEI_CONVENIO

    # ---- 0% (sem vinculação legal) ----
    if tipo == 'Impostos':
        return 0, ''
    if (('FUNDO DE PARTICIPACAO' in n and 'MUNIC' in n) or 'COTA-PARTE DO ICMS' in n or 'COTA-PARTE DO IPVA' in n
            or 'COTA-PARTE DO IPI' in n or 'PROPRIEDADE TERRITORIAL RURAL' in n):
        return 0, ''
    if 'REMUNERACAO DE DEPOSITOS' in n:
        return 0, ''
    if 'RESTITUICOES' in n:
        return 0, ''

    return None, ''
