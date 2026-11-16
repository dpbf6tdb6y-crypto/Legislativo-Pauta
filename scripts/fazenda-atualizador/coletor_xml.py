# -*- coding: utf-8 -*-
"""Coleta de RECEITA e de DESPESA POR ÓRGÃO pelos arquivos XML do Portal da Transparência (Ábaco).

Substitui a leitura do PDF de receita (coletor.py) e do Excel de despesas (coletor_despesas_auto.py), gravando
nos MESMOS arquivos e formatos que o painel já lê (dados_receita.json e dados_despesas.json). Os coletores
antigos continuam no repositório como reserva (o auto_atualizar.sh cai neles se este falhar).

Segurança dos dados (as mesmas regras do compliance.gavix):
- o nome do arquivo no portal é fixo por tipo e dia: o filtro gravado DENTRO do XML é conferido (leitores_xml);
- arquivo vazio é erro; receita só substitui um ano se a soma das contas analíticas fechar com os totalizadores;
- cada XML baixado fica guardado em _cache/xml/ e o SHA-256 vai para o arquivo de dados;
- o arquivo só é baixado na MESMA sessão do navegador (o balanceador do portal só tem o arquivo no servidor
  que o gerou).

Uso:  python coletor_xml.py                      receita + despesas do ano corrente
      python coletor_xml.py receita 2025 2026    só receita, esses anos
      python coletor_xml.py despesas             só despesas do ano corrente
Variáveis: FAZENDA_DADOS (pasta dos arquivos de dados; padrão: esta pasta)
           FAZENDA_CANAL=msedge (Windows, usa o Edge instalado; padrão: chromium sem janela, como na VPS)
           FAZENDA_PORTAL (padrão: https://mgnl.abaco.com.br/transparencia/servlet)
Códigos de saída: 0 ok | 2 nada gravado (dados anteriores mantidos).
"""
import datetime
import json
import os
import sys
import time

import leitores_xml as L

BASE = os.path.dirname(os.path.abspath(__file__))
DADOS = os.environ.get('FAZENDA_DADOS', BASE)   # onde ler/gravar os dados (para testar sem tocar os arquivos do projeto)
CACHE = os.path.join(DADOS, '_cache', 'xml')
PORTAL = os.environ.get('FAZENDA_PORTAL', 'https://mgnl.abaco.com.br/transparencia/servlet')
CANAL = os.environ.get('FAZENDA_CANAL', '')
HOJE = datetime.date.today()
DEST_REC = os.path.join(DADOS, 'dados_receita.json')
DEST_DESP = os.path.join(DADOS, 'dados_despesas.json')
# totalizadores de cada bloco (iguais aos do coletor.py)
BLOCOS = {'1': ('correntes', '1000000000'), '2': ('capital', '2000000000'), '9': ('deducoes', '91000000000')}


def log(m):
    print(m, flush=True)


# ---------------------------------------------------------------- conversão para os formatos que o painel lê
def folhas(cods):
    """Códigos sem nenhum código mais específico abaixo (mesma regra do coletor.py)."""
    cods = list(cods)
    sig = lambda c: len(c.rstrip('0'))  # noqa: E731
    prefixos = {}
    for c in cods:
        prefixos.setdefault(len(c), set()).add((sig(c), c[:sig(c)]))
    out = []
    for c in cods:
        s = sig(c)
        if not any(ss > s and pp[:s] == c[:s] for ss, pp in prefixos[len(c)]):
            out.append(c)
    return out


def tipo_do(cod, linhas):
    """Tipo = espécie (3 dígitos) quando a origem é 11; senão a origem (2 dígitos). Igual ao coletor.py."""
    import re
    if not cod.startswith('1'):
        return ''
    origem = cod[:2].ljust(10, '0')
    especie = cod[:3].ljust(10, '0')
    alvo = especie if cod[:2] == '11' else origem
    d = linhas.get(alvo, {}).get('desc') or linhas.get(origem, {}).get('desc') or ''
    d = re.sub(r'\s*-\s*PRINCIPAL$', '', d, flags=re.I).strip()
    if d.isupper():
        miudas = {'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'por', 'sobre'}
        d = ' '.join(w.capitalize() if (i == 0 or w.lower() not in miudas) else w.lower() for i, w in enumerate(d.split()))
    return d


def receita_para_linhas(contas):
    """Lista do XML -> {cod: {desc, orc_ini, orc_atual, per_ant, no_per, ate_per}} (como o coletor.py devolvia)."""
    return {c['cod']: {'desc': c['nome'], 'orc_ini': c['orc_ini'], 'orc_atual': c['orc_atual'],
                       'per_ant': c['ate_ant'], 'no_per': c['no_per'], 'ate_per': c['ate_per']} for c in contas}


def montar_ano_receita(ano, linhas_ano, linhas_meses, dados):
    """Acrescenta o ano ao dicionário de dados no formato do dados_receita.json. -> lista de blocos com diferença."""
    f = [c for c in folhas(linhas_ano) if c not in [b[1] for b in BLOCOS.values()]]
    reg = {}
    for c in f:
        reg[c] = {'orc_ini': linhas_ano[c]['orc_ini'], 'orc_atual': linhas_ano[c]['orc_atual'],
                  'no_per': linhas_ano[c]['no_per'], 'ate_per': linhas_ano[c]['ate_per']}
        dados['nomes'].setdefault(c, linhas_ano[c]['desc'])
        t = tipo_do(c, linhas_ano)
        if t:
            dados['tipos'].setdefault(c, t)
    ruins = []
    val = []
    for pre, (nome, tot) in BLOCOS.items():
        soma = sum(reg[c]['ate_per'] for c in reg if c.startswith(pre))
        oficial = linhas_ano.get(tot, {}).get('ate_per', 0.0)
        dif = round(soma - oficial, 2)
        val.append({'ano': ano, 'bloco': nome, 'soma_folhas': round(soma, 2), 'totalizador': round(oficial, 2), 'diferenca': dif})
        log('  %d %-10s folhas=%-4d soma=%18s oficial=%18s %s' % (
            ano, nome, len([c for c in reg if c.startswith(pre)]), format(soma, ',.2f'), format(oficial, ',.2f'),
            'OK' if abs(dif) < 0.01 else '*** DIFERE em %.2f ***' % dif))
        if abs(dif) >= 0.01:
            ruins.append(nome)
    dados['anos'][str(ano)] = reg
    dados['validacao'] = [v for v in dados['validacao'] if v['ano'] != ano] + val
    mm = {}
    for mes, Lm in sorted(linhas_meses.items()):
        mm[str(mes)] = {c: Lm[c]['no_per'] for c in Lm if c in reg and abs(Lm[c]['no_per']) > 0.004}
    dados['mensal'][str(ano)] = mm
    return ruins


def despesa_para_mes(itens):
    """Lista do XML -> {ini, atual, emp, liq, pag, orgaos:[[nome, ini, atual, emp, liq, pag]]} (formato do dados_despesas.json)."""
    orgaos = [[d['nome'], d['ini'], d['atual'], d['emp'], d['liq'], d['pag']] for d in itens]
    soma = [round(sum(o[1 + i] for o in orgaos), 2) for i in range(5)]
    return {'ini': soma[0], 'atual': soma[1], 'emp': soma[2], 'liq': soma[3], 'pag': soma[4], 'orgaos': orgaos}


# ---------------------------------------------------------------- navegador (Playwright)
JS_MUDAR = """([suf, valor]) => {
  const s = document.querySelector('select[id$="' + suf + '"]');
  if (!s) return false;
  if (![...s.options].some(o => o.value === valor)) { const o = document.createElement('option'); o.value = valor; o.text = valor; s.add(o); }
  s.value = valor; s.dispatchEvent(new Event('change', {bubbles: true})); return true; }"""
JS_BOTAO = """([re, flags]) => { const r = new RegExp(re, flags);
  const b = [...document.querySelectorAll('input[type=image]')].find(e => r.test(e.title || e.alt || '')); return b ? (b.click(), true) : false; }"""


class Portal:
    def __init__(self, pw):
        if CANAL:   # Windows: Edge instalado (o modo "new" é pedido explicitamente nas versões recentes)
            self.nav = pw.chromium.launch(channel=CANAL, headless=False, args=['--headless=new'])
        else:       # VPS: chromium sem janela
            self.nav = pw.chromium.launch(headless=True, args=['--no-sandbox'])
        self.ctx = self.nav.new_context(accept_downloads=True, locale='pt-BR',
                                        user_agent='painel-fazenda/1.0 (leitura de dados publicos)')
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(120_000)

    def fechar(self):
        try:
            self.nav.close()
        except Exception:  # noqa: BLE001
            pass

    def ir(self, caminho):
        self.page.goto('%s/%s' % (PORTAL, caminho), wait_until='networkidle')

    def mudar(self, sufixo, valor):
        from playwright.sync_api import TimeoutError as PWTimeout
        ok = None
        try:  # nem toda mudança dispara requisição (valor já selecionado): espera curta
            with self.page.expect_response(lambda r: 'gx-no-cache' in r.url, timeout=20_000):
                ok = self.page.evaluate(JS_MUDAR, [sufixo, valor])
        except PWTimeout:
            pass
        if not ok:
            raise RuntimeError('campo %s não encontrado' % sufixo)
        try:
            self.page.wait_for_load_state('networkidle', timeout=15_000)
        except PWTimeout:
            pass
        time.sleep(0.3)

    def buscar(self):
        from playwright.sync_api import TimeoutError as PWTimeout
        try:
            with self.page.expect_response(lambda r: 'gx-no-cache' in r.url, timeout=60_000):
                self.page.evaluate(JS_BOTAO, ['buscar', 'i'])
        except PWTimeout:
            pass
        self.page.wait_for_load_state('networkidle')
        time.sleep(0.3)

    def exportar_xml(self):
        """Aciona o XML e baixa o arquivo na mesma sessão."""
        with self.page.expect_request(lambda r: 'appdownloadarquivo' in r.url, timeout=300_000) as ri:
            self.page.once('download', lambda d: d.cancel())
            if not self.page.evaluate(JS_BOTAO, ['xml', 'i']):
                raise RuntimeError('botão de exportação XML não encontrado')
        url = ri.value.url
        for _ in range(5):
            r = self.ctx.request.get(url)
            corpo = r.body()
            if r.ok and len(corpo) > 100:
                return corpo
            time.sleep(1.5)
        raise RuntimeError('exportação XML veio vazia: %s' % url)

    def baixar(self, pagina, ano, mes, leitor, nome):
        """Baixa e lê um XML; repete se o arquivo vier com o filtro de outro visitante. -> (dados, bytes)."""
        ultimo = None
        for t in range(3):
            try:
                self.ir(pagina)
                self.mudar('vFILTROANO', str(ano))
                self.mudar('vFILTROMES', str(mes))
                self.buscar()
                corpo = self.exportar_xml()
                return leitor(corpo.decode('utf-8'), ano, mes), corpo
            except Exception as e:  # noqa: BLE001 — filtro errado, arquivo vazio ou falha de rede: tenta de novo
                ultimo = e
                log('  %s %d/%02d: tentativa %d falhou (%s)' % (nome, ano, mes, t + 1, str(e).splitlines()[0][:140]))
                time.sleep(5 + 10 * t)
        raise RuntimeError('%s %d/%02d: %s' % (nome, ano, mes, ultimo))


def guardar(corpo, nome):
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, nome), 'wb') as f:
        f.write(corpo)
    return L.sha256(corpo)


def _json(caminho, padrao):
    try:
        with open(caminho, encoding='utf-8') as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return padrao


def _gravar(caminho, dados, **kw):
    tmp = caminho + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, **kw)
    os.replace(tmp, caminho)


# ---------------------------------------------------------------- coletas
def coletar_receita(portal, anos):
    dados = _json(DEST_REC, {})
    for k, v in (('anos', {}), ('mensal', {}), ('nomes', {}), ('tipos', {}), ('validacao', []), ('arquivos', {})):
        dados.setdefault(k, v)
    gravou = False
    for ano in anos:
        ate = 12 if ano < HOJE.year else HOJE.month
        meses = {}
        for mes in range(1, ate + 1):
            contas, corpo = portal.baixar('wmreceitas?1', ano, mes, L.ler_receita, 'receita')
            dados['arquivos']['receitas_%d-%02d' % (ano, mes)] = guardar(corpo, 'receitas_%d-%02d.xml' % (ano, mes))
            meses[mes] = receita_para_linhas(contas)
            if not all(r['confere'] for r in L.conferir_receita(contas)):
                log('  receita %d/%02d: a soma das contas não fecha com os totalizadores — ano descartado' % (ano, mes))
                meses = None
                break
            log('  receita %d/%02d: %d contas' % (ano, mes, len(contas)))
            time.sleep(1)
        if not meses:
            continue
        # o ano é o acumulado até o último mês com dado (o "mês 0" do portal não é necessário)
        ultimo = max(m for m in meses if any(abs(c['ate_per']) > 0 for c in meses[m].values()))
        linhas_ano = {c: dict(v) for c, v in meses[ultimo].items()}
        ruins = montar_ano_receita(ano, linhas_ano, {m: l for m, l in meses.items() if m <= ultimo}, dados)
        if ruins:
            log('  receita %d: blocos com diferença (%s) — conferir' % (ano, ', '.join(ruins)))
        gravou = True
    if gravou:
        dados['coletado_em'] = HOJE.isoformat()
        dados['fonte'] = 'xml'
        dados['validacao'].sort(key=lambda v: (v['ano'], v['bloco']))
        _gravar(DEST_REC, dados, separators=(',', ':'))
        log('gravado: %s' % DEST_REC)
    return gravou


def coletar_despesas(portal, ano):
    dados = _json(DEST_DESP, {'coletado_em': '', 'anos': {}})
    novos, arquivos = {}, {}
    for mes in range(1, HOJE.month + 1 if ano == HOJE.year else 13):
        try:
            itens, corpo = portal.baixar('wmdespesas?0,0', ano, mes, L.ler_despesa_orgao, 'despesa')
        except RuntimeError as e:
            log('  %s — mês ignorado' % e)
            continue
        m = despesa_para_mes(itens)
        arquivos['despesa_orgao_%d-%02d' % (ano, mes)] = guardar(corpo, 'despesa_orgao_%d-%02d.xml' % (ano, mes))
        if abs(m['emp']) + abs(m['liq']) + abs(m['pag']) < 0.005:
            log('  despesa %d/%02d: sem execução ainda, ignorado' % (ano, mes))
            continue
        novos[str(mes)] = m
        log('  despesa %d/%02d: %d órgãos | empenho R$ %s | pago R$ %s' % (ano, mes, len(m['orgaos']), format(m['emp'], ',.2f'), format(m['pag'], ',.2f')))
        time.sleep(1)
    if not novos:
        return False
    dados.setdefault('anos', {}).setdefault(str(ano), {}).update(novos)
    dados['coletado_em'] = HOJE.isoformat()
    dados['fonte'] = 'xml'
    dados.setdefault('arquivos', {}).update(arquivos)
    _gravar(DEST_DESP, dados, indent=2)
    log('gravado: %s' % DEST_DESP)
    return True


def main(argv):
    quais = [a for a in argv if a in ('receita', 'despesas', 'tudo')] or ['tudo']
    # padrão: ano corrente; em janeiro e fevereiro também o anterior (o fechamento do ano ainda pode ser revisado)
    anos = [int(a) for a in argv if a.isdigit()] or ([HOJE.year - 1] if HOJE.month <= 2 else []) + [HOJE.year]
    from playwright.sync_api import sync_playwright
    ok = False
    with sync_playwright() as pw:
        portal = Portal(pw)
        try:
            if 'receita' in quais or 'tudo' in quais:
                log('RECEITA (XML) anos %s' % anos)
                ok = coletar_receita(portal, anos) or ok
            if 'despesas' in quais or 'tudo' in quais:
                for ano in anos:
                    log('DESPESAS por órgão (XML) %d' % ano)
                    ok = coletar_despesas(portal, ano) or ok
        finally:
            portal.fechar()
    if not ok:
        log('Nada gravado — dados anteriores mantidos.')
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
