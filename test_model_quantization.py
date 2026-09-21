import os
import time
import copy
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
print("XLM-R 8-BIT QUANTIZATION TEST")
print("=" * 60)

print(f"Model path: {MODEL_PATH}")
print(f"RAM before loading: {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Load original model
# ---------------------------------------------------------

print()
print("Loading original model...")

start = time.perf_counter()

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
)

model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
)

model.eval()

load_time = time.perf_counter() - start

print(f"RAM after loading:  {memory_mb():.2f} MB")
print(f"Model load time:    {load_time:.2f} seconds")


# ---------------------------------------------------------
# Original inference
# ---------------------------------------------------------

test_text = (
    "The faculty member explains the lessons clearly, "
    "answers questions well, and provides helpful feedback."
)

inputs = tokenizer(
    test_text,
    return_tensors="pt",
    truncation=True,
    max_length=256,
)


print()
print("Running original inference...")

with torch.no_grad():
    start = time.perf_counter()

    output = model(**inputs)

    original_time = time.perf_counter() - start


probabilities = torch.softmax(output.logits, dim=-1)
original_label = torch.argmax(probabilities, dim=-1).item()
original_score = probabilities[0, original_label].item()

print(f"Original label:     {original_label}")
print(f"Original score:     {original_score:.6f}")
print(f"Inference time:     {original_time:.3f} seconds")
print(f"RAM before quant.:  {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Dynamic 8-bit quantization
# ---------------------------------------------------------

print()
print("Creating 8-bit dynamically quantized model...")
print("This may take a little while...")

start = time.perf_counter()

quantized_model = torch.ao.quantization.quantize_dynamic(
    model,
    {torch.nn.Linear},
    dtype=torch.qint8,
)

quantization_time = time.perf_counter() - start

print(f"Quantization time:  {quantization_time:.2f} seconds")
print(f"RAM after quant.:   {memory_mb():.2f} MB")


# ---------------------------------------------------------
# Quantized inference
# ---------------------------------------------------------

print()
print("Running quantized inference...")

with torch.no_grad():
    start = time.perf_counter()

    quantized_output = quantized_model(**inputs)

    quantized_time = time.perf_counter() - start


quantized_probabilities = torch.softmax(
    quantized_output.logits,
    dim=-1,
)

quantized_label = torch.argmax(
    quantized_probabilities,
    dim=-1,
).item()

quantized_score = quantized_probabilities[
    0,
    quantized_label,
].item()


print(f"Quantized label:    {quantized_label}")
print(f"Quantized score:    {quantized_score:.6f}")
print(f"Inference time:     {quantized_time:.3f} seconds")
print(f"RAM after inference:{memory_mb():.2f} MB")


# ---------------------------------------------------------
# Compare results
# ---------------------------------------------------------

print()
print("=" * 60)
print("COMPARISON")
print("=" * 60)

print(f"Original label:     {original_label}")
print(f"Quantized label:    {quantized_label}")

print(
    f"Score difference:   "
    f"{abs(original_score - quantized_score):.6f}"
)

print(
    f"Original inference:{original_time:.3f} seconds"
)

print(
    f"Quantized inference:{quantized_time:.3f} seconds"
)

print()
print("=" * 60)
print("TEST COMPLETE")
print("=" * 60)