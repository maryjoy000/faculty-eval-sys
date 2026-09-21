from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "dataset" / "processed"

MASTER_FILE = PROCESSED_DIR / "master_sentiment_dataset.csv"
OUTPUT_FILE = PROCESSED_DIR / "training_candidates.csv"
EXCLUDED_FILE = PROCESSED_DIR / "excluded_client_comments.csv"


def clean_text(value):
    if pd.isna(value):
        return ""

    return " ".join(str(value).strip().split())


def is_uninformative_general_comment(text):
    """
    Exclude very short/general acknowledgements that provide
    little useful sentiment information for supervised training.
    """

    normalized = text.lower().strip()

    excluded = {
        "ty",
        "ty ma'am",
        "ty mam",
        "thank you ma'am",
        "thank you mam",
        "thank you sir",
        "thanks ma'am",
        "thanks mam",
        "thanks sir",
        "ok",
        "ok po",
        "nice",
    }

    return normalized in excluded


def main():
    df = pd.read_csv(MASTER_FILE)

    df["text"] = df["text"].apply(clean_text)
    df["sentiment"] = (
        df["sentiment"]
        .fillna("")
        .astype(str)
        .str.lower()
        .str.strip()
    )

    df["source"] = (
        df["source"]
        .fillna("")
        .astype(str)
        .str.lower()
        .str.strip()
    )

    df["relevance"] = (
        df["relevance"]
        .fillna("")
        .astype(str)
        .str.lower()
        .str.strip()
    )

    # -----------------------------------------------------
    # Separate client comments from public datasets.
    # -----------------------------------------------------

    client = df[df["source"] == "client"].copy()
    public = df[df["source"] != "client"].copy()

    # -----------------------------------------------------
    # Exclude client comments marked irrelevant.
    # -----------------------------------------------------

    excluded = client[
        client["relevance"] == "irrelevant"
    ].copy()

    client_candidates = client[
        client["relevance"] != "irrelevant"
    ].copy()

    # -----------------------------------------------------
    # Exclude very short/ambiguous general acknowledgements.
    # -----------------------------------------------------

    short_general_mask = (
        (client_candidates["relevance"] == "general")
        & client_candidates["text"].apply(
            is_uninformative_general_comment
        )
    )

    short_general = client_candidates[
        short_general_mask
    ].copy()

    excluded = pd.concat(
        [
            excluded,
            short_general,
        ],
        ignore_index=True
    )

    client_candidates = client_candidates[
        ~short_general_mask
    ].copy()

    # -----------------------------------------------------
    # Combine public + client candidates.
    # -----------------------------------------------------

    candidates = pd.concat(
        [
            public,
            client_candidates,
        ],
        ignore_index=True
    )

    candidates = candidates[
        candidates["text"] != ""
    ].copy()

    candidates = candidates[
        candidates["sentiment"].isin(
            [
                "positive",
                "neutral",
                "negative",
            ]
        )
    ].copy()

    # Remove exact duplicate text + sentiment pairs.
    candidates = candidates.drop_duplicates(
        subset=["text", "sentiment"]
    ).reset_index(drop=True)

    # Create clean IDs.
    candidates["id"] = [
        f"candidate_{i + 1}"
        for i in range(len(candidates))
    ]

    # Keep a consistent column order.
    columns = [
        "id",
        "text",
        "sentiment",
        "relevance",
        "evaluation_type",
        "source",
    ]

    candidates = candidates[columns]

    excluded = excluded[
        [
            "id",
            "text",
            "sentiment",
            "relevance",
            "evaluation_type",
            "source",
        ]
    ]

    # -----------------------------------------------------
    # Save.
    # -----------------------------------------------------

    candidates.to_csv(
        OUTPUT_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    excluded.to_csv(
        EXCLUDED_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    # -----------------------------------------------------
    # Report.
    # -----------------------------------------------------

    print("\n========================================")
    print("TRAINING CANDIDATE PREPARATION COMPLETE")
    print("========================================")

    print(f"\nCandidate records: {len(candidates):,}")
    print(f"Excluded client records: {len(excluded):,}")

    print("\nCandidate sentiment distribution:")
    print(
        candidates["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nCandidate source distribution:")
    print(
        candidates["source"]
        .value_counts()
        .to_string()
    )

    print("\nExcluded client comments by relevance:")
    print(
        excluded["relevance"]
        .value_counts()
        .to_string()
    )

    print("\nFiles created:")
    print(f"  {OUTPUT_FILE}")
    print(f"  {EXCLUDED_FILE}")


if __name__ == "__main__":
    main()