from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "dataset" / "processed"

INPUT_FILE = PROCESSED_DIR / "training_candidates.csv"

CLIENT_TRAIN_FILE = PROCESSED_DIR / "client_training.csv"
CLIENT_VALIDATION_FILE = PROCESSED_DIR / "client_validation.csv"
CLIENT_TEST_FILE = PROCESSED_DIR / "client_test.csv"

RANDOM_STATE = 42


def main():
    df = pd.read_csv(INPUT_FILE)

    client = df[
        df["source"].astype(str).str.lower().str.strip() == "client"
    ].copy()

    client["text"] = (
        client["text"]
        .fillna("")
        .astype(str)
        .str.strip()
    )

    client["sentiment"] = (
        client["sentiment"]
        .fillna("")
        .astype(str)
        .str.lower()
        .str.strip()
    )

    client = client[
        (client["text"] != "")
        & client["sentiment"].isin(
            ["positive", "neutral", "negative"]
        )
    ].copy()

    # -----------------------------------------------------
    # Reserve neutral examples deliberately.
    # The client dataset has no negative examples, so we
    # do not invent or relabel any.
    # -----------------------------------------------------

    neutral = client[
        client["sentiment"] == "neutral"
    ].sample(
        frac=1,
        random_state=RANDOM_STATE
    )

    positive = client[
        client["sentiment"] == "positive"
    ].sample(
        frac=1,
        random_state=RANDOM_STATE
    )

    # Reserve:
    # 1 neutral for validation
    # 1 neutral for test
    neutral_validation = neutral.iloc[:1]
    neutral_test = neutral.iloc[1:2]
    neutral_training = neutral.iloc[2:]

    # Split positive comments 70/15/15.
    positive_training, positive_temp = train_test_split(
        positive,
        test_size=0.30,
        random_state=RANDOM_STATE,
        shuffle=True,
    )

    positive_validation, positive_test = train_test_split(
        positive_temp,
        test_size=0.50,
        random_state=RANDOM_STATE,
        shuffle=True,
    )

    # -----------------------------------------------------
    # Combine each split.
    # -----------------------------------------------------

    client_train = pd.concat(
        [
            positive_training,
            neutral_training,
        ],
        ignore_index=True,
    )

    client_validation = pd.concat(
        [
            positive_validation,
            neutral_validation,
        ],
        ignore_index=True,
    )

    client_test = pd.concat(
        [
            positive_test,
            neutral_test,
        ],
        ignore_index=True,
    )

    # Shuffle each split.
    client_train = client_train.sample(
        frac=1,
        random_state=RANDOM_STATE
    ).reset_index(drop=True)

    client_validation = client_validation.sample(
        frac=1,
        random_state=RANDOM_STATE
    ).reset_index(drop=True)

    client_test = client_test.sample(
        frac=1,
        random_state=RANDOM_STATE
    ).reset_index(drop=True)

    # -----------------------------------------------------
    # Add split identifiers.
    # -----------------------------------------------------

    client_train["split_id"] = [
        f"client_train_{i + 1}"
        for i in range(len(client_train))
    ]

    client_validation["split_id"] = [
        f"client_validation_{i + 1}"
        for i in range(len(client_validation))
    ]

    client_test["split_id"] = [
        f"client_test_{i + 1}"
        for i in range(len(client_test))
    ]

    # -----------------------------------------------------
    # Save.
    # -----------------------------------------------------

    client_train.to_csv(
        CLIENT_TRAIN_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    client_validation.to_csv(
        CLIENT_VALIDATION_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    client_test.to_csv(
        CLIENT_TEST_FILE,
        index=False,
        encoding="utf-8-sig",
    )

    # -----------------------------------------------------
    # Report.
    # -----------------------------------------------------

    print("\n========================================")
    print("CLIENT DATASET SPLIT COMPLETE")
    print("========================================")

    print(f"\nTotal client candidates: {len(client):,}")
    print(f"Client training:         {len(client_train):,}")
    print(f"Client validation:       {len(client_validation):,}")
    print(f"Client test:             {len(client_test):,}")

    print("\nClient training distribution:")
    print(
        client_train["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nClient validation distribution:")
    print(
        client_validation["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nClient test distribution:")
    print(
        client_test["sentiment"]
        .value_counts()
        .to_string()
    )

    print("\nFiles created:")
    print(f"  {CLIENT_TRAIN_FILE}")
    print(f"  {CLIENT_VALIDATION_FILE}")
    print(f"  {CLIENT_TEST_FILE}")


if __name__ == "__main__":
    main()