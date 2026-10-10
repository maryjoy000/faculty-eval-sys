"""
One-time backfill: label every evaluation comment that has no sentiment yet.

Run it from the BACKEND ROOT (the folder that contains your app package and
the nlp/ folder), inside the same virtualenv and with the same environment
variables / .env the web app uses (DB settings, MODEL_HF_ID, HF_TOKEN):

    python backfill_sentiment.py --dry-run --limit 30     # try 30, saves nothing
    nohup python backfill_sentiment.py > backfill.log 2>&1 &
    tail -f backfill.log

Safe to stop (Ctrl+C / kill) and run again: it only ever touches rows whose
sentiment_label is still empty, and it commits after every chunk.
"""

import argparse
import importlib
import os
import sys
import time

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

VALID_LABELS = {"positive", "neutral", "negative"}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--package", default="app",
                        help="name of your Flask package (the folder holding create_app). Default: app")
    parser.add_argument("--chunk", type=int, default=64,
                        help="rows loaded and saved per round. Default: 64")
    parser.add_argument("--batch-size", type=int, default=16,
                        help="comments the model scores at once. Lower it if memory is tight. Default: 16")
    parser.add_argument("--threads", type=int, default=2,
                        help="CPU threads for the model. Default: 2")
    parser.add_argument("--limit", type=int, default=0,
                        help="stop after this many comments (0 = all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="score comments and print results but save nothing")
    args = parser.parse_args()

    sys.path.insert(0, os.getcwd())

    pkg = importlib.import_module(args.package)
    extensions = importlib.import_module(f"{args.package}.extensions")
    evaluation_module = importlib.import_module(f"{args.package}.models.evaluation")
    sentiment_module = importlib.import_module(f"{args.package}.utils.sentiment")

    from sqlalchemy import func, or_
    import torch

    torch.set_num_threads(args.threads)

    db = extensions.db
    Evaluation = evaluation_module.Evaluation

    app = pkg.create_app()

    with app.app_context():
        base = Evaluation.query.filter(
            or_(Evaluation.sentiment_label.is_(None), Evaluation.sentiment_label == ""),
            Evaluation.comments.isnot(None),
            func.trim(Evaluation.comments) != "",
        )

        total = base.count()
        print(f"Comments without a sentiment label: {total}", flush=True)
        if total == 0:
            return

        print("Loading model...", flush=True)
        analyzer = sentiment_module._get_sentiment_analyzer()

        tally = {"positive": 0, "neutral": 0, "negative": 0}
        done = 0
        skipped = 0
        last_id = 0
        warned_labels = set()
        started = time.time()

        while True:
            rows = (
                base.filter(Evaluation.id > last_id)
                .order_by(Evaluation.id)
                .limit(args.chunk)
                .all()
            )
            if not rows:
                break

            last_id = rows[-1].id

            # Similar lengths together = less padding = faster on CPU.
            ordered = sorted(rows, key=lambda row: len(row.comments))
            texts = [row.comments.strip() for row in ordered]

            results = analyzer(
                texts,
                truncation=True,
                max_length=256,
                batch_size=args.batch_size,
            )

            for row, result in zip(ordered, results):
                label = str(result["label"]).lower()

                # Same format analyze_sentiment() saves on submission. Anything
                # unexpected (e.g. LABEL_0) is skipped, never written.
                if label not in VALID_LABELS:
                    skipped += 1
                    if label not in warned_labels:
                        warned_labels.add(label)
                        print(f"  WARNING: model returned unexpected label '{label}'; skipping those rows", flush=True)
                    continue

                if not args.dry_run:
                    row.sentiment_label = label
                    row.sentiment_score = float(result["score"])

                tally[label] += 1
                done += 1

            if args.dry_run:
                db.session.rollback()
            else:
                db.session.commit()

            elapsed = time.time() - started
            rate = (done + skipped) / elapsed if elapsed else 0
            remaining = max(total - (done + skipped), 0)
            eta_min = (remaining / rate / 60) if rate else 0
            print(
                f"{done + skipped}/{total} processed | {rate:.1f}/s | ~{eta_min:.0f} min left | "
                f"pos {tally['positive']} neu {tally['neutral']} neg {tally['negative']} | skipped {skipped}",
                flush=True,
            )

            if args.limit and (done + skipped) >= args.limit:
                break

        mode = "DRY RUN (nothing saved)" if args.dry_run else "saved"
        print(
            f"Finished - {mode}. Labeled {done}: "
            f"positive {tally['positive']}, neutral {tally['neutral']}, negative {tally['negative']}. "
            f"Skipped {skipped}.",
            flush=True,
        )


if __name__ == "__main__":
    main()