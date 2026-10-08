# -*- coding: utf-8 -*-
"""Despesa obrigatória x discricionária, por NATUREZA — só pelas regras
combinadas com o usuário; o que nenhuma regra cobre fica "a classificar"
(nada é chutado).

Obrigatórias
  Pessoal e encargos ... vencimentos, obrigações patronais, aposentadorias e
                         pensões do RPPS, contratação por tempo determinado,
                         indenizações trabalhistas (CF art. 169 / LRF art. 19)
  Dívida e sentenças ... sentenças judiciais (CF art. 100), juros, encargos e
                         principal da dívida contratual (contrato / LRF art. 29)
  Outras obrigações .... despesas de exercícios anteriores (Lei 4.320/1964,
                         art. 37) e rateio de consórcio público (Lei 11.107/2005)
Discricionárias
  Investimentos (obras, equipamentos, imóveis), material de consumo, passagens,
  diárias, premiações e consultoria.

Mesmo nome de natureza pode aparecer em mais de uma categoria econômica; a
regra olha só o nome (sem acento, maiúsculas).
"""
import unicodedata

OBRIG, DISCR = 'Obrigatória', 'Discricionária'


def _norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).upper()


# (trecho do nome, tipo, grupo, base legal) — a primeira regra que casar vale.
REGRAS = [
    ('INDENIZACOES E RESTITUICOES TRABALHISTAS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('VENCIMENTOS E VANTAGENS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('OBRIGACOES PATRONAIS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('APOSENTADORIAS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('PENSOES', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('CONTRATACAO POR TEMPO DETERMINADO', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('OUTRAS DESPESAS VARIAVEIS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19'),
    ('SENTENCAS JUDICIAIS', OBRIG, 'Dívida e sentenças', 'CF art. 100'),
    ('JUROS SOBRE A DIVIDA', OBRIG, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)'),
    ('ENCARGOS SOBRE A DIVIDA', OBRIG, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)'),
    ('PRINCIPAL DA DIVIDA', OBRIG, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)'),
    ('DESPESAS DE EXERCICIOS ANTERIORES', OBRIG, 'Outras obrigações', 'Lei 4.320/1964 art. 37'),
    ('RATEIO PELA PARTICIPACAO EM CONSORCIO', OBRIG, 'Outras obrigações', 'Lei 11.107/2005'),
    ('OBRAS E INSTALACOES', DISCR, 'Investimentos', ''),
    ('EQUIPAMENTOS E MATERIAL PERMANENTE', DISCR, 'Investimentos', ''),
    ('AQUISICAO DE IMOVEIS', DISCR, 'Investimentos', ''),
    ('MATERIAL DE CONSUMO', DISCR, 'Custeio', ''),
    ('PASSAGENS E DESPESAS COM LOCOMOCAO', DISCR, 'Custeio', ''),
    ('DIARIAS', DISCR, 'Custeio', ''),
    ('PREMIACOES', DISCR, 'Custeio', ''),
    ('SERVICOS DE CONSULTORIA', DISCR, 'Custeio', ''),
]


def classifica(nome):
    """Devolve (tipo, grupo, base legal); tipo None = a classificar."""
    n = _norm(nome)
    for trecho, tipo, grupo, lei in REGRAS:
        if trecho in n:
            return tipo, grupo, lei
    return None, '', ''
