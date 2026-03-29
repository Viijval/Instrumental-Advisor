// ── State ──
let currentInstrument = 'guitar';
let analysisData = null;
let stepInterval = null;
const charts = {};

const INSTRUMENT_CONFIG = {
  guitar: { label: 'Guitar Advisor', showScale: true, showCapo: true,  accentClass: 'guitar' },
  piano:  { label: 'Piano Advisor',  showScale: true, showCapo: false, accentClass: 'piano'  },
  drums:  { label: 'Drum Advisor',   showScale: false,showCapo: false, accentClass: 'drums'  },
  bass:   { label: 'Bass Advisor',   showScale: true, showCapo: false, accentClass: 'bass'   },
};

// ── Instrument switching ──
function selectInstrument(instrument) {
  currentInstrument = instrument;
  document.querySelectorAll('.instrument-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-instrument="${instrument}"]`).classList.add('active');
  document.body.className = instrument;

  const cfg = INSTRUMENT_CONFIG[instrument];
  document.getElementById('mainTitle').innerHTML = `${instrument.charAt(0).toUpperCase() + instrument.slice(1)} <em>Advisor</em>`;
  document.getElementById('adviceBadge').textContent = cfg.label;

  if (analysisData) updateAdvicePanel(analysisData);
}

function updateAdvicePanel(data) {
  const cfg    = INSTRUMENT_CONFIG[currentInstrument];
  const advice = data.advice[currentInstrument];

  document.getElementById('adviceBadge').textContent = cfg.label;
  document.getElementById('advKey').textContent      = `${data.key.note} ${data.key.mode}`;
  document.getElementById('advBpm').textContent      = data.bpm.bpm;
  document.getElementById('advPractice').textContent = data.bpm.practice_bpm;
  document.getElementById('advTip').textContent      = advice.tip;

  // Scale
  const scaleItem = document.getElementById('scaleItem');
  scaleItem.style.display = cfg.showScale ? '' : 'none';
  if (cfg.showScale) document.getElementById('advScale').textContent = advice.scale || '—';

  // Chords (drums shows rhythm note instead)
  const chipsEl = document.getElementById('advChords');
  chipsEl.innerHTML = '';
  if (currentInstrument === 'drums') {
    const chip = document.createElement('span');
    chip.className = 'chord-chip';
    chip.textContent = 'Focus on rhythm & timing';
    chipsEl.appendChild(chip);
  } else {
    (advice.top3_chords || []).forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'chord-chip';
      chip.textContent = c;
      chipsEl.appendChild(chip);
    });
  }

  // Capo
  const capoEl = document.getElementById('advCapo');
  if (cfg.showCapo && advice.capo !== undefined) {
    capoEl.textContent = advice.capo > 0 ? `Capo on fret ${advice.capo}` : 'No capo needed';
  } else {
    capoEl.textContent = '';
  }
}

// ── Tab switching ──
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}

// ── File drag & drop ──
const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
let selectedFile = null;

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  document.getElementById('selectedFile').style.display = 'block';
  document.getElementById('selectedFile').textContent = `${file.name}  (${(file.size/1024/1024).toFixed(1)} MB)`;
  document.getElementById('analyzeFileBtn').style.display = 'block';
}

// ── Loading ──
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
  analysisData = null;
}

// ── Analyze ──
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

// ── Charts ──
function destroyCharts() {
  Object.values(charts).forEach(c => c && c.destroy());
  Object.keys(charts).forEach(k => delete charts[k]);
}

const PASTELS = ['#ffb3c6','#ffd6a5','#b5ead7','#c9b8f5','#a8d8f0','#fdf4ab'];
const SEGMENT_COLORS = {
  'Intro/Outro':'#c9b8f5','Verse':'#a8d8f0','Chorus':'#ffb3c6',
  'Bridge':'#ffd6a5','Pre-Chorus':'#b5ead7','Interlude':'#fdf4ab',
  'Section 7':'#ffcfd2','Section 8':'#b9fbc0'
};

function renderResults(d) {
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('results').style.display     = 'block';
  destroyCharts();

  updateAdvicePanel(d);

  // BPM metrics
  document.getElementById('bpmMean').textContent = d.bpm.bpm;
  document.getElementById('bpmCI').textContent   = `${d.bpm.bpm_ci_low}–${d.bpm.bpm_ci_high}`;
  document.getElementById('bpmStd').textContent  = `±${d.bpm.bpm_std}`;
  document.getElementById('keyNote').textContent = `${d.key.note} ${d.key.mode}`;
  document.getElementById('keyConf').textContent = `${(d.key.confidence*100).toFixed(0)}%`;
  document.getElementById('segSil').textContent  = d.segments.silhouette;
  document.getElementById('segK').textContent    = d.segments.optimal_k;
  document.getElementById('segBadge').textContent = `${d.segments.optimal_k} sections`;
  document.getElementById('evalStability').textContent = d.chords.stability;
  document.getElementById('evalLL').textContent        = d.chords.log_likelihood;

  // Waveform
  charts.waveform = new Chart(document.getElementById('waveformChart').getContext('2d'), {
    type:'line', data:{
      labels: d.waveform.map((_,i)=>i),
      datasets:[{data:d.waveform,borderColor:'#9b72cf',borderWidth:1,pointRadius:0,fill:true,backgroundColor:'rgba(155,114,207,0.12)'}]
    },
    options:{plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false}},animation:false,responsive:true}
  });

  // BPM histogram
  const hist=d.bpm.bpm_histogram, mn=Math.floor(Math.min(...hist)), mx=Math.ceil(Math.max(...hist));
  const bins=20, bsize=(mx-mn)/bins, counts=new Array(bins).fill(0);
  hist.forEach(v=>{const i=Math.min(Math.floor((v-mn)/bsize),bins-1);counts[i]++;});
  charts.bpm = new Chart(document.getElementById('bpmChart').getContext('2d'),{
    type:'bar',data:{labels:counts.map((_,i)=>(mn+i*bsize).toFixed(0)),datasets:[{data:counts,backgroundColor:'#c9b8f5',borderRadius:6,borderSkipped:false}]},
    options:{plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9}}},y:{ticks:{font:{size:9}}}},responsive:true}
  });

  // Chroma
  const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const chromaMean=NOTE_NAMES.map((_,ni)=>{const row=d.chroma[ni];return row.reduce((a,b)=>a+b,0)/row.length;});
  charts.chroma = new Chart(document.getElementById('chromaChart').getContext('2d'),{
    type:'bar',data:{labels:NOTE_NAMES,datasets:[{data:chromaMean,backgroundColor:chromaMean.map((_,i)=>NOTE_NAMES[i]===d.key.note?'#9b72cf':'#d4bfee'),borderRadius:6,borderSkipped:false}]},
    options:{plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9}}},y:{display:false}},responsive:true}
  });

  // Segment timeline
  const tl=document.getElementById('segmentTimeline'), lg=document.getElementById('segmentLegend');
  tl.innerHTML=''; lg.innerHTML='';
  const total=d.segments.timeline.length, seen=new Set();
  d.segments.timeline.forEach(label=>{
    const block=document.createElement('div');
    block.className='seg-block';
    block.style.width=`${100/total}%`;
    block.style.background=SEGMENT_COLORS[label]||'#ddd';
    block.title=label;
    tl.appendChild(block);
    seen.add(label);
  });
  seen.forEach(label=>{
    const item=document.createElement('div');
    item.className='legend-item';
    item.innerHTML=`<span class="legend-dot" style="background:${SEGMENT_COLORS[label]||'#ddd'}"></span>${label}`;
    lg.appendChild(item);
  });

  // Chords
  charts.chord = new Chart(document.getElementById('chordChart').getContext('2d'),{
    type:'bar',data:{labels:d.chords.top_chords.map(c=>c.chord),datasets:[{data:d.chords.top_chords.map(c=>c.count),backgroundColor:PASTELS.slice(0,d.chords.top_chords.length),borderRadius:8,borderSkipped:false}]},
    options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9}}},y:{ticks:{font:{size:11,weight:'bold'}}}},responsive:true}
  });

  // Eval radar
  const silNorm=Math.max(0,(d.segments.silhouette+1)/2);
  charts.eval = new Chart(document.getElementById('evalChart').getContext('2d'),{
    type:'radar',data:{
      labels:['Cluster Quality','Chord Stability','BPM Confidence','Key Confidence'],
      datasets:[{data:[silNorm,d.chords.stability,1-Math.min(1,(d.bpm.bpm_ci_high-d.bpm.bpm_ci_low)/30),d.key.confidence],backgroundColor:'rgba(155,114,207,0.2)',borderColor:'#9b72cf',borderWidth:2,pointBackgroundColor:'#9b72cf'}]
    },
    options:{plugins:{legend:{display:false}},scales:{r:{min:0,max:1,ticks:{display:false},pointLabels:{font:{size:9,weight:'bold'}}}},responsive:true}
  });
}
