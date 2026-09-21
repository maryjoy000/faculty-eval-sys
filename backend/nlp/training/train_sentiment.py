import os
import numpy as np
import pandas as pd
import torch

from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
)


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TRAIN_FILE = os.path.join(
    BASE_DIR,
    "dataset",
    "processed",
    "final_training_dataset.csv",
)

VALIDATION_FILE = os.path.join(
    BASE_DIR,
    "dataset",
    "processed",
    "final_validation_dataset.csv",
)

MODEL_NAME = "cardiffnlp/twitter-xlm-roberta-base-sentiment"

OUTPUT_DIR = os.path.join(
    BASE_DIR,
    "models",
    "xlmr-finetuned",
)


LABEL2ID = {
    "negative": 0,
    "neutral": 1,
    "positive": 2,
}

ID2LABEL = {
    0: "negative",
    1: "neutral",
    2: "positive",
}


def load_dataset_file(path):
    df = pd.read_csv(path)

    required_columns = {"text", "sentiment"}

    if not required_columns.issubset(df.columns):
        missing = required_columns - set(df.columns)
        raise ValueError(
            f"{path} is missing columns: {missing}"
        )

    df = df.dropna(
        subset=["text", "sentiment"]
    ).copy()

    df["text"] = df["text"].astype(str)

    df["sentiment"] = (
        df["sentiment"]
        .astype(str)
        .str.lower()
        .str.strip()
    )

    df = df[
        df["sentiment"].isin(LABEL2ID)
    ]

    df["label"] = df["sentiment"].map(
        LABEL2ID
    )

    return df[["text", "label"]]


def main():

    print("=" * 60)
    print("XLM-R SENTIMENT FINE-TUNING")
    print("=" * 60)

    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA is not available. "
            "The RTX 2050 was not detected by PyTorch."
        )

    device_name = torch.cuda.get_device_name(0)

    print(f"\nGPU: {device_name}")
    print(f"CUDA: {torch.version.cuda}")

    print("\nLoading datasets...")

    train_df = load_dataset_file(
        TRAIN_FILE
    )

    validation_df = load_dataset_file(
        VALIDATION_FILE
    )

    print(
        f"Training records:   {len(train_df)}"
    )

    print(
        f"Validation records: {len(validation_df)}"
    )

    print("\nTraining distribution:")

    print(
        train_df["label"]
        .value_counts()
        .sort_index()
    )

    print("\nValidation distribution:")

    print(
        validation_df["label"]
        .value_counts()
        .sort_index()
    )

    print("\nLoading tokenizer...")

    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_NAME
    )

    print("Loading XLM-R model...")

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    train_dataset = Dataset.from_pandas(
        train_df,
        preserve_index=False,
    )

    validation_dataset = Dataset.from_pandas(
        validation_df,
        preserve_index=False,
    )

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            max_length=256,
        )

    print("\nTokenizing training data...")

    train_dataset = train_dataset.map(
        tokenize,
        batched=True,
        remove_columns=["text"],
    )

    print("Tokenizing validation data...")

    validation_dataset = validation_dataset.map(
        tokenize,
        batched=True,
        remove_columns=["text"],
    )

    def compute_metrics(eval_pred):

        logits, labels = eval_pred

        predictions = np.argmax(
            logits,
            axis=-1,
        )

        accuracy = accuracy_score(
            labels,
            predictions,
        )

        precision_macro, recall_macro, f1_macro, _ = (
            precision_recall_fscore_support(
                labels,
                predictions,
                average="macro",
                zero_division=0,
            )
        )

        precision_weighted, recall_weighted, f1_weighted, _ = (
            precision_recall_fscore_support(
                labels,
                predictions,
                average="weighted",
                zero_division=0,
            )
        )

        return {
            "accuracy": accuracy,
            "macro_precision": precision_macro,
            "macro_recall": recall_macro,
            "macro_f1": f1_macro,
            "weighted_precision": precision_weighted,
            "weighted_recall": recall_weighted,
            "weighted_f1": f1_weighted,
        }

    print("\nConfiguring GPU training...")

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,

        num_train_epochs=2,

        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,

        gradient_accumulation_steps=16,

        learning_rate=2e-5,
        weight_decay=0.01,

        eval_strategy="epoch",
        save_strategy="epoch",

        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,

        logging_strategy="steps",
        logging_steps=100,

        save_total_limit=2,

        report_to="none",

        fp16=True,
        bf16=False,

        dataloader_num_workers=0,

        gradient_checkpointing=True,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        processing_class=tokenizer,
        compute_metrics=compute_metrics,
    )

    print("\nStarting fine-tuning...")
    print()
    print("GPU:", device_name)
    print("Batch size: 1")
    print("Gradient accumulation: 16")
    print("Maximum tokens: 256")
    print("Epochs: 2")
    print("FP16: enabled")
    print()
    print("Training may take some time.")
    print("Do not close the terminal while training.")
    print()

    trainer.train()

    print("\n" + "=" * 60)
    print("FINAL VALIDATION RESULTS")
    print("=" * 60)

    results = trainer.evaluate()

    for key, value in results.items():

        if isinstance(value, float):
            print(
                f"{key}: {value:.4f}"
            )
        else:
            print(
                f"{key}: {value}"
            )

    print("\nSaving fine-tuned model...")

    trainer.save_model(
        OUTPUT_DIR
    )

    tokenizer.save_pretrained(
        OUTPUT_DIR
    )

    print("\nModel saved to:")

    print(OUTPUT_DIR)

    print("\nFine-tuning completed successfully.")


if __name__ == "__main__":
    main()