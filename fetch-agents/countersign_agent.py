"""Countersign on Agentverse (owner: P4).

Speaks the Fetch.ai Chat Protocol. Forwards every incoming chat message to the Convex
bridge (POST {CONVEX_SITE_URL}/agent/message) and relays the decision back.
The agent itself never decides anything and has no way to move money.
"""
import os

from dotenv import load_dotenv
from uagents import Agent

load_dotenv()

agent = Agent(
    name="countersign",
    seed=os.environ["COUNTERSIGN_AGENT_SEED"],
    port=8001,
    mailbox=True,
)

# TODO(P4): include the chat protocol, forward ChatMessage -> Convex bridge with
# AGENT_BRIDGE_SECRET, send ChatAcknowledgement, reply with the case decision.

if __name__ == "__main__":
    agent.run()
