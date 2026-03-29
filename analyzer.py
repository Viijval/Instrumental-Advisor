import numpy as np
import librosa
import warnings
warnings.filterwarnings("ignore")

from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from hmmlearn import hmm

NOTE_NAMES  = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
CHORD_NAMES = ['C', 'Cm', 'D', 'Dm', 'E', 'Em', 'F', 'Fm', 'G', 'Gm', 'A', 'Am', 'B', 'Bm']
SECTION_NAMES = ['Intro/Outro', 'Verse', 'Chorus', 'Bridge', 'Pre-Chorus', 'Interlude', 'Section 7', 'Section 8']

MAJOR_PROFILE = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MINOR_PROFILE = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

MAJOR_TEMPLATE = np.array([1,0,0,0,1,0,0,1,0,0,0,0], dtype=float)
MINOR_TEMPLATE = np.array([1,0,0,1,0,0,0,1,0,0,0,0], dtype=float)


def detect_bpm(y, sr, hop_length):
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    tempo = float(np.squeeze(tempo))

    N, SEG = 150, 10 * sr
    bpm_samples = []
    for _ in range(N):
        start = np.random.randint(0, max(1, len(y) - SEG))
        t, _ = librosa.beat.beat_track(y=y[start:start + SEG], sr=sr)
        bpm_samples.append(float(np.squeeze(t)))

    bpm_samples = np.array(bpm_samples)
    return {
        "bpm": round(float(np.mean(bpm_samples)), 1),
        "bpm_std": round(float(np.std(bpm_samples)), 2),
        "bpm_ci_low": round(float(np.percentile(bpm_samples, 2.5)), 1),
        "bpm_ci_high": round(float(np.percentile(bpm_samples, 97.5)), 1),
        "bpm_histogram": bpm_samples.tolist(),
        "practice_bpm": int(float(np.mean(bpm_samples)) * 0.8),
    }


def detect_key(chroma):
    chroma_mean = np.mean(chroma, axis=1)
    best_key, best_mode, best_corr = None, None, -np.inf
    for i in range(12):
        for profile, mode in [(MAJOR_PROFILE, "Major"), (MINOR_PROFILE, "Minor")]:
            corr = np.corrcoef(chroma_mean, np.roll(profile, i))[0, 1]
            if corr > best_corr:
                best_corr, best_key, best_mode = corr, NOTE_NAMES[i], mode
    return best_key, best_mode, round(float(best_corr), 3)


def segment_song(features_scaled, rms, optimal_k):
    gmm = GaussianMixture(n_components=optimal_k, covariance_type='diag',
                          random_state=42, max_iter=500)
    gmm.fit(features_scaled)
    labels = gmm.predict(features_scaled)

    label_energy = sorted(
        [(l, float(np.mean(rms[labels == l]))) for l in range(optimal_k)],
        key=lambda x: x[1]
    )
    label_map = {orig: SECTION_NAMES[i] for i, (orig, _) in enumerate(label_energy)}
    named = [label_map[l] for l in labels]

    sil = float(silhouette_score(features_scaled, labels, sample_size=2000, random_state=42))

    unique, counts = np.unique(named, return_counts=True)
    distribution = {u: round(100 * c / len(named), 1) for u, c in zip(unique, counts)}

    return named, labels, sil, distribution


def predict_chords(chroma_T):
    chord_templates = {}
    for i, n in enumerate(NOTE_NAMES):
        chord_templates[n]       = np.roll(MAJOR_TEMPLATE, i)
        chord_templates[n + 'm'] = np.roll(MINOR_TEMPLATE, i)

    model = hmm.GaussianHMM(n_components=len(CHORD_NAMES), covariance_type='diag',
                             n_iter=100, random_state=42)
    model.means_init = np.array([chord_templates[c] for c in CHORD_NAMES])
    model.fit(chroma_T)

    log_prob, chord_seq = model.decode(chroma_T, algorithm='viterbi')
    chord_names_seq = [CHORD_NAMES[i] for i in chord_seq]

    counts = {}
    for c in chord_names_seq:
        counts[c] = counts.get(c, 0) + 1
    top_chords = sorted(counts.items(), key=lambda x: -x[1])[:6]

    transitions = sum(1 for i in range(1, len(chord_seq)) if chord_seq[i] != chord_seq[i-1])
    stability   = round(1 - transitions / len(chord_seq), 3)

    return {
        "top_chords": [{"chord": c, "count": n} for c, n in top_chords],
        "chord_timeline": chord_names_seq[::4],
        "stability": stability,
        "log_likelihood": round(float(log_prob), 2),
        "transition_matrix": model.transmat_.tolist(),
    }


def instrument_advice(bpm, key, mode, top_chords):
    scale = f"{key} {'Major' if mode == 'Major' else 'Minor'} Pentatonic"
    capo_map = {'C':0,'G':0,'D':0,'A':0,'E':0,'F':1,'A#':3,'G#':4,'D#':6,'C#':9,'B':2,'F#':2}
    capo = capo_map.get(key, 0)
    top3 = [c["chord"] for c in top_chords[:3]]

    if bpm < 70:    strum = "Slow ballad strumming — D DU UDU pattern"
    elif bpm < 100: strum = "Medium groove — D D DU pattern"
    elif bpm < 130: strum = "Upbeat strumming — DDUUDU pattern"
    else:           strum = "Fast — try palm muting on downstrokes"

    if bpm < 70:    piano_style = "Slow arpeggios — broken chord voicings"
    elif bpm < 100: piano_style = "Medium blocked chords with melody in right hand"
    elif bpm < 130: piano_style = "Rhythmic comping — offbeat chord stabs"
    else:           piano_style = "Fast — try octave bass notes in left hand"

    if bpm < 70:    drum_pattern = "Half-time feel — kick on 1, snare on 3"
    elif bpm < 100: drum_pattern = "Standard rock — kick 1&3, snare 2&4"
    elif bpm < 130: drum_pattern = "Driving 8th note hi-hat pattern"
    else:           drum_pattern = "Fast 16th note hi-hats — punk/metal feel"

    if bpm < 70:    bass_style = "Root note sustain with slow walking lines"
    elif bpm < 100: bass_style = "Root-fifth patterns following chord changes"
    elif bpm < 130: bass_style = "Rhythmic 8th note groove locking with kick"
    else:           bass_style = "16th note driving bassline — stay tight with drums"

    return {
        "guitar": {"tip": strum, "scale": scale, "capo": capo, "top3_chords": top3},
        "piano":  {"tip": piano_style, "scale": scale, "top3_chords": top3},
        "drums":  {"tip": drum_pattern, "top3_chords": top3},
        "bass":   {"tip": bass_style, "scale": scale, "top3_chords": top3},
    }


def analyze_audio(path: str) -> dict:
    HOP = 512
    y, sr = librosa.load(path, mono=True, duration=90)
    duration = float(librosa.get_duration(y=y, sr=sr))

    mfcc        = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=HOP)
    mfcc_delta  = librosa.feature.delta(mfcc)
    chroma      = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    rms         = librosa.feature.rms(y=y, hop_length=HOP)[0]

    features_scaled = StandardScaler().fit_transform(
        np.vstack([mfcc, mfcc_delta, chroma]).T
    )

    waveform_ds = y[::512].tolist()
    chroma_ds   = chroma[:, ::4].tolist()

    bic_scores = []
    K_RANGE = range(2, 7)
    for k in K_RANGE:
        g = GaussianMixture(n_components=k, covariance_type='diag', random_state=42, max_iter=200)
        g.fit(features_scaled)
        bic_scores.append(g.bic(features_scaled))
    optimal_k = list(K_RANGE)[int(np.argmin(bic_scores))]

    bpm_data        = detect_bpm(y, sr, HOP)
    key, mode, corr = detect_key(chroma)
    named_labels, seg_labels, sil, seg_dist = segment_song(features_scaled, rms, optimal_k)
    chord_data      = predict_chords(chroma.T)
    advice          = instrument_advice(bpm_data["bpm"], key, mode, chord_data["top_chords"])

    frame_times = librosa.frames_to_time(
        np.arange(0, len(named_labels), 4), sr=sr, hop_length=HOP
    ).tolist()
    segment_timeline = named_labels[::4]

    return {
        "duration": round(duration, 1),
        "waveform": waveform_ds,
        "chroma": chroma_ds,
        "bpm": bpm_data,
        "key": {"note": key, "mode": mode, "confidence": corr},
        "segments": {
            "optimal_k": optimal_k,
            "silhouette": round(sil, 3),
            "distribution": seg_dist,
            "timeline": segment_timeline,
            "frame_times": frame_times,
        },
        "chords": chord_data,
        "advice": advice,
        "bic_scores": [round(b, 1) for b in bic_scores],
        "bic_k_range": list(K_RANGE),
    }
