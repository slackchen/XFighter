import os
import math
import subprocess
import wave
import tempfile
import numpy as np

SR = 44100
OUT_DIR = os.path.join("public", "assets", "audio")
SFX_DIR = os.path.join(OUT_DIR, "sfx")
os.makedirs(SFX_DIR, exist_ok=True)


def midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def biquad_lowpass(x: np.ndarray, cutoff: float, q: float = 0.707) -> np.ndarray:
    """Fast frequency-domain smooth rolloff filter (zero-phase or causal-feel via FFT) for stereo/mono arrays."""
    is_2d = x.ndim == 2
    n = x.shape[0]
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    # 2nd-order Butterworth magnitude response
    ratio = freqs / max(cutoff, 20.0)
    resp = 1.0 / np.sqrt(1.0 + (ratio ** (4.0 * max(q, 0.5))))
    if is_2d:
        spec = np.fft.rfft(x, axis=0)
        return np.fft.irfft(spec * resp[:, None], n=n, axis=0).astype(np.float32)
    spec = np.fft.rfft(x)
    return np.fft.irfft(spec * resp, n=n).astype(np.float32)


def biquad_bandpass(x: np.ndarray, low: float, high: float) -> np.ndarray:
    n = x.shape[0]
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    hp = 1.0 / np.sqrt(1.0 + (max(low, 20.0) / np.maximum(freqs, 1.0)) ** 4)
    lp = 1.0 / np.sqrt(1.0 + (freqs / max(high, 40.0)) ** 4)
    resp = hp * lp
    if x.ndim == 2:
        spec = np.fft.rfft(x, axis=0)
        return np.fft.irfft(spec * resp[:, None], n=n, axis=0).astype(np.float32)
    spec = np.fft.rfft(x)
    return np.fft.irfft(spec * resp, n=n).astype(np.float32)


def fft_reverb(stereo: np.ndarray, decay_sec: float = 1.1, wet: float = 0.22, predelay_ms: float = 18.0) -> np.ndarray:
    """Rich multi-tap stereo reverb using sparse exponentially decaying diffuse impulse response + FFT convolution."""
    n = stereo.shape[0]
    ir_len = int(SR * (decay_sec * 1.6))
    rng = np.random.default_rng(42)
    t = np.arange(ir_len, dtype=np.float32) / SR
    env = np.exp(-t / (decay_sec * 0.45))
    # Early reflections + diffuse tail
    ir_l = rng.standard_normal(ir_len).astype(np.float32) * env
    ir_r = rng.standard_normal(ir_len).astype(np.float32) * env
    # Damp highs in reverb tail
    ir_l = biquad_lowpass(ir_l, 4200.0, 0.7)
    ir_r = biquad_lowpass(ir_r, 3900.0, 0.7)
    predelay = int(SR * predelay_ms / 1000.0)
    ir_l = np.concatenate([np.zeros(predelay, dtype=np.float32), ir_l])
    ir_r = np.concatenate([np.zeros(predelay + 97, dtype=np.float32), ir_r])
    ir_len_full = max(len(ir_l), len(ir_r))
    if len(ir_l) < ir_len_full:
        ir_l = np.pad(ir_l, (0, ir_len_full - len(ir_l)))
    if len(ir_r) < ir_len_full:
        ir_r = np.pad(ir_r, (0, ir_len_full - len(ir_r)))

    # Normalize IR energy
    norm = np.sqrt(np.sum(ir_l ** 2) + 1e-8)
    ir_l /= norm
    ir_r /= norm

    fft_size = 1 << (n + ir_len_full - 1).bit_length()
    wet_l = np.fft.irfft(np.fft.rfft(stereo[:, 0], fft_size) * np.fft.rfft(ir_l, fft_size), fft_size)[:n]
    wet_r = np.fft.irfft(np.fft.rfft(stereo[:, 1], fft_size) * np.fft.rfft(ir_r, fft_size), fft_size)[:n]
    out = stereo.copy()
    out[:, 0] = stereo[:, 0] * (1.0 - wet * 0.35) + wet_l * wet
    out[:, 1] = stereo[:, 1] * (1.0 - wet * 0.35) + wet_r * wet
    return out


def master_limit(stereo: np.ndarray, ceiling: float = 0.91) -> np.ndarray:
    # Remove DC offset
    stereo = stereo - np.mean(stereo, axis=0, keepdims=True)
    peak = float(np.max(np.abs(stereo))) + 1e-8
    if peak > 0.001:
        # Gentle soft-clip warmth then normalize
        gain = min(1.35, 0.95 / peak) if peak < 0.8 else 1.0
        stereo = np.tanh(stereo * gain * 1.15) / math.tanh(1.15)
    peak2 = float(np.max(np.abs(stereo))) + 1e-8
    stereo = stereo * (ceiling / max(peak2, ceiling))
    return np.clip(stereo, -0.99, 0.99).astype(np.float32)


def write_mp3(path: str, stereo: np.ndarray) -> None:
    pcm = (np.clip(stereo, -1.0, 1.0) * 32767.0).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        wav_path = tf.name
    try:
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(pcm.tobytes())
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", wav_path,
            "-c:a", "libmp3lame", "-b:a", "192k", "-ar", str(SR),
            path
        ]
        subprocess.run(cmd, check=True)
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def add_stereo(buf: np.ndarray, start_s: float, sig_l: np.ndarray, sig_r: np.ndarray = None, pan: float = 0.0, gain: float = 1.0) -> None:
    if sig_r is None:
        sig_r = sig_l
    idx = int(round(start_s * SR))
    if idx >= buf.shape[0] or idx + len(sig_l) <= 0:
        return
    src_start = max(0, -idx)
    dst_start = max(0, idx)
    length = min(len(sig_l) - src_start, buf.shape[0] - dst_start)
    if length <= 0:
        return
    gl = gain * math.cos((pan + 1.0) * math.pi * 0.25) * 1.4142
    gr = gain * math.sin((pan + 1.0) * math.pi * 0.25) * 1.4142
    buf[dst_start:dst_start + length, 0] += sig_l[src_start:src_start + length] * gl
    buf[dst_start:dst_start + length, 1] += sig_r[src_start:src_start + length] * gr


def bandlimited_saw(freq: float, dur: float, phase: float = 0.0) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    out = np.zeros(n, dtype=np.float32)
    max_h = min(14, int((SR * 0.42) / max(freq, 20.0)))
    for h in range(1, max_h + 1):
        out += ((-1.0) ** (h + 1)) * np.sin(2.0 * np.pi * freq * h * t + phase * h) / h
    return out * (2.0 / np.pi)


def adsr_env(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    na = max(1, int(a * SR))
    nd = max(1, int(d * SR))
    nr = max(1, int(r * SR))
    env = np.full(n, s, dtype=np.float32)
    a_end = min(n, na)
    env[:a_end] = np.linspace(0.0, 1.0, a_end, dtype=np.float32)
    d_end = min(n, na + nd)
    if d_end > na:
        env[na:d_end] = np.linspace(1.0, s, d_end - na, dtype=np.float32)
    r_start = max(0, n - nr)
    if n > r_start:
        env[r_start:] *= np.linspace(1.0, 0.0, n - r_start, dtype=np.float32)
    return env


def synth_supersaw(midi: float, dur: float, detune_cents: float = 16.0, brightness: float = 5500.0) -> tuple[np.ndarray, np.ndarray]:
    n = int(SR * dur)
    freq = midi_to_hz(midi)
    detunes = [-detune_cents, -detune_cents * 0.45, 0.0, detune_cents * 0.45, detune_cents]
    pans = [-0.85, -0.4, 0.0, 0.4, 0.85]
    l_acc = np.zeros(n, dtype=np.float32)
    r_acc = np.zeros(n, dtype=np.float32)
    for i, (dc, p) in enumerate(zip(detunes, pans)):
        f = freq * (2.0 ** (dc / 1200.0))
        sig = bandlimited_saw(f, dur, phase=i * 1.13)
        wl = math.cos((p + 1.0) * math.pi * 0.25)
        wr = math.sin((p + 1.0) * math.pi * 0.25)
        l_acc += sig * wl
        r_acc += sig * wr
    env = adsr_env(n, 0.012, 0.09, 0.72, min(0.08, dur * 0.28))
    l_acc = biquad_lowpass(l_acc * env, brightness)
    r_acc = biquad_lowpass(r_acc * env, brightness)
    return l_acc * 0.28, r_acc * 0.28


def synth_pad_chord(midis: list[float], dur: float) -> tuple[np.ndarray, np.ndarray]:
    n = int(SR * dur)
    l_acc = np.zeros(n, dtype=np.float32)
    r_acc = np.zeros(n, dtype=np.float32)
    t = np.arange(n, dtype=np.float32) / SR
    for idx, m in enumerate(midis):
        f = midi_to_hz(m)
        s1 = np.sin(2.0 * np.pi * f * t + idx * 0.7) * 0.55
        s2 = bandlimited_saw(f * 1.003, dur, phase=idx * 0.9) * 0.22
        s3 = bandlimited_saw(f * 0.997, dur, phase=idx * 1.7) * 0.22
        voice = biquad_lowpass(s1 + s2 + s3, 1850.0)
        pan = -0.45 + 0.9 * (idx / max(1, len(midis) - 1))
        l_acc += voice * math.cos((pan + 1.0) * math.pi * 0.25)
        r_acc += voice * math.sin((pan + 1.0) * math.pi * 0.25)
    env = adsr_env(n, min(0.35, dur * 0.25), 0.3, 0.75, min(0.45, dur * 0.3))
    return l_acc * env * 0.32, r_acc * env * 0.32


def synth_koto(midi: float, dur: float, bright: float = 0.994) -> np.ndarray:
    """Karplus-Strong Japanese Koto plucked string synthesis."""
    n = int(SR * dur)
    freq = midi_to_hz(midi)
    delay = max(2, int(round(SR / freq)))
    rng = np.random.default_rng(int(midi * 37))
    # Crisp bamboo-pick pluck burst
    ring = (rng.uniform(-1.0, 1.0, delay) * 0.7 + np.sin(np.linspace(0, np.pi, delay)) * 0.4).astype(np.float32)
    out = np.zeros(n, dtype=np.float32)
    ptr = 0
    prev = 0.0
    for i in range(n):
        val = ring[ptr]
        out[i] = val
        nxt = bright * 0.5 * (val + prev)
        prev = val
        ring[ptr] = nxt
        ptr = (ptr + 1) % delay
    env = adsr_env(n, 0.002, 0.15, 0.45, min(0.25, dur * 0.4))
    return out * env


def synth_power_guitar(root_midi: float, dur: float, drive: float = 5.5) -> tuple[np.ndarray, np.ndarray]:
    """Overdriven electric rhythm guitar playing a heavy power chord (Root + 5th + Octave)."""
    n = int(SR * dur)
    notes = [root_midi, root_midi + 7, root_midi + 12]
    sig = np.zeros(n, dtype=np.float32)
    for k, m in enumerate(notes):
        f = midi_to_hz(m)
        sig += bandlimited_saw(f, dur, phase=k * 0.8) * (0.48 if k < 2 else 0.32)
        sig += bandlimited_saw(f * 1.002, dur, phase=k * 1.4) * 0.18
    # Palm-mute / pick attack envelope
    env = adsr_env(n, 0.004, 0.06, 0.78, min(0.04, dur * 0.25))
    dist = np.tanh(sig * env * drive)
    # Guitar cabinet emulation (bandpass 110Hz - 3800Hz)
    cab = biquad_bandpass(dist, 105.0, 3900.0)
    # Haas stereo width
    delay_samps = int(0.011 * SR)
    r_sig = np.concatenate([np.zeros(delay_samps, dtype=np.float32), cab[:-delay_samps]]) * 0.96
    return cab * 0.42, r_sig * 0.42


def synth_bass(midi: float, dur: float) -> np.ndarray:
    n = int(SR * dur)
    freq = midi_to_hz(midi)
    t = np.arange(n, dtype=np.float32) / SR
    sub = np.sin(2.0 * np.pi * freq * t) * 0.65
    grit = bandlimited_saw(freq, dur) * 0.45
    mixed = biquad_lowpass(sub + grit, 720.0, 0.85)
    env = adsr_env(n, 0.004, 0.05, 0.72, min(0.03, dur * 0.2))
    return mixed * env * 0.75


def make_kick() -> np.ndarray:
    dur = 0.26
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    # Pitch drop 165Hz -> 46Hz
    freq = 46.0 + 125.0 * np.exp(-t * 36.0)
    phase = np.cumsum(2.0 * np.pi * freq / SR)
    body = np.sin(phase) * np.exp(-t * 11.5)
    click = np.sin(2.0 * np.pi * 1650.0 * t) * np.exp(-t * 120.0) * 0.35
    return np.tanh((body + click) * 1.4) * 0.85


def make_snare() -> np.ndarray:
    dur = 0.24
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(101)
    freq = 175.0 + 120.0 * np.exp(-t * 48.0)
    tone = np.sin(np.cumsum(2.0 * np.pi * freq / SR)) * np.exp(-t * 18.0) * 0.55
    noise = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 1100.0, 7800.0) * np.exp(-t * 14.0) * 0.75
    return np.tanh((tone + noise) * 1.25) * 0.78


def make_hat(open_hat: bool = False) -> np.ndarray:
    dur = 0.28 if open_hat else 0.065
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(202 if open_hat else 203)
    noise = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 6200.0, 14500.0)
    # Metallic partial shimmer
    ring = sum(np.sin(2.0 * np.pi * f * t) for f in [3120, 4680, 6210, 8140]) * 0.08
    decay = 8.5 if open_hat else 52.0
    return (noise + ring) * np.exp(-t * decay) * (0.42 if open_hat else 0.34)


def make_crash() -> tuple[np.ndarray, np.ndarray]:
    dur = 1.65
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng_l = np.random.default_rng(301)
    rng_r = np.random.default_rng(302)
    nl = biquad_bandpass(rng_l.standard_normal(n).astype(np.float32), 3400.0, 14000.0)
    nr = biquad_bandpass(rng_r.standard_normal(n).astype(np.float32), 3400.0, 14000.0)
    env = np.exp(-t * 2.4) * (1.0 - np.exp(-t * 120.0))
    return nl * env * 0.36, nr * env * 0.36


# ==============================================================================
# BGM 1: MENU THEME (132 BPM, D Minor, Atmospheric Anime Electronic + Koto)
# ==============================================================================
def build_bgm_menu() -> np.ndarray:
    bpm = 132.0
    beat = 60.0 / bpm
    bars = 16
    loop_dur = bars * 4 * beat
    tail = 2.0
    buf = np.zeros((int(SR * (loop_dur + tail)), 2), dtype=np.float32)

    kick = make_kick()
    snare = make_snare()
    hat_c = make_hat(False)
    hat_o = make_hat(True)
    crash_l, crash_r = make_crash()

    # Chord progression in D minor: Dm9 -> Bbmaj7 -> Gm7 -> A7sus4/A7
    chords = [
        ([50, 57, 60, 64, 65], 38),  # Dm9
        ([46, 53, 57, 60, 62], 34),  # Bbmaj7
        ([43, 50, 53, 58, 62], 43),  # Gm7
        ([45, 52, 57, 61, 64], 45),  # A7
    ]

    # Koto pentatonic / minor motif (D5=74, F5=77, G5=79, A5=81, C6=84, D6=86, E5=76)
    koto_bars = [
        [(0.0, 74, 0.7), (0.75, 77, 0.5), (1.5, 81, 0.7), (2.5, 79, 0.6), (3.25, 77, 0.5)],
        [(0.0, 74, 0.8), (1.0, 76, 0.6), (2.0, 77, 0.9), (3.0, 81, 0.8)],
        [(0.0, 84, 0.8), (0.75, 81, 0.6), (1.5, 79, 0.7), (2.5, 77, 0.6), (3.25, 76, 0.6)],
        [(0.0, 79, 0.7), (1.0, 77, 0.6), (2.0, 76, 0.7), (3.0, 73, 0.9)],
    ]

    for bar in range(bars):
        t0 = bar * 4 * beat
        chord_notes, bass_root = chords[bar % 4]
        pl, pr = synth_pad_chord(chord_notes, 4 * beat + 0.25)
        add_stereo(buf, t0, pl, pr, pan=0.0, gain=0.72)

        # Shimmering 16th-note anime synth arp
        arp_seq = [chord_notes[1] + 12, chord_notes[2] + 12, chord_notes[3] + 12, chord_notes[4] + 12]
        for s in range(16):
            st = t0 + s * (beat * 0.25)
            note = arp_seq[s % len(arp_seq)]
            al, ar = synth_supersaw(note, beat * 0.22, detune_cents=10.0, brightness=3200.0)
            add_stereo(buf, st, al, ar, pan=math.sin(s * 0.6) * 0.55, gain=0.22)

        # Bass pulse (8th notes)
        for e in range(8):
            bt = t0 + e * (beat * 0.5)
            b_sig = synth_bass(bass_root + (12 if e % 4 == 2 else 0), beat * 0.42)
            add_stereo(buf, bt, b_sig, b_sig, pan=0.0, gain=0.58)

        # Koto phrases
        for pos, midi_n, ndur in koto_bars[bar % 4]:
            kt = synth_koto(midi_n, ndur * beat + 0.35, bright=0.995)
            add_stereo(buf, t0 + pos * beat, kt, kt, pan=0.28, gain=0.45)

        # Smooth modern electronic beat (kicks in full at bar 4)
        if bar % 4 == 0:
            add_stereo(buf, t0, crash_l, crash_r, pan=-0.25, gain=0.42)
        for b in range(4):
            bt = t0 + b * beat
            if bar >= 2:
                add_stereo(buf, bt, kick, kick, pan=0.0, gain=0.68)
            if bar >= 4 and (b == 1 or b == 3):
                add_stereo(buf, bt, snare, snare, pan=0.0, gain=0.55)
            if bar >= 4:
                add_stereo(buf, bt, hat_c, hat_c, pan=-0.35, gain=0.48)
                add_stereo(buf, bt + beat * 0.5, hat_o if b == 3 else hat_c, hat_o if b == 3 else hat_c, pan=-0.35, gain=0.45)

    buf = fft_reverb(buf, decay_sec=1.35, wet=0.26)
    n_loop = int(SR * loop_dur)
    out = buf[:n_loop].copy()
    # Fold reverb tail onto start for seamless loop
    tail_len = min(int(SR * tail), buf.shape[0] - n_loop, n_loop)
    out[:tail_len] += buf[n_loop:n_loop + tail_len]
    return master_limit(out)


# ==============================================================================
# BGM 2: BATTLE THEME (168 BPM, E Minor / Phrygian High-Octane Anime Rock)
# ==============================================================================
def build_bgm_battle() -> np.ndarray:
    bpm = 168.0
    beat = 60.0 / bpm
    bars = 32  # 4 Intro + 8 Verse + 4 Pre-Chorus + 16 Chorus (~45.7s seamless loop)
    loop_dur = bars * 4 * beat
    tail = 1.8
    buf = np.zeros((int(SR * (loop_dur + tail)), 2), dtype=np.float32)

    kick = make_kick()
    snare = make_snare()
    hat_c = make_hat(False)
    hat_o = make_hat(True)
    crash_l, crash_r = make_crash()

    # E minor anime fighting progression (Em -> C -> D -> Bm/B7)
    # Bars 0..3 Intro: Em riff
    # Bars 4..11 Verse: Em -> C -> Am -> B7
    # Bars 12..15 Pre-Chorus: C -> D -> Em -> B7
    # Bars 16..31 Chorus: C -> D -> Em -> G -> C -> D -> B7 -> Em
    prog_verse = [40, 36, 33, 35]   # E2, C2, A1, B1
    prog_pre = [36, 38, 40, 35]     # C2, D2, E2, B1
    prog_chorus = [36, 38, 40, 43, 36, 38, 35, 40]  # C, D, Em, G, C, D, B7, Em

    # Lead melody phrases (beat offsets within 4-bar block) - soaring Japanese anime rock lines
    chorus_melody_a = [
        (0.0, 76, 1.5), (1.5, 79, 1.0), (2.5, 83, 1.5),
        (4.0, 81, 1.5), (5.5, 79, 1.0), (6.5, 78, 1.5),
        (8.0, 76, 1.0), (9.0, 79, 1.0), (10.0, 83, 1.0), (11.0, 84, 1.0),
        (12.0, 83, 2.0), (14.0, 79, 1.0), (15.0, 78, 1.0),
    ]
    chorus_melody_b = [
        (0.0, 76, 1.0), (1.0, 79, 1.0), (2.0, 84, 2.0),
        (4.0, 83, 1.0), (5.0, 81, 1.0), (6.0, 79, 1.0), (7.0, 78, 1.0),
        (8.0, 79, 1.5), (9.5, 78, 1.0), (10.5, 75, 1.5),
        (12.0, 76, 3.0), (15.0, 79, 1.0),
    ]
    verse_riff = [
        (0.0, 64, 0.5), (0.5, 67, 0.5), (1.0, 71, 0.5), (1.5, 72, 0.5),
        (2.0, 71, 0.75), (2.75, 67, 0.75), (3.5, 66, 0.5),
    ]

    for bar in range(bars):
        t0 = bar * 4 * beat
        if bar < 4:
            root = 40 if bar < 3 else 35
            section = "intro"
        elif bar < 12:
            root = prog_verse[(bar - 4) % 4]
            section = "verse"
        elif bar < 16:
            root = prog_pre[(bar - 12) % 4]
            section = "pre"
        else:
            root = prog_chorus[(bar - 16) % 8]
            section = "chorus"

        # 1. Driving 8th-note Bass + Power Chord Guitar
        for eighth in range(8):
            et = t0 + eighth * (beat * 0.5)
            # Aggressive galloping rhythm in intro/chorus
            g_gain = 0.66 if section in ("intro", "chorus") else 0.45
            if section != "pre" or eighth % 2 == 0:
                b_note = root + (12 if eighth in (3, 7) else 0)
                b_sig = synth_bass(b_note, beat * 0.44)
                add_stereo(buf, et, b_sig, b_sig, pan=0.0, gain=0.72)

            if section in ("intro", "chorus"):
                if eighth in (0, 2, 3, 4, 6, 7):
                    gl, gr = synth_power_guitar(root + 12, beat * 0.45, drive=5.8)
                    add_stereo(buf, et, gl, gr, pan=0.0, gain=g_gain)
            elif section == "verse" and eighth in (0, 3, 6):
                gl, gr = synth_power_guitar(root + 12, beat * 0.55, drive=4.6)
                add_stereo(buf, et, gl, gr, pan=0.0, gain=0.48)
            elif section == "pre" and eighth in (0, 2, 4, 6):
                gl, gr = synth_power_guitar(root + 12, beat * 0.48, drive=5.4)
                add_stereo(buf, et, gl, gr, pan=0.0, gain=0.58)

        # 2. High-energy Rock Drums (Double-kick in chorus!)
        if bar in (0, 4, 12, 16, 20, 24, 28):
            add_stereo(buf, t0, crash_l, crash_r, pan=0.2, gain=0.65)

        for b in range(4):
            bt = t0 + b * beat
            if section == "chorus":
                # Fast double-kick punch
                add_stereo(buf, bt, kick, kick, pan=0.0, gain=0.92)
                if b in (0, 2):
                    add_stereo(buf, bt + beat * 0.5, kick, kick, pan=0.0, gain=0.82)
                else:
                    add_stereo(buf, bt + beat * 0.75, kick, kick, pan=0.0, gain=0.78)
                if b in (1, 3):
                    add_stereo(buf, bt, snare, snare, pan=0.0, gain=0.88)
                add_stereo(buf, bt, hat_o if b == 3 else hat_c, hat_o if b == 3 else hat_c, pan=-0.35, gain=0.55)
                add_stereo(buf, bt + beat * 0.5, hat_c, hat_c, pan=-0.35, gain=0.48)
            elif section == "pre":
                # Tension snare buildup on bar 15
                add_stereo(buf, bt, kick, kick, pan=0.0, gain=0.86)
                if bar == 15 and b >= 2:
                    for sub in range(4):
                        add_stereo(buf, bt + sub * beat * 0.25, snare, snare, pan=0.0, gain=0.65 + sub * 0.08)
                elif b in (1, 3):
                    add_stereo(buf, bt, snare, snare, pan=0.0, gain=0.82)
            else:
                if b in (0, 2) or (b == 1 and bar % 2 == 1):
                    add_stereo(buf, bt, kick, kick, pan=0.0, gain=0.85)
                if b in (1, 3):
                    add_stereo(buf, bt, snare, snare, pan=0.0, gain=0.80)
                add_stereo(buf, bt, hat_c, hat_c, pan=-0.3, gain=0.5)
                add_stereo(buf, bt + beat * 0.5, hat_c, hat_c, pan=-0.3, gain=0.4)

        # 3. Pad support in Pre-chorus & Chorus
        if section in ("pre", "chorus"):
            chord_tones = [root + 12, root + 19, root + 24, root + 27 if root != 38 and root != 36 and root != 43 else root + 28]
            pl, pr = synth_pad_chord(chord_tones, 4 * beat + 0.15)
            add_stereo(buf, t0, pl, pr, pan=0.0, gain=0.45)

        # 4. Japanese Koto rapid accents in Intro & Verse
        if section in ("intro", "verse"):
            for pos, mn, nd in verse_riff:
                kt = synth_koto(mn + (12 if section == "intro" else 0), nd * beat + 0.2, bright=0.996)
                add_stereo(buf, t0 + pos * beat, kt, kt, pan=0.4, gain=0.52)

    # 5. Soaring Dual SuperSaw Anime Lead Melody across Chorus (bars 16..31)
    for block_idx, base_bar in enumerate([16, 20, 24, 28]):
        bt0 = base_bar * 4 * beat
        mel = chorus_melody_a if block_idx % 2 == 0 else chorus_melody_b
        for pos, mn, nd in mel:
            sl, sr = synth_supersaw(mn, nd * beat, detune_cents=18.0, brightness=6800.0)
            add_stereo(buf, bt0 + pos * beat, sl, sr, pan=-0.12, gain=0.72)
            # Harmony third/fifth layer on second pass of chorus!
            if block_idx >= 2:
                hl, hr = synth_supersaw(mn - 5, nd * beat, detune_cents=14.0, brightness=4800.0)
                add_stereo(buf, bt0 + pos * beat, hl, hr, pan=0.22, gain=0.38)

    # High-energy synth stab motif in Intro
    for pos, mn, nd in [(0.0, 76, 0.7), (1.0, 79, 0.7), (2.0, 83, 1.0), (3.0, 86, 1.0)]:
        sl, sr = synth_supersaw(mn, nd * beat, detune_cents=16.0, brightness=6200.0)
        add_stereo(buf, pos * beat, sl, sr, pan=0.0, gain=0.6)
        add_stereo(buf, 8 * beat + pos * beat, sl, sr, pan=0.0, gain=0.6)

    buf = fft_reverb(buf, decay_sec=0.95, wet=0.19)
    n_loop = int(SR * loop_dur)
    out = buf[:n_loop].copy()
    tail_len = min(int(SR * tail), buf.shape[0] - n_loop, n_loop)
    out[:tail_len] += buf[n_loop:n_loop + tail_len]
    return master_limit(out)


# ==============================================================================
# BGM 3: VICTORY FANFARE
# ==============================================================================
def build_bgm_victory() -> np.ndarray:
    bpm = 136.0
    beat = 60.0 / bpm
    dur = 13.5
    buf = np.zeros((int(SR * dur), 2), dtype=np.float32)
    kick = make_kick()
    snare = make_snare()
    crash_l, crash_r = make_crash()

    # Triumphant anime brass/synth progression: C -> G/B -> Am -> F -> G -> Cmaj7
    fanfare = [
        (0.0, 72, 0.5), (0.5, 74, 0.5), (1.0, 76, 1.0), (2.0, 79, 1.0), (3.0, 84, 2.0),
        (5.0, 83, 0.75), (5.75, 81, 0.75), (6.5, 79, 1.5),
        (8.0, 77, 1.0), (9.0, 79, 1.0), (10.0, 81, 1.5), (11.5, 83, 1.5), (13.0, 84, 4.0),
    ]
    chords = [
        (0.0, [48, 55, 60, 64, 67], 4.0),
        (4.0, [47, 55, 59, 62, 67], 4.0),
        (8.0, [45, 52, 57, 60, 64], 2.0),
        (10.0, [41, 48, 53, 57, 60], 2.0),
        (12.0, [43, 50, 55, 59, 62], 1.5),
        (13.5, [48, 55, 60, 64, 71], 6.0),
    ]
    for b_pos, notes, b_len in chords:
        pl, pr = synth_pad_chord(notes, b_len * beat + 0.5)
        add_stereo(buf, b_pos * beat, pl, pr, pan=0.0, gain=0.72)
        b_sig = synth_bass(notes[0] - 12, b_len * beat)
        add_stereo(buf, b_pos * beat, b_sig, b_sig, pan=0.0, gain=0.65)
        add_stereo(buf, b_pos * beat, crash_l, crash_r, pan=0.0, gain=0.45 if b_pos in (0.0, 13.5) else 0.25)

    for b_pos, mn, b_len in fanfare:
        sl, sr = synth_supersaw(mn, b_len * beat, detune_cents=15.0, brightness=6400.0)
        add_stereo(buf, b_pos * beat, sl, sr, pan=0.0, gain=0.75)

    for b in range(20):
        t = b * beat
        if t + 0.3 >= dur:
            break
        if b % 2 == 0:
            add_stereo(buf, t, kick, kick, pan=0.0, gain=0.75)
        else:
            add_stereo(buf, t, snare, snare, pan=0.0, gain=0.65)

    # Koto victory shimmer arpeggio at end
    for i, mn in enumerate([72, 76, 79, 84, 88, 91]):
        kt = synth_koto(mn, 2.2)
        add_stereo(buf, 13.5 * beat + i * 0.09, kt, kt, pan=-0.3 + i * 0.12, gain=0.45)

    buf = fft_reverb(buf, decay_sec=1.6, wet=0.28)
    fade_out = int(SR * 1.2)
    buf[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]
    return master_limit(buf)


# ==============================================================================
# LAYERED FIGHTING GAME SFX GENERATORS
# ==============================================================================
def sfx_ui_move() -> np.ndarray:
    dur = 0.08
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    sig = (np.sin(2 * np.pi * 1180 * t) * 0.6 + np.sin(2 * np.pi * 1770 * t) * 0.4) * np.exp(-t * 55)
    return np.stack([sig, sig], axis=-1) * 0.55


def sfx_ui_confirm() -> np.ndarray:
    dur = 0.28
    buf = np.zeros((int(SR * dur), 2), dtype=np.float32)
    for i, m in enumerate([76, 83, 88]):
        sl, sr = synth_supersaw(m, 0.2, detune_cents=8.0, brightness=6000.0)
        add_stereo(buf, i * 0.035, sl, sr, pan=(-0.3 + i * 0.3), gain=0.55)
    return master_limit(fft_reverb(buf, 0.35, 0.2))


def sfx_ui_cancel() -> np.ndarray:
    dur = 0.18
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    freq = 680.0 - 320.0 * (t / dur)
    sig = np.sin(np.cumsum(2 * np.pi * freq / SR)) * np.exp(-t * 22)
    return np.stack([sig, sig], axis=-1) * 0.55


def sfx_ui_lock() -> np.ndarray:
    """Crisp metallic katana unsheathe + chime on character lock."""
    dur = 0.55
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(701)
    shing = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 2800, 10500) * np.exp(-t * 9.0) * 0.45
    ring = (np.sin(2 * np.pi * 2420 * t) + 0.6 * np.sin(2 * np.pi * 3840 * t)) * np.exp(-t * 7.5) * 0.4
    punch = make_kick()
    buf = np.zeros((n, 2), dtype=np.float32)
    add_stereo(buf, 0.0, shing + ring, shing + ring * 0.9, gain=0.8)
    add_stereo(buf, 0.0, punch, punch, gain=0.75)
    return master_limit(fft_reverb(buf, 0.5, 0.22))


def sfx_vs_clash() -> np.ndarray:
    dur = 1.25
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(702)
    boom = np.sin(np.cumsum(2 * np.pi * (150 * np.exp(-t * 7) + 38) / SR)) * np.exp(-t * 3.2) * 0.9
    crack = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 900, 9500) * np.exp(-t * 14) * 0.85
    metal = (np.sin(2 * np.pi * 1950 * t) + np.sin(2 * np.pi * 3110 * t)) * np.exp(-t * 4.5) * 0.35
    buf = np.stack([boom + crack + metal, boom + crack * 0.95 + metal], axis=-1)
    return master_limit(fft_reverb(buf, 0.9, 0.25))


def sfx_whoosh(pitch_hi: float = 1800, pitch_lo: float = 280, dur: float = 0.22, metallic: float = 0.2) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(int(pitch_hi))
    noise = rng.standard_normal(n).astype(np.float32)
    # Time-varying sweep approximation using dual bands
    lo_part = biquad_bandpass(noise, pitch_lo * 0.6, pitch_lo * 2.2) * np.sin(np.pi * t / dur)
    hi_part = biquad_bandpass(noise, pitch_hi * 0.5, pitch_hi * 1.4) * np.exp(-t * (10.0 / dur * 0.2)) * np.sin(np.pi * t / dur)
    blade = np.sin(np.cumsum(2 * np.pi * (pitch_hi * np.exp(-t * 8) + pitch_lo) / SR)) * np.exp(-t * 15) * metallic
    sig = lo_part * 0.65 + hi_part * 0.75 + blade
    return master_limit(np.stack([sig, np.roll(sig, 18)], axis=-1))


def sfx_hit(weight: str) -> np.ndarray:
    dur = {"light": 0.18, "medium": 0.28, "heavy": 0.42, "counter": 0.58}[weight]
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng({"light": 11, "medium": 22, "heavy": 33, "counter": 44}[weight])
    # Layer 1: Low sub punch
    f_start = {"light": 210, "medium": 175, "heavy": 150, "counter": 185}[weight]
    f_end = {"light": 75, "medium": 55, "heavy": 40, "counter": 36}[weight]
    decay = {"light": 24, "medium": 14, "heavy": 9, "counter": 7}[weight]
    sub = np.sin(np.cumsum(2 * np.pi * (f_end + (f_start - f_end) * np.exp(-t * 42)) / SR)) * np.exp(-t * decay)
    # Layer 2: Crisp flesh/armor transient crunch
    snap = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 750, 7500) * np.exp(-t * (38 if weight == "light" else 22))
    # Layer 3: Blade / Counter metallic bell resonance
    metal = np.zeros(n, dtype=np.float32)
    if weight in ("heavy", "counter"):
        metal += (np.sin(2 * np.pi * 1480 * t) + 0.7 * np.sin(2 * np.pi * 2650 * t)) * np.exp(-t * 12) * 0.35
    if weight == "counter":
        # Glass/bell counter shatter chime
        metal += (np.sin(2 * np.pi * 3200 * t) + np.sin(2 * np.pi * 4150 * t)) * np.exp(-t * 8) * 0.45
    combined = np.tanh((sub * 1.1 + snap * 0.9 + metal) * (1.3 if weight in ("heavy", "counter") else 1.0))
    buf = np.stack([combined, np.roll(combined, 11)], axis=-1)
    return master_limit(fft_reverb(buf, 0.35 if weight != "counter" else 0.75, 0.16 if weight != "counter" else 0.25))


def sfx_guard() -> np.ndarray:
    dur = 0.22
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(555)
    clang = (np.sin(2 * np.pi * 1240 * t) + 0.8 * np.sin(2 * np.pi * 1890 * t) + 0.5 * np.sin(2 * np.pi * 3140 * t)) * np.exp(-t * 20)
    sparks = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 3200, 11500) * np.exp(-t * 28) * 0.65
    thud = np.sin(2 * np.pi * 110 * t) * np.exp(-t * 26) * 0.5
    sig = clang * 0.55 + sparks + thud
    return master_limit(fft_reverb(np.stack([sig, np.roll(sig, 14)], axis=-1), 0.3, 0.18))


def sfx_projectile(kind: str) -> np.ndarray:
    dur = 0.42
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(601 if kind == "sakura" else 602)
    if kind == "sakura":
        f = 950 * np.exp(-t * 6.5) + 210
        tone = bandlimited_saw(420, dur) * np.exp(-t * 9) * 0.4 + np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t * 8) * 0.55
        air = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 1400, 8000) * np.exp(-t * 11) * 0.45
        sig = tone + air
    else:
        # Crystalline astral beam burst
        f = 1850 * np.exp(-t * 8.0) + 460
        tone = np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t * 7) * 0.5
        chime = (np.sin(2 * np.pi * 2093 * t) + 0.5 * np.sin(2 * np.pi * 3136 * t)) * np.exp(-t * 10) * 0.42
        laser = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 2500, 12000) * np.exp(-t * 13) * 0.4
        sig = tone + chime + laser
    return master_limit(fft_reverb(np.stack([sig, np.roll(sig, 17)], axis=-1), 0.45, 0.22))


def sfx_special_surge(kind: str) -> np.ndarray:
    dur = 0.52
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(610 if kind == "dragon" else 611)
    if kind == "dragon":
        f = 220 + 1100 * (1.0 - np.exp(-t * 7.5))
        roar = np.tanh(bandlimited_saw(180, dur) * 2.5) * np.exp(-t * 4.5) * 0.4
        sweep = np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t * 5.2) * 0.55
        flame = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 600, 6200) * np.exp(-t * 4.2) * 0.65
        sig = roar + sweep + flame
    else:
        # Spiral drill
        lfo = 1.0 + 0.35 * np.sin(2 * np.pi * 24 * t)
        f = (320 + 680 * np.sin(np.pi * t / dur)) * lfo
        sig = np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t * 4.0) * 0.55
        sig += biquad_bandpass(rng.standard_normal(n).astype(np.float32), 1800, 9500) * lfo * np.exp(-t * 5.0) * 0.45
    return master_limit(fft_reverb(np.stack([sig, np.roll(sig, 21)], axis=-1), 0.5, 0.22))


def sfx_super_flash() -> np.ndarray:
    """Iconic anime fighting game time-freeze vacuum pull -> blinding super flash burst!"""
    dur = 0.95
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(888)
    # Reverse vacuum rise 0.0 -> 0.24s, then massive bass/chime detonation at 0.24s
    rise_end = int(0.24 * SR)
    sig = np.zeros(n, dtype=np.float32)
    tr = t[:rise_end]
    f_rise = 240 + 1800 * (tr / 0.24) ** 2
    sig[:rise_end] = np.sin(np.cumsum(2 * np.pi * f_rise / SR)) * (tr / 0.24) * 0.65

    tb = t[rise_end:] - 0.24
    boom = np.sin(np.cumsum(2 * np.pi * (160 * np.exp(-tb * 8) + 42) / SR)) * np.exp(-tb * 3.5) * 0.9
    shimmer = (np.sin(2 * np.pi * 1760 * tb) + np.sin(2 * np.pi * 2640 * tb) + np.sin(2 * np.pi * 3520 * tb)) * np.exp(-tb * 4.5) * 0.38
    burst_n = biquad_bandpass(rng.standard_normal(len(tb)).astype(np.float32), 900, 11000) * np.exp(-tb * 9.0) * 0.65
    sig[rise_end:] = boom + shimmer + burst_n
    return master_limit(fft_reverb(np.stack([sig, np.roll(sig, 22)], axis=-1), 1.0, 0.26))


def sfx_super_finisher(kind: str) -> np.ndarray:
    dur = 1.35
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    buf = np.zeros((n, 2), dtype=np.float32)
    if kind == "rin":
        # 5 rapid crisscrossing dimensional slashes + massive finale boom
        for i, pos in enumerate([0.05, 0.16, 0.27, 0.38, 0.49]):
            w = sfx_whoosh(2400 + i * 250, 380, 0.18, 0.45)
            add_stereo(buf, pos, w[:, 0], w[:, 1], pan=-0.6 + i * 0.3, gain=0.8)
        boom = sfx_vs_clash()
        add_stereo(buf, 0.62, boom[:n - int(0.62 * SR), 0], boom[:n - int(0.62 * SR), 1], gain=0.95)
    else:
        # Crystalline lance barrage + orbital astral blast
        for i, pos in enumerate([0.05, 0.18, 0.31, 0.44]):
            p = sfx_projectile("star")
            add_stereo(buf, pos, p[:, 0], p[:, 1], pan=-0.5 + i * 0.33, gain=0.72)
        boom = sfx_vs_clash()
        add_stereo(buf, 0.56, boom[:n - int(0.56 * SR), 0], boom[:n - int(0.56 * SR), 1], gain=0.95)
    return master_limit(fft_reverb(buf, 1.1, 0.25))


def sfx_ko_finish() -> np.ndarray:
    dur = 1.6
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(999)
    sub = np.sin(np.cumsum(2 * np.pi * (145 * np.exp(-t * 5.5) + 32) / SR)) * np.exp(-t * 2.2) * 1.0
    crack = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 450, 8800) * np.exp(-t * 6.5) * 0.85
    bell = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t)) * np.exp(-t * 2.8) * 0.35
    buf = np.stack([sub + crack + bell, sub + np.roll(crack, 25) + bell], axis=-1)
    return master_limit(fft_reverb(buf, 1.4, 0.3))


def sfx_knockdown() -> np.ndarray:
    dur = 0.35
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(512)
    thump = np.sin(np.cumsum(2 * np.pi * (120 * np.exp(-t * 22) + 38) / SR)) * np.exp(-t * 10) * 0.9
    dust = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 180, 1400) * np.exp(-t * 14) * 0.6
    return master_limit(np.stack([thump + dust, thump + dust], axis=-1))


def sfx_footstep() -> np.ndarray:
    """Crisp subtle boot-on-stone tap for grounded walk cadence."""
    dur = 0.085
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(404)
    heel = np.sin(np.cumsum(2 * np.pi * (135 * np.exp(-t * 48) + 65) / SR)) * np.exp(-t * 45) * 0.55
    grit = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 1600, 4800) * np.exp(-t * 62) * 0.35
    sig = heel + grit
    return master_limit(np.stack([sig, np.roll(sig, 8)], axis=-1), ceiling=0.55)


def sfx_skid() -> np.ndarray:
    """Grounded boot-brake scrape on stone floor when stopping from a sprint dash."""
    dur = 0.18
    n = int(SR * dur)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(405)
    plant = np.sin(np.cumsum(2 * np.pi * (125 * np.exp(-t * 32) + 55) / SR)) * np.exp(-t * 26) * 0.55
    scrape = biquad_bandpass(rng.standard_normal(n).astype(np.float32), 950, 4200) * np.exp(-t * 18) * np.sin(np.pi * t / dur) * 0.72
    sig = plant + scrape
    return master_limit(np.stack([sig, np.roll(sig, 12)], axis=-1), ceiling=0.72)


def main() -> None:
    print("[Audio] Synthesizing BGM tracks...")
    write_mp3(os.path.join(OUT_DIR, "bgm_menu.mp3"), build_bgm_menu())
    print("  -> bgm_menu.mp3 ready")
    write_mp3(os.path.join(OUT_DIR, "bgm_battle.mp3"), build_bgm_battle())
    print("  -> bgm_battle.mp3 ready")
    write_mp3(os.path.join(OUT_DIR, "bgm_victory.mp3"), build_bgm_victory())
    print("  -> bgm_victory.mp3 ready")

    print("[Audio] Synthesizing 25 layered SFX...")
    sfx_map = {
        "ui_move.mp3": sfx_ui_move(),
        "ui_confirm.mp3": sfx_ui_confirm(),
        "ui_cancel.mp3": sfx_ui_cancel(),
        "ui_select_lock.mp3": sfx_ui_lock(),
        "vs_clash.mp3": sfx_vs_clash(),
        "dash.mp3": sfx_whoosh(1600, 220, 0.20, 0.05),
        "jump.mp3": sfx_whoosh(1200, 340, 0.16, 0.02),
        "land.mp3": sfx_knockdown() * 0.65,
        "slash_light.mp3": sfx_whoosh(2400, 360, 0.16, 0.35),
        "slash_heavy.mp3": sfx_whoosh(1950, 210, 0.29, 0.45),
        "spear_thrust.mp3": sfx_whoosh(2800, 320, 0.21, 0.42),
        "proj_sakura.mp3": sfx_projectile("sakura"),
        "proj_star.mp3": sfx_projectile("star"),
        "rising_dragon.mp3": sfx_special_surge("dragon"),
        "spiral_drill.mp3": sfx_special_surge("drill"),
        "hit_light.mp3": sfx_hit("light"),
        "hit_medium.mp3": sfx_hit("medium"),
        "hit_heavy.mp3": sfx_hit("heavy"),
        "hit_counter.mp3": sfx_hit("counter"),
        "guard_block.mp3": sfx_guard(),
        "knockdown.mp3": sfx_knockdown(),
        "footstep.mp3": sfx_footstep(),
        "skid.mp3": sfx_skid(),
        "super_flash.mp3": sfx_super_flash(),
        "super_rin_slash.mp3": sfx_super_finisher("rin"),
        "super_lia_beam.mp3": sfx_super_finisher("lia"),
        "ko_finish.mp3": sfx_ko_finish(),
    }
    for fname, audio in sfx_map.items():
        write_mp3(os.path.join(SFX_DIR, fname), audio)
    print(f"[Audio] Generated 3 BGMs and {len(sfx_map)} SFX successfully!")


if __name__ == "__main__":
    main()
