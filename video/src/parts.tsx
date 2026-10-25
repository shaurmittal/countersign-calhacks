// Building blocks: the camera over real footage, texture (grain, vignette, letterbox), captions, type,
// a waveform drawn from real call audio, and the BLOCK stamp.
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BAR, C, H, MONO, SANS, W } from "./theme";
import { ALL_CUES, f } from "./timeline";

const SLOW = Easing.bezier(0.45, 0, 0.2, 1);

// ---- Camera over real footage ----

/** A camera target: from `at` (s, within the shot) move over `dur` s to centre (x, y) (0..1 of the frame) at zoom z. */
export type CamKey = { at: number; dur?: number; x: number; y: number; z: number; punch?: boolean };

function camAt(keys: CamKey[], t: number, fps: number, frame: number): { x: number; y: number; z: number } {
  let cur = { x: keys[0].x, y: keys[0].y, z: keys[0].z };
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t < k.at) break;
    const dur = k.dur ?? (k.punch ? 0.5 : 2);
    const p = k.punch
      ? spring({ frame: frame - Math.round(k.at * fps), fps, config: { damping: 15, stiffness: 140, mass: 0.6 }, durationInFrames: Math.round(dur * fps) })
      : SLOW(Math.min(1, (t - k.at) / dur));
    cur = { x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, z: cur.z + (k.z - cur.z) * p };
  }
  return cur;
}

/**
 * Real screen footage (assets/footage, 3840x2160) with camera moves. `tilt` (0 flat .. 1 tilted) puts it in a
 * 3D frame for establishing shots. Children are drawn in the footage's own 1920x1080 space, so overlays
 * (the glowing path, highlight boxes) move with the camera.
 */
export const Footage: React.FC<{
  src: string;
  from: number;
  keys: CamKey[];
  tilt?: [number, number][];
  rate?: number;
  /** Let the camera move past the page edge (to lift something at the very bottom above the captions). */
  free?: boolean;
  children?: React.ReactNode;
}> = ({ src, from, keys, tilt, rate = 1, free, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cam = camAt(keys, t, fps, frame);
  const clampX = (v: number) => (free ? v : Math.min(0, Math.max(W - W * cam.z, v)));
  const clampY = (v: number) => (free ? v : Math.min(0, Math.max(H - H * cam.z, v)));
  const tx = clampX(W / 2 - cam.x * W * cam.z);
  const ty = clampY(H / 2 - cam.y * H * cam.z);
  const tv = tilt ? interpolate(t, tilt.map((k) => k[0]), tilt.map((k) => k[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: SLOW }) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, perspective: 2400, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translateY(${-30 * tv}px) rotateX(${11 * tv}deg) rotateY(${-16 * tv}deg) rotateZ(${1.5 * tv}deg) scale(${1 - 0.24 * tv})`,
          borderRadius: 22 * tv,
          overflow: "hidden",
          boxShadow: tv > 0 ? `0 ${60 * tv}px ${140 * tv}px rgba(0,0,0,${0.75 * tv}), 0 0 0 1px rgba(236,238,241,${0.14 * tv})` : undefined,
          WebkitBoxReflect: tv > 0.05 ? `below 10px linear-gradient(transparent 72%, rgba(255,255,255,${0.1 * tv}))` : undefined,
        }}
      >
        <div style={{ position: "absolute", width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${cam.z})` }}>
          <OffthreadVideo src={staticFile(`footage/${src}.mp4`)} trimBefore={f(from)} playbackRate={rate} muted style={{ width: W, height: H }} />
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A box drawn on footage (in its 1920x1080 space) that glows in at `at`. */
export const Glow: React.FC<{ x: number; y: number; w: number; h: number; at: number; color?: string }> = ({ x, y, w, h, at, color = C.red }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - f(at), fps, config: { damping: 18, stiffness: 160 } });
  return (
    <div
      style={{
        position: "absolute",
        left: x - 8,
        top: y - 6,
        width: w + 16,
        height: h + 12,
        borderRadius: 10,
        border: `2.5px solid ${color}`,
        boxShadow: `0 0 ${28 * p}px ${color}, inset 0 0 ${18 * p}px ${color}55`,
        opacity: p,
        transform: `scale(${1.08 - 0.08 * p})`,
      }}
    />
  );
};

/** A glowing line tracing a path through points (footage space), drawn from `at` over `dur` s. */
export const TracePath: React.FC<{ points: [number, number][]; at: number; dur: number; color?: string }> = ({ points, at, dur, color = C.green }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [f(at), f(at + dur)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: SLOW });
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const len = points.slice(1).reduce((s, [x, y], i) => s + Math.hypot(x - points[i][0], y - points[i][1]), 0);
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} style={{ filter: `drop-shadow(0 0 10px ${color}) drop-shadow(0 0 22px ${color})` }} />
    </svg>
  );
};

// ---- Texture ----

export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(random(`grain-${Math.floor(frame / 2)}`) * 1000);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.16 }}>
      <svg width={W} height={H}>
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
);

/** 2.39:1 bars; `on` is a list of [start, end] seconds (absolute) when they are shown. */
export const Letterbox: React.FC<{ on: [number, number][] }> = ({ on }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  let v = 0;
  for (const [a, b] of on) v = Math.max(v, Math.min(interpolate(t, [a - 0.35, a], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), interpolate(t, [b, b + 0.35], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const h = BAR * SLOW(v);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: h, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, background: "#000" }} />
    </AbsoluteFill>
  );
};

// ---- Captions (burned in; the same cues become the .srt) ----

export const Captions: React.FC<{ hideDuring?: [number, number][] }> = ({ hideDuring = [] }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const cue = ALL_CUES.find((c) => t >= c.start && t < c.end + 0.15);
  if (!cue || hideDuring.some(([a, b]) => t >= a && t < b)) return null;
  const fade = Math.min(interpolate(t, [cue.start, cue.start + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), interpolate(t, [cue.end, cue.end + 0.15], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 64, pointerEvents: "none" }}>
      <div style={{ opacity: fade, maxWidth: 1400, textAlign: "center", padding: "10px 22px 12px", borderRadius: 10, background: "rgba(7,8,11,0.88)", backdropFilter: "blur(8px)", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
        {cue.speaker && <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.14em", textTransform: "uppercase", color: cue.speaker === "Caller" ? C.red : C.green, marginBottom: 4 }}>{cue.speaker}</div>}
        <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 38, lineHeight: 1.25, color: C.fg }}>{cue.text}</div>
      </div>
    </AbsoluteFill>
  );
};

// ---- Type ----

/** Words revealed one by one from `at` (seconds, relative to the sequence), `perWord` apart. */
export const Words: React.FC<{ text: string; at: number; perWord?: number; style?: React.CSSProperties; accent?: string[]; accentColor?: string }> = ({
  text,
  at,
  perWord = 0.12,
  style,
  accent = [],
  accentColor = C.green,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <span style={style}>
      {text.split(" ").map((w, i) => {
        const p = spring({ frame: frame - f(at + i * perWord), fps, config: { damping: 20, stiffness: 180 } });
        const hot = accent.some((a) => w.replace(/[.,]/g, "").toLowerCase() === a.toLowerCase());
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 26}px)`, filter: `blur(${(1 - p) * 6}px)`, color: hot ? accentColor : undefined, marginRight: "0.26em" }}>
            {w}
          </span>
        );
      })}
    </span>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.soft, style }) => (
  <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.22em", textTransform: "uppercase", color, ...style }}>{children}</div>
);

/** Small honest label in a corner ("Replay of a real case", "Simulated email"). */
export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", right: 36, top: 30, fontFamily: MONO, fontSize: 17, letterSpacing: "0.08em", color: C.soft, background: "rgba(7,8,11,0.7)", padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.line}` }}>
    {children}
  </div>
);

// ---- Waveform from a real recording ----

export const Waveform: React.FC<{ src: string; from: number; color: string; bars?: number; width?: number; height?: number }> = ({ src, from, color, bars = 64, width = 900, height = 160 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const audio = useAudioData(staticFile(src));
  const local = frame - f(from);
  const values =
    audio && local >= 0
      ? visualizeAudio({ fps, frame: local, audioData: audio, numberOfSamples: 128, optimizeFor: "speed" }).slice(0, bars)
      : new Array(bars).fill(0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width, height }}>
      {values.map((v, i) => {
        const mirrored = values[Math.abs(bars / 2 - i) | 0] ?? v;
        const hgt = Math.max(6, Math.min(height, Math.sqrt(mirrored) * height * 1.6));
        return <div key={i} style={{ flex: 1, height: hgt, borderRadius: 4, background: color, boxShadow: `0 0 14px ${color}88` }} />;
      })}
    </div>
  );
};

// ---- The verdict ----

export const Stamp: React.FC<{ at: number; word?: string; color?: string; size?: number }> = ({ at, word = "BLOCK", color = C.red, size = 220 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - f(at), fps, config: { damping: 12, stiffness: 220, mass: 0.7 } });
  return (
    <div
      style={{
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "0.06em",
        color,
        border: `${size / 18}px solid ${color}`,
        borderRadius: size / 9,
        padding: `0 ${size / 6}px`,
        lineHeight: 1.15,
        transform: `rotate(-3deg) scale(${2.2 - 1.2 * p})`,
        opacity: Math.min(1, p * 1.4),
        textShadow: `0 0 40px ${color}`,
        boxShadow: `0 0 60px ${color}66, inset 0 0 40px ${color}33`,
      }}
    >
      {word}
    </div>
  );
};
