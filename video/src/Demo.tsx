// The Countersign demo video, 1:21. Product shots are real recordings of the deployed app (assets/footage);
// motion graphics are only titles, captions, diagrams and transitions. Times are absolute seconds
// (timeline.ts); each scene is a Sequence, so footage and type inside use scene-local time.
import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Captions, Footage, Glow, Grain, Kicker, Letterbox, Note, TracePath, Vignette, Waveform, Words } from "./parts";
import { C, MONO, SANS } from "./theme";
import { CALL, f, SCENES, SPEECH, TOTAL_SECONDS, VO_AT } from "./timeline";

/** The /demo replay (case …8gx7rm) starts 30.9 s into film-replay.mp4: footage time = film time + 30.9. */
const FILM = (filmT: number) => filmT + 30.9;
const REPLAY_NOTE = "Replay of a real case · countersign-calhacks.vercel.app/demo";

const Scene: React.FC<{ from: number; to: number; children: React.ReactNode; name: string }> = ({ from, to, children, name }) => (
  <Sequence from={f(from)} durationInFrames={f(to) - f(from)} name={name}>
    {children}
  </Sequence>
);

const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", textAlign: "center", ...style }}>{children}</AbsoluteFill>
);

/** Fades a scene's content in and out over `fade` seconds. */
const useFade = (dur: number, fade = 0.25) => {
  const frame = useCurrentFrame();
  return Math.min(interpolate(frame, [0, f(fade)], [0, 1], { extrapolateRight: "clamp" }), interpolate(frame, [f(dur - fade), f(dur)], [1, 0], { extrapolateLeft: "clamp" }));
};

// ---------------- 1. Cold open ----------------

const IncomingCall: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.sin(frame / 4);
  const o = interpolate(frame, [f(0.35), f(0.8)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Center style={{ opacity: o, gap: 34 }}>
      <Kicker color={C.red}>
        <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 7, background: C.red, marginRight: 14, opacity: 0.4 + 0.6 * pulse, boxShadow: `0 0 18px ${C.red}` }} />
        Incoming call · Countersign line
      </Kicker>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 96, color: C.fg, letterSpacing: "-0.02em" }}>“Pixel &amp; Pine”</div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: C.soft }}>says it's a vendor · wants invoice 1042 paid somewhere new</div>
      <Waveform src="audio/caller-scam.wav" from={CALL.caller} color={C.red} width={1100} height={170} />
    </Center>
  );
};

const ColdOpen: React.FC = () => (
  <>
    <Scene from={0} to={CALL.room} name="incoming call">
      <IncomingCall />
    </Scene>
    {/* The room lights up while the caller keeps talking: the case file finds the account isn't the one on file. */}
    <Scene from={CALL.room} to={CALL.dial} name="room">
      <Footage
        src="film-replay"
        from={FILM(24.4)}
        keys={[
          { at: 0, x: 0.42, y: 0.55, z: 1.25 },
          { at: 0.1, dur: 3.2, x: 0.45, y: 0.55, z: 1.38 },
          { at: 1.9, punch: true, x: 0.72, y: 0.47, z: 2.05 },
        ]}
      >
        <Glow x={1186} y={386} w={330} h={24} at={2.15} />
      </Footage>
      <Note>{REPLAY_NOTE}</Note>
    </Scene>
    {/* Countersign dials the number already on file, never the one in the message. */}
    <Scene from={CALL.dial} to={CALL.denial} name="callback dials">
      <Footage src="film-replay" from={FILM(34.0)} keys={[{ at: 0, x: 0.7, y: 0.42, z: 1.55 }, { at: 0, dur: 2.4, x: 0.7, y: 0.43, z: 1.75 }]}>
        <Glow x={1070} y={448} w={440} h={26} at={0.5} color={C.green} />
      </Footage>
      <Note>{REPLAY_NOTE}</Note>
    </Scene>
    <Scene from={CALL.denial} to={CALL.block} name="the vendor says no">
      <Footage src="film-replay" from={FILM(59.3)} keys={[{ at: 0, x: 0.36, y: 0.86, z: 1.9 }, { at: 0, dur: 1.3, x: 0.37, y: 0.86, z: 2.05 }]} />
    </Scene>
    <Scene from={CALL.block} to={SCENES.title} name="BLOCK">
      <Footage src="film-replay" from={FILM(79.75)} keys={[{ at: 0, x: 0.34, y: 0.43, z: 1.2 }, { at: 0, punch: true, x: 0.34, y: 0.43, z: 1.75 }]} />
      <Flash at={0} />
    </Scene>
  </>
);

const Flash: React.FC<{ at: number; color?: string }> = ({ at, color = "#fff" }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [f(at), f(at) + 2, f(at) + 9], [0, 0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: "none" }} />;
};

// ---------------- 2. Title ----------------

const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const word = "COUNTERSIGN";
  const shown = Math.min(word.length, Math.floor(interpolate(frame, [f(0.25), f(1.05)], [0, word.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const sub = interpolate(frame, [f(1.2), f(1.8)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const vo = VO_AT["02-title"] - SCENES.title;
  const fade = useFade(SCENES.problem - SCENES.title);
  return (
    <Center style={{ gap: 26, opacity: fade }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 132, letterSpacing: "0.22em", color: C.fg, marginRight: "-0.22em" }}>
        {word.slice(0, shown)}
        <span style={{ opacity: shown < word.length ? 1 : 0, color: C.green }}>▍</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 40, color: C.soft, opacity: sub }}>The second signer a one-person company never had.</div>
      <div style={{ display: "flex", gap: 120, marginTop: 40 }}>
        <Figure at={vo + 2.0} value="$4,800" label="almost sent to a scammer" color={C.red} />
        <Figure at={vo + 4.6} value="50 s" label="from the call to BLOCK" color={C.green} />
      </div>
    </Center>
  );
};

const Figure: React.FC<{ at: number; value: string; label: string; color: string }> = ({ at, value, label, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - f(at), fps, config: { damping: 16, stiffness: 160 } });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 92, color, textShadow: `0 0 30px ${color}66` }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.12em", textTransform: "uppercase", color: C.soft }}>{label}</div>
    </div>
  );
};

// ---------------- 3. The problem ----------------

const Person: React.FC<{ color: string; check?: boolean; at: number }> = ({ color, check, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - f(at), fps, config: { damping: 15 } });
  return (
    <svg width={150} height={190} viewBox="0 0 150 190" style={{ opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}>
      <circle cx={75} cy={52} r={38} fill="none" stroke={color} strokeWidth={6} />
      <path d="M15 182c0-38 27-64 60-64s60 26 60 64" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" />
      {check && <path d="M100 120l14 14 28-30" fill="none" stroke={C.green} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
};

const SCAMS = ["Bank change", "Fake invoice", "Boss in a hurry", "Gift cards", "Payroll redirect", "AI agent requests"];

const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const vo = VO_AT["03-problem"] - SCENES.problem;
  const split = vo + 4.2;
  const left = interpolate(frame, [f(split - 0.2), f(split + 0.3)], [1, 0.22], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = useFade(SCENES.how - SCENES.problem);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <div style={{ position: "absolute", left: 180, top: 230, width: 700, opacity: left }}>
        <Kicker>Any company</Kicker>
        <div style={{ display: "flex", gap: 30, margin: "34px 0" }}>
          <Person color={C.fg} check at={vo + 0.3} />
          <Person color={C.fg} check at={vo + 0.8} />
        </div>
        <Words text="Two people approve every payment." at={vo + 0.6} style={{ fontFamily: SANS, fontWeight: 700, fontSize: 54, color: C.fg, lineHeight: 1.15 }} />
      </div>
      <div style={{ position: "absolute", left: 1040, top: 230, width: 720 }}>
        <Kicker color={C.red} style={{ opacity: interpolate(frame, [f(split), f(split + 0.3)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          A solo founder · 11:04 PM
        </Kicker>
        <div style={{ display: "flex", gap: 30, margin: "34px 0" }}>
          <Person color={C.red} at={split + 0.1} />
        </div>
        <Words text="Nobody to check." at={split + 0.2} style={{ fontFamily: SANS, fontWeight: 700, fontSize: 54, color: C.red }} />
      </div>
      <div style={{ position: "absolute", left: 180, right: 180, bottom: 210, display: "flex", gap: 16, justifyContent: "center" }}>
        {SCAMS.map((s, i) => {
          const p = spring({ frame: frame - f(split + 0.5 + i * 0.12), fps: 30, config: { damping: 18 } });
          return (
            <div key={s} style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)`, fontFamily: MONO, fontSize: 22, color: C.fg, padding: "12px 18px", borderRadius: 10, border: `1.5px solid ${C.red}88`, background: "rgba(255,59,78,0.08)" }}>
              {s}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- 4. How it works ----------------

const CHANNELS = ["Phone calls", "Email", "Web chat", "AI agents"];
// War Room graph nodes in footage space (1920x1080).
const NODE = { intake: [225, 370], vendor: [483, 290], risk: [753, 290], leader: [618, 468], callback: [1002, 370], policy: [618, 638] } as const;

const How: React.FC = () => {
  const vo = VO_AT["04-how"] - SCENES.how; // 0.2
  const roomEnd = vo + 7.9;
  return (
    <>
      {/* Live War Room, a real case from start to finish (a forged email fired while filming). */}
      <Sequence from={0} durationInFrames={f(roomEnd)} name="war room live">
        <Footage
          src="warroom-email-live"
          from={3.6}
          tilt={[[0, 1], [2.4, 1], [3.4, 0]]}
          keys={[
            { at: 0, x: 0.5, y: 0.5, z: 1 },
            { at: 3.4, dur: 0.8, x: 0.32, y: 0.5, z: 1.32 },
            { at: 5.7, punch: true, x: 0.8, y: 0.5, z: 1.75 },
          ]}
        >
          <TracePath points={[NODE.intake, NODE.leader, NODE.vendor, NODE.leader, NODE.risk, NODE.leader, NODE.policy] as unknown as [number, number][]} at={3.6} dur={2.1} />
          <Glow x={1390} y={508} w={108} h={22} at={6.1} />
          <Glow x={1233} y={640} w={240} h={22} at={6.5} />
        </Footage>
        <ChannelChips at={vo + 0.4} until={roomEnd - 4.8} />
        <Note>Live War Room · a forged email, simulated headers</Note>
      </Sequence>
      {/* "Then it does what a careful accountant would": the callback agent rings the number on file. */}
      <Sequence from={f(roomEnd)} durationInFrames={f(vo + 10.4) - f(roomEnd)} name="dial">
        <Footage src="film-replay" from={FILM(27.5)} keys={[{ at: 0, x: 0.52, y: 0.38, z: 1.55 }, { at: 0, dur: 2.5, x: 0.53, y: 0.37, z: 1.85 }]} />
        <Note>{REPLAY_NOTE}</Note>
      </Sequence>
      {/* "It never calls the number that called it." */}
      <Sequence from={f(vo + 10.4)} durationInFrames={f(vo + 12.8) - f(vo + 10.4)} name="number on file">
        <Footage src="film-replay" from={FILM(35.7)} keys={[{ at: 0, x: 0.66, y: 0.42, z: 1.6 }, { at: 0.3, punch: true, x: 0.66, y: 0.43, z: 2.0 }]}>
          <Glow x={1070} y={448} w={440} h={26} at={0.35} color={C.green} />
        </Footage>
        <Note>{REPLAY_NOTE}</Note>
      </Sequence>
      {/* "It calls the number it already trusts, and the real vendor says no." */}
      <Sequence from={f(vo + 12.8)} durationInFrames={f(SCENES.design - SCENES.how) - f(vo + 12.8)} name="denial">
        <Footage src="film-replay" from={FILM(57.6)} keys={[{ at: 0, x: 0.68, y: 0.5, z: 1.5 }, { at: 0.2, dur: 3.6, x: 0.68, y: 0.52, z: 1.72 }]} />
        <Note>{REPLAY_NOTE}</Note>
      </Sequence>
      <Flash at={roomEnd} color="#000" />
    </>
  );
};

const ChannelChips: React.FC<{ at: number; until: number }> = ({ at, until }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [f(until), f(until + 0.4)], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 90, bottom: 190, display: "flex", gap: 14, opacity: out }}>
      {CHANNELS.map((c, i) => {
        const p = spring({ frame: frame - f(at + i * 0.32), fps, config: { damping: 16 } });
        return (
          <div key={c} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)`, fontFamily: MONO, fontSize: 26, color: C.fg, padding: "12px 20px", borderRadius: 12, border: `1.5px solid ${C.green}99`, background: "rgba(7,8,11,0.82)", boxShadow: `0 0 24px ${C.green}33` }}>
            {c}
          </div>
        );
      })}
    </div>
  );
};

// ---------------- 5. The core design ----------------

const Box: React.FC<{ x: number; y: number; w: number; h: number; color: string; on: number; children: React.ReactNode }> = ({ x, y, w, h, color, on, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 22,
      border: `2px solid ${color}`,
      background: `rgba(16,19,24,0.9)`,
      boxShadow: `0 0 ${50 * on}px ${color}55, inset 0 0 ${30 * on}px ${color}22`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 14,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

const Design: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vo = VO_AT["05-design"] - SCENES.design; // 0.2
  const sp = (at: number) => spring({ frame: frame - f(at), fps, config: { damping: 18 } });
  const verbs = ["read", "reason", "talk"];
  const blocked = sp(vo + 2.75);
  const lock = sp(vo + 4.2);
  const path = interpolate(frame, [f(vo + 5.0), f(vo + 6.2)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bankCut = vo + 6.4;
  const lineCut = vo + 8.4;
  return (
    <>
      <Sequence from={0} durationInFrames={f(bankCut)} name="diagram">
        <AbsoluteFill>
          <Box x={150} y={330} w={520} h={330} color={C.fg} on={sp(vo + 0.1)}>
            <Kicker>AI agents</Kicker>
            <div style={{ display: "flex", gap: 14 }}>
              {verbs.map((v, i) => {
                const p = sp(vo + 0.25 + i * 0.6);
                return (
                  <div key={v} style={{ fontFamily: SANS, fontWeight: 700, fontSize: 44, color: p > 0.5 ? C.fg : C.muted, opacity: 0.3 + 0.7 * p }}>
                    {v}
                  </div>
                );
              })}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 20, color: C.soft }}>Claude · Cartesia voices</div>
          </Box>
          {/* The blocked route: AI agents straight to the money. */}
          <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            <path d="M670 420 C 980 240, 1300 240, 1500 340" fill="none" stroke={C.red} strokeWidth={4} strokeDasharray="14 12" opacity={blocked} />
            <g opacity={blocked} transform={`translate(1085 268) scale(${0.6 + 0.4 * blocked})`}>
              <circle r={34} fill={C.bg} stroke={C.red} strokeWidth={4} />
              <path d="M-14 -14L14 14M14 -14L-14 14" stroke={C.red} strokeWidth={6} strokeLinecap="round" />
            </g>
            <path d="M670 560 L 830 560" stroke={C.green} strokeWidth={4} opacity={lock} />
            <path d="M1250 560 L 1500 500" stroke={C.green} strokeWidth={5} strokeDasharray="420" strokeDashoffset={420 * (1 - path)} style={{ filter: `drop-shadow(0 0 10px ${C.green})` }} />
          </svg>
          <div style={{ position: "absolute", left: 960, top: 200, fontFamily: MONO, fontSize: 24, color: C.red, opacity: blocked, transform: "translateX(-50%)" }}>cannot move money</div>
          <Box x={830} y={420} w={420} h={280} color={C.green} on={lock}>
            <svg width={56} height={56} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 + 0.6 * lock }}>
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke={C.green} strokeWidth="1.8" />
              <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke={C.green} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 40, color: C.fg }}>Policy Engine</div>
            <div style={{ fontFamily: MONO, fontSize: 22, color: C.green }}>17 rules · plain code · no AI</div>
          </Box>
          <Box x={1500} y={330} w={300} h={330} color={path > 0.95 ? C.green : C.muted} on={path}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 84, color: path > 0.95 ? C.green : C.muted }}>$</div>
            <Kicker>The money</Kicker>
          </Box>
          <div style={{ position: "absolute", left: 1262, top: 470, fontFamily: MONO, fontSize: 22, color: C.green, opacity: path }}>the only path to money</div>
        </AbsoluteFill>
      </Sequence>
      {/* "...and the bank checks their signature": the bank refuses four direct transfer attempts. */}
      <Sequence from={f(bankCut)} durationInFrames={f(lineCut) - f(bankCut)} name="bank refuses">
        <Footage src="bank-hijack" from={5.6} keys={[{ at: 0, x: 0.635, y: 0.72, z: 1.45 }, { at: 0, dur: 2, x: 0.635, y: 0.78, z: 1.62 }]} />
        <Note>Lumen Bank, our sandbox bank · /bank</Note>
      </Sequence>
      <Sequence from={f(lineCut)} name="the line">
        <Center>
          <div style={{ maxWidth: 1500, fontFamily: SANS, fontWeight: 700, fontSize: 84, lineHeight: 1.1, color: C.fg, letterSpacing: "-0.02em" }}>
            <Words text="You can talk it into anything, except moving money." at={0.15} perWord={0.21} accent={["except", "moving", "money"]} />
          </div>
        </Center>
      </Sequence>
    </>
  );
};

// ---------------- 6. Not a blocker ----------------

const Blocker: React.FC = () => {
  const vo = VO_AT["06-blocker"] - SCENES.blocker; // 0.2
  return (
    <>
      <Sequence from={0} durationInFrames={f(vo + 2.4)} name="a real bill, paid">
        <Footage src="bank-ledger" from={2.6} keys={[{ at: 0, x: 0.5, y: 0.6, z: 1.3 }, { at: 0.35, punch: true, x: 0.44, y: 0.85, z: 1.85 }]}>
          <Glow x={408} y={912} w={1120} h={28} at={0.6} color={C.green} />
        </Footage>
        <Note>Lumen Bank ledger · /bank</Note>
      </Sequence>
      <Sequence from={f(vo + 2.4)} durationInFrames={f(vo + 5.3) - f(vo + 2.4)} name="owner approval (placeholder)">
        <Placeholder shot="owner-approve" what="/owner: Priya approves the $4,800 payment with a 6-digit code from her authenticator app" />
      </Sequence>
      <Sequence from={f(vo + 5.3)} name="never a voice">
        <Center style={{ gap: 30 }}>
          <div style={{ position: "relative" }}>
            <Waveform src="audio/caller-scam.wav" from={-2} color={C.muted} width={900} height={120} />
            <div style={{ position: "absolute", left: -20, right: -20, top: "50%", height: 6, background: C.red, transform: "rotate(-4deg)", boxShadow: `0 0 20px ${C.red}` }} />
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 72, color: C.fg }}>Never a voice.</div>
        </Center>
      </Sequence>
    </>
  );
};

/** A clearly labelled gap for footage still to be recorded (see video/README.md). */
const Placeholder: React.FC<{ shot: string; what: string }> = ({ shot, what }) => (
  <Center style={{ gap: 20, background: "repeating-linear-gradient(45deg, #0d0f14 0 24px, #10131a 24px 48px)" }}>
    <Kicker color={C.red}>Footage to record · {shot}</Kicker>
    <div style={{ fontFamily: SANS, fontSize: 40, color: C.fg, maxWidth: 1200 }}>{what}</div>
  </Center>
);

// ---------------- 7. Proof ----------------

const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const vo = VO_AT["07-proof"] - SCENES.proof; // 0.1
  const zeroAt = vo + 4.06;
  const count = Math.round(interpolate(frame, [f(zeroAt - 0.1), f(zeroAt + 0.9)], [0, 26], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <>
      <Sequence from={0} durationInFrames={f(vo + 2.4)} name="39 scenarios">
        <Footage src="breakit-run" from={0.2} keys={[{ at: 0, x: 0.36, y: 0.2, z: 1.5 }, { at: 1.0, dur: 1.4, x: 0.62, y: 0.6, z: 1.45 }]} />
        <Note>Answer key in the real Policy Engine · /demo</Note>
      </Sequence>
      <Sequence from={f(vo + 2.4)} durationInFrames={f(vo + 3.9) - f(vo + 2.4)} name="every scam stopped">
        <Footage src="breakit-run" from={5.2} keys={[{ at: 0, x: 0.66, y: 0.88, z: 1.7 }, { at: 0, punch: true, x: 0.64, y: 0.9, z: 2.3 }]}>
          <Glow x={962} y={980} w={560} h={30} at={0.2} color={C.green} />
        </Footage>
      </Sequence>
      <Sequence from={f(vo + 3.9)} durationInFrames={f(vo + 5.3) - f(vo + 3.9)} name="zero wrong payments">
        <Center style={{ gap: 10 }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 260, color: C.green, lineHeight: 1, textShadow: `0 0 60px ${C.green}66` }}>0</div>
          <Kicker color={C.fg}>wrong payments</Kicker>
          <div style={{ fontFamily: MONO, fontSize: 30, color: C.soft, marginTop: 24 }}>
            {count}/26 scams stopped · 13/13 real bills handled · 39 scenarios
          </div>
        </Center>
      </Sequence>
      <Sequence from={f(vo + 5.3)} name="audit chain">
        <Footage free src="warroom-idle" from={1.0} keys={[{ at: 0, x: 0.3, y: 0.86, z: 1.9 }, { at: 0.1, dur: 2.3, x: 0.62, y: 0.88, z: 2.05 }]} />
        <Note>Live War Room · hash-chained audit log</Note>
      </Sequence>
    </>
  );
};

// ---------------- 8. Built with, and close ----------------

const STACK = [
  { name: "Cartesia", role: "both phone calls", at: 0.75 },
  { name: "Claude", role: "reads and writes, never decides", at: 1.1 },
  { name: "Convex", role: "realtime backend and audit chain", at: 1.5 },
  { name: "Moss", role: "vendor and policy search", at: 1.85 },
  { name: "CRS", role: "email fraud scores", at: 2.35 },
  { name: "Fetch.ai", role: "agent-to-agent requests", at: 3.4 },
];

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vo = VO_AT["08-close"] - SCENES.close; // 0.2
  const endAt = vo + 5.6;
  return (
    <>
      <Sequence from={0} durationInFrames={f(endAt)} name="built with">
        <Center style={{ gap: 40 }}>
          <Kicker>Built with</Kicker>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 440px)", gap: 26 }}>
            {STACK.map((s) => {
              const p = spring({ frame: frame - f(vo + s.at), fps, config: { damping: 16 } });
              return (
                <div key={s.name} style={{ padding: "28px 30px", borderRadius: 18, border: `1.5px solid ${p > 0.5 ? C.green : C.line}`, background: "rgba(16,19,24,0.85)", opacity: 0.25 + 0.75 * p, transform: `scale(${0.96 + 0.04 * p})`, boxShadow: `0 0 ${36 * p}px ${C.green}22`, textAlign: "left" }}>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 52, color: C.fg }}>{s.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 20, color: C.soft, marginTop: 6 }}>{s.role}</div>
                </div>
              );
            })}
          </div>
        </Center>
      </Sequence>
      <Sequence from={f(endAt)} name="end card">
        <EndCard callAt={0.15} scamAt={vo + 7.04 - endAt} />
      </Sequence>
    </>
  );
};

const EndCard: React.FC<{ callAt: number; scamAt: number }> = ({ callAt, scamAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: frame - f(callAt), fps, config: { damping: 18 } });
  const b = spring({ frame: frame - f(scamAt), fps, config: { damping: 14 } });
  const logo = spring({ frame: frame - f(scamAt + 1.6), fps, config: { damping: 20 } });
  return (
    <Center style={{ gap: 26 }}>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 104, color: C.fg, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>+1 (256) 215-6932</div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 64, color: C.green, opacity: b, transform: `scale(${1.2 - 0.2 * b})` }}>Try to scam it.</div>
      <div style={{ marginTop: 50, opacity: logo, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 52, letterSpacing: "0.3em", color: C.fg, marginRight: "-0.3em" }}>COUNTERSIGN</div>
        <div style={{ fontFamily: SANS, fontSize: 26, color: C.soft }}>You can talk it into anything except moving money.</div>
      </div>
      <div style={{ position: "absolute", bottom: 160, fontFamily: MONO, fontSize: 18, color: C.muted, opacity: logo }}>
        Fictional company and vendors. Real calls, real verification, sandbox payments.
      </div>
    </Center>
  );
};

// ---------------- Sound ----------------

const duck = (t: number) => {
  let d = 0;
  for (const [a, b] of SPEECH) d = Math.max(d, Math.min(interpolate(t, [a - 0.25, a], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), interpolate(t, [b, b + 0.4], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  return d;
};

const Sound: React.FC = () => {
  const sfx = (name: string, at: number, volume = 1) => (
    <Sequence key={`${name}-${at}`} from={f(at)} name={`sfx ${name}`}>
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
  return (
    <>
      {/* Cold open: the real calls, the tension pulse, the half-second of silence, the hit. */}
      {sfx("buzz", CALL.buzz, 0.55)}
      <Sequence from={f(0.5)} durationInFrames={f(CALL.silence) - f(0.5)} name="pulse">
        <Audio src={staticFile("sfx/pulse.wav")} volume={(fr) => interpolate(fr, [0, 20, f(CALL.silence - 0.5) - 6, f(CALL.silence - 0.5)], [0, 0.55, 0.55, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
      <Sequence from={f(CALL.caller)} name="real call: the caller">
        <Audio src={staticFile("audio/caller-scam.wav")} volume={1} />
      </Sequence>
      {sfx("whoosh", CALL.room - 0.35, 0.5)}
      {sfx("ringback", CALL.dial, 0.6)}
      <Sequence from={f(CALL.denial)} name="real call: the vendor">
        <Audio src={staticFile("audio/vendor-denial.wav")} volume={1.5} />
      </Sequence>
      {sfx("hit", CALL.block, 0.95)}
      {sfx("hit", SCENES.title + 0.25, 0.45)}
      {[SCENES.problem, SCENES.how, SCENES.design, SCENES.blocker, SCENES.proof, SCENES.close].map((t) => sfx("whoosh", t - 0.4, 0.35))}
      {sfx("hit", SCENES.design + 8.6, 0.4)}
      {sfx("hit", SCENES.close + 5.85, 0.35)}
      {/* Music bed: a drone (or assets/music/track.mp3 if dropped in), ducked ~12 dB under the narration. */}
      <Sequence from={f(SCENES.title)} name="music">
        <Audio
          src={staticFile("music/drone.wav")}
          volume={(fr) => {
            const t = fr / 30 + SCENES.title;
            const base = interpolate(t, [SCENES.title, SCENES.title + 1.5, TOTAL_SECONDS - 3, TOTAL_SECONDS], [0, 0.42, 0.42, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return base * (1 - 0.75 * duck(t));
          }}
        />
      </Sequence>
      {Object.entries(VO_AT).map(([id, at]) => (
        <Sequence key={id} from={f(at)} name={`vo ${id}`}>
          <Audio src={staticFile(`vo/${id}.wav`)} volume={1} />
        </Sequence>
      ))}
    </>
  );
};

// ---------------- The film ----------------

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <ColdOpen />
    <Scene from={SCENES.title} to={SCENES.problem} name="2 title">
      <Title />
    </Scene>
    <Scene from={SCENES.problem} to={SCENES.how} name="3 problem">
      <Problem />
    </Scene>
    <Scene from={SCENES.how} to={SCENES.design} name="4 how it works">
      <How />
    </Scene>
    <Scene from={SCENES.design} to={SCENES.blocker} name="5 design">
      <Design />
    </Scene>
    <Scene from={SCENES.blocker} to={SCENES.proof} name="6 not a blocker">
      <Blocker />
    </Scene>
    <Scene from={SCENES.proof} to={SCENES.close} name="7 proof">
      <Proof />
    </Scene>
    <Scene from={SCENES.close} to={SCENES.end} name="8 close">
      <Close />
    </Scene>
    <Vignette />
    <Grain />
    <Letterbox on={[[SCENES.title, SCENES.problem - 0.3], [SCENES.design + 8.4, SCENES.blocker - 0.2], [SCENES.close + 7.0, SCENES.end]]} />
    <Captions />
    <Sound />
  </AbsoluteFill>
);

/** The thumbnail: the BLOCK moment with the title. */
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <Footage src="film-replay" from={FILM(80.0)} keys={[{ at: 0, x: 0.52, y: 0.45, z: 1.55 }]} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(7,8,11,0) 30%, rgba(7,8,11,0.92) 70%)" }} />
    <div style={{ position: "absolute", right: 110, top: 330, width: 760, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 92, letterSpacing: "0.16em", color: C.fg }}>COUNTERSIGN</div>
      <div style={{ fontFamily: SANS, fontSize: 44, lineHeight: 1.2, color: C.soft }}>
        You can talk it into anything <span style={{ color: C.green }}>except moving money.</span>
      </div>
    </div>
    <Vignette />
    <Grain />
  </AbsoluteFill>
);
