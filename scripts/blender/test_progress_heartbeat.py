import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from progress_heartbeat import write_progress


class ProgressHeartbeat(unittest.TestCase):
    def test_writes_frame_done_total_and_time(self):
        path = os.path.join(tempfile.mkdtemp(), 'p.json')
        write_progress(path, 4, 4, 96, now=lambda: 123.0)
        self.assertEqual(json.load(open(path, encoding='utf-8')), {'frame': 4, 'done': 4, 'total': 96, 'ts': 123.0})


if __name__ == '__main__':
    unittest.main()
