"use client";
// The film: a replay of a real caught scam (see story.ts). Scenes cross-fade by chapter; every frame is a
// pure function of the playhead, so the chapter tabs, the scrubber and the arrow keys seek exactly.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { InboundCall, TwoCalls } from "./Lines";
import { Room } from "./Room";
import { CAPTIONS, CHAPTERS, FILM_LENGTH, SPEAKER_LABEL, TIMES, caseClock, chapterAt, type Caption } from "./story";
import { ramp, useFilm } from "./useFilm";
import { useFilmAudio } from "./useFilmAudio";
import { Verdict } from "./Verdict";

export function Film() {
  const film = useFilm(FILM_LENGTH);
  const { t } = film;
  const sound = useFilmAudio(t, film.playing);
  const root = useRef<HTMLElement>(null);
  const [started, setStarted] = useState(false);
  const autoPaused = useRef(false);

  // Plays when the film scrolls into view (unless the viewer prefers less motion), pauses when it leaves.
  const latest = useRef({ film, started });
  latest.current = { film, started };
  // `?t=42` opens the film paused at that second (for links to a moment, and for screenshots).
  const pinned = useRef(false);
  useEffect(() => {
    const at = Number(new URLSearchParams(window.location.search).get("t"));
    if (at > 0) {
      pinned.current = true;
      setStarted(true);
      latest.current.film.seek(at);
    }
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        const { film: f, started: s } = latest.current;
        if (entry.isIntersecting) {
          if (!reduced && !pinned.current && (!s || autoPaused.current) && !f.ended) {
            autoPaused.current = false;
            setStarted(true);
            f.play();
          }
        } else if (f.playing) {
          autoPaused.current = true;
          f.pause();
        }
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const chapter = chapterAt(t);
  const callOpacity = 1 - ramp(t, TIMES.room - 0.4, 0.8);
  const roomOpacity = ramp(t, TIMES.room - 0.4, 0.8);
  const compact = t >= TIMES.callbackScene - 0.4;
  const verdict = ramp(t, TIMES.verdictScene, 0.6);

  const start = (withSound: boolean) => {
    if (withSound) sound.enable();
    setStarted(true);
    film.play();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      setStarted(true);
      film.toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      film.seek(t + 5);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      film.seek(t - 5);
    }
  };

  const clockValue = caseClock(t);

  return (
    <section ref={root} className="lp-film" aria-label="Replay of a real scam call being caught" tabIndex={-1} onKeyDown={onKey} data-chapter={chapter}>
      <div className="lp-film-bar">
        <ol className="lp-chapters">
          {CHAPTERS.map((c, i) => {
            const end = CHAPTERS[i + 1]?.start ?? FILM_LENGTH;
            const fill = Math.max(0, Math.min(1, (t - c.start) / (end - c.start)));
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={chapter === c.id ? "step" : undefined}
                  onClick={() => {
                    setStarted(true);
                    film.seek(c.start + 0.01);
                    film.play();
                  }}
                >
                  <span className="lp-chapter-num">{c.numeral}</span>
                  <span className="lp-chapter-title">{c.title}</span>
                  <span className="lp-chapter-fill" style={{ transform: `scaleX(${fill})` }} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
        <div className="lp-film-controls">
          <p className="lp-caseclock" aria-live="off">
            {clockValue === null ? (
              <>
                <span>Case clock</span> <b>waiting for the request</b>
              </>
            ) : (
              <>
                <span>Case clock · real time</span> <b>T+{clockValue.toFixed(2)}s</b>
              </>
            )}
          </p>
          <button
            type="button"
            className="lp-soundbtn"
            aria-pressed={sound.on}
            onClick={() => (sound.on ? sound.disable() : sound.enable())}
            aria-label={sound.on ? "Turn sound off" : "Turn sound on"}
          >
            <SpeakerIcon on={sound.on} />
            <span>{sound.on ? "Sound on" : "Sound off"}</span>
          </button>
          <button type="button" className="lp-playbtn" onClick={() => (film.playing ? film.pause() : start(false))} aria-label={film.playing ? "Pause" : "Play"}>
            {film.playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 5l12 7-12 7z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="lp-stage" data-compact={compact || undefined}>
        <div className="lp-scene lp-scene-call" style={{ opacity: callOpacity, visibility: callOpacity > 0 ? "visible" : "hidden" }}>
          <InboundCall t={t} />
        </div>

        <div className="lp-scene lp-scene-room" style={{ opacity: roomOpacity * (1 - verdict * 0.82), visibility: roomOpacity > 0 ? "visible" : "hidden" }}>
          <Room t={t} compact={compact} />
          <div className="lp-scene-calls" style={{ opacity: ramp(t, TIMES.callbackScene - 0.4, 0.7) * (1 - verdict), visibility: compact ? "visible" : "hidden" }}>
            <TwoCalls t={t} />
          </div>
        </div>

        <div className="lp-scene lp-scene-verdict" style={{ opacity: verdict, visibility: verdict > 0 ? "visible" : "hidden" }}>
          <Verdict
            t={t}
            onReplay={() => {
              film.seek(0.01);
              film.play();
            }}
          />
        </div>

        <Captions t={t} />

        {!started && (
          <div className="lp-poster">
            <button type="button" className="lp-poster-main" onClick={() => start(true)}>
              <span className="lp-poster-play" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24">
                  <path d="M7 5l12 7-12 7z" fill="currentColor" />
                </svg>
              </span>
              <span>
                Watch with sound <small>{Math.round(FILM_LENGTH)} seconds · the real recordings of both calls</small>
              </span>
            </button>
            <button type="button" className="lp-poster-muted" onClick={() => start(false)}>
              Watch muted, with captions
            </button>
          </div>
        )}
        {started && film.playing && !sound.on && (
          <button type="button" className="lp-soundhint" onClick={sound.enable}>
            <SpeakerIcon on={false} /> Turn on sound to hear the real calls
          </button>
        )}
      </div>

      <Scrubber t={t} onSeek={(x) => film.seek(x)} />
      <p className="lp-film-note">
        A replay of a real case on our test deployment. The voices are the real recordings of both calls: a teammate plays the
        scammer, and “Jordan” is our stand-in vendor, a second Cartesia agent on the vendor's number on file. Lines are verbatim
        (three end at a sentence break), and the case clock shows real elapsed time.
      </p>
    </section>
  );
}

function Captions({ t }: { t: number }) {
  const c = [...CAPTIONS].reverse().find((x) => t >= x.start && t < x.end + 1.2);
  if (!c) return null;
  const typing = Math.max(0, Math.min(1, (t - c.start) / ((c.end - c.start) * 0.82)));
  const fade = t > c.end ? 1 - (t - c.end) / 1.2 : Math.min(1, (t - c.start) * 5);
  return (
    <div className={`lp-caption lp-caption-${c.speaker}`} style={{ opacity: fade }} aria-live="polite">
      <p className="lp-caption-who">
        {SPEAKER_LABEL[c.speaker]}
        <span>{c.line === "inbound" ? "Line 1" : "Line 2 · callback"}</span>
      </p>
      <p className="lp-caption-text">{typed(c, typing)}</p>
    </div>
  );
}

function typed(c: Caption, k: number) {
  const visible = Math.round(c.text.length * k);
  const parts: { text: string; mark: boolean }[] = [];
  let rest = c.text;
  for (const m of c.marks ?? []) {
    const i = rest.indexOf(m);
    if (i < 0) continue;
    parts.push({ text: rest.slice(0, i), mark: false }, { text: m, mark: true });
    rest = rest.slice(i + m.length);
  }
  parts.push({ text: rest, mark: false });
  let left = visible;
  return parts.map((p, i) => {
    const shown = p.text.slice(0, Math.max(0, left));
    left -= p.text.length;
    if (!shown) return null;
    return p.mark ? (
      <mark key={i} className="lp-mark">
        {shown}
      </mark>
    ) : (
      <span key={i}>{shown}</span>
    );
  });
}

function Scrubber({ t, onSeek }: { t: number; onSeek: (t: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seekTo = (e: PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onSeek(((e.clientX - r.left) / r.width) * FILM_LENGTH);
  };
  return (
    <div
      ref={ref}
      className="lp-scrub"
      role="slider"
      tabIndex={0}
      aria-label="Film position"
      aria-valuemin={0}
      aria-valuemax={FILM_LENGTH}
      aria-valuenow={Math.round(t)}
      aria-valuetext={`${Math.round(t)} of ${FILM_LENGTH} seconds`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
      }}
    >
      <div className="lp-scrub-track">
        {CAPTIONS.map((c, i) => (
          <span
            key={i}
            className={`lp-scrub-cap lp-scrub-${c.speaker}`}
            style={{ left: `${(c.start / FILM_LENGTH) * 100}%`, width: `${((c.end - c.start) / FILM_LENGTH) * 100}%` }}
          />
        ))}
        {CHAPTERS.slice(1).map((c) => (
          <span key={c.id} className="lp-scrub-tick" style={{ left: `${(c.start / FILM_LENGTH) * 100}%` }} />
        ))}
        <span className="lp-scrub-fill" style={{ transform: `scaleX(${t / FILM_LENGTH})` }} />
        <span className="lp-scrub-head" style={{ left: `${(t / FILM_LENGTH) * 100}%` }} />
      </div>
    </div>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      {on ? (
        <>
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
          <path d="M18 6.5a7.8 7.8 0 0 1 0 11" />
        </>
      ) : (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}
