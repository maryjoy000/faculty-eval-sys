"""Per-evaluation-type submission rules shared by the API layer.

Classroom Observation is the Admin's rating-only form: it has no comment
box, no sentiment analysis, and no free-text storage. Rules live here (and
are enforced server-side) so the guarantee does not depend on any client
choosing not to send comments.

Every comment-bearing type (student, peer-to-peer, HR) requires exactly
one written comment per submitted evaluation, so the sentiment corpus
always matches the evaluation count one-to-one.
"""

COMMENT_ALLOWED_TYPES = {"student", "peerToPeer", "hrEvaluation"}

COMMENT_REQUIRED_TYPES = {"student", "peerToPeer", "hrEvaluation"}


def sanitize_comments(type_code, comments):
    """Return the comment text that may be stored for this evaluation type.

    Returns None for types that do not accept comments (classroom
    observation) and for anything that is not a plain string.
    """
    if type_code not in COMMENT_ALLOWED_TYPES:
        return None

    if comments is None or not isinstance(comments, str):
        return None

    return comments


def validate_required_comment(type_code, comments):
    """Return an error message when a comment is required but missing.

    Every comment-bearing evaluation type requires exactly one written
    comment per submission (the 1:1 match the sentiment corpus needs).
    Classroom Observation is rating-only and always passes — its comments
    are dropped before storage anyway. Returns None when valid.
    """
    if type_code not in COMMENT_REQUIRED_TYPES:
        return None

    if comments is None or not isinstance(comments, str) or not comments.strip():
        return "A written comment is required to submit this evaluation."

    return None
