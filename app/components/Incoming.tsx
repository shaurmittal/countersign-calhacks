"use client";
// Left column (spec §7.2): the selected request as a caption, the reply Countersign sent, and the
// case tabs so two judges can test at once.
import type { Id } from "../../convex/_generated/dataModel";
import type { CaseRow } from "./DecisionCard";
import { channelLabel, clockTime } from "./format";

export function Incoming({ c }: { c: CaseRow }) {
  return (
    <div className="lp-caption wr-caption" aria-live="polite">
      <div className="wr-caption-caller">
        <p className="lp-caption-who">
          {channelLabel(c.channel)}{" "}
          <span>
            from {c.fromAddress} · {clockTime(c.createdAt)}
          </span>
        </p>
        <p className="lp-caption-text">{c.rawContent}</p>
      </div>
      {c.replyText && (
        <div key={c.replyText} className="wr-caption-reply wr-rise">
          <p className="lp-caption-who">
            Countersign <span>reply</span>
          </p>
          <p className="lp-caption-text">{c.replyText}</p>
        </div>
      )}
    </div>
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
    <div className="wr-tabs-wrap">
      <ol className="lp-chapters wr-tabs" aria-label="Cases">
        {props.cases.map((c) => (
          <li key={c._id}>
            <button
              type="button"
              aria-current={c._id === props.selectedId ? "step" : undefined}
              onClick={() => props.onSelect(c._id)}
            >
              <span className="lp-chapter-num">{clockTime(c.createdAt)}</span>
              <span className="lp-chapter-title">{channelLabel(c.channel)}</span>
              <span className="wr-dot" data-decision={c.decision} aria-hidden="true" />
              <span className="sr-only">{c.decision ?? c.status.toLowerCase().replace("_", " ")}</span>
            </button>
          </li>
        ))}
      </ol>
      {!props.following && (
        <button type="button" className="wr-follow" onClick={props.onFollow}>
          Follow newest
        </button>
      )}
    </div>
  );
}
