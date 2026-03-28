// ── Tab switching ──
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── File drag & drop ──
const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const selFile    = document.getElementById('selectedFile');
const analyzeBtn = document.getElementById('analyzeFileBtn');
let selectedFile = null;

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  selFile.style.display = 'block';
  selFile.textContent = `🎵 ${file.name}  (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  analyzeBtn.style.display = 'block';
}

// ── Loading steps animation ──
let stepInterval = null;
function animateSteps() {
  const steps = ['step1','step2','step3','step4'];
  let i = 0;
  steps.forEach(s => document.getElementById(s).className = 'step');
  stepInterval = setInterval(() => {
    if (i > 0) document.getElementById(steps[i-1]).className = 'step done';
    if (i < steps.length) { document.getElementById(steps[i]).className = 'step active'; i++; }
  }, 1800);
}

function stopSteps() {
  clearInterval(stepInterval);
  ['step1','step2','step3','step4'].forEach(s => document.getElementById(s).className = 'step done');
}

// ── Show/hide helpers ──
function showLoading() {
  document.querySelector('.input-card').style.display = 'none';
  document.getElementById('loadingCard').style.display = 'block';
  document.getElementById('errorCard').style.display   = 'none';
  document.getElementById('results').style.display     = 'none';
  animateSteps();
}

function showError(msg) {
  stopSteps();
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('errorCard').style.display   = 'block';
  document.getElementById('errorText').textContent     = msg;
}

function resetUI() {
  document.querySelector('.input-card').style.display = 'block';
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('errorCard').style.display   = 'none';
  document.getElementById('results').style.display     = 'none';
  destroyCharts();
}

// ── Analyze file ──
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
    renderResults(data);
  } catch (e) { showError(e.message); }
}

// ── Analyze YouTube ──
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
    renderResults(data);
  } catch (e) { showError(e.message); }
}

// ── Chart instances ──
const charts = {};
function destroyCharts() {
  Object.values(charts).forEach(c => c && c.destroy());
  Object.keys(charts).forEach(k => delete charts[k]);
}

// ── Pastel color palette ──
const PASTELS = ['#ffb3c6','#ffd6a5','#b5ead7','#c9b8f5','#a8d8f0','#fdf4ab','#ffcfd2','#b9fbc0'];
const SEGMENT_COLORS = {
  'Intro/Outro': '#c9b8f5', 'Verse': '#a8d8f0', 'Chorus': '#ffb3c6',
  'Bridge': '#ffd6a5', 'Pre-Chorus': '#b5ead7', 'Interlude': '#fdf4ab',
  'Section 7': '#ffcfd2', 'Section 8': '#b9fbc0'
};

// ── Render everything ──
function renderResults(d) {
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('results').style.display     = 'block';
  destroyCharts();

  const bpm  = d.bpm;
  const key  = d.key;
  const seg  = d.segments;
  const ch   = d.chords;
  const adv  = d.advice;

  // ── Advice hero ──
  document.getElementById('advKey').textContent      = `${key.note} ${key.mode}`;
  document.getElementById('advBpm').textContent      = `${bpm.bpm}`;
  document.getElementById('advPractice').textContent = `${bpm.practice_bpm}`;
  document.getElementById('advScale').textContent    = adv.scale;
  document.getElementById('advStrum').textContent    = `🎸 ${adv.strumming}`;
  document.getElementById('advCapo').textContent     = adv.capo > 0 ? `💡 Capo on fret ${adv.capo}` : '💡 No capo needed';

  const chipsEl = document.getElementById('advChords');
  chipsEl.innerHTML = '';
  adv.top3_chords.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'chord-chip';
    chip.textContent = c;
    chipsEl.appendChild(chip);
  });

  // ── Waveform ──
  const wCtx = document.getElementById('waveformChart').getContext('2d');
  charts.waveform = new Chart(wCtx, {
    type: 'line',
    data: {
      labels: d.waveform.map((_, i) => i),
      datasets: [{ data: d.waveform, borderColor: '#9b72cf', borderWidth: 1,
                   pointRadius: 0, fill: true,
                   backgroundColor: 'rgba(155,114,207,0.12)' }]
    },
    options: { plugins:{legend:{display:false}}, scales:{x:{display:false},y:{display:false}},
               animation: false, responsive: true }
  });

  // ── BPM histogram ──
  const hist = bpm.bpm_histogram;
  const min = Math.floor(Math.min(...hist));
  const max = Math.ceil(Math.max(...hist));
  const bins = 20;
  const binSize = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  hist.forEach(v => { const i = Math.min(Math.floor((v - min) / binSize), bins-1); counts[i]++; });
  const labels = counts.map((_, i) => (min + i * binSize).toFixed(0));

  const bCtx = document.getElementById('bpmChart').getContext('2d');
  charts.bpm = new Chart(bCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: counts, backgroundColor: '#c9b8f5', borderRadius: 6, borderSkipped: false }]
    },
    options: {
      plugins: { legend:{display:false} },
      scales: { x:{ ticks:{font:{size:9}} }, y:{ ticks:{font:{size:9}} } },
      responsive: true
    }
  });

  document.getElementById('bpmMean').textContent = `${bpm.bpm}`;
  document.getElementById('bpmCI').textContent   = `${bpm.bpm_ci_low}–${bpm.bpm_ci_high}`;
  document.getElementById('bpmStd').textContent  = `±${bpm.bpm_std}`;

  // ── Chroma chart ──
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const chromaMean = NOTE_NAMES.map((_, ni) => {
    const row = d.chroma[ni];
    return row.reduce((a,b) => a+b, 0) / row.length;
  });
  const highlighted = chromaMean.map((v, i) => NOTE_NAMES[i] === key.note ? '#9b72cf' : '#d4bfee');

  const cCtx = document.getElementById('chromaChart').getContext('2d');
  charts.chroma = new Chart(cCtx, {
    type: 'bar',
    data: {
      labels: NOTE_NAMES,
      datasets: [{ data: chromaMean, backgroundColor: highlighted, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      plugins: { legend:{display:false} },
      scales: { x:{ ticks:{font:{size:9}} }, y:{ display:false } },
      responsive: true
    }
  });

  document.getElementById('keyNote').textContent = `${key.note} ${key.mode}`;
  document.getElementById('keyConf').textContent = `${(key.confidence * 100).toFixed(0)}%`;

  // ── Segment timeline ──
  const tl = document.getElementById('segmentTimeline');
  const lg = document.getElementById('segmentLegend');
  tl.innerHTML = ''; lg.innerHTML = '';
  document.getElementById('segBadge').textContent = `${seg.optimal_k} sections`;
  document.getElementById('segSil').textContent   = seg.silhouette;
  document.getElementById('segK').textContent     = seg.optimal_k;

  const total = seg.timeline.length;
  const seenSections = new Set();
  seg.timeline.forEach(label => {
    const block = document.createElement('div');
    block.className = 'seg-block';
    block.style.width = `${100/total}%`;
    block.style.background = SEGMENT_COLORS[label] || '#ddd';
    block.title = label;
    tl.appendChild(block);
    seenSections.add(label);
  });

  seenSections.forEach(label => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${SEGMENT_COLORS[label]||'#ddd'}"></span>${label}`;
    lg.appendChild(item);
  });

  // ── Chord bar chart ──
  const chCtx = document.getElementById('chordChart').getContext('2d');
  charts.chord = new Chart(chCtx, {
    type: 'bar',
    data: {
      labels: ch.top_chords.map(c => c.chord),
      datasets: [{
        data: ch.top_chords.map(c => c.count),
        backgroundColor: PASTELS.slice(0, ch.top_chords.length),
        borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend:{display:false} },
      scales: { x:{ ticks:{font:{size:9}} }, y:{ ticks:{font:{size:11, weight:'bold'}} } },
      responsive: true
    }
  });

  // ── Evaluation radar ──
  const evCtx = document.getElementById('evalChart').getContext('2d');
  const silNorm = Math.max(0, (seg.silhouette + 1) / 2);
  charts.eval = new Chart(evCtx, {
    type: 'radar',
    data: {
      labels: ['Cluster Quality', 'Chord Stability', 'BPM Confidence', 'Key Confidence'],
      datasets: [{
        data: [
          silNorm,
          ch.stability,
          1 - Math.min(1, (bpm.bpm_ci_high - bpm.bpm_ci_low) / 30),
          key.confidence
        ],
        backgroundColor: 'rgba(155,114,207,0.2)',
        borderColor: '#9b72cf',
        borderWidth: 2,
        pointBackgroundColor: '#9b72cf',
      }]
    },
    options: {
      plugins: { legend:{display:false} },
      scales: { r: { min:0, max:1, ticks:{display:false}, pointLabels:{font:{size:9,weight:'bold'}} } },
      responsive: true
    }
  });

  document.getElementById('evalStability').textContent = ch.stability;
  document.getElementById('evalLL').textContent        = ch.log_likelihood;
}
