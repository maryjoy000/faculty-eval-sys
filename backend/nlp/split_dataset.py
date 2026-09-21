from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "dataset" / "processed"

INPUT_FILE = PROCESSED_DIR / "training_candidates.csv"

TRAIN_FILE = PROCESSED_DIR / "training_dataset.csv"
VALIDATION_FILE = PROCESSED_DIR / "validation_dataset.csv"
TEST_FILE = PROCESSED_DIR / "test_dataset.csv"


RANDOM_STATE = 42


def main():
    df = pd.read_csv(INPUT_FILE)

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

    df = df[
        (df["text"] != "")
        & df["sentiment"].isin(
            ["negative", "neutral", "positive"]
        )
    ].copy()

    # -----------------------------------------------------
    # First split:
    # 80% training
    # 20% temporary
    # -----------------------------------------------------

    train, temporary = train_test_split(
        df,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=df["sentiment"],
    )

    # -----------------------------------------------------
    # Second split:
    # Half of temporary → validation
    # Half of temporary → test
    #
    # Result:
    # 80% training
    # 10% validation
    # 10% test
    # -----------------------------------------------------

    validation, test = train_test_split(
        temporary,
        test_size=0.50,
        random_state=RANDOM_STATE,
        stratify=temporary["sentiment"],
    )

    # -----------------------------------------------------
    # Reset IDs
    # -----------------------------------------------------

    train = train.reset_index(drop=True)
    validation = validation.reset_index(drop=True)
    test = test.reset_index(drop=True)

    train["split_id"] = [
        f"train_{i + 1}"
        for i in range(len(train))
    ]

    validation["split_id"] = [
        f"validation_{i + 1}"
        for i in range(len(validation))
    ]

    test["split_id"] = [
        f"test_{i + 1}"
        for i in range(len(test))
    ]

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

    # -----------------------------------------------------
    # Report
    # -----------------------------------------------------

    print("\n========================================")
    print("DATASET SPLIT COMPLETE")
    print("========================================")

    print(f"\nTotal records:      {len(df):,}")
    print(f"Training records:   {len(train):,}")
    print(f"Validation records: {len(validation):,}")
    print(f"Test records:       {len(test):,}")

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

    print("\nFiles created:")
    print(f"  {TRAIN_FILE}")
    print(f"  {VALIDATION_FILE}")
    print(f"  {TEST_FILE}")


if __name__ == "__main__":
    main()