import os

from transformers import pipeline


BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "nlp",
    "models",
    "xlmr-finetuned",
)


_sentiment_analyzer = None


def _get_sentiment_analyzer():
    global _sentiment_analyzer

    if _sentiment_analyzer is None:
        _sentiment_analyzer = pipeline(
            "sentiment-analysis",
            model=MODEL_PATH,
            tokenizer=MODEL_PATH,
            device=-1,
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