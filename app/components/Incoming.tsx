"use client";
// Left column (spec §7.2): the selected request, the reply Countersign sent, and the case queue
// so two judges can test at once.
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseRow } from "./DecisionCard";
import { channelLabel, clockTime } from "./format";

const PREVIEW_CHARS = 80;

export function Incoming({ c }: { c: CaseRow }) {
  return (
    <section className="panel" aria-labelledby="incoming-heading" data-decision={c.decision}>
      <h2 id="incoming-heading">Incoming</h2>
      <div className="incoming-meta">
        <span className="chip">{channelLabel(c.channel)}</span>
        <span className="muted">
          from {c.fromAddress} · {clockTime(c.createdAt)}
        </span>
      </div>
      <p className="incoming-text">{c.rawContent}</p>
      {c.replyText && (
        <div className="reply">
          <b>Countersign replied</b>
          {c.replyText}
        </div>
      )}
    </section>
  );
}

export function CaseQueue(props: {
  cases: CaseRow[];
  selectedId: Id<"cases"> | null;
  following: boolean;
  onSelect: (id: Id<"cases">) => void;
  onFollow: () => void;
}) {
  return (
    <section className="panel grow" aria-labelledby="queue-heading">
      <h2 id="queue-heading">
        Cases
        {!props.following && (
          <button type="button" className="follow" onClick={props.onFollow}>
            Follow newest
          </button>
        )}
      </h2>
      <ul className="queue">
        {props.cases.map((c) => (
          <li key={c._id}>
            <button
              type="button"
              aria-current={c._id === props.selectedId}
              onClick={() => props.onSelect(c._id)}
            >
              <span className="muted mono">{clockTime(c.createdAt)}</span>
              <span className="preview">
                {channelLabel(c.channel)}: {c.rawContent.slice(0, PREVIEW_CHARS)}
              </span>
              <span className="chip" data-decision={c.decision} style={{ color: "var(--decision, var(--muted))" }}>
                {c.decision ?? c.status.toLowerCase().replace("_", " ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
