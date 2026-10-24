import { describe, expect, it } from "vitest";
import { GENESIS, hashEvent, stableStringify, verifyEvents, type ChainEvent, type ChainedEvent } from "./audit";

async function chain(events: ChainEvent[]): Promise<ChainedEvent[]> {
  const out: ChainedEvent[] = [];
  let prevHash = GENESIS;
  for (const e of events) {
    const hash = await hashEvent(prevHash, e);
    out.push({ ...e, prevHash, hash });
    prevHash = hash;
  }
  return out;
}

const EVENTS: ChainEvent[] = [
  { seq: 1, caseId: "c1", actor: "system", action: "case.opened", payload: { channel: "sms" }, at: 1 },
  { seq: 2, caseId: "c1", actor: "policy", action: "case.updated", payload: { decision: "BLOCK", firedRules: ["R2", "R10"] }, at: 2 },
  { seq: 3, caseId: "c1", actor: "payer", action: "agent.done", payload: null, at: 3 },
];

describe("audit hash chain", () => {
  it("verifies an untouched chain", async () => {
    expect(await verifyEvents(await chain(EVENTS))).toEqual({ ok: true, brokenAtSeq: null });
  });

  it("detects an edited payload", async () => {
    const c = await chain(EVENTS);
    c[1] = { ...c[1], payload: { decision: "PAY", firedRules: ["R12"] } };
    expect(await verifyEvents(c)).toEqual({ ok: false, brokenAtSeq: 2 });
  });

  it("detects a deleted event", async () => {
    const c = await chain(EVENTS);
    expect((await verifyEvents([c[0], c[2]])).brokenAtSeq).toBe(3);
  });

  it("does not depend on object key order", async () => {
    const c = await chain(EVENTS);
    c[1] = { ...c[1], payload: { firedRules: ["R2", "R10"], decision: "BLOCK" } };
    expect((await verifyEvents(c)).ok).toBe(true);
  });

  it("stableStringify sorts keys and drops undefined fields", () => {
    expect(stableStringify({ b: 1, a: { d: undefined, c: [1, undefined] } })).toBe('{"a":{"c":[1,null]},"b":1}');
  });
});
