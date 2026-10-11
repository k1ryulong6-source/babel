#!/usr/bin/env python3
"""离线神经语音合成（Kokoro-82M），用来批量预录 App 里要朗读的单词、例句、课纲句子。

依赖（装在单独的 venv 里）：onnxruntime numpy soundfile kokoro-onnx spacy misaki
模型与声音（Apache-2.0）：
  - 模型：npm 包 kokoro-fp32a/b/c-shards 的 19 个分片按序拼接为 kokoro-fp32.onnx
  - 声音：npm 包 expo-kokoro 的 build/voices/*.bin（每个 510×1×256 float32）
用法：
  from tts_kokoro import Kokoro
  k = Kokoro(model_path, voices_dir); wav = k.say("Hello.", "en", "af_heart"); k.mp3(wav, "out.mp3")
"""
import json, os, re, subprocess, tempfile
import numpy as np

SR = 24000


def _blank_spacy():
    # spaCy 的英语模型下载不到：用空白管线代替，misaki 仍用自带的发音词典注音
    import spacy
    real = spacy.load

    def load(name, *a, **k):
        try:
            return real(name, *a, **k)
        except Exception:
            nlp = spacy.blank("en")
            nlp.add_pipe("sentencizer")
            return nlp
    spacy.load = load
    import spacy.cli
    spacy.cli.download = lambda *a, **k: None


class Kokoro:
    def __init__(self, model_path, voices_dir):
        import onnxruntime as ort, kokoro_onnx
        so = ort.SessionOptions()
        so.intra_op_num_threads = os.cpu_count() or 4
        self.sess = ort.InferenceSession(model_path, so, providers=["CPUExecutionProvider"])
        cfg = json.load(open(os.path.join(os.path.dirname(kokoro_onnx.__file__), "config.json"), encoding="utf-8"))
        self.vocab = cfg["vocab"]
        self.voices_dir = voices_dir
        self._voices, self._g2p = {}, {}

    def voice(self, name):
        if name not in self._voices:
            self._voices[name] = np.fromfile(os.path.join(self.voices_dir, name + ".bin"), dtype=np.float32).reshape(-1, 1, 256)
        return self._voices[name]

    def g2p(self, lang):
        if lang not in self._g2p:
            # espeak-ng 用 espeakng-loader 自带的动态库和数据
            import espeakng_loader
            from phonemizer.backend.espeak.wrapper import EspeakWrapper
            EspeakWrapper.set_library(espeakng_loader.get_library_path())
            EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
            from misaki import espeak
            if lang == "en":
                _blank_spacy()
                from misaki import en
                self._g2p[lang] = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
            elif lang == "es":
                self._g2p[lang] = espeak.EspeakG2P(language="es")
            else:
                raise ValueError(lang)
        return self._g2p[lang]

    def phonemes(self, text, lang):
        r = self.g2p(lang)(text)
        return r[0] if isinstance(r, tuple) else r

    def tokens(self, ps):
        return [self.vocab[c] for c in ps if c in self.vocab]

    def synth_ps(self, ps, voice, speed=1.0):
        ids = self.tokens(ps)[:510]
        style = self.voice(voice)[len(ids)]
        out = self.sess.run(None, {"input_ids": np.array([[0, *ids, 0]], dtype=np.int64), "style": style.astype(np.float32), "speed": np.array([speed], dtype=np.float32)})[0]
        return out.reshape(-1)

    def say(self, text, lang, voice, speed=1.0):
        # 长文本按句切开分别合成，句间留 0.25 秒
        parts = [p for p in re.split(r"(?<=[.!?¿¡;:…])\s+", text.strip()) if p.strip()] or [text]
        gap = np.zeros(int(SR * .25), dtype=np.float32)
        out = []
        for p in parts:
            out += [self.synth_ps(self.phonemes(p, lang), voice, speed), gap]
        wav = np.concatenate(out[:-1]) if out else np.zeros(1, np.float32)
        return trim(wav)

    @staticmethod
    def mp3(wav, path, kbps=48):
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        import soundfile as sf
        sf.write(tmp, wav, SR)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp, "-ac", "1", "-ar", "24000", "-b:a", f"{kbps}k", path], check=True)
        os.unlink(tmp)


def trim(wav, thr=0.004, pad=0.06):
    idx = np.where(np.abs(wav) > thr)[0]
    if not len(idx):
        return wav
    a, b = max(0, idx[0] - int(SR * pad)), min(len(wav), idx[-1] + int(SR * pad * 2))
    return wav[a:b]
