"""Fake vendor billing agent (owner: P4). Sends payment requests to Countersign over the
Chat Protocol to demo the agent-to-agent channel (spec §1, scam type 6)."""
import os

from dotenv import load_dotenv
from uagents import Agent

load_dotenv()

agent = Agent(
    name="pixel-and-pine-billing",
    seed=os.environ["VENDOR_AGENT_SEED"],
    port=8002,
    mailbox=True,
)

# TODO(P4): on startup (or on a trigger), send a ChatMessage to COUNTERSIGN_AGENT_ADDRESS.

if __name__ == "__main__":
    agent.run()
