from datetime import timezone


def utc_iso(value):
    """Serialize a UTC datetime for the API with an explicit offset.

    All timestamps are stored as naive UTC wall-clock (``datetime.utcnow``).
    Plain ``isoformat()`` carries no offset, so browsers parse it as *local*
    time and every displayed time skews (e.g. 8h behind in Asia/Manila).
    This helper appends ``Z`` and drops microseconds so the wire format is
    uniform (``YYYY-MM-DDTHH:MM:SSZ``), which also keeps lexicographic
    string sorting correct.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(microsecond=0).isoformat() + "Z"
    return (
        value.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
