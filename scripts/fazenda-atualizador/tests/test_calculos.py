import json
import os
import sys
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import calculos as C  # noqa: E402
import leitores_xml as L  # noqa: E402

FIX = os.path.join(BASE, 'tests', 'fixtures')


def json_fix(nome):
    with open(os.path.join(FIX, nome), encoding='utf-8') as f:
        return json.load(f)['items']


def txt_fix(nome):
    with open(os.path.join(FIX, nome), encoding='utf-8') as f:
        return f.read()


class PessoalLRF(unittest.TestCase):
    def test_limites_do_executivo_nao_sao_os_do_municipio(self):
        self.assertEqual(C.LIMITES_PESSOAL['executivo'], {'alerta': 48.6, 'prudencial': 51.3, 'maximo': 54.0})
        self.assertEqual(C.LIMITES_PESSOAL['municipio']['maximo'], 60.0)

    def test_faixas(self):
        self.assertEqual([C.nivel_pessoal(p) for p in (31.91, 48.59, 48.6, 51.3, 54)],
                         ['abaixo', 'abaixo', 'alerta', 'prudencial', 'maximo'])

    def test_margens_com_numeros_do_rgf_de_nova_lima(self):
        m = C.margens_pessoal(498019293.83, 1560794069.71)
        self.assertAlmostEqual(m['alerta'], 260526624.04, delta=0.02)
        self.assertAlmostEqual(m['maximo'], 344809503.81, delta=0.02)
        self.assertLess(C.margens_pessoal(600, 1000)['alerta'], 0)  # passou do alerta


class Camara29A(unittest.TestCase):
    def test_faixas_populacionais(self):
        casos = {50_000: 7.0, 100_000: 7.0, 100_001: 6.0, 120_959: 6.0, 300_000: 6.0, 300_001: 5.0,
                 500_001: 4.5, 3_000_001: 4.0, 8_000_001: 3.5}
        for pop, pct in casos.items():
            self.assertEqual(C.percentual_29a(pop), pct, pop)

    def test_teto_usa_a_base_informada_e_a_populacao(self):
        self.assertEqual(C.teto_camara(1_000_000_000, 120_959), 60_000_000.0)
        self.assertEqual(C.teto_camara(1_000_000_000, 90_000), 70_000_000.0)


class MinimosEDivida(unittest.TestCase):
    def test_minimo_e_anual(self):
        self.assertEqual((C.nivel_minimo(24, 25, 4), C.nivel_minimo(24, 25, 6), C.nivel_minimo(25, 25, 6)),
                         ('observacao', 'atencao', 'ok'))

    def test_divida(self):
        self.assertEqual([C.nivel_divida(p) for p in (-18.09, 107.99, 108, 120)], ['ok', 'ok', 'observacao', 'atencao'])


class Siconfi(unittest.TestCase):
    def test_rgf_de_nova_lima_2_quadrimestre_2026(self):
        r = C.extrair_rgf(json_fix('rgf_3144805_2026_q2.json'))
        self.assertEqual((r['dtp_pct'], r['rcl_ajustada'], r['limite_alerta_pct']), (31.91, 1560794069.71, 48.6))
        self.assertEqual((r['dcl'], r['dcl_pct'], r['dcl_limite_pct']), (-283875372.23, -18.09, 120))
        self.assertEqual(C.populacao(json_fix('rgf_3144805_2026_q2.json')), 120959)

    def test_rreo_anexo14_4_bimestre_2026(self):
        r = C.extrair_rreo(json_fix('rreo_3144805_2026_b4_anexo14.json'))
        self.assertEqual((r['mde_pct'], r['mde_minimo_pct'], r['fundeb_pct'], r['asps_pct']), (26.42, 25, 95.25, 22.04))
        self.assertEqual((r['primario_meta'], r['primario_apurado'], r['nominal_meta']), (370000, -218040078.36, -15218775))
        self.assertEqual(r['resultado_orcamentario'], -124522180.89)  # déficit vira negativo
        self.assertEqual((r['rp_proc_saldo'], r['rp_nproc_saldo']), (2920096.28, 9427615.94))

    def test_relatorio_vazio_nao_inventa_numero(self):
        self.assertEqual((C.extrair_rgf([]), C.extrair_rreo([])), ({}, {}))


class LeitoresXml(unittest.TestCase):
    def test_despesa_por_orgao_fecha_com_o_total_do_portal(self):
        d = L.ler_despesa_orgao(txt_fix('despesa_orgao_2026-10.xml'), 2026, 10)
        self.assertEqual(len(d), 24)
        self.assertAlmostEqual(sum(x['ini'] for x in d), 1576815000.00, places=2)
        self.assertAlmostEqual(sum(x['pag'] for x in d), 158355656.25, places=2)  # conferido com a tela na Fase 0

    def test_filtro_diferente_e_descartado(self):
        with self.assertRaisesRegex(ValueError, 'descartado'):
            L.ler_despesa_orgao(txt_fix('despesa_orgao_2026-10.xml'), 2026, 9)
        with self.assertRaisesRegex(ValueError, 'descartado'):
            L.ler_receita(txt_fix('receitas_2026-10.xml'), 2025, 10)

    def test_arquivo_sem_registros_e_erro(self):
        vazio = '<Export><Filtros><Ano>2026</Ano><Mes>OUTUBRO</Mes></Filtros><SDTReceitaOrcamentoCollection/></Export>'
        with self.assertRaisesRegex(ValueError, 'sem registros'):
            L.ler_receita(vazio, 2026, 10)

    def test_receita_275_contas_e_soma_das_folhas_fecha_com_o_total(self):
        c = L.ler_receita(txt_fix('receitas_2026-10.xml'), 2026, 10)
        self.assertEqual(len(c), 275)
        for r in L.conferir_receita(c):
            self.assertTrue(r['confere'], r)

    def test_hash_do_arquivo_e_estavel(self):
        self.assertEqual(L.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')


if __name__ == '__main__':
    unittest.main()
