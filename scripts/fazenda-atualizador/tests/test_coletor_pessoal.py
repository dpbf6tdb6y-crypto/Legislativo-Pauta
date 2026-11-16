"""Código de saída da coleta de pessoal: o mês em andamento ilegível é esperado; um mês fechado que falha não é."""
import datetime
import os
import sys
import unittest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

try:
    import coletor_pessoal as P  # noqa: E402
except ImportError as e:  # pragma: no cover (sem Playwright instalado)
    P = None

HOJE = datetime.date(2026, 11, 16)
ALVO = [(2026, 11), (2026, 10), (2026, 9)]


@unittest.skipIf(P is None, 'coletor_pessoal não importou (Playwright ausente)')
class CodigoDeSaida(unittest.TestCase):
    def test_tudo_coletado(self):
        novos = {P.chave(*a): {} for a in ALVO}
        self.assertEqual(P.resultado(ALVO, novos, HOJE), 0)

    def test_mes_em_andamento_ilegivel_e_esperado(self):
        # novembro/2026 ainda aberto no portal: o que vale é outubro, o último mês fechado
        novos = {P.chave(2026, 10): {}, P.chave(2026, 9): {}}
        self.assertEqual(P.resultado(ALVO, novos, HOJE), 0)

    def test_mes_em_andamento_ilegivel_sem_o_anterior_e_falha(self):
        self.assertEqual(P.resultado(ALVO, {P.chave(2026, 9): {}}, HOJE), 2)

    def test_mes_fechado_que_falhou_continua_sendo_falha(self):
        # o mais novo da lista é outubro (fechado) e não veio: isso é problema de verdade
        alvo = [(2026, 10), (2026, 9)]
        self.assertEqual(P.resultado(alvo, {P.chave(2026, 9): {}}, datetime.date(2026, 11, 16)), 2)

    def test_nada_coletado_e_falha(self):
        self.assertEqual(P.resultado(ALVO, {}, HOJE), 2)


if __name__ == '__main__':
    unittest.main()
