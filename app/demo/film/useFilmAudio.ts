"use client";
// Sound for the film: the real call recordings, kept in sync with the playhead (seeking and chapter jumps
// included), plus a ringback tone while the callback rings and a low thud when the lock says BLOCK.
// Browsers only allow sound after a click, so it starts off and `enable()` must run in a click handler.
import { useCallback, useEffect, useRef, useState } from "react";
import { CAPTIONS, TIMES } from "./story";

const DRIFT = 0.35; // seconds of drift tolerated before re-seeking a clip
const RING_ON = 2; // US ringback: 2 s on, 4 s off
const RING_CYCLE = 6;

export function useFilmAudio(t: number, playing: boolean) {
  const [on, setOn] = useState(false);
  const clips = useRef<HTMLAudioElement[] | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const ring = useRef<GainNode | null>(null);
  const lastT = useRef(t);

  const enable = useCallback(() => {
    if (!clips.current) {
      clips.current = CAPTIONS.map((c) => {
        const a = new Audio(c.audio);
        a.preload = "auto";
        return a;
      });
    }
    if (!ctx.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctx();
      const gain = ac.createGain();
      gain.gain.value = 0;
      for (const f of [440, 480]) {
        const osc = ac.createOscillator();
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start();
      }
      gain.connect(ac.destination);
      ctx.current = ac;
      ring.current = gain;
    }
    void ctx.current.resume();
    setOn(true);
  }, []);
  const disable = useCallback(() => setOn(false), []);

  // Clips follow the playhead.
  useEffect(() => {
    const list = clips.current;
    if (!list) return;
    CAPTIONS.forEach((c, i) => {
      const a = list[i];
      const offset = t - c.start;
      const live = on && playing && offset >= 0 && offset < c.end - c.start;
      if (live) {
        if (a.paused) {
          a.currentTime = offset;
          void a.play().catch(() => {});
        } else if (Math.abs(a.currentTime - offset) > DRIFT) {
          a.currentTime = offset;
        }
      } else if (!a.paused) {
        a.pause();
      }
    });
  }, [t, on, playing]);

  // Ringback while the callback rings, and the thud as BLOCK lands.
  useEffect(() => {
    const ac = ctx.current;
    const gain = ring.current;
    const prev = lastT.current;
    lastT.current = t;
    if (!ac || !gain) return;
    const ringing = on && playing && t >= TIMES.ringFrom && t < TIMES.connect && (t - TIMES.ringFrom) % RING_CYCLE < RING_ON;
    gain.gain.setTargetAtTime(ringing ? 0.035 : 0, ac.currentTime, 0.02);
    if (on && playing && prev < TIMES.block && t >= TIMES.block && t - prev < 0.5) thud(ac);
  }, [t, on, playing]);

  // Silence everything when the page goes away.
  useEffect(
    () => () => {
      clips.current?.forEach((a) => a.pause());
      void ctx.current?.close();
    },
    [],
  );

  return { on, enable, disable };
}

function thud(ac: AudioContext) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(38, now + 0.35);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.65);
}
