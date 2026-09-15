#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / 'player_focus_sim.py'
spec = importlib.util.spec_from_file_location('player_focus_sim', SCRIPT)
sim = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sim)

class PlayerFocusSimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sim.load_scenario(sim.PROJECT_ROOT, '1560_okehazama')

    def test_default_target_clans_are_present(self):
        self.assertEqual(sim.CLAN_NAMES[1], '織田家')
        self.assertEqual(sim.CLAN_NAMES[3], '武田家')
        self.assertEqual(sim.CLAN_NAMES[62], '宗家')

    def test_same_seed_is_deterministic(self):
        a = sim.Sim(1, 123456, 'standard', 12).run()
        b = sim.Sim(1, 123456, 'standard', 12).run()
        self.assertEqual(a, b)

    def test_summary_shape(self):
        rows = [sim.Sim(3, 300009 + i, 'standard', 2).run() for i in range(3)]
        result = sim.summ(rows)
        self.assertEqual(result['n'], 3)
        self.assertIn('clear_rate', result)
        self.assertIn('gameover_rate', result)
        self.assertIn('median_castles_cp', result)

    def test_known_profiles_exist(self):
        self.assertEqual(set(sim.PARAMS), {'cautious', 'standard', 'skilled'})

if __name__ == '__main__':
    unittest.main(verbosity=2)
