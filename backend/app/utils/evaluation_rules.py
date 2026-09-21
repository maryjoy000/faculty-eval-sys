"""Per-evaluation-type submission rules shared by the API layer.

Classroom Observation is the Admin's rating-only form: it has no comment
box, no sentiment analysis, and no free-text storage. Rules live here (and
are enforced server-side) so the guarantee does not depend on any client
choosing not to send comments.
"""

COMMENT_ALLOWED_TYPES = {"student", "peerToPeer", "hrEvaluation"}


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
