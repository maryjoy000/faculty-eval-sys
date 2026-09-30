"""Unit tests for comment rules per evaluation type."""

from app.utils.evaluation_rules import sanitize_comments, validate_required_comment


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


def test_required_comment_accepts_real_text():
    for type_code in ("student", "peerToPeer", "hrEvaluation"):
        assert validate_required_comment(type_code, "Great teaching!") is None


def test_required_comment_rejects_missing_and_blank():
    for type_code in ("student", "peerToPeer", "hrEvaluation"):
        assert validate_required_comment(type_code, None) is not None
        assert validate_required_comment(type_code, "") is not None
        assert validate_required_comment(type_code, "   ") is not None
        assert validate_required_comment(type_code, 123) is not None


def test_required_comment_exempts_classroom_observation():
    # Rating-only by design: no comment box exists, so none is required.
    assert validate_required_comment("classroomObservation", None) is None
    assert validate_required_comment("classroomObservation", "") is None
    assert validate_required_comment("unknownType", None) is None
