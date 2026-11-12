import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from look_switches import apply_state, write_states


class LookSwitches(unittest.TestCase):
    def test_every_switch_is_set_even_when_the_state_names_none(self):
        body = {'tights_on': 1.0, 'shoes_on': 1.0}   # left over from the office look
        rec = apply_state(body, ['tights_on', 'shoes_on'], {})
        self.assertEqual(body, {'tights_on': 0.0, 'shoes_on': 0.0})
        self.assertEqual(rec, {'tights_on': 0.0, 'shoes_on': 0.0})

    def test_named_values_win_and_a_typo_is_an_error(self):
        body = {}
        apply_state(body, ['tights_on', 'shoes_on'], {'tights_on': 1})
        self.assertEqual(body, {'tights_on': 1.0, 'shoes_on': 0.0})
        with self.assertRaises(KeyError):
            apply_state(body, ['tights_on'], {'tight_on': 1})

    def test_written_file_has_every_switch_in_every_state(self):
        path = os.path.join(tempfile.mkdtemp(), 'look_states.json')
        sw = ['tights_on', 'shoes_on']
        write_states(path, sw, {'nude': apply_state({}, sw, {}), 'office': apply_state({}, sw, {'tights_on': 1, 'shoes_on': 1})})
        data = json.load(open(path, encoding='utf-8'))
        self.assertTrue(all(set(s) == set(sw) for s in data['states'].values()))


if __name__ == '__main__':
    unittest.main()
