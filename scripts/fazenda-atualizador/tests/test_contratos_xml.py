"""Contratos pelo XML do portal: leitura, privacidade (sem CPF) e recusa de lista vazia ou parcial."""
import datetime
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import leitores_xml as L  # noqa: E402

try:
    import coletor_xml as X  # noqa: E402  (não precisa do Playwright para importar)
except ImportError:  # pragma: no cover
    X = None

HOJE = datetime.date(2026, 11, 16)
FIX = os.path.join(BASE, 'tests', 'fixtures', 'contratos_amostra.xml')


def amostra():
    with open(FIX, encoding='utf-8') as f:
        return f.read()


class LeituraDeContratos(unittest.TestCase):
    def setUp(self):
        self.regs = L.ler_contratos(amostra(), HOJE)
        self.por_num = {r['num']: r for r in self.regs}

    def test_formato_que_o_painel_le(self):
        r = self.por_num['062/2026']
        for k in ('num', 'ini', 'fim', 'credor', 'desc', 'tipo', 'valor', 'sit', 'dias'):
            self.assertIn(k, r)
        self.assertEqual((r['ini'], r['fim'], r['valor']), ('26/05/2026', '26/05/2031', 8830000.0))
        self.assertEqual((r['sit'], r['credor'], r['cnpj']), ('vigente', 'BANCO SANTANDER (BRASIL) S.A.', '90400888000142'))
        self.assertEqual(r['dias'], (datetime.date(2031, 5, 26) - HOJE).days)

    def test_tipo_nao_se_confunde_entre_materiais_e_materiais_com_servicos(self):
        # no PDF os dois ficavam como o rótulo longo; no XML o tipo vem inteiro
        tipos = {r['tipo'] for r in self.regs}
        self.assertIn('AQUISIÇÃO DE MATERIAIS', tipos)
        self.assertTrue(any(t == 'AQUISIÇÃO DE MATERIAIS' for t in tipos))

    def test_objeto_vem_inteiro_e_sem_lixo_do_pdf(self):
        longos = [r for r in self.regs if len(r['desc']) > 400]
        self.assertTrue(longos)
        self.assertTrue(all('(cid:' not in r['desc'] for r in self.regs))

    def test_pessoa_fisica_nao_tem_documento_guardado(self):
        sem = [r for r in self.regs if not r['cnpj']]
        self.assertTrue(sem)  # a amostra tem pessoas físicas
        self.assertTrue(all(r['cnpj'] == '' for r in sem))
        self.assertTrue(all(len(r['cnpj']) == 14 for r in self.regs if r['cnpj']))
        self.assertNotIn('00000000000"', json.dumps(self.regs))

    def test_situacao_pelas_datas(self):
        self.assertEqual(L.situacao_contrato(datetime.date(2026, 1, 1), datetime.date(2026, 11, 15), HOJE), 'encerrado')
        self.assertEqual(L.situacao_contrato(datetime.date(2026, 1, 1), datetime.date(2026, 11, 16), HOJE), 'vigente')  # vence hoje: ainda vale
        self.assertEqual(L.situacao_contrato(datetime.date(2026, 11, 17), datetime.date(2027, 1, 1), HOJE), 'a iniciar')
        self.assertEqual(L.situacao_contrato(None, datetime.date(2027, 1, 1), HOJE), 'sem data')

    def test_arquivo_sem_registros_e_erro(self):
        with self.assertRaises(ValueError):
            L.ler_contratos('<Export><SDTContratoCollection/></Export>', HOJE)

    def test_registro_sem_numero_e_erro(self):
        ruim = amostra().replace('<ContratoNumero>062</ContratoNumero>', '<ContratoNumero/>')
        with self.assertRaises(ValueError):
            L.ler_contratos(ruim, HOJE)


class _PortalFalso:
    def __init__(self, corpo):
        self.corpo = corpo

    def ir(self, caminho):
        self.caminho = caminho

    def exportar_xml(self):
        return self.corpo


@unittest.skipIf(X is None, 'coletor_xml não importou')
class ColetorDeContratos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.dest, self.cache = X.DEST_CT, X.CACHE
        X.DEST_CT = os.path.join(self.tmp, 'dados_contratos.json')
        X.CACHE = os.path.join(self.tmp, 'cache')

    def tearDown(self):
        X.DEST_CT, X.CACHE = self.dest, self.cache

    def test_grava_lista_e_sha256(self):
        self.assertTrue(X.coletar_contratos(_PortalFalso(amostra().encode('utf-8'))))
        d = json.load(open(X.DEST_CT, encoding='utf-8'))
        self.assertEqual((d['fonte'], len(d['contratos']), len(d['sha256'])), ('xml', 14, 64))
        self.assertTrue(os.path.exists(os.path.join(X.CACHE, 'contratos_%s.xml' % X.HOJE.isoformat())))

    def test_lista_que_encolheu_nao_substitui_a_anterior(self):
        antigo = {'coletado_em': '2026-11-15', 'contratos': [{'num': '%04d/2026' % i} for i in range(100)]}
        json.dump(antigo, open(X.DEST_CT, 'w', encoding='utf-8'))
        self.assertFalse(X.coletar_contratos(_PortalFalso(amostra().encode('utf-8'))))
        self.assertEqual(json.load(open(X.DEST_CT, encoding='utf-8')), antigo)

    def test_arquivo_vazio_mantem_os_dados_anteriores(self):
        antigo = {'coletado_em': '2026-11-15', 'contratos': [{'num': '0001/2026'}]}
        json.dump(antigo, open(X.DEST_CT, 'w', encoding='utf-8'))
        with mock.patch.object(X.time, 'sleep'):  # sem esperar entre as tentativas
            self.assertFalse(X.coletar_contratos(_PortalFalso(b'<Export><SDTContratoCollection/></Export>')))
        self.assertEqual(json.load(open(X.DEST_CT, encoding='utf-8')), antigo)


if __name__ == '__main__':
    unittest.main()
