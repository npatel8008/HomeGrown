"""Route layer for voice control. Holds no logic of its own.

Two steps, deliberately separate endpoints:

    POST /api/voice/transcribe   audio  -> text   (ElevenLabs Scribe)
    POST /api/voice/interpret    text   -> commands

Splitting them means the browser can skip the first one when it has its own
speech recognition, and that a typed instruction goes through exactly the same
interpretation path as a spoken one — which is also what makes this testable
without a microphone.
"""

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from models.schemas import InterpretRequest, InterpretResponse, TranscribeResponse
from services import elevenlabs_stt, garden_voice

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio: UploadFile = File(...)) -> TranscribeResponse:
    if not elevenlabs_stt.is_available():
        # The client falls back to browser speech recognition or the text box.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ELEVENLABS_API_KEY is not set on the backend.",
        )

    payload = await audio.read()
    text = elevenlabs_stt.transcribe(payload, audio.content_type or "audio/webm")
    if text is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech-to-text failed. Try again, or type the request instead.",
        )
    return TranscribeResponse(text=text, generated_by="elevenlabs:%s" % elevenlabs_stt.STT_MODEL)


@router.post("/interpret", response_model=InterpretResponse)
def interpret(request: InterpretRequest) -> InterpretResponse:
    result = garden_voice.parse_request(request.transcript)
    return InterpretResponse(
        transcript=request.transcript,
        commands=result["commands"],
        descriptions=result.get("descriptions", []),
        understood=result["understood"],
        generated_by=result["generated_by"],
    )
