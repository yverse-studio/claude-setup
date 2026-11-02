#!/usr/bin/env bash
# Schreibt game/art/loops/lengths.json: Länge (Sekunden) von <slot>_intro und <slot>_finish aus den echten WebM-Dateien.
# slots.rpy liest die Datei und überschreibt damit ANIM_LEN; ohne Datei oder Eintrag gilt ANIM_LEN. Aufruf nach jedem neuen Clip.
set -e
cd "$(dirname "$0")/../game/art/loops"
export PATH="$PATH:$(ls -d /c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin 2>/dev/null | head -1)"
out="{"; first=1
for f in *_intro.webm *_finish.webm; do
  [ -e "$f" ] || continue
  case "$f" in *" - Copy"*|*_xray_*|*_nur_*) continue;; esac
  slot="${f%_*}"; teil="${f##*_}"; teil="${teil%.webm}"
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  d=$(awk -v d="$d" 'BEGIN{printf "%.2f", d}')
  [ $first -eq 0 ] && out="$out,"; first=0
  out="$out\"$slot|$teil\":$d"
done
echo "$out}" > lengths.json
cat lengths.json
