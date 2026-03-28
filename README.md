# 🎸 Guitar Advisor

A music analysis web app that takes any audio file or YouTube link and gives you a personalised guitar practice plan.

Built as an Advanced Machine Learning lab project — uses **GMM (Module 3)**, **HMM (Module 4)**, and **Monte Carlo methods (Module 6)** from the AML syllabus.

![Python](https://img.shields.io/badge/Python-3.10+-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green) ![librosa](https://img.shields.io/badge/librosa-0.10-orange)

---

## ✨ Features

| Feature | ML Method |
|---|---|
| BPM Detection + Uncertainty | Monte Carlo bootstrap sampling |
| Song Segmentation | Gaussian Mixture Model + EM Algorithm |
| Chord Prediction | Hidden Markov Model + Viterbi Decoding |
| Key Detection | Krumhansl-Schmuckler profiles |
| Guitar Advice | Rule-based advisor using all outputs |

### Input
- Upload an audio file (MP3, WAV, OGG, FLAC, M4A)
- Paste a YouTube URL

### Output
- BPM with 95% confidence interval
- Musical key + confidence
- Song section timeline (Verse, Chorus, Bridge...)
- Top predicted chord progression
- Scale to use for soloing
- Strumming pattern suggestion
- Capo recommendation
- Practice tempo (80% of detected BPM)

---

## 🚀 Run Locally

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/guitar-advisor.git
cd guitar-advisor

# Install dependencies
pip install -r requirements.txt

# Run
uvicorn main:app --reload
```

Open http://localhost:8000

---

## 🚂 Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repo
4. Railway auto-detects the `Procfile` and deploys

No environment variables needed.

> **Note:** YouTube download requires `ffmpeg` to be available. Railway provides this by default. For local use, install via `brew install ffmpeg` (Mac) or `apt install ffmpeg` (Linux).

---

## 📁 Project Structure

```
guitar-advisor/
├── main.py          # FastAPI app & routes
├── analyzer.py      # Core ML analysis logic
├── requirements.txt
├── Procfile         # Railway deployment
├── templates/
│   └── index.html   # Frontend UI
└── static/
    ├── css/style.css
    └── js/app.js
```

---

## 🧠 ML Details

### BPM — Monte Carlo (Module 6)
Detects tempo using `librosa.beat.beat_track`, then runs 150 bootstrap samples over random 10-second windows to estimate a confidence interval around the BPM.

### Song Segmentation — GMM + EM (Module 3)
Extracts MFCC + delta + chroma features, normalises them, and fits a Gaussian Mixture Model. BIC score is used to automatically select the optimal number of segments (k=2–7). Frames are clustered and labelled by energy level (low energy → Intro/Outro, high energy → Chorus).

### Chord Prediction — HMM + Viterbi (Module 4)
Fits a `GaussianHMM` on chroma features with 14 hidden states (C, Cm, D, Dm ... B, Bm). Chord templates initialise the emission means. Viterbi decoding finds the most likely chord sequence over time.

---

## 📚 Dependencies

- `librosa` — audio feature extraction
- `hmmlearn` — Hidden Markov Models
- `scikit-learn` — GMM, preprocessing, metrics
- `fastapi` + `uvicorn` — web server
- `yt-dlp` — YouTube audio download
- `Chart.js` — frontend charts (CDN)

---

## 📄 License

MIT
