// Scheduled jobs.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// P2: keeps a Node container's Moss worker loaded. A cold worker needs longer than the 2.5 s budget of a
// mid-call lookup_policy (or the 3 s vendor search), so the first lookup after a quiet spell would fall
// back to keywords. A no-op without Moss credentials.
crons.interval("keep Moss warm", { minutes: 3 }, internal.agents.moss.lookupPolicy, {
  question: "why does a bank change need a callback",
  budgetMs: 20_000,
});

export default crons;
