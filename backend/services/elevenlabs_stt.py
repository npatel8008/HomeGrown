"""SYSTEM 5a — speech to text, via ElevenLabs Scribe.

Thin and replaceable, in the same spirit as `llm_client.py`: this is the only
module that knows ElevenLabs' wire format. Callers get a transcript string or
`None`, and `None` means "fall back", never "crash".

Configuration:
    ELEVENLABS_API_KEY     required; without it this reports itself unavailable
    ELEVENLABS_STT_MODEL   default scribe_v1
    ELEVENLABS_TIMEOUT     seconds, default 30

The audio never touches disk here — it arrives as bytes from the route and is
forwarded straight on.
"""

import json
import logging
import mimetypes
import os
import time
import urllib.error
import urllib.request
import uuid
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1").rstrip("/")
STT_MODEL = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v1")
TIMEOUT_SECONDS = float(os.getenv("ELEVENLABS_TIMEOUT", "30"))
# A few seconds of speech is plenty; this is a guard against someone POSTing a
# podcast at the endpoint.
MAX_AUDIO_BYTES = int(os.getenv("ELEVENLABS_MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))


def api_key() -> Optional[str]:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    return key or None


def is_available() -> bool:
    return api_key() is not None


class TranscriptionError(RuntimeError):
    pass


def _multipart(fields: dict, filename: str, content_type: str, audio: bytes) -> Tuple[bytes, str]:
    """Build a multipart/form-data body without pulling in a HTTP library."""
    boundary = "----gardenai%s" % uuid.uuid4().hex
    parts = []

    for name, value in fields.items():
        parts.append(
            (
                "--%s\r\n"
                'Content-Disposition: form-data; name="%s"\r\n\r\n'
                "%s\r\n" % (boundary, name, value)
            ).encode("utf-8")
        )

    parts.append(
        (
            "--%s\r\n"
            'Content-Disposition: form-data; name="file"; filename="%s"\r\n'
            "Content-Type: %s\r\n\r\n" % (boundary, filename, content_type)
        ).encode("utf-8")
    )
    parts.append(audio)
    parts.append(("\r\n--%s--\r\n" % boundary).encode("utf-8"))

    return b"".join(parts), "multipart/form-data; boundary=%s" % boundary


def transcribe(audio: bytes, content_type: str = "audio/webm") -> Optional[str]:
    """Audio bytes -> transcript, or None if anything at all went wrong."""
    key = api_key()
    if not key:
        return None
    if not audio:
        return None
    if len(audio) > MAX_AUDIO_BYTES:
        logger.warning("Refusing %d bytes of audio (limit %d)", len(audio), MAX_AUDIO_BYTES)
        return None

    extension = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ".webm"
    body, full_content_type = _multipart(
        {"model_id": STT_MODEL}, "speech%s" % extension, content_type, audio
    )

    request = urllib.request.Request(
        "%s/speech-to-text" % BASE_URL,
        data=body,
        headers={"xi-api-key": key, "Content-Type": full_content_type},
        method="POST",
    )

    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read()[:400].decode("utf-8", "replace")
        logger.warning("ElevenLabs STT HTTP %s: %s", error.code, detail)
        return None
    except Exception as error:  # timeout, DNS, connection reset, bad JSON
        logger.warning("ElevenLabs STT failed: %s: %s", type(error).__name__, error)
        return None

    # The field has been spelled both ways across versions; accept either
    # rather than breaking on a rename.
    text = payload.get("text") or payload.get("transcription") or ""
    if isinstance(text, dict):
        text = text.get("text", "")

    logger.info("Transcribed %d bytes in %.1fs", len(audio), time.time() - started)
    return text.strip() or None
