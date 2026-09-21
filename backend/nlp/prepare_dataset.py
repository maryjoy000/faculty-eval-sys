from pathlib import Path

import pandas as pd


# ---------------------------------------------------------
# Paths
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "dataset" / "raw"
PROCESSED_DIR = BASE_DIR / "dataset" / "processed"

CLIENT_FILE = RAW_DIR / "client_comments.csv"
TAGASENTI_FILE = RAW_DIR / "tagasenti_dataset.csv"
FEEDBACK_FILE = RAW_DIR / "feedback_5000.csv"

MASTER_FILE = PROCESSED_DIR / "master_sentiment_dataset.csv"
CONFLICT_FILE = PROCESSED_DIR / "tagasenti_label_conflicts.csv"
DUPLICATE_FILE = PROCESSED_DIR / "feedback_duplicates.csv"


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def clean_text(value):
    if pd.isna(value):
        return ""

    return " ".join(str(value).strip().split())


def normalize_sentiment(value):
    if pd.isna(value):
        return None

    value = str(value).strip().lower()

    mapping = {
        "positive": "positive",
        "pos": "positive",

        "neutral": "neutral",
        "netural": "neutral",
        "neu": "neutral",

        "negative": "negative",
        "neg": "negative",
    }

    return mapping.get(value)


# ---------------------------------------------------------
# Client dataset
# ---------------------------------------------------------

def prepare_client_dataset():
    df = pd.read_csv(CLIENT_FILE)

    df = df.rename(
        columns={
            "comment": "text",
        }
    )

    df["text"] = df["text"].apply(clean_text)
    df["sentiment"] = df["sentiment"].apply(normalize_sentiment)

    df["source"] = "client"

    # Preserve the original evaluation type and relevance.
    df["evaluation_type"] = (
        df["evaluation_type"]
        .fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
    )

    df["relevance"] = (
        df["relevance"]
        .fillna("")
        .astype(str)
        .str.strip()
        .str.lower()
    )

    # Empty comments are not useful for sentiment training.
    df = df[df["text"] != ""].copy()

    # Keep the original client ID for traceability.
    columns = [
        "id",
        "text",
        "sentiment",
        "relevance",
        "evaluation_type",
        "source",
    ]

    return df[columns]


# ---------------------------------------------------------
# Tagasenti dataset
# ---------------------------------------------------------

def prepare_tagasenti_dataset():
    df = pd.read_csv(TAGASENTI_FILE)

    df = df.rename(
        columns={
            "sentence": "text",
        }
    )

    df["text"] = df["text"].apply(clean_text)

    label_mapping = {
        0: "negative",
        1: "neutral",
        2: "positive",
    }

    df["sentiment"] = pd.to_numeric(
        df["label"],
        errors="coerce"
    ).map(label_mapping)

    df["source"] = "tagasenti"
    df["relevance"] = "general"
    df["evaluation_type"] = "general"

    df = df[
        (df["text"] != "")
        & df["sentiment"].notna()
    ].copy()

    df["id"] = [
        f"tagasenti_{i}"
        for i in range(len(df))
    ]

    columns = [
        "id",
        "text",
        "sentiment",
        "relevance",
        "evaluation_type",
        "source",
    ]

    return df[columns]


# ---------------------------------------------------------
# Tagasenti duplicate/conflict analysis
# ---------------------------------------------------------

def analyze_tagasenti_conflicts():
    df = pd.read_csv(TAGASENTI_FILE)

    df = df.rename(
        columns={
            "sentence": "text",
        }
    )

    df["text"] = df["text"].apply(clean_text)

    label_mapping = {
        0: "negative",
        1: "neutral",
        2: "positive",
    }

    df["sentiment"] = pd.to_numeric(
        df["label"],
        errors="coerce"
    ).map(label_mapping)

    df = df[
        (df["text"] != "")
        & df["sentiment"].notna()
    ].copy()

    # Find sentences that have more than one sentiment label.
    conflict_counts = (
        df.groupby("text")["sentiment"]
        .nunique()
        .reset_index(name="label_count")
    )

    conflicts = conflict_counts[
        conflict_counts["label_count"] > 1
    ]

    if conflicts.empty:
        return pd.DataFrame(
            columns=["text", "sentiment"]
        )

    conflict_texts = conflicts["text"].tolist()

    return (
        df[df["text"].isin(conflict_texts)]
        .sort_values("text")
        [["text", "sentiment"]]
    )


# ---------------------------------------------------------
# Feedback 5000
# ---------------------------------------------------------

def prepare_feedback_dataset():
    df = pd.read_csv(FEEDBACK_FILE)

    df["Comment"] = df["Comment"].apply(clean_text)

    df["Sentiment"] = df["Sentiment"].apply(
        normalize_sentiment
    )

    # Keep only the fields needed for NLP.
    df = df.rename(
        columns={
            "Feedback_ID": "id",
            "Comment": "text",
            "Sentiment": "sentiment",
        }
    )

    df["source"] = "feedback_5000"
    df["relevance"] = "performance"
    df["evaluation_type"] = "student"

    df = df[
        (df["text"] != "")
        & df["sentiment"].notna()
    ].copy()

    columns = [
        "id",
        "text",
        "sentiment",
        "relevance",
        "evaluation_type",
        "source",
    ]

    return df[columns]


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():
    PROCESSED_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    print("\nPreparing client dataset...")
    client = prepare_client_dataset()

    print("Preparing Tagasenti dataset...")
    tagasenti = prepare_tagasenti_dataset()

    print("Checking Tagasenti label conflicts...")
    conflicts = analyze_tagasenti_conflicts()

    if not conflicts.empty:
        conflict_texts = set(conflicts["text"].unique())

        tagasenti = tagasenti[
            ~tagasenti["text"].isin(conflict_texts)
        ].copy()

    print("Preparing feedback_5000...")
    feedback = prepare_feedback_dataset()

    # -----------------------------------------------------
    # Remove exact duplicate comments within each source.
    # -----------------------------------------------------

    client = client.drop_duplicates(
        subset=["text", "sentiment"]
    )

    tagasenti = tagasenti.drop_duplicates(
        subset=["text", "sentiment"]
    )

    feedback = feedback.drop_duplicates(
        subset=["text", "sentiment"]
    )

    # -----------------------------------------------------
    # Combine datasets.
    # -----------------------------------------------------

    master = pd.concat(
        [
            client,
            tagasenti,
            feedback,
        ],
        ignore_index=True
    )

    # Remove empty/invalid sentiment rows.
    master = master[
        (master["text"] != "")
        & master["sentiment"].isin(
            [
                "positive",
                "neutral",
                "negative",
            ]
        )
    ].copy()

    # Remove exact duplicates across all datasets.
    master = master.drop_duplicates(
        subset=["text", "sentiment"]
    ).reset_index(drop=True)

    # Give every final record a unique ID.
    master["id"] = [
        f"sample_{i + 1}"
        for i in range(len(master))
    ]

    # -----------------------------------------------------
    # Save files.
    # -----------------------------------------------------

    master.to_csv(
        MASTER_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    conflicts.to_csv(
        CONFLICT_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    # Save duplicate feedback comments for inspection.
    feedback_original = pd.read_csv(FEEDBACK_FILE)
    feedback_original["Comment"] = (
        feedback_original["Comment"]
        .apply(clean_text)
    )

    duplicate_comments = (
        feedback_original[
            feedback_original["Comment"] != ""
        ]
        .loc[
            feedback_original["Comment"].duplicated(
                keep=False
            )
        ]
        .sort_values("Comment")
    )

    duplicate_comments.to_csv(
        DUPLICATE_FILE,
        index=False,
        encoding="utf-8-sig"
    )

    # -----------------------------------------------------
    # Report
    # -----------------------------------------------------

    print("\n========================================")
    print("DATASET PREPARATION COMPLETE")
    print("========================================")

    print(f"\nClient records:     {len(client):,}")
    print(f"Tagasenti records:  {len(tagasenti):,}")
    print(f"Feedback records:   {len(feedback):,}")
    print(f"Final records:      {len(master):,}")

    print("\nFinal sentiment distribution:")
    print(
        master["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nFinal source distribution:")
    print(
        master["source"]
        .value_counts()
        .to_string()
    )

    print(
        f"\nTagasenti conflicting texts: "
        f"{conflicts['text'].nunique():,}"
    )

    print("\nFiles created:")
    print(f"  {MASTER_FILE}")
    print(f"  {CONFLICT_FILE}")
    print(f"  {DUPLICATE_FILE}")


if __name__ == "__main__":
    main()