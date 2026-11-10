# -*- coding: utf-8 -*-
"""Leitura da tela COMPLETA de Servidores do Portal da Transparência.

A exportação em Excel/XML do portal traz uma linha por servidor, mas a tela de consulta
lista também outros lançamentos do mês (sem vencimento e sem desconto, bruto = líquido),
que a exportação não inclui. Para a folha bater com a tela, o coletor lê a tela inteira
e confere o resultado antes de aceitar (ver `valida`).

Este módulo tem duas partes:
  - funções puras (números, validação, resumo, CSV) — testáveis sem navegador;
  - `le_grade(page)` — usa o Playwright já aberto na tela de Servidores.

O CSV completo (com nomes) fica só no disco do servidor (RHX_*.csv, fora do git).
"""
import csv, math

PAGINA_GRANDE = 500   # o seletor do portal só oferece até 30, mas o servidor aceita valores maiores
COLUNAS = ['ref', 'matricula', 'nome', 'cargo', 'ocupacao', 'tipo', 'situacao', 'lotacao',
           'venc', 'bruto', 'previdencia', 'saude', 'irrf', 'liquido', 'id']

# Linhas da grade: <tr> com 18+ células diretas cuja 4ª é "AAAA/M" (ref). Devolve as células 3..17 como texto.
JS_LER = """() => {
  const out = [];
  document.querySelectorAll('table tr').forEach(tr => {
    const td = tr.querySelectorAll(':scope > td');
    if (td.length < 18) return;
    const c = Array.from(td, x => x.innerText.trim());
    if (!/^\\d{4}\\/\\d{1,2}$/.test(c[3])) return;
    out.push(c.slice(3, 18));
  });
  return out;
}"""

JS_CONTA = """(esperado) => {
  let n = 0;
  document.querySelectorAll('table tr').forEach(tr => {
    const td = tr.querySelectorAll(':scope > td');
    if (td.length >= 18 && /^\\d{4}\\/\\d{1,2}$/.test(td[3].innerText.trim())) n++;
  });
  return n === esperado;
}"""

# id da primeira linha exibida: muda quando a página nova chegou (o nº da página muda ANTES do conteúdo)
JS_PRIMEIRO_ID = """() => {
  for (const tr of document.querySelectorAll('table tr')) {
    const td = tr.querySelectorAll(':scope > td');
    if (td.length >= 18 && /^\\d{4}\\/\\d{1,2}$/.test(td[3].innerText.trim())) return td[17].innerText.trim();
  }
  return null;
}"""
JS_MUDOU = "ant => { const f = (" + JS_PRIMEIRO_ID + "); const p = f(); return p !== null && p !== ant; }"

JS_TROCA = """(n) => {
  const sel = document.querySelector('#W0044vNREGISTROSPORPAGINA');
  let o = Array.from(sel.options).find(x => x.value === String(n));
  if (!o) { o = document.createElement('option'); o.value = String(n); o.text = String(n); sel.appendChild(o); }
  sel.value = String(n);
  sel.dispatchEvent(new Event('change', {bubbles: true}));
}"""


def num_br(s):
    """'R$ 1.234,56' -> 1234.56 (vazio ou inválido vira 0)."""
    t = str(s).replace('R$', '').replace('\xa0', '').replace(' ', '').strip()
    if not t:
        return 0.0
    try:
        return float(t.replace('.', '').replace(',', '.'))
    except ValueError:
        return 0.0


def para_linhas(brutas):
    """Linhas lidas da tela (listas de 15 textos) -> lista de dicts."""
    out = []
    for c in brutas:
        d = dict(zip(COLUNAS, c))
        for k in ('venc', 'bruto', 'previdencia', 'saude', 'irrf', 'liquido'):
            d[k] = num_br(d[k])
        out.append(d)
    return out


def _ref(s):
    a, m = str(s).split('/')[:2]
    return int(a), int(m)


def valida(linhas, n_reg, ano, mes, excel=None, tol=0.05):
    """Confere se a leitura da tela é íntegra. Devolve a lista de problemas (vazia = ok).

    n_reg  total de registros informado pelo próprio portal
    excel  (servidores, vencimentos, bruto) lidos da exportação do mesmo mês, se houver
    """
    erros = []
    if len(linhas) != n_reg:
        erros.append('li %d linhas, mas o portal informa %d registros' % (len(linhas), n_reg))
    if len({l['id'] for l in linhas}) != len(linhas):
        erros.append('há linhas repetidas (mesmo id) — a paginação se perdeu')
    try:
        refs = {_ref(l['ref']) for l in linhas}
    except ValueError:
        refs = {None}
    if refs != {(ano, mes)}:
        erros.append('referências fora do mês pedido: %s' % sorted(map(str, refs)))
    if excel:
        n_x, venc_x, bruto_x = excel
        princ = [l for l in linhas if l['venc'] != 0]
        if len(princ) != n_x:
            erros.append('linhas com vencimento (%d) diferem da exportação (%d)' % (len(princ), n_x))
        if abs(sum(l['venc'] for l in linhas) - venc_x) > tol:
            erros.append('vencimentos da tela diferem da exportação')
        if abs(sum(l['bruto'] for l in princ) - bruto_x) > tol:
            erros.append('bruto das linhas com vencimento difere da exportação')
    return erros


def resume(linhas):
    """Totais do mês a partir da tela completa."""
    com_venc = {l['matricula'] for l in linhas if l['venc'] != 0}
    extras = [l for l in linhas if l['venc'] == 0]
    venc = sum(l['venc'] for l in linhas)
    return {
        'registros': len(linhas),
        'servidores': len({l['matricula'] for l in linhas}),      # matrículas distintas na folha
        'servidores_venc': len(com_venc),                          # matrículas com vencimento (as da exportação)
        'vencimentos': round(venc, 2),
        'bruto': round(sum(l['bruto'] for l in linhas), 2),
        'liquido': round(sum(l['liquido'] for l in linhas), 2),
        'lancamentos_extras': len(extras),                         # linhas sem vencimento
        'bruto_extras': round(sum(l['bruto'] for l in extras), 2),
        'media': round(venc / len(com_venc), 2) if com_venc else 0.0,
    }


def grava_csv(linhas, caminho):
    with open(caminho, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(COLUNAS)
        for l in linhas:
            w.writerow([l[c] for c in COLUNAS])


def rh_completo(caminho):
    """Lê o RHX_*.csv e devolve (DataFrame, info) no formato que o gerar_painel já usa:
    uma linha por MATRÍCULA (soma dos lançamentos) com as colunas da exportação em Excel.

    Cargo, tipo, situação e lotação vêm do lançamento de maior vencimento (o do salário);
    vencimentos, bruto e líquido são a soma de todos os lançamentos da matrícula.
    """
    import pandas as pd
    d = pd.read_csv(caminho, sep=';', encoding='utf-8-sig', dtype=str, keep_default_na=False)
    for c in ('venc', 'bruto', 'liquido'):
        d[c] = pd.to_numeric(d[c], errors='coerce').fillna(0.0)
    ordem = d.sort_values(['matricula', 'venc'], ascending=[True, False], kind='stable')
    base = ordem.groupby('matricula', sort=False).first()
    soma = d.groupby('matricula', sort=False)[['venc', 'bruto', 'liquido']].sum()
    out = pd.DataFrame({
        'Ano/Mês': base['ref'], 'Matrícula': base.index, 'Nome': base['nome'], 'Cargo': base['cargo'],
        'Tipo': base['tipo'], 'Situação': base['situacao'], 'Lotação': base['lotacao'],
        'Vencimentos': soma['venc'], 'Bruto': soma['bruto'], 'Líquido': soma['liquido'],
    }).reset_index(drop=True)
    extras = d[d['venc'] == 0]
    info = {
        'registros': int(len(d)), 'matriculas': int(len(out)),
        'com_venc': int((soma['venc'] != 0).sum()),
        'extras': int(len(extras)), 'bruto_extras': round(float(extras['bruto'].sum()), 2),
    }
    return out, info


def _le_pagina(page, esperado, tentativas=6):
    """Lê a página atual; se a quantidade de linhas não for a esperada (a tela ainda está atualizando), espera e relê."""
    n = -1
    for _ in range(tentativas):
        brutas = page.evaluate(JS_LER)
        n = len(brutas)
        if n == esperado:
            return brutas
        page.wait_for_timeout(2000)
    raise RuntimeError('a página trouxe %d linhas, esperava %d' % (n, esperado))


def le_grade(page, n_reg, log=print):
    """Lê todas as linhas da tela já filtrada (mês escolhido e Buscar clicado). Devolve lista de dicts.

    O número da página (#W0044vNPAGINAATUAL) muda ANTES de o conteúdo novo chegar; por isso, depois de cada
    clique em "Próximo" espera a primeira linha mudar e a quantidade de linhas bater exatamente com a esperada.
    """
    paginas = max(1, math.ceil(n_reg / PAGINA_GRANDE))
    atuais = int(page.eval_on_selector('#W0044vNPAGINAS', 'e => e.value') or 0)
    ja_grande = page.eval_on_selector('#W0044vNREGISTROSPORPAGINA', 'e => e.value') == str(PAGINA_GRANDE)
    if not ja_grande:       # o seletor lembra o tamanho da página entre um mês e outro
        page.evaluate(JS_TROCA, PAGINA_GRANDE)
    if atuais != paginas:
        page.wait_for_function('n => document.querySelector("#W0044vNPAGINAS").value === String(n)',
                               arg=paginas, timeout=300000)
    page.wait_for_function(JS_CONTA, arg=min(PAGINA_GRANDE, n_reg), timeout=300000)
    page.wait_for_timeout(1500)
    brutas = []
    for p in range(1, paginas + 1):
        brutas.extend(_le_pagina(page, min(PAGINA_GRANDE, n_reg - (p - 1) * PAGINA_GRANDE)))
        if p % 5 == 0 or p == paginas:
            log('    tela completa: página %d de %d (%d linhas)' % (p, paginas, len(brutas)))
        if p == paginas:
            break
        ant = page.evaluate(JS_PRIMEIRO_ID)
        page.click('input[type=image][alt="Próximo"]')
        page.wait_for_function(JS_MUDOU, arg=ant, timeout=300000)
        page.wait_for_function(JS_CONTA, arg=min(PAGINA_GRANDE, n_reg - p * PAGINA_GRANDE), timeout=300000)
        page.wait_for_timeout(500)
    return para_linhas(brutas)
