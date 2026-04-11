from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
import uvicorn
import os
import re
import json
import tempfile
import shutil
from datetime import datetime
from pathlib import Path

from analyzer import analyze_audio

app = FastAPI(title="Music Advisor")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

UPLOAD_DIR   = "uploads"
FEEDBACK_DIR = "feedback"
os.makedirs(UPLOAD_DIR,   exist_ok=True)
os.makedirs(FEEDBACK_DIR, exist_ok=True)


# ── Pages ──────────────────────────────────────────────────────────────────────

@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


# ── Analyze: File Upload ───────────────────────────────────────────────────────

@app.post("/analyze/file")
async def analyze_file(file: UploadFile = File(...)):
    allowed = {".mp3", ".wav", ".ogg", ".flac", ".m4a"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"File type {ext} not supported. Use: {', '.join(allowed)}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        result = analyze_audio(tmp_path, original_filename=file.filename)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        os.unlink(tmp_path)


# ── Analyze: YouTube ───────────────────────────────────────────────────────────

@app.post("/analyze/youtube")
async def analyze_youtube(url: str = Form(...)):
    # Validate URL
    yt_pattern = r'(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w-]+'
    if not re.search(yt_pattern, url):
        raise HTTPException(400, "Invalid YouTube URL")

    try:
        from pytubefix import YouTube
        from pytubefix.cli import on_progress
    except ImportError:
        raise HTTPException(500, "pytubefix not installed. Run: pip install pytubefix")

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            yt = YouTube(url, on_progress_callback=on_progress)
            title = yt.title or "youtube_audio"

            # Get best audio stream
            stream = (
                yt.streams.filter(only_audio=True, file_extension='mp4').order_by('abr').last()
                or yt.streams.filter(only_audio=True).first()
            )
            if not stream:
                raise HTTPException(500, "No audio stream found for this video")

            audio_path = stream.download(output_path=tmpdir, filename="audio")

            # Convert to mp3 if needed
            mp3_path = os.path.join(tmpdir, "audio.mp3")
            if not audio_path.endswith('.mp3'):
                import subprocess
                subprocess.run(
                    ['ffmpeg', '-i', audio_path, '-q:a', '0', '-map', 'a', mp3_path, '-y'],
                    check=True, capture_output=True
                )
            else:
                mp3_path = audio_path

            result = analyze_audio(mp3_path, original_filename=title + '.mp3')
            result['youtube_title'] = title
            return JSONResponse(content=result)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Could not process YouTube video: {str(e)}")


# ── Tab Search ─────────────────────────────────────────────────────────────────

@app.get("/tabs/search")
async def search_tabs(title: str):
    """Return YouTube search links for tabs and official video."""
    import urllib.parse

    def yt_search(query):
        q = urllib.parse.quote_plus(query)
        return f"https://www.youtube.com/results?search_query={q}"

    def ug_search(query):
        q = urllib.parse.quote_plus(query)
        return f"https://www.ultimate-guitar.com/search.php?search_type=title&value={q}"

    return JSONResponse({
        'title': title,
        'links': [
            {
                'label': 'Guitar Tab (YouTube)',
                'url': yt_search(f"{title} guitar tab"),
                'icon': 'youtube',
            },
            {
                'label': 'Official Music Video',
                'url': yt_search(f"{title} official music video"),
                'icon': 'youtube',
            },
            {
                'label': 'Instrumental / Backing Track',
                'url': yt_search(f"{title} official instrumental backing track"),
                'icon': 'youtube',
            },
            {
                'label': 'Ultimate Guitar Tabs',
                'url': ug_search(title),
                'icon': 'tabs',
            },
        ]
    })


# ── Feedback ───────────────────────────────────────────────────────────────────

@app.post("/feedback")
async def submit_feedback(request: Request):
    """
    Store user corrections for future model improvement.
    Body: { song_title, detected_key, correct_key, detected_chords, correct_chords, rating }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    required = ['song_title']
    for field in required:
        if field not in body:
            raise HTTPException(400, f"Missing field: {field}")

    entry = {
        'timestamp': datetime.utcnow().isoformat(),
        **body
    }

    # Append to a JSONL file (one JSON object per line)
    feedback_file = Path(FEEDBACK_DIR) / "corrections.jsonl"
    with open(feedback_file, 'a') as f:
        f.write(json.dumps(entry) + '\n')

    # Return aggregated confidence for this song if we have prior feedback
    song_title = body.get('song_title', '').lower().strip()
    confirmations = 0
    corrections = 0

    if feedback_file.exists():
        with open(feedback_file) as f:
            for line in f:
                try:
                    fb = json.loads(line)
                    if fb.get('song_title', '').lower().strip() == song_title:
                        if fb.get('correct_key') == fb.get('detected_key'):
                            confirmations += 1
                        else:
                            corrections += 1
                except Exception:
                    continue

    total = confirmations + corrections
    community_confidence = round(confirmations / total, 2) if total > 0 else None

    return JSONResponse({
        'status': 'saved',
        'message': 'Thank you for your feedback!',
        'community_confidence': community_confidence,
        'total_reports': total,
    })


@app.get("/feedback/stats")
async def feedback_stats():
    """Return aggregated feedback stats."""
    feedback_file = Path(FEEDBACK_DIR) / "corrections.jsonl"
    if not feedback_file.exists():
        return JSONResponse({'total': 0, 'songs': {}})

    stats = {}
    with open(feedback_file) as f:
        for line in f:
            try:
                fb = json.loads(line)
                title = fb.get('song_title', 'unknown')
                if title not in stats:
                    stats[title] = {'confirmations': 0, 'corrections': 0}
                if fb.get('correct_key') == fb.get('detected_key'):
                    stats[title]['confirmations'] += 1
                else:
                    stats[title]['corrections'] += 1
            except Exception:
                continue

    return JSONResponse({'total': sum(s['confirmations'] + s['corrections'] for s in stats.values()), 'songs': stats})


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
