import os
import pandas as pd
import torch

from transformers import pipeline
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    classification_report,
    confusion_matrix,
)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_FILE = os.path.join(
    BASE_DIR,
    "dataset",
    "processed",
    "final_test_dataset.csv",
)

MODEL_NAME = "cardiffnlp/twitter-xlm-roberta-base-sentiment"

LABEL_MAP = {
    "LABEL_0": "negative",
    "LABEL_1": "neutral",
    "LABEL_2": "positive",
}

LABEL_TO_ID = {
    "negative": 0,
    "neutral": 1,
    "positive": 2,
}


def main():
    print("Loading test dataset...")

    df = pd.read_csv(TEST_FILE)

    required_columns = {"text", "sentiment"}

    if not required_columns.issubset(df.columns):
        missing = required_columns - set(df.columns)
        raise ValueError(f"Missing required columns: {missing}")

    df = df.dropna(subset=["text", "sentiment"]).copy()

    df["text"] = df["text"].astype(str)
    df["sentiment"] = df["sentiment"].str.lower().str.strip()

    print(f"Test records: {len(df)}")

    device = 0 if torch.cuda.is_available() else -1

    print(
        "Device:",
        "CUDA GPU" if torch.cuda.is_available() else "CPU"
    )

    print("Loading current XLM-R model...")

    classifier = pipeline(
        "sentiment-analysis",
        model=MODEL_NAME,
        tokenizer=MODEL_NAME,
        device=device,
    )

    print("Running baseline predictions...")

    predictions = []

    batch_size = 16 if torch.cuda.is_available() else 4

    texts = df["text"].tolist()

    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]

        results = classifier(
            batch,
            truncation=True,
            max_length=512,
        )

        for result in results:
            predictions.append(
                LABEL_MAP.get(
                    result["label"],
                    result["label"].lower()
                )
            )

        processed = min(start + batch_size, len(texts))
        print(f"Processed {processed}/{len(texts)}")

    df["predicted_sentiment"] = predictions

    y_true = df["sentiment"].map(LABEL_TO_ID)
    y_pred = df["predicted_sentiment"].map(LABEL_TO_ID)

    valid = y_true.notna() & y_pred.notna()

    y_true = y_true[valid]
    y_pred = y_pred[valid]

    accuracy = accuracy_score(y_true, y_pred)

    precision_macro, recall_macro, f1_macro, _ = (
        precision_recall_fscore_support(
            y_true,
            y_pred,
            average="macro",
            zero_division=0,
        )
    )

    precision_weighted, recall_weighted, f1_weighted, _ = (
        precision_recall_fscore_support(
            y_true,
            y_pred,
            average="weighted",
            zero_division=0,
        )
    )

    print("\n" + "=" * 60)
    print("BASELINE RESULTS")
    print("=" * 60)

    print(f"Accuracy:          {accuracy:.4f}")
    print(f"Macro Precision:   {precision_macro:.4f}")
    print(f"Macro Recall:      {recall_macro:.4f}")
    print(f"Macro F1:          {f1_macro:.4f}")
    print(f"Weighted Precision:{precision_weighted:.4f}")
    print(f"Weighted Recall:   {recall_weighted:.4f}")
    print(f"Weighted F1:       {f1_weighted:.4f}")

    print("\nClassification Report:")
    print(
        classification_report(
            y_true,
            y_pred,
            labels=[0, 1, 2],
            target_names=["negative", "neutral", "positive"],
            zero_division=0,
        )
    )

    print("Confusion Matrix:")
    print(
        confusion_matrix(
            y_true,
            y_pred,
            labels=[0, 1, 2],
        )
    )

    output_file = os.path.join(
        BASE_DIR,
        "dataset",
        "processed",
        "baseline_predictions.csv",
    )

    df.to_csv(output_file, index=False)

    print("\nPredictions saved to:")
    print(output_file)


if __name__ == "__main__":
    main()