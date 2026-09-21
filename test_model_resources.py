import os
import time
import psutil

from transformers import pipeline


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
print("XLM-R RESOURCE TEST")
print("=" * 60)

print(f"Model path: {MODEL_PATH}")
print(f"RAM before loading: {memory_mb():.2f} MB")

start = time.perf_counter()

analyzer = pipeline(
    "sentiment-analysis",
    model=MODEL_PATH,
    tokenizer=MODEL_PATH,
    device=-1,
)

load_time = time.perf_counter() - start

print(f"RAM after loading:  {memory_mb():.2f} MB")
print(f"Model load time:    {load_time:.2f} seconds")

print()
print("Running sentiment inference...")

test_text = (
    "The faculty member explains the lessons clearly, "
    "answers questions well, and provides helpful feedback."
)

cpu_before = process.cpu_times()
ram_before = memory_mb()
start = time.perf_counter()

result = analyzer(
    test_text,
    truncation=True,
    max_length=256,
)[0]

elapsed = time.perf_counter() - start

cpu_after = process.cpu_times()
ram_after = memory_mb()

cpu_used = (
    (cpu_after.user - cpu_before.user)
    + (cpu_after.system - cpu_before.system)
)

print(f"Result:             {result}")
print(f"Inference time:     {elapsed:.3f} seconds")
print(f"CPU time used:      {cpu_used:.3f} seconds")
print(f"RAM before test:    {ram_before:.2f} MB")
print(f"RAM after test:     {ram_after:.2f} MB")
print(f"RAM increase:       {ram_after - ram_before:.2f} MB")

print()
print("=" * 60)
print("TEST COMPLETE")
print("=" * 60)