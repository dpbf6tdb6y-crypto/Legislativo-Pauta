# -*- coding: utf-8 -*-
"""Coleta do SICONFI (Tesouro Nacional): RGF (limite de pessoal e dívida) e RREO Anexo 14 (mínimos de educação,
FUNDEB e saúde, metas fiscais da LDO, resultado orçamentário e restos a pagar).

API pública e igual para qualquer município; os números vêm prontos da contabilidade. Só leitura.
Grava dados_siconfi.json. Se a coleta falhar, o arquivo anterior é mantido (código de saída 2).

Uso:  python coletor_siconfi.py                 (município de FAZENDA_IBGE, ano corrente)
      python coletor_siconfi.py 2025            (outro ano)
Variável: FAZENDA_IBGE (padrão 3144805 = Nova Lima/MG)
"""
import datetime
import json
import os
import sys
import time

import requests

import calculos
from leitores_xml import sha256

BASE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(BASE, 'dados_siconfi.json')
API = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt'
IBGE = int(os.environ.get('FAZENDA_IBGE', '3144805'))


def log(m):
    print(m, flush=True)


def obter(url, tentativas=3):
    """Baixa o JSON; recusa resposta paginada (não grava metade de um relatório)."""
    ultimo = None
    for t in range(tentativas):
        try:
            r = requests.get(url, headers={'User-Agent': 'painel-fazenda/1.0 (leitura de dados publicos)'}, timeout=120)
            r.raise_for_status()
            j = r.json()
            if j.get('hasMore'):
                raise RuntimeError('resposta paginada não esperada')
            return j.get('items', []), sha256(r.content)
        except Exception as e:  # noqa: BLE001 — qualquer falha de rede ou formato tenta de novo
            ultimo = e
            time.sleep(3 + 4 * t)
    raise RuntimeError('SICONFI: %s (%s)' % (ultimo, url))


def coletar(ano):
    novo = {'rgf': {}, 'rreo': {}, 'hashes': {}}
    pop = None
    for q in (1, 2, 3):
        itens, h = obter('%s/rgf?an_exercicio=%d&in_periodicidade=Q&nr_periodo=%d&co_tipo_demonstrativo=RGF&co_poder=E&id_ente=%d' % (API, ano, q, IBGE))
        r = calculos.extrair_rgf(itens)
        if r:
            novo['rgf']['%d-%d' % (ano, q)] = r
            novo['hashes']['rgf %d-Q%d' % (ano, q)] = h
            pop = pop or calculos.populacao(itens)
    for b in range(1, 7):
        itens, h = obter('%s/rreo?an_exercicio=%d&nr_periodo=%d&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%%2014&id_ente=%d' % (API, ano, b, IBGE))
        r = calculos.extrair_rreo(itens)
        if r:
            # caixa (Anexo 06) e restos a pagar (Anexo 07): se falharem, o bimestre fica sem eles (o painel avisa)
            for chave, anexo, extrair in (('caixa', '06', calculos.extrair_caixa), ('rp', '07', calculos.extrair_restos)):
                try:
                    its, hx = obter('%s/rreo?an_exercicio=%d&nr_periodo=%d&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%%20%s&id_ente=%d' % (API, ano, b, anexo, IBGE))
                    ex = extrair(its)
                    if ex:
                        r[chave] = ex
                        novo['hashes']['rreo %d-B%d anexo %s' % (ano, b, anexo)] = hx
                    else:
                        log('  RREO %d-B%d Anexo %s: não conferiu ou veio vazio — sem %s neste bimestre' % (ano, b, anexo, chave))
                except Exception as e:  # noqa: BLE001
                    log('  RREO %d-B%d Anexo %s: %s — sem %s neste bimestre' % (ano, b, anexo, e, chave))
            if r.get('caixa') and r.get('saldo_exercicios_anteriores') is not None:
                # superávit financeiro de anos anteriores já usado (Anexo 14, saldo de exercícios anteriores)
                r['caixa']['superavit_utilizado'] = r['saldo_exercicios_anteriores']
            novo['rreo']['%d-%d' % (ano, b)] = r
            novo['hashes']['rreo %d-B%d' % (ano, b)] = h
            pop = pop or calculos.populacao(itens)
    novo['populacao'] = pop
    return novo


def main():
    ano = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today().year
    antigo = {}
    try:
        antigo = json.load(open(DEST, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        pass
    try:
        novo = coletar(ano)
    except Exception as e:  # noqa: BLE001
        log('FALHA na coleta do SICONFI: %s — mantendo o arquivo anterior' % e)
        return 2
    if not novo['rgf'] and not novo['rreo']:
        log('SICONFI sem dados de %d — mantendo o arquivo anterior' % ano)
        return 2
    # junta com o que já havia de outros anos; os períodos do ano coletado são substituídos
    for tipo in ('rgf', 'rreo'):
        mantidos = {k: v for k, v in (antigo.get(tipo) or {}).items() if not k.startswith('%d-' % ano)}
        mantidos.update(novo[tipo])
        novo[tipo] = dict(sorted(mantidos.items()))
    novo['populacao'] = novo['populacao'] or antigo.get('populacao')
    novo['ibge'] = IBGE
    novo['coletado_em'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    tmp = DEST + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(novo, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DEST)
    log('SICONFI %d: RGF %s | RREO %s | população %s' % (ano, sorted(k for k in novo['rgf'] if k.startswith(str(ano))),
                                                       sorted(k for k in novo['rreo'] if k.startswith(str(ano))), novo['populacao']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
