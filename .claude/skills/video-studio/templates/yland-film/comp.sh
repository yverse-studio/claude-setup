#!/bin/bash
# comp.sh <selfie> <frames_dir> <caption_png> <out_dir> [music.mp3 start_s]
set -e
[ $# -ge 4 ] || { echo "usage: comp.sh <selfie> <frames_dir> <caption_png> <out_dir> [music start_s]"; exit 2; }
SELF="$1"; FR="$2"; CAP="$3"; OUT="$4"; MUS="$5"; MST="${6:-0}"
mkdir -p "$OUT/work"
# game: frames 45..164 -> 4.0 s at 30 fps
ffmpeg -loglevel error -y -framerate 30 -start_number 45 -i "$FR/f%04d.png" -frames:v 120 -c:v libx264 -crf 12 -pix_fmt yuv420p "$OUT/work/game.mp4"
# selfie: 1080x1920 cover crop, light grade, 7.5 s (stretched hold of last frame if short)
ffmpeg -loglevel error -y -i "$SELF" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,eq=contrast=1.04:saturation=1.05,tpad=stop_mode=clone:stop_duration=8" -t 7.5 -an -c:v libx264 -crf 14 -pix_fmt yuv420p "$OUT/work/selfie.mp4"
# cut-in circle: 330 px, white 6 px ring, bottom-left above the TikTok caption area
ffmpeg -loglevel error -y -i "$OUT/work/selfie.mp4" -i "$OUT/work/game.mp4" -i "$CAP" -filter_complex "\
[0]split[s0][s1];\
[s0]split[h0][h1];[h0]trim=0:2,setpts=PTS-STARTPTS[head];[h1]trim=6:7.5,setpts=PTS-STARTPTS[tail];\
[s1]trim=2:6,setpts=PTS-STARTPTS,crop=900:900:90:300,scale=380:380,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lte(hypot(X-190,Y-190),185),255,0)'[face];\
color=white:s=392x392,format=yuva420p,geq=lum=235:cb=128:cr=128:a='if(lte(hypot(X-196,Y-196),196),255,0)'[ring];\
[1][ring]overlay=54:1144:shortest=1[g1];[g1][face]overlay=60:1150:shortest=1[game];\
[head][game][tail]concat=n=3:v=1:a=0[v];[v][2]overlay=0:0[vo]" -map "[vo]" -r 30 -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$OUT/work/video.mp4"
# nomusic master (silent stereo track so every app accepts it)
ffmpeg -loglevel error -y -i "$OUT/work/video.mp4" -f lavfi -i anullsrc=r=48000:cl=stereo -shortest -c:v copy -c:a aac -b:a 192k "$OUT/final-nomusic.mp4"
if [ -n "$MUS" ]; then
ffmpeg -loglevel error -y -i "$OUT/work/video.mp4" -ss $MST -i "$MUS" -filter_complex "[1:a]atrim=0:7.5,afade=t=in:d=0.05,afade=t=out:st=7.1:d=0.4,loudnorm=I=-14:TP=-1:LRA=9[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT/final.mp4"
fi
ffmpeg -loglevel error -y -ss 0.1 -i "$OUT/final-nomusic.mp4" -frames:v 1 "$OUT/cover.png"
echo done
