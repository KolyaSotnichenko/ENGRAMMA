import argparse
import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests


def session_to_text(session_turns: List[Dict[str, Any]], session_date: Optional[Any]) -> str:
    # LongMemEval sessions are lists of turns: {"role": "user"/"assistant", "content": "..."} [1]
    # We also inject the timestamp in text to help temporal questions.
    prefix = ""
    if session_date is not None:
        prefix = f"[session_date={session_date}]\n"
    lines = []
    for t in session_turns:
        role = str(t.get("role", "")).strip()
        content = str(t.get("content", "")).strip()
        if not content:
            continue
        lines.append(f"{role}: {content}")
    return prefix + "\n".join(lines)


def _headers(api_key: Optional[str]) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def post_json(url: str, payload: Dict[str, Any], api_key: Optional[str]) -> Dict[str, Any]:
    r = requests.post(url, headers=_headers(api_key), json=payload, timeout=120)
    r.raise_for_status()
    return r.json()


def get_json(url: str, api_key: Optional[str]) -> Dict[str, Any]:
    r = requests.get(url, headers=_headers(api_key), timeout=120)
    r.raise_for_status()
    return r.json()


def run_case(
    base_url: str,
    api_key: Optional[str],
    item: Dict[str, Any],
    k: int,
    use_graph: bool,
    verify_by_session_id: bool,
) -> Tuple[bool, bool, bool, List[Dict[str, Any]]]:
    qid = item["question_id"]
    question = item["question"]
    answer = str(item.get("answer", "")).strip()

    user_id = f"longmemeval:{qid}"

    sessions = item.get("haystack_sessions", [])
    dates = item.get("haystack_dates", [])
    session_ids = item.get("haystack_session_ids", [])
    answer_session_ids = set(item.get("answer_session_ids", []) or [])

    evidence_turns: List[str] = []
    for sess in sessions:
        for t in sess:
            if t.get("has_answer") is True:
                c = str(t.get("content", "")).strip()
                if c:
                    evidence_turns.append(c)

    for idx, sess in enumerate(sessions):
        # session in dataset is typically: List[Turn]
        sess_turns = sess
        sess_date = dates[idx] if idx < len(dates) else None
        sess_id = session_ids[idx] if idx < len(session_ids) else f"{qid}:{idx}"

        text = session_to_text(sess_turns, sess_date)
        if not text.strip():
            continue

        add_payload = {
            "content": text,
            "tags": ["longmemeval", f"qid:{qid}", f"sid:{sess_id}"],
            "metadata": {"question_id": qid, "session_id": sess_id, "session_date": sess_date, "idx": idx},
            "user_id": user_id,
        }
        post_json(f"{base_url}/memory/add", add_payload, api_key)

    query_payload = {
        "query": question,
        "k": k,
        "filters": {"user_id": user_id, "use_graph": use_graph},
    }
    out = post_json(f"{base_url}/memory/query", query_payload, api_key)
    matches = out.get("matches", []) or []

    # Three signals:
    # - answer_hit: naive check whether gold answer string appears verbatim in retrieved text
    # - evidence_hit: whether any has_answer=true turn appears verbatim in retrieved text (sensitive to server summarization)
    # - session_hit: whether any retrieved memory belongs to an evidence session_id (robust even with summary-only storage)

    answer_hit = False
    if answer:
        ans_n = normalize_text(answer)
        for m in matches:
            content = normalize_text(str(m.get("content", "")))
            if ans_n and ans_n in content:
                answer_hit = True
                break

    evidence_hit = False
    if evidence_turns:
        ev_n = [normalize_text(e) for e in evidence_turns]
        for m in matches:
            content = normalize_text(str(m.get("content", "")))
            for e in ev_n:
                if e and e in content:
                    evidence_hit = True
                    break
            if evidence_hit:
                break

    session_hit = False
    if verify_by_session_id and answer_session_ids and matches:
        for m in matches:
            mid = str(m.get("id", "")).strip()
            if not mid:
                continue
            mem = get_json(
                f"{base_url}/memory/{mid}?user_id={user_id}",
                api_key,
            )
            meta = mem.get("metadata") if isinstance(mem, dict) else None
            sid = None
            if isinstance(meta, dict):
                sid = meta.get("session_id")
            if sid in answer_session_ids:
                session_hit = True
                break

    return answer_hit, evidence_hit, session_hit, matches


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, help="Path to longmemeval_*.json")
    ap.add_argument("--base-url", default="http://localhost:8080", help="Nest base URL")
    ap.add_argument("--api-key", default=None, help="ENGRAMMA_API_KEY if enabled")
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument("--limit", type=int, default=50, help="How many items to run")
    ap.add_argument("--use-graph", action="store_true")
    ap.add_argument(
        "--verify-by-session-id",
        action="store_true",
        help="Compute evidence hit by checking retrieved memory metadata.session_id against answer_session_ids (extra GETs).",
    )
    ap.add_argument("--out-jsonl", required=True, help="Where to write jsonl logs")
    args = ap.parse_args()

    with open(args.dataset, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = 0
    answer_hits = 0
    evidence_hits = 0
    session_hits = 0

    with open(args.out_jsonl, "w", encoding="utf-8") as w:
        for item in data[: args.limit]:
            total += 1
            t0 = time.time()
            ans_ok, ev_ok, sid_ok, matches = run_case(
                args.base_url,
                args.api_key,
                item,
                args.k,
                args.use_graph,
                args.verify_by_session_id,
            )
            dt_ms = int((time.time() - t0) * 1000)
            answer_hits += 1 if ans_ok else 0
            evidence_hits += 1 if ev_ok else 0
            session_hits += 1 if sid_ok else 0

            w.write(
                json.dumps(
                    {
                        "question_id": item["question_id"],
                        "question_type": item.get("question_type"),
                        "question": item["question"],
                        "gold_answer": item.get("answer"),
                        "answer_hit": ans_ok,
                        "evidence_hit": ev_ok,
                        "session_hit": sid_ok,
                        "k": args.k,
                        "latency_ms": dt_ms,
                        "retrieved": [
                            {
                                "id": m.get("id"),
                                "score": m.get("score"),
                                "primary_sector": m.get("primary_sector"),
                            }
                            for m in matches
                        ],
                        "top_content": matches[0].get("content") if matches else "",
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

            qid = item["question_id"]
            parts = [
                f"[{total}] {qid}",
                f"evidence@{args.k}={'OK' if ev_ok else 'MISS'}",
                f"answer@{args.k}={'OK' if ans_ok else 'MISS'}",
            ]
            if args.verify_by_session_id:
                parts.append(f"session@{args.k}={'OK' if sid_ok else 'MISS'}")
            parts.append(f"latency={dt_ms}ms")
            print(" ".join(parts))

    answer_recall = answer_hits / max(1, total)
    evidence_recall = evidence_hits / max(1, total)
    session_recall = session_hits / max(1, total)
    tail = (
        f" | session@{args.k}={session_recall:.3f} ({session_hits}/{total})"
        if args.verify_by_session_id
        else ""
    )
    print(
        f"Done. evidence@{args.k}={evidence_recall:.3f} ({evidence_hits}/{total}) | answer@{args.k}={answer_recall:.3f} ({answer_hits}/{total}){tail}"
    )


if __name__ == "__main__":
    main()