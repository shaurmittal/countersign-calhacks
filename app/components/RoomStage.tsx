"use client";
// The room, live: one case's Convex rows become node states, chips and hot wires. Re-derived every
// second so the owner's cooling-off countdown ticks; everything else moves only when a row changes.
import { useMemo } from "react";
import type { CaseDetail } from "./AgentLanes";
import type { CaseRow } from "./DecisionCard";
import { useNow } from "./format";
import { RoomGraph } from "./RoomGraph";
import { deriveRoom } from "./roomState";

export function RoomStage({ c, detail }: { c: CaseRow; detail: CaseDetail | undefined }) {
  const now = useNow(1000);
  const room = useMemo(() => deriveRoom(c, detail, now), [c, detail, now]);
  return <RoomGraph {...room} />;
}
