// ── State ───────────────────────────────────────────────────────────────────
let analysisData  = null;
let currentInst   = 'guitar';
let scaleMode     = 'penta';
let selectedRating = 0;
let stepInterval  = null;
const charts      = {};

const NOTE_NAMES   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const STRING_NOTES = ['E','B','G','D','A','E']; // high to low

const SEG_COLORS = {
  'Intro/Outro': '#60a5fa', 'Verse': '#a78bfa', 'Pre-Chorus': '#f472b6',
  'Chorus': '#00ff87',      'Bridge': '#f97316', 'Interlude': '#fbbf24',
};

// ── Tab Switch ───────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
}

// ── Instrument Switch ────────────────────────────────────────────────────────
function switchInstrument(inst) {
  currentInst = inst;
  document.querySelectorAll('.inst-btn').forEach(b => b.classList.toggle('active', b.dataset.inst === inst));
  if (analysisData) {
    renderChordDiagrams(analysisData);
    document.getElementById('instLabel').textContent = inst === 'guitar' ? 'Guitar fingerings' : 'Piano voicings';
  }
}

// ── File Handling ────────────────────────────────────────────────────────────
const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
let selectedFile = null;

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  const sel = document.getElementById('selectedFile');
  sel.style.display = 'block';
  sel.textContent = `${file.name}  (${(file.size/1024/1024).toFixed(1)} MB)`;
  document.getElementById('analyzeFileBtn').style.display = 'block';
}

// ── Loading ──────────────────────────────────────────────────────────────────
function animateSteps() {
  const steps = ['step1','step2','step3','step4'];
  let i = 0;
  steps.forEach(s => document.getElementById(s).className = 'step');
  stepInterval = setInterval(() => {
    if (i > 0) document.getElementById(steps[i-1]).className = 'step done';
    if (i < steps.length) { document.getElementById(steps[i]).className = 'step active'; i++; }
    else clearInterval(stepInterval);
  }, 1600);
}
function stopSteps() {
  clearInterval(stepInterval);
  ['step1','step2','step3','step4'].forEach(s => document.getElementById(s).className = 'step done');
}

function showLoading() {
  document.getElementById('inputSection').style.display  = 'none';
  document.getElementById('loadingScreen').style.display = 'block';
  document.getElementById('errorScreen').style.display   = 'none';
  document.getElementById('results').style.display       = 'none';
  animateSteps();
}
function showError(msg) {
  stopSteps();
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display   = 'block';
  document.getElementById('errorText').textContent = msg;
}
function resetUI() {
  document.getElementById('inputSection').style.display  = 'block';
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('errorScreen').style.display   = 'none';
  document.getElementById('results').style.display       = 'none';
  destroyCharts();
  analysisData = null;
  selectedFile = null;
  selectedRating = 0;
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('analyzeFileBtn').style.display = 'none';
  document.getElementById('ytUrl').value = '';
  document.getElementById('fbResponse').textContent = '';
}

// ── Analyze ──────────────────────────────────────────────────────────────────
async function analyzeFile() {
  if (!selectedFile) return;
  showLoading();
  const form = new FormData();
  form.append('file', selectedFile);
  try {
    const res  = await fetch('/analyze/file', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Analysis failed');
    stopSteps();
    analysisData = data;
    renderResults(data);
  } catch(e) { showError(e.message); }
}

async function analyzeYoutube() {
  const url = document.getElementById('ytUrl').value.trim();
  if (!url) return;
  showLoading();
  const form = new FormData();
  form.append('url', url);
  try {
    const res  = await fetch('/analyze/youtube', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Analysis failed');
    stopSteps();
    analysisData = data;
    renderResults(data);
  } catch(e) { showError(e.message); }
}

// ── Charts util ──────────────────────────────────────────────────────────────
function destroyCharts() {
  Object.values(charts).forEach(c => c?.destroy());
  Object.keys(charts).forEach(k => delete charts[k]);
}

const chartDefaults = {
  responsive: true,
  animation: false,
  plugins: { legend: { display: false } },
};

// ── Render All Results ───────────────────────────────────────────────────────
function renderResults(d) {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('results').style.display       = 'block';
  destroyCharts();

  // ── Top Stats ──
  document.getElementById('statBpm').textContent      = d.bpm.bpm;
  document.getElementById('statBpmCI').textContent    = `${d.bpm.bpm_ci_low}–${d.bpm.bpm_ci_high} CI`;
  document.getElementById('statKey').textContent      = `${d.key.note} ${d.key.mode}`;
  document.getElementById('statKeyConf').textContent  = `${(d.key.confidence*100).toFixed(0)}% confidence`;
  document.getElementById('statDiff').textContent     = d.difficulty.label;
  document.getElementById('statDiffScore').textContent = `Score: ${d.difficulty.score}`;
  document.getElementById('statMood').textContent     = d.mood.label;
  document.getElementById('statMoodSub').textContent  = `Valence: ${d.mood.mean_valence > 0 ? '+' : ''}${d.mood.mean_valence}`;
  document.getElementById('durationBadge').textContent = formatDuration(d.duration);

  // ── Waveform ──
  charts.waveform = new Chart(document.getElementById('waveformChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: d.waveform.map((_, i) => i),
      datasets: [{
        data: d.waveform,
        borderColor: '#00ff87',
        borderWidth: 1,
        pointRadius: 0,
        fill: true,
        backgroundColor: 'rgba(0,255,135,0.06)',
      }]
    },
    options: { ...chartDefaults, scales: { x: { display: false }, y: { display: false } } }
  });

  // ── Mood Arc ──
  const moodLabels = d.mood.valence.map((_, i) => i);
  charts.mood = new Chart(document.getElementById('moodChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: moodLabels,
      datasets: [
        { data: d.mood.valence, borderColor: '#00ff87', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, label: 'Valence' },
        { data: d.mood.energy,  borderColor: '#60a5fa', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, label: 'Energy'  },
        { data: d.mood.tension, borderColor: '#f97316', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4, label: 'Tension', borderDash: [4,4] },
      ]
    },
    options: {
      ...chartDefaults,
      scales: {
        x: { display: false },
        y: { min: -1, max: 1, ticks: { color: '#6b6b80', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

  // ── Chord Progression ──
  renderProgression(d);

  // ── Chord Chart ──
  const PASTEL = ['#00ff87','#60a5fa','#f97316','#a78bfa','#f472b6','#fbbf24'];
  charts.chord = new Chart(document.getElementById('chordChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: d.chords.top_chords.map(c => c.chord),
      datasets: [{
        data: d.chords.top_chords.map(c => c.count),
        backgroundColor: PASTEL.slice(0, d.chords.top_chords.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      scales: {
        x: { ticks: { color: '#6b6b80', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#e8e8f0', font: { size: 11, weight: 'bold', family: 'Space Mono' } }, grid: { display: false } }
      }
    }
  });

  // ── Scale Visualizer ──
  renderFretboard(d);

  // ── Chord Diagrams ──
  renderChordDiagrams(d);
  document.getElementById('scaleLabel').textContent = `${d.key.note} ${d.key.mode} — ${d.advice.guitar.scale}`;
  document.getElementById('instLabel').textContent = 'Guitar fingerings';

  // ── Arpeggio ──
  renderArpeggio(d);

  // ── Difficulty ──
  renderDifficulty(d);

  // ── Segments ──
  renderSegments(d);

  // ── Tab Links ──
  fetchTabLinks(d.search_title || (d.youtube_title || ''));

  // ── Feedback prefill ──
  document.getElementById('fbDetectedKey').value = `${d.key.note} ${d.key.mode}`;
  document.getElementById('fbSongTitle').value = d.search_title || (d.youtube_title || '');

  // Scroll to results
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Chord Progression ────────────────────────────────────────────────────────
function renderProgression(d) {
  const el = document.getElementById('progressionLoop');
  el.innerHTML = '';

  if (!d.chords.progressions || d.chords.progressions.length === 0) {
    el.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">No strong repeating progression detected</span>';
    document.getElementById('progressionSub').textContent = '';
    return;
  }

  const top = d.chords.progressions[0];
  document.getElementById('progressionSub').textContent = `${top.length}-chord loop · repeats ${top.repeats}×`;

  top.pattern.forEach((chord, i) => {
    const chip = document.createElement('div');
    chip.className = 'prog-chord';
    chip.textContent = chord;
    el.appendChild(chip);
    if (i < top.pattern.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'prog-arrow';
      arrow.textContent = '→';
      el.appendChild(arrow);
    }
  });

  const loop = document.createElement('span');
  loop.className = 'prog-loop-icon';
  loop.textContent = '↺ loop';
  el.appendChild(loop);
}

// ── Fretboard ────────────────────────────────────────────────────────────────
function renderFretboard(d) {
  window._fretboardData = d;
  showScale(scaleMode);
}

function showScale(mode) {
  scaleMode = mode;
  document.getElementById('togPenta').classList.toggle('active', mode === 'penta');
  document.getElementById('togFull').classList.toggle('active', mode === 'full');

  const d = window._fretboardData;
  if (!d) return;

  const notes = mode === 'penta' ? d.advice.guitar.penta_notes : d.advice.guitar.scale_notes;
  const root  = d.key.note;

  const fb = document.getElementById('fretboard');
  fb.innerHTML = '';

  // String notes from high E to low E
  const openNotes = ['E','B','G','D','A','E'];
  const noteIdx   = n => NOTE_NAMES.indexOf(n);

  openNotes.forEach((open, si) => {
    const row = document.createElement('div');
    row.className = 'fret-string';

    const lbl = document.createElement('div');
    lbl.className = 'string-label';
    lbl.textContent = open;
    row.appendChild(lbl);

    for (let f = 0; f <= 11; f++) {
      const cell = document.createElement('div');
      cell.className = 'fret-cell';
      const note = NOTE_NAMES[(noteIdx(open) + f) % 12];
      if (notes.includes(note)) {
        const dot = document.createElement('div');
        dot.className = `fret-dot ${note === root ? 'root' : (mode === 'penta' ? 'penta' : 'scale')}`;
        dot.textContent = note;
        cell.appendChild(dot);
      }
      row.appendChild(cell);
    }
    fb.appendChild(row);
  });

  // Fret numbers row
  const numRow = document.createElement('div');
  numRow.className = 'fret-numbers';
  const spacer = document.createElement('div');
  numRow.appendChild(spacer);
  for (let f = 0; f <= 11; f++) {
    const n = document.createElement('div');
    n.className = 'fret-num';
    n.textContent = f === 0 ? 'Open' : f;
    numRow.appendChild(n);
  }
  fb.appendChild(numRow);
}

// ── Chord Diagrams ────────────────────────────────────────────────────────────
function renderChordDiagrams(d) {
  const el = document.getElementById('chordDiagrams');
  el.innerHTML = '';

  if (currentInst === 'guitar') {
    const fingerings = d.chords.fingerings;
    Object.entries(fingerings).slice(0, 4).forEach(([chord, data]) => {
      const wrap = document.createElement('div');
      wrap.className = 'chord-diagram';

      const lbl = document.createElement('div');
      lbl.className = 'chord-name-label';
      lbl.textContent = chord;
      wrap.appendChild(lbl);

      const grid = document.createElement('div');
      grid.className = 'chord-grid';

      // 5 fret rows × 6 strings
      const minFret = Math.min(...data.frets.filter(f => f > 0));
      const startFret = data.barre > 0 ? data.barre : (minFret > 3 ? minFret - 1 : 1);

      for (let fret = startFret; fret < startFret + 5; fret++) {
        for (let str = 0; str < 6; str++) {
          const cell = document.createElement('div');
          cell.className = 'chord-cell';
          if (data.frets[str] === fret) {
            const dot = document.createElement('div');
            dot.className = 'fret-dot-small';
            cell.appendChild(dot);
          } else if (fret === startFret) {
            if (data.frets[str] === -1) {
              const x = document.createElement('div');
              x.className = 'muted-x';
              x.textContent = '✕';
              cell.appendChild(x);
            } else if (data.frets[str] === 0) {
              const o = document.createElement('div');
              o.className = 'open-o';
              o.textContent = '○';
              cell.appendChild(o);
            }
          }
          grid.appendChild(cell);
        }
      }
      wrap.appendChild(grid);

      if (data.barre > 0) {
        const barreLbl = document.createElement('div');
        barreLbl.style.cssText = 'font-size:0.6rem;color:var(--muted);margin-top:3px;font-family:var(--font-mono)';
        barreLbl.textContent = `Barre fr.${data.barre}`;
        wrap.appendChild(barreLbl);
      }
      el.appendChild(wrap);
    });
  } else {
    // Piano voicings
    const voicings = d.chords.piano_voicings;
    Object.entries(voicings).slice(0, 4).forEach(([chord, offsets]) => {
      const wrap = document.createElement('div');
      wrap.className = 'chord-diagram';

      const lbl = document.createElement('div');
      lbl.className = 'chord-name-label';
      lbl.textContent = chord;
      wrap.appendChild(lbl);

      // Simple piano keyboard (C to B = 7 white, 5 black)
      const pianoWrap = document.createElement('div');
      pianoWrap.className = 'piano-voicing';
      pianoWrap.style.position = 'relative';
      pianoWrap.style.width = '120px';

      // White key note indices in octave: C=0,D=2,E=4,F=5,G=7,A=9,B=11
      const whiteIdx = [0,2,4,5,7,9,11];
      whiteIdx.forEach(ni => {
        const k = document.createElement('div');
        k.className = 'piano-key-w' + (offsets.map(o => o % 12).includes(ni) ? ' active' : '');
        pianoWrap.appendChild(k);
      });

      wrap.appendChild(pianoWrap);

      const noteLbl = document.createElement('div');
      noteLbl.style.cssText = 'font-size:0.65rem;color:var(--muted);margin-top:4px;font-family:var(--font-mono);text-align:center';
      noteLbl.textContent = offsets.map(o => NOTE_NAMES[o % 12]).join(' - ');
      wrap.appendChild(noteLbl);

      el.appendChild(wrap);
    });
  }
}

// ── Arpeggio ──────────────────────────────────────────────────────────────────
function renderArpeggio(d) {
  const arp = d.arpeggio;
  document.getElementById('arpStyle').textContent = `${arp.pattern_name} · ${arp.pattern} · ${arp.bpm_range} BPM`;

  const grid = document.getElementById('arpeggioGrid');
  grid.innerHTML = '';

  Object.entries(arp.chord_arpeggios).forEach(([chord, notes]) => {
    const card = document.createElement('div');
    card.className = 'arp-card';

    const chordLbl = document.createElement('div');
    chordLbl.className = 'arp-chord';
    chordLbl.innerHTML = `Chord: <strong>${chord}</strong>`;
    card.appendChild(chordLbl);

    const notesWrap = document.createElement('div');
    notesWrap.className = 'arp-notes';
    notes.forEach((note, i) => {
      const span = document.createElement('span');
      span.className = 'arp-note';
      span.textContent = `${i+1}. ${note}`;
      notesWrap.appendChild(span);
    });
    card.appendChild(notesWrap);

    const patLbl = document.createElement('div');
    patLbl.className = 'arp-pattern';
    patLbl.textContent = `Pattern: ${arp.pattern}`;
    card.appendChild(patLbl);

    grid.appendChild(card);
  });

  if (Object.keys(arp.chord_arpeggios).length === 0) {
    grid.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">No arpeggio data available</span>';
  }
}

// ── Difficulty ────────────────────────────────────────────────────────────────
function renderDifficulty(d) {
  const diff = d.difficulty;
  const badge = document.getElementById('diffBadge');
  badge.textContent = `${diff.label} · ${diff.score}`;
  badge.className = 'diff-badge' + (diff.level >= 4 ? ' expert' : diff.level === 3 ? ' hard' : '');

  const bars = document.getElementById('diffBars');
  bars.innerHTML = '';

  const breakdown = [
    { label: 'BPM Difficulty',     val: diff.breakdown.bpm_difficulty },
    { label: 'Chord Complexity',   val: diff.breakdown.chord_complexity },
    { label: 'Transition Speed',   val: diff.breakdown.transition_speed },
    { label: 'Key Clarity (inv.)', val: diff.breakdown.key_clarity },
  ];

  breakdown.forEach(item => {
    const row = document.createElement('div');
    row.className = 'diff-row';

    const lbl = document.createElement('div');
    lbl.className = 'diff-row-label';
    lbl.textContent = item.label;

    const track = document.createElement('div');
    track.className = 'diff-bar-track';
    const fill = document.createElement('div');
    fill.className = 'diff-bar-fill';
    fill.style.width = '0%';
    track.appendChild(fill);

    const val = document.createElement('div');
    val.className = 'diff-val';
    val.textContent = (item.val * 100).toFixed(0) + '%';

    row.appendChild(lbl);
    row.appendChild(track);
    row.appendChild(val);
    bars.appendChild(row);

    // Animate in
    setTimeout(() => { fill.style.width = `${item.val * 100}%`; }, 100);
  });
}

// ── Segments ─────────────────────────────────────────────────────────────────
function renderSegments(d) {
  document.getElementById('segBadge').textContent = `${d.segments.optimal_k} sections · silhouette ${d.segments.silhouette}`;

  const tl = document.getElementById('segmentTimeline');
  const lg = document.getElementById('segmentLegend');
  tl.innerHTML = ''; lg.innerHTML = '';

  const total = d.segments.timeline.length;
  const seen = new Set();

  d.segments.timeline.forEach(label => {
    const block = document.createElement('div');
    block.className = 'seg-block';
    block.style.width = `${100 / total}%`;
    block.style.background = SEG_COLORS[label] || '#6b6b80';
    block.title = label;
    tl.appendChild(block);
    seen.add(label);
  });

  seen.forEach(label => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${SEG_COLORS[label] || '#6b6b80'}"></span>${label}`;
    lg.appendChild(item);
  });
}

// ── Tab Links ────────────────────────────────────────────────────────────────
async function fetchTabLinks(title) {
  const el = document.getElementById('tabLinks');
  document.getElementById('tabSearchTitle').textContent = title || '—';

  if (!title) {
    el.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">No title detected — enter the song name to search</span>';
    return;
  }

  try {
    const res  = await fetch(`/tabs/search?title=${encodeURIComponent(title)}`);
    const data = await res.json();
    el.innerHTML = '';

    const icons = {
      youtube: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
      tabs:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    };

    data.links.forEach(link => {
      const a = document.createElement('a');
      a.className = 'tab-link-item';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.innerHTML = `
        <span class="tab-link-icon">${icons[link.icon] || icons.youtube}</span>
        <span>${link.label}</span>
        <span class="tab-link-arrow">↗</span>
      `;
      el.appendChild(a);
    });
  } catch(e) {
    el.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">Could not load links</span>';
  }
}

// ── Feedback ─────────────────────────────────────────────────────────────────
document.getElementById('starRating').addEventListener('click', e => {
  if (!e.target.classList.contains('star')) return;
  selectedRating = parseInt(e.target.dataset.val);
  document.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= selectedRating);
  });
});

async function submitFeedback() {
  const btn = document.getElementById('fbBtn');
  btn.textContent = 'Submitting...';

  const body = {
    song_title:      document.getElementById('fbSongTitle').value.trim(),
    detected_key:    document.getElementById('fbDetectedKey').value.trim(),
    correct_key:     document.getElementById('fbCorrectKey').value.trim() || document.getElementById('fbDetectedKey').value.trim(),
    detected_chords: analysisData?.chords?.top_chords?.map(c => c.chord) || [],
    rating:          selectedRating || null,
  };

  try {
    const res  = await fetch('/feedback', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    const fbEl = document.getElementById('fbResponse');
    fbEl.textContent = data.community_confidence !== null
      ? `✓ Saved! Community confidence for this song: ${(data.community_confidence*100).toFixed(0)}% (${data.total_reports} reports)`
      : '✓ Feedback saved. Thanks!';
    btn.textContent = 'Submit Feedback';
  } catch(e) {
    document.getElementById('fbResponse').textContent = 'Could not save feedback.';
    btn.textContent = 'Submit Feedback';
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2,'0')}`;
}
