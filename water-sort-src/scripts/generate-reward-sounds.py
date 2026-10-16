"""Deterministic, full-rate glass harmonics, bubble transients and a clear flourish."""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 48000
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sounds' / 'v3'


def render(name, duration, notes, bubbles):
    samples = [0.0] * int(RATE * duration)
    for start, hz, length, gain in notes:
        for i in range(min(int(length * RATE), len(samples) - int(start * RATE))):
            t = i / RATE
            envelope = min(1, t / .003) * math.exp(-5.5 * t / length) * min(1, (length - t) / .025)
            body = math.sin(math.tau * hz * t)
            body += .22 * math.sin(math.tau * hz * 2.756 * t) * math.exp(-18 * t)
            body += .08 * math.sin(math.tau * hz * 5.404 * t) * math.exp(-30 * t)
            samples[int(start * RATE) + i] += body * envelope * gain
    rng = random.Random(927)
    for start, hz in bubbles:
        for i in range(min(int(.1 * RATE), len(samples) - int(start * RATE))):
            t = i / RATE
            phase = math.tau * (hz * t + 2600 * t * t)
            value = math.sin(phase) * math.exp(-t * 58) * .2
            value += rng.uniform(-1, 1) * math.exp(-t * 380) * .13
            samples[int(start * RATE) + i] += value * min(1, t / .0015)
    peak = max(map(abs, samples))
    scale = .62 / peak
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / (name + '.wav')), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        output.writeframes(b''.join(struct.pack('<h', round(x * scale * 32767)) for x in samples))
    print(f'{name}: {duration}s, {RATE}Hz, peak 0.62')


render('complete', .62, [(0, 783.99, .34, .25), (.035, 1174.66, .4, .19),
                       (.09, 1567.98, .5, .11), (.15, 2349.32, .3, .035)],
       [(0, 520), (.035, 820), (.075, 1100)])
render('clear', .98, [(0, 523.25, .36, .20), (.055, 659.25, .38, .18),
                    (.11, 783.99, .43, .18), (.18, 1046.5, .65, .19),
                    (.23, 1318.51, .65, .13), (.29, 1567.98, .63, .09),
                    (.36, 2093, .5, .055)], [(0, 420), (.08, 680), (.17, 900)])
