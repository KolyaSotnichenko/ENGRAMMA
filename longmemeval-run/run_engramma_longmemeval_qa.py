import argparse
import json
import os
import time
from typing import Any, Dict, List, Optional

import requests


def session_to_text(session_turns: List[Dict[str, Any]], session_date: Optional[Any]) -> str:
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


def _openai_headers(api_key: Optional[str]) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _resolve_chat_completions_url(base_url: str) -> str:
    b = (base_url or "").strip().rstrip("/")
    if b.endswith("/v1"):
        return f"{b}/chat/completions"
    return f"{b}/v1/chat/completions"


def post_json(url: str, payload: Dict[str, Any], api_key: Optional[str]) -> Dict[str, Any]:
    r = requests.post(url, headers=_headers(api_key), json=payload, timeout=120)
    r.raise_for_status()
    return r.json()


def get_json(url: str, api_key: Optional[str]) -> Dict[str, Any]:
    r = requests.get(url, headers=_headers(api_key), timeout=120)
    r.raise_for_status()
    return r.json()


def delete_user_memories(base_url: str, api_key: Optional[str], user_id: str) -> None:
    url = f"{base_url}/users/{user_id}/memories"
    r = requests.delete(url, headers=_headers(api_key), timeout=120)
    # Якщо користувача ще немає – це не помилка
    if r.status_code not in (200, 404):
        r.raise_for_status()


def truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def build_reader_messages(question: str, memories: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    system_prompt = (
        "You are a helpful assistant that answers questions based ONLY on the provided memory snippets "
        "from a long chat history. If the answer is not supported by the snippets, say you don't know."
    )

    parts: List[str] = []
    parts.append("Question:")
    parts.append(question)
    parts.append("")
    parts.append("Retrieved memory snippets (most relevant first):")

    for idx, m in enumerate(memories, start=1):
        score = m.get("score")
        score_str = f"{float(score):.3f}" if isinstance(score, (int, float)) else "n/a"
        content = str(m.get("content", "")).strip()
        content = truncate(content, 2000)
        parts.append(f"\n### Memory {idx} (score={score_str}, id={m.get('id')})\n{content}")

    user_prompt = "\n".join(parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def call_openai_chat(
    base_url: str,
    model: str,
    api_key: Optional[str],
    messages: List[Dict[str, str]],
    temperature: float = 0.0,
    max_tokens: int = 256,
    retries: int = 3,
    backoff_base: float = 2.0,
) -> str:
    url = _resolve_chat_completions_url(base_url)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            r = requests.post(url, headers=_openai_headers(api_key), json=payload, timeout=120)
            if r.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"status {r.status_code}", response=r)
            r.raise_for_status()
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError("OpenAI response has no choices")
            msg = choices[0].get("message") or {}
            content = msg.get("content") or ""
            return str(content).strip()
        except Exception as e:  # noqa: BLE001
            last_err = e
            # простий експоненціальний бекоф
            sleep_s = backoff_base**attempt
            time.sleep(sleep_s)

    raise RuntimeError(f"OpenAI chat completion failed after {retries} attempts: {last_err}")


def retrieve_memories(
    base_url: str,
    api_key: Optional[str],
    item: Dict[str, Any],
    k: int,
    use_graph: bool,
    cleanup_user: bool,
) -> List[Dict[str, Any]]:
    """
    Інжестить сесії для одного question_id у Engramma, робить /memory/query,
    потім гідратує повний content через /memory/:id.
    Повертає список [{id, score, primary_sector, content}, ...].
    """
    qid = item["question_id"]
    question = item["question"]
    user_id = f"longmemeval:{qid}"

    sessions = item.get("haystack_sessions", []) or []
    dates = item.get("haystack_dates", []) or []
    session_ids = item.get("haystack_session_ids", []) or []

    if cleanup_user:
        delete_user_memories(base_url, api_key, user_id)

    # Інжест усіх сесій
    for idx, sess in enumerate(sessions):
        sess_turns = sess
        sess_date = dates[idx] if idx < len(dates) else None
        sess_id = session_ids[idx] if idx < len(session_ids) else f"{qid}:{idx}"

        text = session_to_text(sess_turns, sess_date)
        if not text.strip():
            continue

        add_payload = {
            "content": text,
            "tags": ["longmemeval", f"qid:{qid}", f"sid:{sess_id}"],
            "metadata": {
                "question_id": qid,
                "session_id": sess_id,
                "session_date": sess_date,
                "idx": idx,
            },
            "user_id": user_id,
        }
        post_json(f"{base_url}/memory/add", add_payload, api_key)

    # Запит пам'яті
    query_payload = {
        "query": question,
        "k": k,
        "filters": {"user_id": user_id, "use_graph": use_graph},
    }
    out = post_json(f"{base_url}/memory/query", query_payload, api_key)
    matches = out.get("matches", []) or []

    # Гідратація content через /memory/:id
    hydrated: List[Dict[str, Any]] = []
    for m in matches:
        mid = str(m.get("id", "")).strip()
        if not mid:
            continue
        try:
            mem = get_json(f"{base_url}/memory/{mid}?user_id={user_id}", api_key)
            content = mem.get("content") if isinstance(mem, dict) else ""
        except Exception:  # noqa: BLE001
            content = ""

        hydrated.append(
            {
                "id": mid,
                "score": m.get("score"),
                "primary_sector": m.get("primary_sector"),
                "content": content,
            }
        )

    return hydrated


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--dataset",
        required=True,
        help="Path to longmemeval_*.json (e.g., longmemeval_oracle.json)",
    )
    ap.add_argument(
        "--base-url",
        default="http://localhost:8080",
        help="Engramma Nest base URL (default: http://localhost:8080)",
    )
    ap.add_argument("--api-key", default=None, help="ENGRAMMA_API_KEY if enabled")
    ap.add_argument("--k", type=int, default=8, help="Top-k memories to retrieve per question")
    ap.add_argument("--limit", type=int, default=50, help="How many items from the dataset to run")
    ap.add_argument(
        "--use-graph",
        action="store_true",
        help="Enable graph-based spreading activation (ENGRAMMA_USE_GRAPH)",
    )
    ap.add_argument(
        "--cleanup-user",
        action="store_true",
        help="Delete existing memories for longmemeval:{question_id} before ingesting (recommended for repeat runs).",
    )
    ap.add_argument(
        "--reader-base-url",
        default="https://api.openai.com",
        help="OpenAI-compatible base URL for the reader (e.g., http://127.0.0.1:1234 or http://127.0.0.1:1234/v1).",
    )
    ap.add_argument(
        "--reader-model",
        default="openai/gpt-oss-20b",
        help="Reader chat model name (e.g., openai/gpt-oss-20b).",
    )
    ap.add_argument(
        "--reader-api-key",
        default=None,
        help="API key for the reader LLM. If omitted, will use OPENAI_API_KEY from the environment. Leave empty for local servers that don't require a key.",
    )
    ap.add_argument(
        "--out-jsonl",
        required=True,
        help="Path to write hypothesis jsonl (question_id, hypothesis)",
    )
    args = ap.parse_args()

    reader_api_key = args.reader_api_key or os.environ.get("OPENAI_API_KEY")
    if ("api.openai.com" in args.reader_base_url) and not reader_api_key:
        raise RuntimeError(
            "Reader API key is required for api.openai.com (pass --reader-api-key or set OPENAI_API_KEY)."
        )

    with open(args.dataset, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = 0
    t_global0 = time.time()

    with open(args.out_jsonl, "w", encoding="utf-8") as w:
        for idx, item in enumerate(data[: args.limit], start=1):
            qid = item["question_id"]
            question = item["question"]
            total += 1

            t0 = time.time()
            memories = retrieve_memories(
                base_url=args.base_url,
                api_key=args.api_key,
                item=item,
                k=args.k,
                use_graph=args.use_graph,
                cleanup_user=args.cleanup_user,
            )

            messages = build_reader_messages(question, memories)
            hypothesis = call_openai_chat(
                base_url=args.reader_base_url,
                model=args.reader_model,
                api_key=reader_api_key,
                messages=messages,
                temperature=0.0,
                max_tokens=256,
            )
            dt_ms = int((time.time() - t0) * 1000)

            w.write(
                json.dumps(
                    {
                        "question_id": qid,
                        "hypothesis": hypothesis,
                        "latency_ms": dt_ms,
                        "retrieved_count": len(memories),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            w.flush()

            print(f"[{idx}] {qid} retrieved={len(memories)} latency={dt_ms}ms")

    print(f"Done. Generated hypotheses for {total} items in {(time.time() - t_global0):.1f}s")


if __name__ == "__main__":
    main()