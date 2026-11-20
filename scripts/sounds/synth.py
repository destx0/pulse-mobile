"""Synthesises the gym's sound effects (docs/gym.md "Sound and touch") as OGG Vorbis files for the pulse-sound module.

Every sound is made here from sine partials and a little noise, so there is no third-party audio to license and the
files can be regenerated or retuned. Run from the repository root:

    python3 scripts/sounds/synth.py

It writes modules/pulse-sound/android/src/main/res/raw/gym_*.ogg (ffmpeg with libvorbis is needed for the encoding).
"""

import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

RATE = 32_000
OUT = os.path.join("modules", "pulse-sound", "android", "src", "main", "res", "raw")


def t(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * RATE)) / RATE


def env(x: np.ndarray, decay: float, attack: float = 0.002) -> np.ndarray:
    """A fast attack and an exponential fall: the shape of anything struck."""
    a = np.clip(x / attack, 0, 1)
    return a * np.exp(-x / decay)


def bell(freq: float, seconds: float, decay: float) -> np.ndarray:
    """A small bell: a fundamental with the inharmonic partials of a struck bar, the high ones dying first."""
    x = t(seconds)
    out = np.zeros_like(x)
    for ratio, gain, d in ((1.0, 1.0, decay), (2.76, 0.32, decay * 0.45), (5.40, 0.12, decay * 0.25)):
        out += gain * np.sin(2 * np.pi * freq * ratio * x) * env(x, d)
    return out


def sweep(f0: float, f1: float, seconds: float, decay: float) -> np.ndarray:
    """A pitch falling from f0 to f1: a pop, a blip."""
    x = t(seconds)
    f = f1 + (f0 - f1) * np.exp(-x / (seconds / 4))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    return np.sin(phase) * env(x, decay)


def mix(length: float, *parts: tuple[float, np.ndarray]) -> np.ndarray:
    """Layers (offset seconds, signal) into one buffer `length` seconds long."""
    out = np.zeros(int(length * RATE))
    for offset, sig in parts:
        i = int(offset * RATE)
        n = min(len(sig), len(out) - i)
        out[i : i + n] += sig[:n]
    return out


def click(seconds: float = 0.012, gain: float = 0.25) -> np.ndarray:
    rng = np.random.default_rng(7)
    x = t(seconds)
    return gain * rng.uniform(-1, 1, len(x)) * env(x, seconds / 4, 0.0005)


def note(name: str) -> float:
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    return 440.0 * 2 ** ((names[name[0]] + 12 * (int(name[1:]) - 4)) / 12)


def tick() -> np.ndarray:
    """A set ticked: a round, bright pop with a touch of click on top."""
    return mix(0.14, (0, sweep(1500, 720, 0.14, 0.035)), (0, 0.4 * sweep(3000, 1440, 0.06, 0.012)), (0, click()))


def untick() -> np.ndarray:
    """A tick taken back: the pop's lower, softer cousin, falling."""
    return 0.7 * mix(0.12, (0, sweep(620, 360, 0.12, 0.03)))


def add() -> np.ndarray:
    """A set or an exercise added: a dry wooden knock."""
    x = t(0.07)
    body = np.sin(2 * np.pi * 1750 * x) * env(x, 0.012) + 0.5 * np.sin(2 * np.pi * 2680 * x) * env(x, 0.007)
    return 0.8 * mix(0.07, (0, body), (0, click(0.006, 0.2)))


def done() -> np.ndarray:
    """Every set of an exercise ticked: two bells, a fifth apart, rising."""
    return mix(0.62, (0, bell(note("E6"), 0.6, 0.18)), (0.09, bell(note("B6"), 0.5, 0.2)))


def record() -> np.ndarray:
    """A new personal record: a quick rising arpeggio with a shimmer over its tail."""
    steps = ["C6", "E6", "G6", "C7"]
    parts = [(i * 0.065, (1.0 if i < 3 else 1.15) * bell(note(n), 0.8, 0.22 if i < 3 else 0.42)) for i, n in enumerate(steps)]
    x = t(0.6)
    shimmer = 0.10 * np.sin(2 * np.pi * 5200 * x) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * x)) * env(x, 0.2, 0.05)
    return mix(1.0, *parts, (0.2, shimmer))


def finish() -> np.ndarray:
    """A workout finished: a soft low thump, then a major chord rolled upward that rings out."""
    x = t(0.25)
    thump = 0.9 * np.sin(2 * np.pi * (60 + 80 * np.exp(-x / 0.03)) * x) * env(x, 0.07)
    chord = ["G5", "C6", "E6", "G6", "C7"]
    parts = [(0.04 + i * 0.075, 0.75 * bell(note(n), 1.3, 0.45)) for i, n in enumerate(chord)]
    return mix(1.5, (0, thump), *parts)


SOUNDS = {"gym_tick": tick, "gym_untick": untick, "gym_add": add, "gym_done": done, "gym_record": record, "gym_finish": finish}


def write(name: str, sig: np.ndarray) -> None:
    fade = min(len(sig), int(0.01 * RATE))
    sig = sig.copy()
    sig[-fade:] *= np.linspace(1, 0, fade)
    sig = sig / max(1e-9, np.max(np.abs(sig))) * 0.7  # about -3 dBFS
    pcm = (sig * 32767).astype("<i2").tobytes()
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, f"{name}.wav")
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm)
        out = os.path.join(OUT, f"{name}.ogg")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-c:a", "libvorbis", "-q:a", "4", "-map_metadata", "-1", out], check=True)
    print(f"{out}: {os.path.getsize(out)} bytes, {len(sig) / RATE:.2f} s")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for key, make in SOUNDS.items():
        if len(sys.argv) > 1 and key not in sys.argv[1:]:
            continue
        write(key, make())
