#!/bin/sh
# Light-weight versions of the master for Google Slides / Drive, email and chat.
# Usage: scripts/light.sh [master.mp4] [outdir]
set -e
IN=${1:-out/sonar-vortex-1080p60.mp4}
OUT=${2:-out}
COMMON="-an -pix_fmt yuv420p -profile:v high -movflags +faststart -color_primaries bt709 -color_trc bt709 -colorspace bt709"
# 1080p30: visually matches the master at full screen; what Google Slides streams best.
ffmpeg -v error -y -i "$IN" -vf fps=30 -c:v libx264 -preset slower -crf ${CRF_1080:-25} -tune film \
  -x264-params keyint=60:aq-mode=3 $COMMON "$OUT/sonar-vortex_slides_1080p30.mp4"
# 720p30: smallest, for email and chat.
ffmpeg -v error -y -i "$IN" -vf "fps=30,scale=1280:720:flags=lanczos" -c:v libx264 -preset slower -crf ${CRF_720:-24} -tune film \
  -x264-params keyint=60:aq-mode=3 $COMMON "$OUT/sonar-vortex_slides-lite_720p30.mp4"
ls -lh "$OUT"/sonar-vortex_slides*.mp4
