"""SYSTEM 5b — turning what someone said into edits to their garden.

Two implementations behind one contract, the same pattern as ingredient
extraction:

    _parse_with_rules   deterministic keyword/number parsing. Always available,
                        needs no key, and is what the tests pin down.
    _parse_with_llm     K2 via llm_client, for phrasings the rules miss
                        ("swap the kale for something I'd actually eat").

The rules run FIRST and the model is only consulted when they find nothing.
That ordering is deliberate: "add two tomatoes" should never depend on a
network round trip, and a deterministic parser cannot hallucinate a crop.

Whatever produces the commands, every command is validated against the real
crop catalogue before it leaves this module — a crop id that is not in
`data/crops.json` is dropped rather than passed on to break the layout call.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from services import llm_client
from services.crop_repository import all_crops

logger = logging.getLogger(__name__)

MAX_PLANTS_PER_CROP = 60

# Spoken numbers. "a couple" and "a few" are included because people say them
# far more often than they say "two".
NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "fifteen": 15, "twenty": 20, "couple": 2, "few": 3,
    "several": 3, "dozen": 12, "half": 0,
}

REMOVE_WORDS = (
    "remove", "delete", "get rid of", "no more", "drop", "take out", "lose the",
    "don't want", "do not want", "dont want", "hate", "without", "cut the",
    "skip the", "not a fan of", "allergic",
)
ADD_WORDS = ("add", "plant", "include", "put in", "give me", "i want", "grow", "throw in")
MORE_WORDS = ("more", "increase", "double", "extra", "boost", "up the")
LESS_WORDS = ("less", "fewer", "reduce", "halve", "cut back", "fewer of")
CLEAR_WORDS = ("clear everything", "start over", "remove everything", "clear the garden", "wipe")
ALL_WORDS = ("everything", "all the crops", "select all", "add everything")
UNDO_WORDS = ("undo", "revert", "never mind", "nevermind", "go back", "put it back")


def _crop_lookup() -> List[Tuple[str, str, str]]:
    """(crop_id, display name, matchable phrase) with plurals and synonyms."""
    entries: List[Tuple[str, str, str]] = []
    for crop in all_crops():
        crop_id = crop["id"]
        name = crop["name"]
        phrases = {name.lower(), crop_id.replace("-", " ")}
        lowered = name.lower()
        phrases.add(lowered + "s")
        phrases.add(lowered + "es")
        if lowered.endswith("y"):
            phrases.add(lowered[:-1] + "ies")
        # A few things people say that are not the catalogue name.
        extra = {
            "jalapeno": {"jalapenos", "jalapeño", "jalapeños", "hot peppers"},
            "bell-pepper": {"peppers", "pepper", "bell peppers"},
            "green-onion": {"scallions", "scallion", "spring onions"},
            "cherry-tomato": {"cherry tomatoes", "cherry toms"},
            "green-beans": {"beans", "green bean"},
            "swiss-chard": {"chard"},
            "zucchini": {"courgette", "courgettes", "zucchinis"},
        }.get(crop_id, set())
        phrases |= extra
        for phrase in phrases:
            entries.append((crop_id, name, phrase))
    # Longest phrases first, so "cherry tomatoes" wins over "tomatoes".
    entries.sort(key=lambda row: len(row[2]), reverse=True)
    return entries


def _find_crops(text: str) -> List[Tuple[str, str]]:
    """Every crop named in a clause, in the order they were said.

    One clause routinely names several ("add basil, mint and parsley"), so
    matching only the first would silently drop the rest. Matched spans are
    masked out as we go, which is what stops "cherry tomatoes" from also
    matching "tomatoes" and ordering a crop nobody asked for.
    """
    remaining = text
    found: List[Tuple[int, str, str]] = []

    for crop_id, name, phrase in _crop_lookup():
        if any(crop_id == existing_id for _, existing_id, _ in found):
            continue
        match = re.search(r"\b%s\b" % re.escape(phrase), remaining)
        if match:
            found.append((match.start(), crop_id, name))
            # Blank the span so longer names cannot be re-matched by shorter ones.
            remaining = (
                remaining[: match.start()] + " " * (match.end() - match.start()) + remaining[match.end() :]
            )

    found.sort(key=lambda row: row[0])
    return [(crop_id, name) for _, crop_id, name in found]


def _find_crop(text: str) -> Optional[Tuple[str, str]]:
    crops = _find_crops(text)
    return crops[0] if crops else None


def _find_number(text: str) -> Optional[int]:
    digits = re.search(r"\b(\d{1,3})\b", text)
    if digits:
        return int(digits.group(1))
    for word, value in NUMBER_WORDS.items():
        if value and re.search(r"\b%s\b" % word, text):
            return value
    return None


def _contains(text: str, needles) -> bool:
    return any(needle in text for needle in needles)


_INSTRUCTION_VERBS = (
    "add|remove|delete|plant|drop|get rid|include|put|give|grow|throw in|"
    "double|halve|increase|reduce|scale|set|up the|cut back|cut the|skip|lose|take out|"
    "more|less|fewer|extra|boost|i want|i don't want|i do not want|i hate|no more|without"
)
_AND_BEFORE_VERB = re.compile(r"\band\b(?=\s*(?:%s)\b)" % _INSTRUCTION_VERBS)


def _split_clauses(transcript: str) -> List[str]:
    """"Add basil and remove the kale" is two instructions, not one."""
    lowered = transcript.lower().strip()
    parts = re.split(r",| and then | then |;| and also |\. | but | also ", lowered)
    # Keep "and" joins that are just a list of crops ("basil and mint") intact
    # by only splitting on "and" when a verb follows it.
    expanded: List[str] = []
    for part in parts:
        # Split on "and" only when a verb follows it, so "basil and mint" stays
        # one list of crops while "add basil and double the tomatoes" becomes
        # two instructions. Every verb that can start an instruction has to be
        # listed here — a missing one silently applies the wrong action to the
        # crops on the other side of the "and".
        pieces = re.split(_AND_BEFORE_VERB, part)
        expanded.extend(pieces)
    return [piece.strip() for piece in expanded if piece.strip()]


def _parse_with_rules(transcript: str) -> List[Dict[str, Any]]:
    commands: List[Dict[str, Any]] = []

    for clause in _split_clauses(transcript):
        if _contains(clause, UNDO_WORDS):
            commands.append({"kind": "undo"})
            continue
        if _contains(clause, CLEAR_WORDS):
            commands.append({"kind": "clear_crops"})
            continue

        found = _find_crops(clause)
        if not found and _contains(clause, ALL_WORDS) and _contains(clause, ADD_WORDS):
            commands.append({"kind": "select_all_crops"})
            continue
        if not found:
            continue

        number = _find_number(clause)
        removing = _contains(clause, REMOVE_WORDS)

        for crop_id, name in found:
            commands.extend(_command_for(clause, crop_id, name, number, removing))

    return commands


def _command_for(
    clause: str, crop_id: str, name: str, number: Optional[int], removing: bool
) -> List[Dict[str, Any]]:
    """The intent of one clause, applied to one crop it named."""
    base = {"crop_id": crop_id, "crop": name}

    if removing:
        return [dict(base, kind="remove_crop")]

    if _contains(clause, MORE_WORDS):
        if "double" in clause:
            return [dict(base, kind="scale_crop_count", factor=2.0)]
        return [dict(base, kind="adjust_crop_count", delta=number or 2)]

    if _contains(clause, LESS_WORDS):
        if "halve" in clause or "half" in clause:
            return [dict(base, kind="scale_crop_count", factor=0.5)]
        return [dict(base, kind="adjust_crop_count", delta=-(number or 2))]

    if number is not None:
        # "six tomatoes" / "set tomatoes to four" — an explicit count.
        return [dict(base, kind="set_crop_count", plants=number)]

    # An explicit "add", or a bare crop name, which is most usefully read the
    # same way: someone saying "basil" wants basil.
    return [dict(base, kind="add_crop")]


_LLM_SYSTEM = (
    "You convert a gardener's spoken request into JSON edits to their garden. "
    "Reply with only: {\"commands\":[...]}. Allowed command kinds: add_crop, "
    "remove_crop, set_crop_count, adjust_crop_count, scale_crop_count, "
    "clear_crops, select_all_crops, undo. Every command except clear_crops, "
    "select_all_crops and undo needs a crop_id from the allowed list. "
    "set_crop_count takes plants, adjust_crop_count takes delta (may be "
    "negative), scale_crop_count takes factor. Use only listed crop_ids."
)


def _parse_with_llm(transcript: str, crop_ids: List[str]) -> Optional[List[Dict[str, Any]]]:
    if not llm_client.is_available():
        return None
    payload = llm_client.complete_json(
        [
            {"role": "system", "content": _LLM_SYSTEM},
            {
                "role": "user",
                "content": "Allowed crop_ids: %s\nRequest: %s" % (", ".join(crop_ids), transcript),
            },
        ],
        temperature=0.1,
    )
    if not payload:
        return None
    commands = payload.get("commands")
    return commands if isinstance(commands, list) else None


def _validate(commands: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop anything that names a crop we do not have, or is malformed.

    The model is not trusted to stay inside the catalogue, and neither is a
    mis-heard transcript.
    """
    known = {crop["id"]: crop["name"] for crop in all_crops()}
    clean: List[Dict[str, Any]] = []

    for command in commands:
        if not isinstance(command, dict):
            continue
        kind = command.get("kind")
        if kind in ("clear_crops", "select_all_crops", "undo"):
            clean.append({"kind": kind})
            continue

        crop_id = command.get("crop_id")
        if crop_id not in known:
            logger.info("Dropping command for unknown crop %r", crop_id)
            continue
        entry: Dict[str, Any] = {"kind": kind, "crop_id": crop_id, "crop": known[crop_id]}

        if kind == "set_crop_count":
            plants = command.get("plants")
            if not isinstance(plants, (int, float)):
                continue
            entry["plants"] = max(0, min(MAX_PLANTS_PER_CROP, int(plants)))
        elif kind == "adjust_crop_count":
            delta = command.get("delta")
            if not isinstance(delta, (int, float)):
                continue
            entry["delta"] = max(-MAX_PLANTS_PER_CROP, min(MAX_PLANTS_PER_CROP, int(delta)))
        elif kind == "scale_crop_count":
            factor = command.get("factor")
            if not isinstance(factor, (int, float)) or factor <= 0:
                continue
            entry["factor"] = max(0.1, min(5.0, float(factor)))
        elif kind not in ("add_crop", "remove_crop"):
            continue

        clean.append(entry)

    return clean


def describe(command: Dict[str, Any]) -> str:
    """One short line per command, for the on-screen log."""
    crop = command.get("crop") or command.get("crop_id") or ""
    kind = command["kind"]
    if kind == "add_crop":
        return "Added %s" % crop
    if kind == "remove_crop":
        return "Removed %s" % crop
    if kind == "set_crop_count":
        return "Set %s to %d plants" % (crop, command["plants"])
    if kind == "adjust_crop_count":
        delta = command["delta"]
        return "%s %d %s" % ("Added" if delta > 0 else "Removed", abs(delta), crop)
    if kind == "scale_crop_count":
        return "%s %s" % ("Doubled" if command["factor"] >= 1 else "Halved", crop)
    if kind == "clear_crops":
        return "Cleared the garden"
    if kind == "select_all_crops":
        return "Added every recommended crop"
    if kind == "undo":
        return "Undid the last change"
    return kind


def parse_request(transcript: str) -> Dict[str, Any]:
    """Transcript -> validated commands, plus which parser produced them."""
    transcript = (transcript or "").strip()
    if not transcript:
        return {"commands": [], "generated_by": "empty", "understood": False}

    commands = _validate(_parse_with_rules(transcript))
    source = "rules"

    if not commands:
        from_llm = _parse_with_llm(transcript, [crop["id"] for crop in all_crops()])
        if from_llm:
            commands = _validate(from_llm)
            source = "%s (K2)" % llm_client.MODEL_STRUCTURED if commands else source

    return {
        "commands": commands,
        "generated_by": source,
        "understood": bool(commands),
        "descriptions": [describe(command) for command in commands],
    }
