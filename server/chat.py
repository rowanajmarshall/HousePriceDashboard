"""
/api/chat endpoint — streams Claude responses with a single execute_sql tool.
"""

import json
import signal
from contextlib import contextmanager
from typing import AsyncIterator

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import config
from .database import execute_query

router = APIRouter()

_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """\
You are a helpful assistant for exploring UK house price data.

You have access to a DuckDB database with two tables:

**transactions** — Land Registry price paid data (~30M rows)
  - price        INTEGER   — sale price in GBP
  - date         DATE      — transaction date
  - postcode     VARCHAR   — full postcode (e.g. "SW1A 2AA")
  - sector       VARCHAR   — postcode sector (e.g. "SW1A 2")
  - district     VARCHAR   — postcode district (e.g. "SW1A")
  - property_type VARCHAR  — D=detached, S=semi, T=terraced, F=flat, O=other
  - new_build    VARCHAR   — Y or N
  - tenure       VARCHAR   — F=freehold, L=leasehold

**cpi** — UK CPI index (base year 2015 = 100, source ONS D7BT)
  - year         INTEGER
  - index        DOUBLE

For real-terms calculations, join on YEAR(date) = cpi.year and divide price by (cpi.index / 100).

Rules:
- Only use SELECT statements — no INSERT, UPDATE, DELETE, CREATE, DROP, etc.
- Keep queries efficient; use WHERE clauses and LIMIT where appropriate.
- Explain your findings clearly in plain English after running queries.
- If a query fails, try a simpler variant or explain the limitation.
"""

TOOLS = [
    {
        "name": "execute_sql",
        "description": "Run a read-only SQL SELECT query against the house prices DuckDB database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "A valid DuckDB SELECT statement.",
                }
            },
            "required": ["query"],
        },
    }
]


class ChatRequest(BaseModel):
    messages: list[dict]  # OpenAI-style message list


@contextmanager
def _timeout(seconds: int):
    def _handler(signum, frame):
        raise TimeoutError(f"Query exceeded {seconds}s timeout")

    old = signal.signal(signal.SIGALRM, _handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


def _run_tool(tool_name: str, tool_input: dict) -> str:
    if tool_name != "execute_sql":
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    sql = tool_input.get("query", "").strip()

    # Basic safety: block non-SELECT statements
    if not sql.upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT statements are allowed."})

    try:
        with _timeout(config.QUERY_TIMEOUT):
            rows = execute_query(sql)
        return json.dumps(rows, default=str)
    except TimeoutError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        return json.dumps({"error": str(e)})


async def _stream_chat(messages: list[dict]) -> AsyncIterator[str]:
    """Agentic loop: stream text, handle tool calls, continue until done."""

    # Convert to Anthropic message format (role/content only)
    anthropic_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]

    while True:
        # Collect full response (streaming within each turn)
        response_text = ""
        tool_uses = []
        stop_reason = None

        with _client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=anthropic_messages,
        ) as stream:
            for event in stream:
                if hasattr(event, "type"):
                    if event.type == "content_block_delta":
                        delta = event.delta
                        if hasattr(delta, "text"):
                            chunk = delta.text
                            response_text += chunk
                            yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
                    elif event.type == "message_stop":
                        pass

            # Get final message after stream ends
            final = stream.get_final_message()
            stop_reason = final.stop_reason
            tool_uses = [b for b in final.content if b.type == "tool_use"]

        if stop_reason == "end_turn" or not tool_uses:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            break

        if stop_reason == "tool_use":
            # Add assistant turn with all content blocks
            anthropic_messages.append({
                "role": "assistant",
                "content": [b.model_dump() for b in final.content],
            })

            # Execute each tool and build tool_result blocks
            tool_results = []
            for tu in tool_uses:
                yield f"data: {json.dumps({'type': 'tool_call', 'name': tu.name, 'input': tu.input})}\n\n"
                result = _run_tool(tu.name, tu.input)
                yield f"data: {json.dumps({'type': 'tool_result', 'result': result[:2000]})}\n\n"
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": result,
                })

            anthropic_messages.append({"role": "user", "content": tool_results})
            # Continue loop for next assistant turn


@router.post("/api/chat")
async def chat(req: ChatRequest):
    if not config.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    return StreamingResponse(
        _stream_chat(req.messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
