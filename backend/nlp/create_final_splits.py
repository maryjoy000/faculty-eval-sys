from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "dataset" / "processed"

INPUT_FILE = PROCESSED_DIR / "training_candidates.csv"

TRAIN_FILE = PROCESSED_DIR / "final_training_dataset.csv"
VALIDATION_FILE = PROCESSED_DIR / "final_validation_dataset.csv"
TEST_FILE = PROCESSED_DIR / "final_test_dataset.csv"

RANDOM_STATE = 42


def clean(df):
    df = df.copy()

    df["text"] = (
        df["text"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    df["sentiment"] = (
        df["sentiment"]
        .fillna("")
        .astype(str)
        .str.lower()
        .str.strip()
    )

    return df[
        (df["text"] != "")
        & df["sentiment"].isin(
            ["positive", "neutral", "negative"]
        )
    ].copy()


def main():
    df = clean(pd.read_csv(INPUT_FILE))

    # -----------------------------------------------------
    # PUBLIC DATA
    #
    # Only Tagasenti + feedback_5000.
    # Client comments are deliberately excluded here.
    # -----------------------------------------------------

    public = df[df["source"] != "client"].copy()

    public_train, public_temp = train_test_split(
        public,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=public["sentiment"],
    )

    public_validation, public_test = train_test_split(
        public_temp,
        test_size=0.50,
        random_state=RANDOM_STATE,
        stratify=public_temp["sentiment"],
    )

    # -----------------------------------------------------
    # CLIENT DATA
    #
    # These were already deliberately split.
    # -----------------------------------------------------

    client_train = clean(
        pd.read_csv(
            PROCESSED_DIR / "client_training.csv"
        )
    )

    client_validation = clean(
        pd.read_csv(
            PROCESSED_DIR / "client_validation.csv"
        )
    )

    client_test = clean(
        pd.read_csv(
            PROCESSED_DIR / "client_test.csv"
        )
    )

    # -----------------------------------------------------
    # FINAL TRAINING
    #
    # Public training + client training.
    # -----------------------------------------------------

    train = pd.concat(
        [
            public_train,
            client_train,
        ],
        ignore_index=True,
    )

    # -----------------------------------------------------
    # FINAL VALIDATION
    #
    # Public validation + unseen client validation.
    # -----------------------------------------------------

    validation = pd.concat(
        [
            public_validation,
            client_validation,
        ],
        ignore_index=True,
    )

    # -----------------------------------------------------
    # FINAL TEST
    #
    # Public test + completely unseen client test.
    # -----------------------------------------------------

    test = pd.concat(
        [
            public_test,
            client_test,
        ],
        ignore_index=True,
    )

    # -----------------------------------------------------
    # Remove exact duplicate texts across splits.
    #
    # This is a safety check. It should report zero overlap.
    # -----------------------------------------------------

    train_texts = set(train["text"].str.lower())
    validation_texts = set(validation["text"].str.lower())
    test_texts = set(test["text"].str.lower())

    train_validation_overlap = (
        train_texts & validation_texts
    )

    train_test_overlap = (
        train_texts & test_texts
    )

    validation_test_overlap = (
        validation_texts & test_texts
    )
    # -----------------------------------------------------
    # Remove validation/test overlap.
    # Keep the example in validation and remove it from test.
    # -----------------------------------------------------

    if validation_test_overlap:
        test = test[
            ~test["text"].str.lower().isin(
                validation_test_overlap
            )
        ].copy()

        test = test.reset_index(drop=True)

    # Recalculate overlap after removal.
    test_texts = set(test["text"].str.lower())

    train_validation_overlap = (
        train_texts & validation_texts
    )

    train_test_overlap = (
        train_texts & test_texts
    )

    validation_test_overlap = (
        validation_texts & test_texts
    )

    print("\n========================================")
    print("FINAL DATASET SPLIT")
    print("========================================")

    print(f"\nTraining records:   {len(train):,}")
    print(f"Validation records: {len(validation):,}")
    print(f"Test records:       {len(test):,}")

    print("\nText overlap check:")
    print(
        f"Train ↔ Validation: "
        f"{len(train_validation_overlap):,}"
    )
    print(
        f"Train ↔ Test:       "
        f"{len(train_test_overlap):,}"
    )
    print(
        f"Validation ↔ Test:  "
        f"{len(validation_test_overlap):,}"
    )

    print("\nTraining distribution:")
    print(
        train["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nValidation distribution:")
    print(
        validation["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nTest distribution:")
    print(
        test["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nTest source distribution:")
    print(
        test["source"]
        .value_counts()
        .to_string()
    )

    print("\nTest client distribution:")
    print(
        test[
            test["source"] == "client"
        ]["sentiment"]
        .value_counts()
        .to_string()
    )

    # -----------------------------------------------------
    # Save
    # -----------------------------------------------------

    train.to_csv(
        TRAIN_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    validation.to_csv(
        VALIDATION_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    test.to_csv(
        TEST_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    print("\nFiles created:")
    print(f"  {TRAIN_FILE}")
    print(f"  {VALIDATION_FILE}")
    print(f"  {TEST_FILE}")


if __name__ == "__main__":
    main()