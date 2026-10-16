"""Deterministic, full-rate glass harmonics, bubble transients and a clear flourish."""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 48000
OUT = Path(__file__).resolve().parent.parent / 'public' / 'sounds' / 'v4'


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
    # A short falling body, airy upward sweep and a crystal attack share one headroom budget.
    for i in range(len(samples)):
        t = i / RATE
        attack = min(1, t / .003)
        body = math.sin(math.tau * (150 * t - 110 * t * t)) * math.exp(-t * 28) * .3
        strike = (math.sin(math.tau * 2380 * t) + .4 * rng.uniform(-1, 1)) * math.exp(-t * 90) * .12
        air = rng.uniform(-1, 1) * math.exp(-((t - .11) / .065) ** 2) * .045
        shimmer = math.sin(math.tau * (1450 * t + 1800 * t * t)) * math.exp(-t * 15) * .035
        samples[i] += (body + strike + air + shimmer) * attack * min(1, (duration - t) / .025)
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


render('complete', .68, [(0, 783.99, .4, .25), (.025, 1174.66, .45, .20),
                       (.07, 1567.98, .56, .13), (.13, 2349.32, .4, .045), (.18, 3135.96, .35, .02)],
       [(0, 520), (.035, 820), (.075, 1100)])
render('clear', .98, [(0, 523.25, .36, .20), (.055, 659.25, .38, .18),
                    (.11, 783.99, .43, .18), (.18, 1046.5, .65, .19),
                    (.23, 1318.51, .65, .13), (.29, 1567.98, .63, .09),
                    (.36, 2093, .5, .065), (.42, 2637.02, .48, .04)], [(0, 420), (.08, 680), (.17, 900)])
