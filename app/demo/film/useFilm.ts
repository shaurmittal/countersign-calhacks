"use client";
// The film's clock. Everything on screen is a pure function of `t`, so seeking and replaying are exact.
import { useCallback, useEffect, useRef, useState } from "react";

export type FilmClock = {
  t: number;
  playing: boolean;
  ended: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
};

export function useFilm(length: number): FilmClock {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(0);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : Math.min(0.1, (now - last.current) / 1000);
      last.current = now;
      const next = Math.min(length, tRef.current + dt);
      tRef.current = next;
      setT(next);
      if (next >= length) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      last.current = null;
    };
  }, [playing, length]);

  const seek = useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(length, to));
      tRef.current = clamped;
      setT(clamped);
    },
    [length],
  );
  const play = useCallback(() => {
    if (tRef.current >= length) seek(0);
    setPlaying(true);
  }, [length, seek]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  return { t, playing, ended: t >= length, play, pause, toggle, seek };
}

/** 0 before `start`, 1 after `start + dur`, eased in between. */
export function ramp(t: number, start: number, dur = 0.6): number {
  if (t <= start) return 0;
  if (t >= start + dur) return 1;
  const x = (t - start) / dur;
  return x * x * (3 - 2 * x);
}

/** 1 inside [start, end], fading over `fade` seconds at each side. */
export function window01(t: number, start: number, end: number, fade = 0.5): number {
  return Math.min(ramp(t, start - fade, fade), 1 - ramp(t, end, fade));
}
