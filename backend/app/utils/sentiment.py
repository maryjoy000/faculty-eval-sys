import os

from transformers import pipeline


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )
)

LOCAL_MODEL_PATH = os.path.join(
    BASE_DIR,
    "nlp",
    "models",
    "xlmr-finetuned",
)

# Deployment: set MODEL_HF_ID (e.g. "maryjoy1228/fes-xlmr-finetuned") and
# HF_TOKEN on the server so the model is pulled from the Hugging Face Hub.
# Local dev needs no env vars as long as the models folder exists on disk.
MODEL_HF_ID = os.getenv("MODEL_HF_ID", "").strip()
MODEL_PATH = os.getenv("MODEL_PATH", LOCAL_MODEL_PATH).strip()
HF_TOKEN = os.getenv("HF_TOKEN", "").strip() or None


def _resolve_model_source():
    if MODEL_PATH and os.path.isdir(MODEL_PATH):
        return MODEL_PATH
    if MODEL_HF_ID:
        return MODEL_HF_ID
    return MODEL_PATH or LOCAL_MODEL_PATH


_sentiment_analyzer = None


def _get_sentiment_analyzer():
    global _sentiment_analyzer

    if _sentiment_analyzer is None:
        source = _resolve_model_source()
        _sentiment_analyzer = pipeline(
            "sentiment-analysis",
            model=source,
            tokenizer=source,
            device=-1,
            token=HF_TOKEN,
        )

    return _sentiment_analyzer


def analyze_sentiment(text):
    if not text or not text.strip():
        return None

    analyzer = _get_sentiment_analyzer()

    result = analyzer(
        text,
        truncation=True,
        max_length=256,
    )[0]

    return {
        "label": result["label"].lower(),
        "score": float(result["score"]),
    }