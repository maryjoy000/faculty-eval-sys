"""Unit tests for comment rules per evaluation type."""

from app.utils.evaluation_rules import sanitize_comments


def test_classroom_observation_drops_comments():
    assert sanitize_comments("classroomObservation", "Great teaching!") is None
    assert sanitize_comments("classroomObservation", None) is None


def test_comment_types_pass_text_through():
    for type_code in ("student", "peerToPeer", "hrEvaluation"):
        assert sanitize_comments(type_code, "Nice work") == "Nice work"


def test_unknown_type_drops_comments():
    assert sanitize_comments("notARealType", "hello") is None


def test_non_string_payloads_are_rejected():
    assert sanitize_comments("student", 123) is None
    assert sanitize_comments("student", ["a"]) is None
    assert sanitize_comments("student", {"text": "x"}) is None


def test_empty_and_whitespace_strings_pass_through():
    # analyze_sentiment treats blank text as "no sentiment" on its own;
    # storage keeps exactly what was submitted.
    assert sanitize_comments("student", "") == ""
    assert sanitize_comments("student", "   ") == "   "
