"""Download flags: impersonation only when curl_cffi is usable, cert retry detection."""
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))

import download as dl  # noqa: E402


def fake_run(stdout):
    return mock.patch.object(dl.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout, ''))


class Flags(unittest.TestCase):
    def setUp(self):
        dl.impersonation_args.cache_clear()

    def test_impersonates_when_curl_cffi_listed(self):
        with fake_run('Client Source\nChrome-136 Macos-15 curl_cffi\n'):
            self.assertEqual(dl.impersonation_args(), ('--impersonate', 'chrome'))

    def test_no_flag_without_curl_cffi(self):
        with fake_run('Client Source\nChrome-136 Macos-15 (unavailable)\n'):
            self.assertEqual(dl.impersonation_args(), ())

    def test_no_flag_when_ytdlp_missing(self):
        with mock.patch.object(dl.subprocess, 'run', side_effect=FileNotFoundError):
            self.assertEqual(dl.impersonation_args(), ())

    def test_cert_failure_detected(self):
        self.assertTrue(dl.is_cert_failure('[SSL: CERTIFICATE_VERIFY_FAILED] x'))
        self.assertFalse(dl.is_cert_failure('HTTP Error 403'))


if __name__ == '__main__':
    unittest.main()
