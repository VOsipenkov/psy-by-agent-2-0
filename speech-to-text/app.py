import os
import tempfile
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel


MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
MODEL_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MODEL_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MODEL_BEAM_SIZE = max(1, int(os.getenv("WHISPER_BEAM_SIZE", "1")))
MODEL_VAD_FILTER = os.getenv("WHISPER_VAD_FILTER", "true").lower() not in {"0", "false", "no"}
MODEL_CACHE_DIR = os.getenv("WHISPER_CACHE_DIR", "/models")

app = FastAPI(title="Dream Speech To Text")
_model = None
_model_lock = Lock()


def get_model() -> WhisperModel:
    global _model

    with _model_lock:
        if _model is None:
            _model = WhisperModel(
                MODEL_NAME,
                device=MODEL_DEVICE,
                compute_type=MODEL_COMPUTE_TYPE,
                download_root=MODEL_CACHE_DIR,
            )

    return _model


@app.get("/health")
def health() -> dict:
    return {
        "status": "UP",
        "model": MODEL_NAME,
        "loaded": _model is not None,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
) -> dict:
    suffix = Path(file.filename or "voice.ogg").suffix or ".ogg"
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(await file.read())
            temp_path = temp_file.name

        language_hint = (language or "").strip() or None
        segments, info = get_model().transcribe(
            temp_path,
            language=language_hint,
            beam_size=MODEL_BEAM_SIZE,
            vad_filter=MODEL_VAD_FILTER,
        )

        transcript = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        return {
            "text": transcript,
            "language": getattr(info, "language", language_hint),
        }
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error}") from error
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)
