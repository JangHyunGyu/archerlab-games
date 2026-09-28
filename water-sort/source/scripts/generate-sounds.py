"""Synthesized UI sounds plus the user-supplied bubbles recording for pouring."""
import math
import random
import struct
import shutil
import subprocess
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sounds' / 'v1'
OUT.mkdir(parents=True, exist_ok=True)


def tone(samples, start, duration, hz, amplitude=.25, end_hz=None, glass=False):
    phase = 0.0
    for i in range(int(duration * RATE)):
        t = i / RATE
        position = int(start * RATE) + i
        if position >= len(samples):
            break
        frequency = hz if end_hz is None else hz + (end_hz - hz) * t / duration
        phase += math.tau * frequency / RATE
        envelope = min(1, t / .006) * math.exp(-5 * t / duration) * min(1, (duration - t) / .015)
        value = math.sin(phase)
        if glass:
            value += .2 * math.sin(phase * 2.73) * math.exp(-12 * t)
        samples[position] += amplitude * envelope * value


def save(name, samples, directory=OUT):
    peak = max(abs(x) for x in samples)
    scale = min(1, .65 / max(peak, .001))
    directory.mkdir(parents=True, exist_ok=True)
    with wave.open(str(directory / (name + '.wav')), 'wb') as wav:
        wav.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        wav.writeframes(b''.join(struct.pack('<h', round(x * scale * 32767)) for x in samples))
    print(f'{name}: {len(samples)/RATE:.2f}s, peak {peak*scale:.3f}')


def chime(name, duration, notes):
    samples = [0.0] * int(RATE * duration)
    for start, hz, length, amp in notes:
        tone(samples, start, length, hz, amp, glass=True)
    save(name, samples)


chime('select', .16, [(0, 920, .15, .21)])
# A small rounded bubble pop when a draggable bottle acquires a valid target.
target = [0.0] * int(RATE * .14)
tone(target, 0, .13, 640, .28, end_hz=1120)
tone(target, .025, .09, 1280, .065, end_hz=1540, glass=True)
save('target', target)
chime('start', .42, [(0, 523.25, .2, .2), (.09, 659.25, .2, .18), (.18, 783.99, .24, .2)])
chime('clear', .9, [(0, 659.25, .3, .22), (.1, 783.99, .32, .22), (.2, 1046.5, .65, .2), (.28, 1318.5, .55, .12)])
chime('timeout', .65, [(0, 523.25, .26, .2), (.14, 440, .28, .18), (.3, 349.23, .35, .19)])
invalid = [0.0] * int(RATE * .18)
tone(invalid, 0, .18, 260, .19, end_hz=190)
save('invalid', invalid)

# A restrained mechanical tick with a short escapement click, original synthesis.
tick = [0.0] * int(RATE * .12)
tick_rng = random.Random(4928)
for i in range(len(tick)):
    t = i / RATE
    tick[i] = tick_rng.uniform(-1, 1) * .28 * min(1, t / .0008) * math.exp(-t * 175)
tone(tick, 0, .05, 1750, .16, end_hz=1050)
tone(tick, .024, .05, 850, .1, end_hz=600)
save('tick', tick)

# Retain the supplied MP3 unchanged. Use an active middle section, then fade
# both edges to prevent clicks. Playback stretches this to the liquid stream.
source = Path(__file__).resolve().parent.parent / 'freesound_community-bubbles-003-6397.mp3'
ffmpeg = shutil.which('ffmpeg') or shutil.which('ffmpeg.cmd')
if not ffmpeg:
    raise RuntimeError('FFmpeg is required to prepare the supplied pouring sound.')
decoded = subprocess.run([
    ffmpeg, '-v', 'error', '-i', str(source), '-ss', '1.28', '-t', '0.64',
    '-ac', '1', '-ar', str(RATE), '-f', 'f32le', 'pipe:1',
], check=True, capture_output=True).stdout
pour = list(struct.unpack('<' + str(len(decoded) // 4) + 'f', decoded))
for i in range(len(pour)):
    envelope = max(0, min(1, i / (RATE * .025), (len(pour) - 1 - i) / (RATE * .07)))
    pour[i] *= envelope
gain = .55 / max(abs(x) for x in pour)
save('pour', [x * gain for x in pour], OUT.parent / 'v2')
