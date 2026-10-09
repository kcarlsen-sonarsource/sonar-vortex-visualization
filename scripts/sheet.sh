#!/bin/sh
# Combine up to 4 frames into a 2x2 contact sheet (each at 960x540). Usage: sheet.sh out.png f1 f2 f3 f4
out=$1; shift
n=$#
inputs=""; for f in "$@"; do inputs="$inputs -i $f"; done
while [ $n -lt 4 ]; do inputs="$inputs -f lavfi -i color=black:s=1920x1080:d=1"; n=$((n+1)); done
ffmpeg -v error -y $inputs -filter_complex "[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" -frames:v 1 "$out"
