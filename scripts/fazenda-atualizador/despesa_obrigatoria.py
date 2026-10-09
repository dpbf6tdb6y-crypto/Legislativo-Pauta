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


# (trecho do nome, tipo, grupo, base legal, entra_no_limite_de_pessoal)
# O último campo é a regra da LRF para a "despesa total com pessoal" (art. 18 e 19):
#   entram: vencimentos, encargos, inativos e pensionistas, contratação temporária e a
#           terceirização de mão de obra que substitui servidores (art. 18, §1º);
#   não entram (art. 19, §1º): indenização por demissão, sentenças de períodos anteriores
#           e despesas de exercícios anteriores.
REGRAS = [
    ('INDENIZACOES E RESTITUICOES TRABALHISTAS', OBRIG, 'Pessoal e encargos', 'CF art. 169 · fora do limite: LRF art. 19, §1º, I', False),
    ('VENCIMENTOS E VANTAGENS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19', True),
    ('OBRIGACOES PATRONAIS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19', True),
    ('APOSENTADORIAS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 18 (inativos)', True),
    ('PENSOES', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 18 (pensionistas)', True),
    ('CONTRATACAO POR TEMPO DETERMINADO', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19', True),
    ('OUTRAS DESPESAS VARIAVEIS', OBRIG, 'Pessoal e encargos', 'CF art. 169 / LRF art. 19', True),
    ('DESPESAS DE PESSOAL DECORRENTES DE CONTRATOS DE TERCEIRIZACAO', OBRIG, 'Pessoal e encargos', 'LRF art. 18, §1º (terceirização)', True),
    ('SENTENCAS JUDICIAIS', OBRIG, 'Dívida e sentenças', 'CF art. 100', False),
    ('JUROS SOBRE A DIVIDA', OBRIG, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)', False),
    ('ENCARGOS SOBRE A DIVIDA', OBRIG, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)', False),
    ('PRINCIPAL DA DIVIDA', OBRIG, 'Dívida e sentenças', 'Contrato da dívida (LRF art. 29)', False),
    ('DESPESAS DE EXERCICIOS ANTERIORES', OBRIG, 'Outras obrigações', 'Lei 4.320/1964 art. 37', False),
    ('RATEIO PELA PARTICIPACAO EM CONSORCIO', OBRIG, 'Outras obrigações', 'Lei 11.107/2005', False),
    ('OBRAS E INSTALACOES', DISCR, 'Investimentos', '', False),
    ('EQUIPAMENTOS E MATERIAL PERMANENTE', DISCR, 'Investimentos', '', False),
    ('AQUISICAO DE IMOVEIS', DISCR, 'Investimentos', '', False),
    ('MATERIAL DE CONSUMO', DISCR, 'Custeio', '', False),
    ('PASSAGENS E DESPESAS COM LOCOMOCAO', DISCR, 'Custeio', '', False),
    ('DIARIAS', DISCR, 'Custeio', '', False),
    ('PREMIACOES', DISCR, 'Custeio', '', False),
    ('SERVICOS DE CONSULTORIA', DISCR, 'Custeio', '', False),
]


def classifica(nome):
    """Devolve (tipo, grupo, base legal, entra_no_limite_de_pessoal); tipo None = a classificar."""
    n = _norm(nome)
    for trecho, tipo, grupo, lei, dtp in REGRAS:
        if trecho in n:
            return tipo, grupo, lei, dtp
    return None, '', '', False
