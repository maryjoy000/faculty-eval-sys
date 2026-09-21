import os
import gc
import time
import psutil
import torch

from transformers import AutoModelForSequenceClassification, AutoTokenizer


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "backend",
    "nlp",
    "models",
    "xlmr-finetuned",
)

process = psutil.Process(os.getpid())


def memory_mb():
    return process.memory_info().rss / (1024 * 1024)


print("=" * 60)
print("XLM-R STANDALONE QUANTIZED MODEL TEST")
print("=" * 60)

print(f"Model path: {MODEL_PATH}")
print(f"RAM at start: {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Load original
# ---------------------------------------------------------

print()
print("Loading original model...")

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
)

model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
)

model.eval()

print(f"RAM after original: {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Quantize
# ---------------------------------------------------------

print()
print("Creating 8-bit quantized model...")

start = time.perf_counter()

quantized_model = torch.ao.quantization.quantize_dynamic(
    model,
    {torch.nn.Linear},
    dtype=torch.qint8,
)

quantization_time = time.perf_counter() - start

print(f"Quantization time: {quantization_time:.2f} seconds")
print(f"RAM with both models: {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Remove original model
# ---------------------------------------------------------

print()
print("Removing original model from memory...")

del model
gc.collect()

print(f"RAM with quantized model only: {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Test comments
# ---------------------------------------------------------

comments = [
    "The faculty member explains the lessons clearly and provides helpful feedback.",
    "The teacher is always late and does not explain the lessons properly.",
    "The instructor is okay and covers the required topics.",
    "The faculty member is very approachable and encourages students to participate.",
    "The lessons are confusing and the instructor does not answer questions.",
]


print()
print("Running quantized inference tests...")
print()

for i, text in enumerate(comments, start=1):

    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=256,
    )

    start = time.perf_counter()

    with torch.no_grad():
        output = quantized_model(**inputs)

    elapsed = time.perf_counter() - start

    probabilities = torch.softmax(
        output.logits,
        dim=-1,
    )

    label = torch.argmax(
        probabilities,
        dim=-1,
    ).item()

    score = probabilities[0, label].item()

    print(f"Test {i}:")
    print(f"Text:       {text}")
    print(f"Label:      {label}")
    print(f"Score:      {score:.6f}")
    print(f"Time:       {elapsed:.3f} seconds")
    print()


print("=" * 60)
print("FINAL MEMORY")
print("=" * 60)

print(f"RAM: {memory_mb():.2f} MB")

print()
print("=" * 60)
print("TEST COMPLETE")
print("=" * 60)