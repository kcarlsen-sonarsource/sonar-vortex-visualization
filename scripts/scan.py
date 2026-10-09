"""Flag glitch frames in a rendered MP4: per-frame mean luma vs. its neighbours.
Usage: python3 -I scripts/scan.py out/video.mp4"""
import subprocess, sys, re
path = sys.argv[1]
out = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
ys = [float(m) for m in re.findall(r'YAVG=([\d.]+)', out)]
print(f'{len(ys)} frames, first={ys[0]:.2f} last={ys[-1]:.2f} min={min(ys):.2f} max={max(ys):.2f}')
bad = []
for i in range(2, len(ys) - 2):
    nb = (ys[i - 2] + ys[i - 1] + ys[i + 1] + ys[i + 2]) / 4
    if abs(ys[i] - nb) > max(3.0, nb * 0.25):
        bad.append((i, round(i / 60, 3), round(ys[i], 2), round(nb, 2)))
print('suspicious frames:', bad[:40] if bad else 'none')
