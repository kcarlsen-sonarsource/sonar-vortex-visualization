#!/bin/sh
# 3x3 contact sheet at 640x360 per tile. Usage: sheet9.sh out.png f1..f9
out=$1; shift
n=$#; inputs=""; for f in "$@"; do inputs="$inputs -i $f"; done
while [ $n -lt 9 ]; do inputs="$inputs -f lavfi -i color=black:s=1920x1080:d=1"; n=$((n+1)); done
ffmpeg -v error -y $inputs -filter_complex "[0]scale=640:360[a0];[1]scale=640:360[a1];[2]scale=640:360[a2];[3]scale=640:360[a3];[4]scale=640:360[a4];[5]scale=640:360[a5];[6]scale=640:360[a6];[7]scale=640:360[a7];[8]scale=640:360[a8];[a0][a1][a2][a3][a4][a5][a6][a7][a8]xstack=inputs=9:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h1|w0_h0+h1|w0+w1_h0+h1" -frames:v 1 "$out"
