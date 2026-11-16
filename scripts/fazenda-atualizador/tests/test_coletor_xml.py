"""Conversão dos XML do portal para os formatos que o painel já lê (sem rede, sem navegador)."""
import json
import os
import sys
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import leitores_xml as L  # noqa: E402

try:
    import coletor_xml as X  # noqa: E402  (não precisa do Playwright para importar)
except ImportError as e:  # pragma: no cover
    X = None
    ERRO_IMPORT = e

FIX = os.path.join(BASE, 'tests', 'fixtures')


def txt(nome):
    with open(os.path.join(FIX, nome), encoding='utf-8') as f:
        return f.read()


@unittest.skipIf(X is None, 'coletor_xml não importou')
class ConversaoParaOPainel(unittest.TestCase):
    def setUp(self):
        self.contas = L.ler_receita(txt('receitas_2026-10.xml'), 2026, 10)
        self.linhas = X.receita_para_linhas(self.contas)

    def test_receita_vira_o_formato_do_coletor_antigo(self):
        c = self.linhas['1112500100']  # IPTU principal
        self.assertEqual(set(c), {'desc', 'orc_ini', 'orc_atual', 'per_ant', 'no_per', 'ate_per'})
        self.assertGreater(c['ate_per'], 0)

    def test_ano_fecha_com_os_totalizadores_e_tem_tipos_conhecidos(self):
        dados = {'anos': {}, 'mensal': {}, 'nomes': {}, 'tipos': {}, 'validacao': []}
        ruins = X.montar_ano_receita(2026, self.linhas, {10: self.linhas}, dados)
        self.assertEqual(ruins, [])
        self.assertEqual({v['bloco'] for v in dados['validacao']}, {'correntes', 'capital', 'deducoes'})
        self.assertTrue(all(abs(v['diferenca']) < 0.01 for v in dados['validacao']))
        tipos = set(dados['tipos'].values())
        for esperado in ('Impostos', 'Taxas', 'Transferências Correntes', 'Receita Patrimonial'):
            self.assertIn(esperado, tipos)
        self.assertIn('1112500100', dados['anos']['2026'])      # só contas analíticas
        self.assertNotIn('1112500000', dados['anos']['2026'])   # a conta-mãe do IPTU fica de fora
        self.assertIn('10', dados['mensal']['2026'])

    def test_soma_que_nao_fecha_e_apontada(self):
        linhas = {c: dict(v) for c, v in self.linhas.items()}
        analitica = next(c for c in linhas if c.startswith('1') and c not in ('1000000000',) and linhas[c]['ate_per'] > 0 and not any(o != c and o.startswith(c.rstrip('0')) for o in linhas))
        linhas[analitica]['ate_per'] += 100.0
        dados = {'anos': {}, 'mensal': {}, 'nomes': {}, 'tipos': {}, 'validacao': []}
        self.assertIn('correntes', X.montar_ano_receita(2026, linhas, {}, dados))

    def test_despesa_vira_o_formato_do_painel(self):
        m = X.despesa_para_mes(L.ler_despesa_orgao(txt('despesa_orgao_2026-10.xml'), 2026, 10))
        self.assertEqual(set(m), {'ini', 'atual', 'emp', 'liq', 'pag', 'orgaos'})
        self.assertEqual(len(m['orgaos']), 24)
        self.assertEqual(len(m['orgaos'][0]), 6)  # [nome, ini, atual, emp, liq, pag]
        self.assertAlmostEqual(m['pag'], 158355656.25, places=2)
        self.assertAlmostEqual(m['ini'], sum(o[1] for o in m['orgaos']), places=2)
        json.dumps(m)  # serializa sem erro

    def test_folhas_ignora_contas_com_desdobramento(self):
        self.assertEqual(sorted(X.folhas(['1100000000', '1110000000', '1112500000', '1112500100'])), ['1112500100'])


if __name__ == '__main__':
    unittest.main()
