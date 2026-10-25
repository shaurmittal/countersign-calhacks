#!/bin/sh
# Sound bed for the video, synthesized with ffmpeg (no third-party music). Drop a licensed track at
# assets/music/track.mp3 and the edit uses it instead of the drone. Also cuts the two real call clips.
set -e
FF="ffmpeg -v error -y"
cd "$(dirname "$0")/.."
A=assets

# Drone: two low tones a fifth apart with a slow beat, plus a breath of filtered noise. 95 s.
$FF -f lavfi -i "aevalsrc='0.32*sin(2*PI*55*t)*(0.75+0.25*sin(2*PI*0.07*t))+0.22*sin(2*PI*82.41*t+0.4*sin(2*PI*0.05*t))+0.12*sin(2*PI*110.3*t)*(0.5+0.5*sin(2*PI*0.11*t))':s=44100:d=95" \
  -f lavfi -i "anoisesrc=c=pink:a=0.05:d=95:r=44100" \
  -filter_complex "[1]lowpass=f=420,highpass=f=60[n];[0][n]amix=inputs=2:weights='1 0.6',lowpass=f=900,afade=t=in:d=3,afade=t=out:st=91:d=4,aformat=channel_layouts=stereo" $A/music/drone.wav

# Tension pulse: a soft low thump every 0.8 s (75 bpm). 40 s.
$FF -f lavfi -i "aevalsrc='0.9*sin(2*PI*(42+38*exp(-mod(t\,0.8)*22))*mod(t\,0.8))*exp(-mod(t\,0.8)*9)':s=44100:d=40" \
  -af "lowpass=f=180,aformat=channel_layouts=stereo" $A/sfx/pulse.wav

# Hit: a deep boom with a short noise transient, for BLOCK and the title.
$FF -f lavfi -i "aevalsrc='sin(2*PI*(36+70*exp(-t*14))*t)*exp(-t*2.6)':s=44100:d=2.2" \
  -f lavfi -i "anoisesrc=c=brown:a=0.9:d=0.35:r=44100" \
  -filter_complex "[1]lowpass=f=1800,afade=t=out:d=0.35[n];[0][n]amix=inputs=2:weights='1 0.5',alimiter=limit=0.95,aformat=channel_layouts=stereo" $A/sfx/hit.wav

# Whoosh: band-passed noise sweeping up then down, 0.9 s.
$FF -f lavfi -i "anoisesrc=c=pink:a=0.8:d=0.9:r=44100" \
  -af "bandpass=f=900:width_type=o:w=2,volume='sin(PI*t/0.9)^2':eval=frame,afade=t=in:d=0.25,afade=t=out:st=0.55:d=0.35,aformat=channel_layouts=stereo" $A/sfx/whoosh.wav

# US ringback: 440 + 480 Hz, 1.6 s on.
$FF -f lavfi -i "aevalsrc='0.22*(sin(2*PI*440*t)+sin(2*PI*480*t))':s=44100:d=1.6" \
  -af "afade=t=in:d=0.02,afade=t=out:st=1.55:d=0.05,aformat=channel_layouts=stereo" $A/sfx/ringback.wav

# Phone buzz: two 0.35 s pulses of a rough 150 Hz motor.
$FF -f lavfi -i "aevalsrc='0.5*sgn(sin(2*PI*150*t))*(lt(mod(t\,0.6)\,0.35))*(0.6+0.4*sin(2*PI*23*t))':s=44100:d=1.2" \
  -af "lowpass=f=700,aformat=channel_layouts=stereo" $A/sfx/buzz.wav

# The two real call lines (case …8gx7rm), from the app's own clips.
$FF -i ../public/demo/audio/c02-caller-scam.mp3 -t 6.9 -af "afade=t=out:st=6.6:d=0.3,aformat=channel_layouts=stereo" $A/audio/caller-scam.wav
$FF -i ../public/demo/audio/c07-vendor-denial.mp3 -t 1.5 -af "afade=t=out:st=1.35:d=0.15,aformat=channel_layouts=stereo" $A/audio/vendor-denial.wav
echo "sound bed ready"
