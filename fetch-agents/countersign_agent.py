"""Countersign on Agentverse (owner: P4).

Speaks the Fetch.ai Chat Protocol, so vendors' billing agents and ASI:One can reach it.

- A payment request is forwarded to the Convex bridge (POST {CONVEX_SITE_URL}/agent/message),
  which opens a case in the same pipeline as calls and web chat. The agent polls the case and
  relays each reply until the case closes.
- The owner can say "pending" to list cases waiting for approval, and
  "approve <ref> <code>", "decline <ref> <code>" or "cancel <ref> <code>" with a code from their
  authenticator app. Convex checks the code; this agent never sees a secret.

The agent itself never decides anything and has no way to move money.
"""
import asyncio
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

import requests
from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

CONVEX_SITE_URL = os.environ["CONVEX_SITE_URL"].rstrip("/")
BRIDGE_SECRET = os.environ["AGENT_BRIDGE_SECRET"]
HTTP_TIMEOUT_SECONDS = 15
POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 120  # covers a vendor callback with one retry

OWNER_COMMAND = re.compile(r"\b(approve|decline|cancel)\s+([a-z0-9]{6})\s+(\d{6})\b", re.IGNORECASE)
PENDING_COMMAND = re.compile(
    r"^\W*(show|list|what'?s|what is)?\s*(me\s+)?(my\s+|the\s+)?(pending|waiting)"
    r"(\s+(approvals?|payments?|cases?|requests?))?\W*$",
    re.IGNORECASE,
)
HELP_TEXT = (
    "I'm Countersign, the payments assistant for Lumen Labs. Send me a payment request and I'll verify it. "
    "Owner: say \"pending\" to see what's waiting, then \"approve <ref> <code>\" with a code from your "
    "authenticator app."
)

agent = Agent(
    name="countersign",
    seed=os.environ["COUNTERSIGN_AGENT_SEED"],
    port=8001,
    mailbox=True,
    publish_agent_details=True,
    handle_messages_concurrently=True,  # one slow case must not block other senders
    description="Payments assistant for a one-person company: verifies every request before money moves.",
    readme_path=os.path.join(os.path.dirname(__file__), "README.md"),
)
chat = Protocol(spec=chat_protocol_spec)


class BridgeError(Exception):
    """Convex bridge unreachable or returned an unexpected response."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _bridge(method: str, path: str, **kwargs) -> requests.Response:
    """One call to the Convex bridge, off the event loop."""
    headers = {"X-Agent-Bridge-Secret": BRIDGE_SECRET}
    try:
        return await asyncio.to_thread(
            requests.request, method, f"{CONVEX_SITE_URL}{path}", headers=headers, timeout=HTTP_TIMEOUT_SECONDS, **kwargs
        )
    except requests.RequestException as err:
        raise BridgeError(f"{method} {path}: {err}") from err


async def _send_text(ctx: Context, to: str, text: str, end: bool) -> None:
    content = [TextContent(type="text", text=text)]
    if end:
        content.append(EndSessionContent(type="end-session"))
    await ctx.send(to, ChatMessage(timestamp=_now(), msg_id=uuid4(), content=content))


async def _list_pending() -> str:
    response = await _bridge("GET", "/agent/pending")
    if response.status_code != 200:
        raise BridgeError(f"pending: HTTP {response.status_code}")
    pending = response.json()["pending"]
    if not pending:
        return "Nothing is waiting for your approval."
    lines = [
        f"{p['ref']}: {p['vendor']} {p['amount'] or '(amount unknown)'} [{' '.join(p['rules'])}]"
        + (" approved, cooling off" if p["approved"] else "")
        for p in pending
    ]
    return "Waiting for you:\n" + "\n".join(lines) + "\nReply \"approve <ref> <code>\" or \"decline <ref> <code>\"."


async def _owner_command(action: str, ref: str, code: str) -> str:
    response = await _bridge("POST", "/agent/approval", json={"ref": ref.lower(), "code": code, "action": action.lower()})
    try:
        body = response.json()
    except ValueError as err:
        raise BridgeError(f"approval: HTTP {response.status_code}, non-JSON body") from err
    if response.status_code >= 500 or "ok" not in body:
        raise BridgeError(f"approval: HTTP {response.status_code}")
    return body["message"] if body["ok"] else body["error"]


async def _relay_request(ctx: Context, sender: str, msg_id: str, text: str) -> None:
    """Opens a case, then relays every new reply until the case closes or the poll times out."""
    response = await _bridge("POST", "/agent/message", json={"sender": sender, "text": text, "msgId": msg_id})
    if response.status_code == 429:
        await _send_text(ctx, sender, "Slow down: at most 10 messages a minute.", end=True)
        return
    if response.status_code != 200:
        raise BridgeError(f"message: HTTP {response.status_code}")
    case_id = response.json()["caseId"]
    ctx.logger.info(f"case {case_id[-6:]} opened for {sender[-6:]}")

    last_reply = None
    deadline = asyncio.get_running_loop().time() + POLL_TIMEOUT_SECONDS
    while asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        status = await _bridge("GET", "/agent/case", params={"id": case_id})
        if status.status_code != 200:
            raise BridgeError(f"case: HTTP {status.status_code}")
        case = status.json()
        closed = case["status"] == "CLOSED"
        if case["reply"] and case["reply"] != last_reply:
            last_reply = case["reply"]
            await _send_text(ctx, sender, f"{last_reply} (case {case['ref']})", end=closed)
        if closed:
            return
    await _send_text(ctx, sender, "Still verifying. Nothing is paid until every check passes.", end=True)


@chat.on_message(ChatMessage)
async def on_chat_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=_now(), acknowledged_msg_id=msg.msg_id))
    text = " ".join(item.text for item in msg.content if isinstance(item, TextContent)).strip()
    if not text:
        return  # session start or end markers only

    try:
        owner = OWNER_COMMAND.search(text)
        if owner:
            await _send_text(ctx, sender, await _owner_command(*owner.groups()), end=True)
        elif PENDING_COMMAND.match(text):
            await _send_text(ctx, sender, await _list_pending(), end=True)
        elif text.lower() in {"help", "hi", "hello"}:
            await _send_text(ctx, sender, HELP_TEXT, end=True)
        else:
            await _relay_request(ctx, sender, str(msg.msg_id), text)
    except BridgeError as err:
        ctx.logger.error(f"bridge error: {err}")
        await _send_text(ctx, sender, "Countersign can't reach its back office right now. Nothing was paid.", end=True)


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.debug(f"ack from {sender[-6:]} for {msg.acknowledged_msg_id}")


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
