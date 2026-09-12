"""What the parser makes of things people actually say.

These pin the deterministic path specifically — it runs first, needs no API
key, and is what the demo falls back to when the network is hostile. Every case
here is phrased the way someone would say it out loud, not the way an API
would want it.
"""

import pytest

from services.garden_voice import parse_request


def kinds(transcript):
    return [command["kind"] for command in parse_request(transcript)["commands"]]


def first(transcript):
    commands = parse_request(transcript)["commands"]
    assert commands, "nothing parsed from %r" % transcript
    return commands[0]


@pytest.mark.parametrize(
    "said",
    [
        "add some basil",
        "I want to plant basil",
        "throw in basil",
        "basil",
    ],
)
def test_adding_a_crop(said):
    command = first(said)
    assert command["kind"] in ("add_crop", "set_crop_count")
    assert command["crop_id"] == "basil"


@pytest.mark.parametrize(
    "said",
    [
        "remove the kale",
        "get rid of kale",
        "I don't want any kale",
        "I hate kale",
        "drop kale",
    ],
)
def test_removing_a_crop(said):
    command = first(said)
    assert command["kind"] == "remove_crop"
    assert command["crop_id"] == "kale"


def test_an_explicit_count():
    command = first("give me six tomatoes")
    assert command["kind"] == "set_crop_count"
    assert command["crop_id"] == "tomato"
    assert command["plants"] == 6


def test_a_spoken_number():
    command = first("plant three zucchini")
    assert command["plants"] == 3


def test_more_of_something():
    command = first("more spinach please")
    assert command["kind"] == "adjust_crop_count"
    assert command["crop_id"] == "spinach"
    assert command["delta"] > 0


def test_fewer_of_something():
    command = first("fewer radishes")
    assert command["kind"] == "adjust_crop_count"
    assert command["delta"] < 0


def test_doubling():
    command = first("double the lettuce")
    assert command["kind"] == "scale_crop_count"
    assert command["factor"] == 2.0


def test_halving():
    command = first("halve the mint")
    assert command["kind"] == "scale_crop_count"
    assert command["factor"] == 0.5


def test_cherry_tomatoes_beat_tomatoes():
    """The longer crop name has to win, or every cherry tomato becomes a tomato."""
    assert first("add cherry tomatoes")["crop_id"] == "cherry-tomato"
    assert first("add tomatoes")["crop_id"] == "tomato"


@pytest.mark.parametrize(
    "said,expected",
    [
        ("add scallions", "green-onion"),
        ("plant some chard", "swiss-chard"),
        ("I want jalapeños", "jalapeno"),
        ("add courgettes", "zucchini"),
        ("more beans", "green-beans"),
    ],
)
def test_synonyms_people_actually_use(said, expected):
    assert first(said)["crop_id"] == expected


def test_two_instructions_in_one_breath():
    result = parse_request("add basil and remove the kale")
    assert [command["kind"] for command in result["commands"]] == ["add_crop", "remove_crop"]
    assert result["commands"][0]["crop_id"] == "basil"
    assert result["commands"][1]["crop_id"] == "kale"


def test_a_list_of_crops_is_not_split_into_nonsense():
    result = parse_request("add basil, mint and parsley")
    crop_ids = {command["crop_id"] for command in result["commands"]}
    assert "basil" in crop_ids and "mint" in crop_ids


def test_undo():
    assert kinds("undo that") == ["undo"]
    assert kinds("never mind") == ["undo"]


def test_clearing():
    assert kinds("clear everything") == ["clear_crops"]


def test_an_unknown_crop_is_dropped_not_invented():
    """Mis-hearings and crops we do not stock must not reach the layout call."""
    result = parse_request("add some dragonfruit")
    assert result["commands"] == []
    assert result["understood"] is False


def test_silence_is_handled():
    result = parse_request("   ")
    assert result["understood"] is False
    assert result["commands"] == []


def test_counts_are_clamped():
    command = first("plant 900 tomatoes")
    assert command["plants"] <= 60


def test_descriptions_are_human_readable():
    result = parse_request("add basil and remove the kale")
    assert result["descriptions"] == ["Added Basil", "Removed Kale"]


def test_two_different_verbs_in_one_sentence():
    """"add mint and double the tomatoes" is two instructions, not one applied twice.

    Before the clause splitter knew about count verbs, the "double" leaked onto
    the mint as well and planted eight of them.
    """
    result = parse_request("add mint and double the tomatoes")
    by_crop = {command["crop_id"]: command for command in result["commands"]}

    assert by_crop["mint"]["kind"] == "add_crop"
    assert by_crop["tomato"]["kind"] == "scale_crop_count"
    assert by_crop["tomato"]["factor"] == 2.0


@pytest.mark.parametrize(
    "said,expected_kinds",
    [
        ("add basil and more spinach", {"basil": "add_crop", "spinach": "adjust_crop_count"}),
        ("remove the kale and add six tomatoes", {"kale": "remove_crop", "tomato": "set_crop_count"}),
        ("halve the lettuce and get rid of the peas", {"lettuce": "scale_crop_count", "peas": "remove_crop"}),
    ],
)
def test_mixed_instructions_stay_separate(said, expected_kinds):
    result = parse_request(said)
    by_crop = {command["crop_id"]: command["kind"] for command in result["commands"]}
    for crop_id, kind in expected_kinds.items():
        assert by_crop.get(crop_id) == kind, "%r gave %s" % (said, by_crop)


def test_a_plain_list_of_crops_still_is_not_split():
    """The fix must not break "basil and mint", which is one instruction."""
    result = parse_request("add basil and mint")
    assert {command["crop_id"] for command in result["commands"]} == {"basil", "mint"}
    assert all(command["kind"] == "add_crop" for command in result["commands"])
