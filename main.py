from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import JSONResponse
import uvicorn
import os
import tempfile
import shutil

from analyzer import analyze_audio

app = FastAPI(title="🎸 Guitar Advisor")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/analyze/file")
async def analyze_file(file: UploadFile = File(...)):
    # Validate file type
    allowed = {".mp3", ".wav", ".ogg", ".flac", ".m4a"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type {ext} not supported. Use: {', '.join(allowed)}")

    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        result = analyze_audio(tmp_path)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/analyze/youtube")
async def analyze_youtube(url: str = Form(...)):
    try:
        import yt_dlp
    except ImportError:
        raise HTTPException(status_code=500, detail="yt-dlp not installed")

    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, "audio.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": out_path,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "quiet": True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not download YouTube audio: {e}")

        audio_file = os.path.join(tmpdir, "audio.mp3")
        if not os.path.exists(audio_file):
            raise HTTPException(status_code=500, detail="Audio extraction failed")

        try:
            result = analyze_audio(audio_file)
            return JSONResponse(content=result)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
