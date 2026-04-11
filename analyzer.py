import numpy as np
import librosa
import warnings
from scipy.ndimage import median_filter
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from hmmlearn import hmm

warnings.filterwarnings("ignore")

# ── Constants ──────────────────────────────────────────────────────────────────

NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

KS_MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
KS_MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

MAJOR_T = np.array([1,0,0,0,1,0,0,1,0,0,0,0], dtype=float)
MINOR_T = np.array([1,0,0,1,0,0,0,1,0,0,0,0], dtype=float)

DIATONIC = {
    'C major':  ['C','Dm','Em','F','G','Am'],
    'C# major': ['C#','D#m','Fm','F#','G#','A#m'],
    'D major':  ['D','Em','F#m','G','A','Bm'],
    'D# major': ['D#','Fm','Gm','G#','A#','Cm'],
    'E major':  ['E','F#m','G#m','A','B','C#m'],
    'F major':  ['F','Gm','Am','A#','C','Dm'],
    'F# major': ['F#','G#m','A#m','B','C#','D#m'],
    'G major':  ['G','Am','Bm','C','D','Em'],
    'G# major': ['G#','A#m','Cm','C#','D#','Fm'],
    'A major':  ['A','Bm','C#m','D','E','F#m'],
    'A# major': ['A#','Cm','Dm','D#','F','Gm'],
    'B major':  ['B','C#m','D#m','E','F#','G#m'],
    'C minor':  ['Cm','D#','Fm','Gm','G#','A#'],
    'C# minor': ['C#m','E','F#m','G#m','A','B'],
    'D minor':  ['Dm','F','Gm','Am','A#','C'],
    'D# minor': ['D#m','F#','G#m','A#m','B','C#'],
    'E minor':  ['Em','G','Am','Bm','C','D'],
    'F minor':  ['Fm','G#','A#m','Cm','C#','D#'],
    'F# minor': ['F#m','A','Bm','C#m','D','E'],
    'G minor':  ['Gm','A#','Cm','Dm','D#','F'],
    'G# minor': ['G#m','B','C#m','D#m','E','F#'],
    'A minor':  ['Am','C','Dm','Em','F','G'],
    'A# minor': ['A#m','C#','D#m','Fm','F#','G#'],
    'B minor':  ['Bm','D','Em','F#m','G','A'],
}

# Chord fingerings: (fret positions for E A D G B e strings), barre fret
CHORD_FINGERINGS = {
    'C':   {'frets': [-1,3,2,0,1,0], 'barre': 0},
    'Cm':  {'frets': [-1,3,5,5,4,3], 'barre': 3},
    'D':   {'frets': [-1,-1,0,2,3,2], 'barre': 0},
    'Dm':  {'frets': [-1,-1,0,2,3,1], 'barre': 0},
    'E':   {'frets': [0,2,2,1,0,0], 'barre': 0},
    'Em':  {'frets': [0,2,2,0,0,0], 'barre': 0},
    'F':   {'frets': [1,3,3,2,1,1], 'barre': 1},
    'Fm':  {'frets': [1,3,3,1,1,1], 'barre': 1},
    'G':   {'frets': [3,2,0,0,0,3], 'barre': 0},
    'Gm':  {'frets': [3,5,5,3,3,3], 'barre': 3},
    'A':   {'frets': [-1,0,2,2,2,0], 'barre': 0},
    'Am':  {'frets': [-1,0,2,2,1,0], 'barre': 0},
    'B':   {'frets': [-1,2,4,4,4,2], 'barre': 2},
    'Bm':  {'frets': [-1,2,4,4,3,2], 'barre': 2},
    'A#':  {'frets': [-1,1,3,3,3,1], 'barre': 1},
    'A#m': {'frets': [-1,1,3,3,2,1], 'barre': 1},
    'D#':  {'frets': [-1,-1,1,3,4,3], 'barre': 0},
    'D#m': {'frets': [-1,-1,1,3,4,2], 'barre': 0},
    'G#':  {'frets': [4,6,6,5,4,4], 'barre': 4},
    'G#m': {'frets': [4,6,6,4,4,4], 'barre': 4},
    'C#':  {'frets': [-1,4,6,6,6,4], 'barre': 4},
    'C#m': {'frets': [-1,4,6,6,5,4], 'barre': 4},
    'F#':  {'frets': [2,4,4,3,2,2], 'barre': 2},
    'F#m': {'frets': [2,4,4,2,2,2], 'barre': 2},
}

# Piano voicings: MIDI note offsets from middle C (C4=60)
PIANO_VOICINGS = {
    'C':   [0,4,7],       'Cm':  [0,3,7],
    'D':   [2,6,9],       'Dm':  [2,5,9],
    'E':   [4,8,11],      'Em':  [4,7,11],
    'F':   [5,9,12],      'Fm':  [5,8,12],
    'G':   [7,11,14],     'Gm':  [7,10,14],
    'A':   [9,13,16],     'Am':  [9,12,16],
    'B':   [11,15,18],    'Bm':  [11,14,18],
    'A#':  [10,14,17],    'A#m': [10,13,17],
    'D#':  [3,7,10],      'D#m': [3,6,10],
    'G#':  [8,12,15],     'G#m': [8,11,15],
    'C#':  [1,5,8],       'C#m': [1,4,8],
    'F#':  [6,10,13],     'F#m': [6,9,13],
}

SECTION_NAMES = ['Intro/Outro','Verse','Pre-Chorus','Chorus','Bridge','Interlude']

# Valence/tension profiles per chord quality (for mood)
CHORD_TENSION = {
    'major': 0.2, 'minor': 0.6, 'dim': 0.9,
}

ARPEGGIO_PATTERNS = {
    'slow':   {'name': 'Slow ballad', 'pattern': 'p i m a m i', 'bpm_range': '< 70'},
    'medium': {'name': 'Fingerpick', 'pattern': 'p i m i a m i', 'bpm_range': '70–100'},
    'upbeat': {'name': 'Travis pick', 'pattern': 'p(1) p(2) i m a m i', 'bpm_range': '100–130'},
    'fast':   {'name': 'Sweep', 'pattern': 'p i m a e a m i', 'bpm_range': '> 130'},
}


# ── Feature Extraction ─────────────────────────────────────────────────────────

def extract_features(y, sr, hop_length):
    y_harmonic, y_perc = librosa.effects.hpss(y, margin=4)

    mfcc       = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
    mfcc_delta = librosa.feature.delta(mfcc)
    chroma     = librosa.feature.chroma_cens(y=y_harmonic, sr=sr, hop_length=hop_length)
    rms        = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    spectral_contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length)

    features_scaled = StandardScaler().fit_transform(
        np.vstack([mfcc, mfcc_delta, chroma]).T
    )

    return chroma, rms, features_scaled, y_harmonic, spectral_contrast


# ── BPM Detection ──────────────────────────────────────────────────────────────

def detect_bpm(y, sr, hop_length):
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    tempo = float(np.squeeze(tempo))

    N, SEG = 150, 10 * sr
    samples = []
    for _ in range(N):
        start = np.random.randint(0, max(1, len(y) - SEG))
        t, _ = librosa.beat.beat_track(y=y[start:start+SEG], sr=sr)
        samples.append(float(np.squeeze(t)))

    samples = np.array(samples)
    mean_bpm = float(np.mean(samples))

    return {
        'bpm': round(mean_bpm, 1),
        'bpm_std': round(float(np.std(samples)), 2),
        'bpm_ci_low': round(float(np.percentile(samples, 2.5)), 1),
        'bpm_ci_high': round(float(np.percentile(samples, 97.5)), 1),
        'bpm_histogram': samples.tolist(),
        'practice_bpm': int(mean_bpm * 0.8),
    }


# ── Key Detection ──────────────────────────────────────────────────────────────

def detect_key(chroma):
    chroma_mean = chroma.mean(axis=1)
    best_key, best_mode, best_corr = None, None, -np.inf
    for i in range(12):
        for profile, mode in [(KS_MAJOR, 'Major'), (KS_MINOR, 'Minor')]:
            corr = np.corrcoef(chroma_mean, np.roll(profile, i))[0, 1]
            if corr > best_corr:
                best_corr, best_key, best_mode = corr, NOTE_NAMES[i], mode
    return best_key, best_mode, round(float(best_corr), 3)


# ── Chord Prediction ───────────────────────────────────────────────────────────

def build_templates():
    templates = {}
    for i, n in enumerate(NOTE_NAMES):
        templates[n]       = np.roll(MAJOR_T, i)
        templates[n + 'm'] = np.roll(MINOR_T, i)
    return templates


def predict_chords(chroma, sr, hop_length, detected_key, detected_mode):
    key_str = f'{detected_key} {detected_mode}'
    chord_names = DIATONIC.get(key_str, ['Am','Em','G','C','Dm','F'])

    templates = build_templates()

    # Denoise + normalize chroma
    chroma_filtered = median_filter(chroma, size=(1, 5))
    chroma_norm = chroma_filtered / (chroma_filtered.sum(axis=0, keepdims=True) + 1e-6)
    chroma_T = chroma_norm.T

    means = np.array([templates[c] for c in chord_names])
    n = len(chord_names)

    transmat = np.full((n, n), 0.15 / (n - 1))
    np.fill_diagonal(transmat, 0.85)

    model = hmm.GaussianHMM(n_components=n, covariance_type='diag', n_iter=1, random_state=42)
    model.startprob_ = np.ones(n) / n
    model.transmat_  = transmat
    model.means_     = means
    model.covars_    = np.ones((n, 12)) * 0.4

    log_prob, state_seq = model.decode(chroma_T, algorithm='viterbi')
    chord_seq = [chord_names[i] for i in state_seq]

    # Smooth blips
    smoothed = list(state_seq)
    for i in range(1, len(smoothed) - 1):
        if smoothed[i] != smoothed[i-1] and smoothed[i] != smoothed[i+1]:
            smoothed[i] = smoothed[i-1]
    chord_names_smooth = [chord_names[i] for i in smoothed]

    # Chord counts
    counts = {}
    for c in chord_names_smooth:
        counts[c] = counts.get(c, 0) + 1
    top_chords = sorted(counts.items(), key=lambda x: -x[1])[:6]

    # Transition matrix
    trans_matrix = np.zeros((n, n))
    chord_to_idx = {c: i for i, c in enumerate(chord_names)}
    for i in range(1, len(chord_names_smooth)):
        a = chord_to_idx.get(chord_names_smooth[i-1])
        b = chord_to_idx.get(chord_names_smooth[i])
        if a is not None and b is not None:
            trans_matrix[a][b] += 1
    row_sums = trans_matrix.sum(axis=1, keepdims=True)
    trans_norm = np.divide(trans_matrix, row_sums, where=row_sums > 0)

    # Stability
    transitions = sum(1 for i in range(1, len(smoothed)) if smoothed[i] != smoothed[i-1])
    stability = round(1 - transitions / len(smoothed), 3)

    # Segments from smoothed sequence
    segments = []
    frame_times = librosa.frames_to_time(np.arange(len(chord_names_smooth)), sr=sr, hop_length=hop_length)
    seg_start = 0
    for i in range(1, len(chord_names_smooth)):
        if chord_names_smooth[i] != chord_names_smooth[i-1]:
            segments.append({'chord': chord_names_smooth[i-1], 'start': float(frame_times[seg_start]), 'end': float(frame_times[i])})
            seg_start = i
    segments.append({'chord': chord_names_smooth[-1], 'start': float(frame_times[seg_start]), 'end': float(frame_times[-1])})

    # Progression detection
    chord_list = [s['chord'] for s in segments]
    progressions = []
    for plen in [4, 3]:
        seen = {}
        for i in range(len(chord_list) - plen + 1):
            pat = tuple(chord_list[i:i+plen])
            seen[pat] = seen.get(pat, 0) + 1
        found = sorted([(list(p), c) for p, c in seen.items() if c >= 2], key=lambda x: -x[1])
        if found:
            progressions.extend([{'pattern': p, 'repeats': c, 'length': plen} for p, c in found[:2]])

    # Fingerings for top chords
    fingerings = {}
    for chord, _ in top_chords:
        if chord in CHORD_FINGERINGS:
            fingerings[chord] = CHORD_FINGERINGS[chord]

    # Piano voicings for top chords
    piano_voicings = {}
    for chord, _ in top_chords:
        if chord in PIANO_VOICINGS:
            piano_voicings[chord] = PIANO_VOICINGS[chord]

    return {
        'chord_names': chord_names,
        'top_chords': [{'chord': c, 'count': n} for c, n in top_chords],
        'chord_timeline': chord_names_smooth[::4],
        'segments': segments[::2],
        'progressions': progressions[:3],
        'stability': stability,
        'log_likelihood': round(float(log_prob), 2),
        'transition_matrix': {'matrix': trans_norm.tolist(), 'labels': chord_names},
        'fingerings': fingerings,
        'piano_voicings': piano_voicings,
    }


# ── Song Segmentation ──────────────────────────────────────────────────────────

def segment_song(features_scaled, rms):
    bic_scores = []
    K_RANGE = range(2, 7)
    for k in K_RANGE:
        g = GaussianMixture(n_components=k, covariance_type='diag', random_state=42, max_iter=200)
        g.fit(features_scaled)
        bic_scores.append(g.bic(features_scaled))
    optimal_k = list(K_RANGE)[int(np.argmin(bic_scores))]

    gmm = GaussianMixture(n_components=optimal_k, covariance_type='diag', random_state=42, max_iter=500)
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

    return named, optimal_k, round(sil, 3), distribution, [round(b, 1) for b in bic_scores], list(K_RANGE)


# ── Mood & Energy Arc ──────────────────────────────────────────────────────────

def analyze_mood(y, sr, rms, chroma, hop_length):
    # Valence: based on major vs minor chroma profile similarity per frame
    major_profile = KS_MAJOR / KS_MAJOR.max()
    minor_profile = KS_MINOR / KS_MINOR.max()

    valence = []
    for frame in chroma.T:
        frame_norm = frame / (frame.sum() + 1e-6)
        maj_sim = float(np.corrcoef(frame_norm, major_profile)[0, 1])
        min_sim = float(np.corrcoef(frame_norm, minor_profile)[0, 1])
        # +1 = very major (happy), -1 = very minor (sad)
        valence.append(round((maj_sim - min_sim) / 2, 3))

    # Energy: normalized RMS
    rms_norm = (rms - rms.min()) / (rms.max() - rms.min() + 1e-6)

    # Tension: spectral flux (rate of change)
    flux = np.sqrt(np.mean(np.diff(chroma, axis=1)**2, axis=0))
    flux_norm = (flux - flux.min()) / (flux.max() - flux.min() + 1e-6)
    flux_padded = np.append(flux_norm, flux_norm[-1])

    # Downsample all to ~100 points for frontend
    n_points = 100
    def downsample(arr):
        idx = np.linspace(0, len(arr)-1, n_points).astype(int)
        return [round(float(arr[i]), 3) for i in idx]

    val_ds  = downsample(np.array(valence))
    rms_ds  = downsample(rms_norm)
    flux_ds = downsample(flux_padded)

    # Overall mood label
    mean_valence = float(np.mean(valence))
    mean_energy  = float(np.mean(rms_norm))

    if mean_valence > 0.1 and mean_energy > 0.5:   mood = 'Energetic & Uplifting'
    elif mean_valence > 0.1 and mean_energy <= 0.5: mood = 'Calm & Happy'
    elif mean_valence <= 0.1 and mean_energy > 0.5: mood = 'Intense & Emotional'
    else:                                            mood = 'Melancholic & Reflective'

    return {
        'label': mood,
        'valence': val_ds,
        'energy': rms_ds,
        'tension': flux_ds,
        'mean_valence': round(mean_valence, 3),
        'mean_energy': round(mean_energy, 3),
    }


# ── Difficulty Score ───────────────────────────────────────────────────────────

def compute_difficulty(bpm, chord_data, key_confidence):
    top_chords = [c['chord'] for c in chord_data['top_chords']]

    # BPM difficulty (0–1)
    bpm_score = min(1.0, max(0.0, (bpm - 60) / 120))

    # Chord complexity: barre chords are harder
    barre_count = sum(1 for c in top_chords if c in CHORD_FINGERINGS and CHORD_FINGERINGS[c]['barre'] > 0)
    chord_score = min(1.0, barre_count / max(1, len(top_chords)))

    # Transition difficulty: how fast chords change
    stability = chord_data['stability']
    transition_score = 1 - stability

    # Key confidence inversely affects difficulty (clear key = easier to understand)
    clarity_score = 1 - key_confidence

    # Weighted total
    total = (bpm_score * 0.25 + chord_score * 0.35 + transition_score * 0.25 + clarity_score * 0.15)

    if total < 0.33:   level, label = 1, 'Beginner'
    elif total < 0.55: level, label = 2, 'Intermediate'
    elif total < 0.75: level, label = 3, 'Advanced'
    else:              level, label = 4, 'Expert'

    return {
        'score': round(total, 3),
        'level': level,
        'label': label,
        'breakdown': {
            'bpm_difficulty': round(bpm_score, 3),
            'chord_complexity': round(chord_score, 3),
            'transition_speed': round(transition_score, 3),
            'key_clarity': round(clarity_score, 3),
        }
    }


# ── Arpeggio Suggestions ───────────────────────────────────────────────────────

def get_arpeggio_suggestions(bpm, chord_data):
    if bpm < 70:     style = 'slow'
    elif bpm < 100:  style = 'medium'
    elif bpm < 130:  style = 'upbeat'
    else:            style = 'fast'

    pattern = ARPEGGIO_PATTERNS[style]
    top_chords = [c['chord'] for c in chord_data['top_chords'][:4]]

    # Per-chord arpeggio note order (based on chord tones)
    chord_arpeggios = {}
    for chord in top_chords:
        if chord in PIANO_VOICINGS:
            notes = PIANO_VOICINGS[chord]
            root_idx = NOTE_NAMES.index(chord.replace('m','')) if chord.replace('m','') in NOTE_NAMES else 0
            note_names_in_chord = [NOTE_NAMES[(root_idx + offset) % 12] for offset in [0, 3 if 'm' in chord else 4, 7]]
            chord_arpeggios[chord] = note_names_in_chord

    return {
        'style': style,
        'pattern_name': pattern['name'],
        'pattern': pattern['pattern'],
        'bpm_range': pattern['bpm_range'],
        'chord_arpeggios': chord_arpeggios,
    }


# ── Instrument Advice ──────────────────────────────────────────────────────────

def instrument_advice(bpm, key, mode, chord_data):
    scale = f'{key} {mode} Pentatonic'
    capo_map = {'C':0,'G':0,'D':0,'A':0,'E':0,'F':1,'A#':3,'G#':4,'D#':6,'C#':9,'B':2,'F#':2}
    capo = capo_map.get(key, 0)
    top3 = [c['chord'] for c in chord_data['top_chords'][:3]]

    if bpm < 70:    strum = 'Slow ballad — D DU UDU'
    elif bpm < 100: strum = 'Medium groove — D D DU'
    elif bpm < 130: strum = 'Upbeat — DDUUDU'
    else:           strum = 'Fast — try palm muting'

    if bpm < 70:    piano_style = 'Slow arpeggios — broken chord voicings'
    elif bpm < 100: piano_style = 'Medium blocked chords with melody in right hand'
    elif bpm < 130: piano_style = 'Rhythmic comping — offbeat chord stabs'
    else:           piano_style = 'Fast — octave bass notes in left hand'

    # Scale notes for fretboard
    scale_intervals = [0,2,4,5,7,9,11] if mode == 'Major' else [0,2,3,5,7,8,10]
    root_idx = NOTE_NAMES.index(key)
    scale_notes = [NOTE_NAMES[(root_idx + i) % 12] for i in scale_intervals]

    # Pentatonic (5 notes)
    penta_intervals = [0,2,4,7,9] if mode == 'Major' else [0,3,5,7,10]
    penta_notes = [NOTE_NAMES[(root_idx + i) % 12] for i in penta_intervals]

    return {
        'guitar': {
            'tip': strum, 'scale': scale, 'capo': capo,
            'top3_chords': top3, 'scale_notes': scale_notes, 'penta_notes': penta_notes,
        },
        'piano': {
            'tip': piano_style, 'scale': scale,
            'top3_chords': top3, 'scale_notes': scale_notes, 'penta_notes': penta_notes,
        },
    }


# ── NLP Title Extraction ───────────────────────────────────────────────────────

def extract_search_title(filename: str, key: str, mode: str, bpm: float) -> str:
    """Clean filename into a search-friendly song title."""
    import re
    name = filename.rsplit('.', 1)[0]  # remove extension
    # Remove common noise patterns
    name = re.sub(r'\(.*?\)|\[.*?\]', '', name)
    name = re.sub(r'\d{3,}kbps|official|audio|video|lyrics|hd|4k|ft\.?|feat\.?', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[-_]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


# ── Main Analysis ──────────────────────────────────────────────────────────────

def analyze_audio(path: str, original_filename: str = '') -> dict:
    HOP = 512
    y, sr = librosa.load(path, mono=True, duration=90)
    duration = float(librosa.get_duration(y=y, sr=sr))

    chroma, rms, features_scaled, y_harmonic, spectral_contrast = extract_features(y, sr, HOP)

    waveform_ds = y[::512].tolist()
    chroma_ds   = chroma[:, ::4].tolist()

    bpm_data               = detect_bpm(y, sr, HOP)
    key, mode, key_conf    = detect_key(chroma)
    named, opt_k, sil, seg_dist, bic_scores, bic_k = segment_song(features_scaled, rms)
    chord_data             = predict_chords(chroma, sr, HOP, key, mode)
    mood_data              = analyze_mood(y, sr, rms, chroma, HOP)
    difficulty             = compute_difficulty(bpm_data['bpm'], chord_data, key_conf)
    arpeggio               = get_arpeggio_suggestions(bpm_data['bpm'], chord_data)
    advice                 = instrument_advice(bpm_data['bpm'], key, mode, chord_data)

    frame_times = librosa.frames_to_time(np.arange(0, len(named), 4), sr=sr, hop_length=HOP).tolist()

    # NLP title for tab search
    fname = original_filename or path.split('/')[-1]
    search_title = extract_search_title(fname, key, mode, bpm_data['bpm'])

    return {
        'duration': round(duration, 1),
        'waveform': waveform_ds,
        'chroma': chroma_ds,
        'bpm': bpm_data,
        'key': {'note': key, 'mode': mode, 'confidence': key_conf},
        'segments': {
            'optimal_k': opt_k,
            'silhouette': sil,
            'distribution': seg_dist,
            'timeline': named[::4],
            'frame_times': frame_times,
            'bic_scores': bic_scores,
            'bic_k_range': bic_k,
        },
        'chords': chord_data,
        'mood': mood_data,
        'difficulty': difficulty,
        'arpeggio': arpeggio,
        'advice': advice,
        'search_title': search_title,
    }
