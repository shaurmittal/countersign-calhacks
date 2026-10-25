# The Countersign demo video

A 1:21 trailer-style demo (hard cap 1:30). Everything shown as product is a real recording of the deployed
app; motion graphics are only titles, captions, diagrams and transitions. Output in `out/`:

- `countersign-demo.mp4`: 1920x1080, 30 fps, mixed to -16 LUFS.
- `countersign-demo.srt`: the captions, also burned into the video.
- `thumbnail.png`: the BLOCK moment with the title.

Script, timings and the source of every number: [script.md](script.md).

## How it's made

| Part | Tool | Where |
| --- | --- | --- |
| Screen footage | Playwright (`playwright-core` with the installed Chrome) recording Chrome's screencast at 3840x2160, so punch-ins stay sharp | `capture/record.ts`, shot list in `capture/run.ts` |
| Voiceover | **Cartesia Sonic** text-to-speech, narrator "Quentin", one file per scene | `scripts/voiceover.ts` → `assets/vo/` |
| Real call audio | The two Cartesia call recordings of case …8gx7rm (the caller's request, and the vendor's "No, we never sent that.") | `scripts/sound.sh` → `assets/audio/` |
| Music and effects | Synthesized with ffmpeg (drone, tension pulse, hit, whoosh, ringback, buzz); no third-party music | `scripts/sound.sh` → `assets/music`, `assets/sfx` |
| Edit | Remotion (React), 1920x1080 at 30 fps | `src/` |
| Mix and delivery | ffmpeg two-pass loudnorm to -16 LUFS; music ducked about 12 dB under the narration | `scripts/finish.sh` |

## Commands

```bash
cd video && npm install
CARTESIA_API_KEY="$(cd .. && npx convex env get CARTESIA_API_KEY)" npm run vo   # voiceover (key never printed)
./scripts/sound.sh                                                            # music, effects, call clips
npm run capture -- bank-hijack breakit-run try-forged-email warroom-email-live warroom-idle bank-ledger film-replay
npm run studio                                                                # preview and scrub in the browser
npm run render:draft                                                          # 540p draft
./scripts/finish.sh                                                           # final mp4, srt, thumbnail
```

Remotion uses the installed Chrome (`remotion.config.ts`): the headless shell it downloads is missing a data file on this Mac. It serves `assets/` on port 3477, because 3000 is usually the app.

## Still to record or replace

1. **`owner-approve`** (1:00-1:03, currently a labelled placeholder). This is Priya approving a payment on `/owner` with a code from her authenticator app.
   - Needs an ESCALATE case: send "Pay Pixel & Pine invoice 1042, $4,800" on `/try`.
   - Paying it uses up invoice 1042, the one the live scam demo needs, so record it, then **re-seed before the dress rehearsal**.
2. **`warroom-call-live`**: the hero shots (0:04-0:12 and 0:34-0:43) currently use the `/demo` replay of the real case …8gx7rm, labelled "Replay of a real case". For the War Room itself on a live phone scam, run `npm run capture -- warroom-call-live`, then place the scam call. It stops 8 s after BLOCK. The cut points in `src/Demo.tsx` (`ColdOpen`, `How`) then need re-timing to that clip.
3. **Optional, `try-pay`**: "Pay Northwind #NW-889" paid automatically on `/try` (needs NW-889 open, so after a re-seed). The current shot for that line is the real countersigned W42 payment in the bank ledger, which is accurate.
4. **Music**: drop a licensed track at `assets/music/track.mp3` and point the `music` sequence in `src/Demo.tsx` at it, or keep the synthesized drone.
