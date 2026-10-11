#!/usr/bin/env python3
"""用 Google Cloud Text-to-Speech 合成录音（神经语音），批量预录 App 里的单词、例句、课纲句子。

密钥从环境变量 GOOGLE_TTS_API_KEY 读取（在云端环境设置里添加，不要写进仓库）。
用法：
  python3 tools/tts_google.py --list es-ES          列出某语言可用的声音
  python3 tools/tts_google.py --say "perro" --lang es --out perro.mp3
"""
import argparse, base64, json, os, sys, urllib.request

API = "https://texttospeech.googleapis.com/v1"
# 默认声音：每种语言一女一男（可用 --voice 覆盖）
VOICES = {
    "en": ("en-US", ["en-US-Neural2-F", "en-US-Neural2-D"]),
    "es": ("es-ES", ["es-ES-Neural2-A", "es-ES-Neural2-F"]),
    "ja": ("ja-JP", ["ja-JP-Neural2-B", "ja-JP-Neural2-C"]),
}


def key():
    k = os.environ.get("GOOGLE_TTS_API_KEY")
    if not k:
        sys.exit("缺少环境变量 GOOGLE_TTS_API_KEY")
    return k


def call(path, body=None):
    req = urllib.request.Request(f"{API}/{path}{'&' if '?' in path else '?'}key={key()}", data=json.dumps(body).encode() if body else None, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def voices(lang_code):
    return [v for v in call(f"voices?languageCode={lang_code}")["voices"]]


def synth(text, lang, voice=None, rate=1.0, ssml=False):
    code, defaults = VOICES[lang]
    body = {"input": {"ssml" if ssml else "text": text}, "voice": {"languageCode": code, "name": voice or defaults[0]},
            "audioConfig": {"audioEncoding": "MP3", "speakingRate": rate, "sampleRateHertz": 24000}}
    return base64.b64decode(call("text:synthesize", body)["audioContent"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--list"); ap.add_argument("--say"); ap.add_argument("--lang", default="en"); ap.add_argument("--voice"); ap.add_argument("--out", default="out.mp3")
    a = ap.parse_args()
    if a.list:
        for v in voices(a.list):
            print(v["name"], v["ssmlGender"], v.get("naturalSampleRateHertz"))
    elif a.say:
        open(a.out, "wb").write(synth(a.say, a.lang, a.voice)); print("wrote", a.out)
