import unittest

import twin


class Text(unittest.TestCase):
    def test_split_sentences(self):
        self.assertEqual(twin.split_sentences("No way.  Look at this! Six hours?\nWorth it."),
                         ["No way.", "Look at this!", "Six hours?", "Worth it."])

    def test_wer_ignores_case_and_punctuation(self):
        self.assertEqual(twin.word_error_rate("No way, look at THIS!", "no way look at this"), 0.0)

    def test_wer_counts_a_wrong_word(self):
        self.assertAlmostEqual(twin.word_error_rate("put your villager in", "put your village in"), 0.25)

    def test_wer_empty(self):
        self.assertEqual(twin.word_error_rate("", ""), 0.0)
        self.assertEqual(twin.word_error_rate("", "hi"), 1.0)

    def test_closure_times_only_b_p_m(self):
        words = [{"word": " Pause", "start": 0.5}, {"word": "look", "start": 1.0}, {"word": "Bro", "start": 1.4},
                 {"word": "made", "start": 2.0}]
        self.assertEqual(twin.closure_times(words), [0.5, 1.4, 2.0])


class Raw(unittest.TestCase):
    GOOD_AUDIO = {"sample_rate": 48000, "duration": 500, "peak_db": -6.0, "noise_floor_db": -62.0}
    GOOD_VIDEO = {"width": 1080, "height": 1920, "fps": 29.97, "duration": 185, "rotation": 0}

    def test_good_audio_passes(self):
        self.assertEqual(twin.judge_audio("voice-calm", self.GOOD_AUDIO), [])

    def test_bad_audio_names_each_problem(self):
        bad = {"sample_rate": 22050, "duration": 60, "peak_db": -0.1, "noise_floor_db": -35.0}
        problems = twin.judge_audio("voice-calm", bad)
        self.assertEqual(len(problems), 4)
        self.assertTrue(any("Lossless" in p for p in problems))

    def test_good_video_passes(self):
        self.assertEqual(twin.judge_video(self.GOOD_VIDEO), [])

    def test_rotated_phone_video_counts_as_vertical(self):
        self.assertEqual(twin.judge_video({**self.GOOD_VIDEO, "width": 1920, "height": 1080, "rotation": -90}), [])

    def test_landscape_short_low_res_fails(self):
        problems = twin.judge_video({"width": 1280, "height": 720, "fps": 30, "duration": 40, "rotation": 0})
        self.assertEqual(len(problems), 3)


class Prep(unittest.TestCase):
    def test_parse_silences(self):
        err = "silence_start: 1.5\nsilence_end: 2.0 | silence_duration: 0.5\nsilence_start: 14.1\nsilence_end: 14.9"
        self.assertEqual(twin.parse_silences(err), [(1.5, 2.0), (14.1, 14.9)])

    def test_best_window_starts_and_ends_in_a_pause(self):
        silences = [(1.5, 2.0), (14.1, 14.9), (30.0, 34.0), (40.0, 40.5)]
        self.assertEqual(twin.best_window(silences, 60), (14.9, 30.0))

    def test_best_window_none_when_no_pause_fits(self):
        self.assertIsNone(twin.best_window([(1.0, 1.5)], 5))

    def test_face_segments_follow_the_take(self):
        segs = twin.face_segments(175)
        self.assertEqual([s["mood"] for s in segs], ["neutral", "talk", "smile", "think", "hyped"])
        self.assertEqual(segs[-1]["end"], 175)

    def test_every_mood_has_voice_and_face(self):
        faces = {m for m, _, _ in twin.FACE_PLAN}
        for mood, (voice, face) in twin.MOODS.items():
            self.assertIn(voice, twin.VOICE_FILES)
            self.assertIn(face, faces)
            self.assertIn(mood, twin.VOICE_KNOBS)


class Say(unittest.TestCase):
    MANIFEST = {"face": {"talk": {"file": "face/talk.mp4", "seconds": 60}, "hyped": {"file": "face/hyped.mp4", "seconds": 30}}}

    def test_pick_clip_by_mood(self):
        self.assertEqual(twin.pick_clip(self.MANIFEST, "calm", 12)["file"], "face/talk.mp4")

    def test_script_longer_than_clip_falls_back_to_real_footage(self):
        with self.assertRaises(SystemExit) as e:
            twin.pick_clip(self.MANIFEST, "hyped", 31)
        self.assertIn("real footage", str(e.exception))

    def test_musetalk_config_uses_forward_slashes(self):
        cfg = twin.musetalk_config(r"C:\twin\face\talk.mp4", "out/voice.wav")
        self.assertIn('video_path: "C:/twin/face/talk.mp4"', cfg)
        self.assertTrue(cfg.startswith("task_0:"))


if __name__ == "__main__":
    unittest.main()
