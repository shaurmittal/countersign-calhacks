#!/bin/sh
# Final render: 1080p video, the mix normalized to -16 LUFS (true peak -1.5 dB), captions as .srt, thumbnail.
set -e
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:$PATH"
npx remotion render src/index.ts CountersignDemo out/video-raw.mp4 --crf=16 --log=error
# Two-pass loudnorm: measure, then apply with the measured values (linear, so dynamics are kept).
M=$(ffmpeg -hide_banner -i out/video-raw.mp4 -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | sed -n "s/.*\"$1\" : \"\(.*\)\".*/\1/p"; }
ffmpeg -v error -y -i out/video-raw.mp4 -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" \
  -c:a aac -b:a 256k -movflags +faststart out/countersign-demo.mp4
npx tsx scripts/srt.ts
npx remotion still src/index.ts Thumbnail out/thumbnail.png --log=error
ffmpeg -hide_banner -i out/countersign-demo.mp4 -af ebur128 -f null - 2>&1 | grep -E "^\s+I:|^\s+Peak:" | tail -2
ffprobe -v error -show_entries format=duration -of csv=p=0 out/countersign-demo.mp4
