# Sonar Vortex: a chaptered three.js explainer

A ~3-minute visual story for a live conference talk: **problem → how Vortex works → outcome**.
Headlines are kept sparse because the speaker does the narration.

**It is not a screen recording.** The story is code (three.js + HTML typography). The video is
rendered from that code one exact frame at a time, so it can be changed and re-rendered at any time.
There are two ways to tweak it:

1. **In an editor (After Effects, Premiere, Resolve, Final Cut): no code needed.** Use the layered
   exports below. The typography sits on its own alpha layer, so headlines, labels and stats can be
   re-typeset, re-coloured or swapped while the 3D motion stays intact.
2. **In code:** change colours, fonts, copy, timing, camera or animation, then re-render. See
   [Where to tweak](#where-to-tweak).

## Video files

Video files are attached to the repo's **GitHub Release**. They're too large for git.

| File | What it is | Use it for |
|------|------------|------------|
| `sonar-vortex-1080p60.mp4` | Master, 1920×1080, 60 fps, H.264 | Playback, events, the reference |
| `sonar-vortex_slides_1080p30.mp4` | Light version, 1080p, 30 fps | Google Slides / Drive embeds |
| `sonar-vortex_slides-lite_720p30.mp4` | Smallest version, 720p, 30 fps | Email, chat, slow connections |
| `sonar-vortex_plate-no-text_1080p60.mp4` | **Editable layer 1:** the 3D scene with no typography (includes the dark scrims behind headlines and the dips to black) | Bottom track in an edit |
| `sonar-vortex_text-layer-alpha_1080p60.mov` | **Editable layer 2:** all typography, labels, stats and logos on a transparent background (QuickTime Animation, RGBA) | Top track. Restyle or replace it |
| `chapters.csv` | Chapter start and end times and frame numbers | Timeline markers |

**Rebuilding the master in an editor:** put the text layer directly above the plate in a 1920×1080,
60 fps sequence with Normal blend mode. That reproduces the master exactly. During each dip to
black the text layer darkens rather than turning transparent, so the composite matches frame for frame.
If you restyle the text, fade your new layers along with the plate.

## The story (11 chapters, 3:02)

| # | Time | Chapter | On screen |
|---|------|---------|-----------|
| 1 | 0:00 | Title | Sonar Vortex · *Make your AI coding agents more efficient* |
| 2 | 0:12 | Machine speed | Agents now write code at machine speed. |
| 3 | 0:26 | Blind exploration | But they don't know your project. |
| 4 | 0:44 | Late feedback | Their mistakes surface late, at the pull request. |
| 5 | 1:02 | Meet Vortex | Sonar Vortex · *Guide and verify, inside the agent's coding loop.* |
| 6 | 1:16 | 01 · Guide | The right context, before the first line. |
| 7 | 1:38 | 02 · Verify | Every change, verified in real time. |
| 8 | 1:56 | 03 · Solve | Fixed inside the loop, before the PR. |
| 9 | 2:14 | Works with your stack | One loop, every agent. |
| 10 | 2:28 | Outcome | Better code. Fewer tokens. Less rework. (36% / 44% / 3.2%) |
| 11 | 2:50 | Outro | *Context before the agent writes. Verification as it writes.* |

All copy and stats come from the public product page (sonarsource.com/products/sonar-vortex) and
the public Vortex docs. The 3D mark is extruded from the official Sonar Vortex SVG.

## Run it

Needs Node 20+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:5199, the interactive presenter version
```

| Key | Action |
|-----|--------|
| `→` `↓` `PageDown` `Space` `Enter` / click | Next chapter (plays its exit, then the next intro) |
| `←` `↑` `PageUp` | Restart the chapter, or go to the previous one if you're near its start |
| `1`–`9`, `0` | Jump to chapter 1–10 |
| `A` | Autoplay (runs like the video and loops) |
| `F` | Fullscreen |

Each chapter plays its animation, then **holds** on its final state until you advance.
`?c=5` opens on chapter 6, `?t=100` opens at that second, and `?auto` starts in autoplay.

## Where to tweak

| What | Where |
|------|-------|
| Brand colours, 3D (agent, vortex, pass/fail) | `src/world/common.js` → `COLORS` |
| Brand colours, typography/UI | `src/style.css` → `:root` variables (`--accent`, `--ink`, `--error`, `--pass`…) |
| Fonts | `src/style.css` → `--display` / `--mono`; font imports at the top of `src/main.js` (drop licensed files such as Sentient into `public/fonts` and add an `@font-face`) |
| Headline sizes, kicker style, label chips, stats layout | `src/style.css` (`.headline`, `.kicker`, `.label`, `.stat`) |
| Copy for each chapter | `src/story.js`: each chapter's `text({ kicker, headline })`. In headlines `[[…]]` = accent colour, `{{…}}` = red, `((…))` = green, `\|` = line break |
| Chapter length / pacing | `src/story.js`: `dur:` on each chapter. Animation beats are timestamps inside each `update()` |
| Camera moves | `src/story.js`: the `setCam(lt, [{ t, pos, look }, …])` keyframes in each chapter |
| Glow / exposure | `src/main.js`: `UnrealBloomPass(…, strength, radius, threshold)` and `toneMappingExposure` |
| Logos | `public/assets/` (official Vortex mark, wordmark and lockup, plus the Sonar wordmark) |
| Particle vortex look | `src/world/vortex.js` → `VortexField` (arm count, spiral, colours) |

After a change, check it with frame stills (fast), then re-render:

```bash
node scripts/frames.mjs 12.5 47 101.25      # exact stills → frames/*.png
node scripts/frames.mjs --chapter verify --step 1
scripts/sheet9.sh sheet.png frames/*.png     # 3×3 contact sheet
pnpm render                                  # master MP4 (~15 min)
node scripts/render.mjs --layers             # master + plate + text layer (~35 min)
node scripts/render.mjs --from 98 --to 116   # just one section
```

The render scripts drive headless Chromium through Playwright. On a fresh machine, run
`pnpm exec playwright install chromium` once, or point `CHROME_PATH` at an installed Chrome or Chromium.
ffmpeg must be on your `PATH`.

## How it's built

- `src/story.js`: the 11 chapters. Each `update(lt, amb)` is a pure function of chapter time
  (choreography) and ambient time (idle motion), so every frame is deterministic.
- `src/world/*`: the agent core, the codebase city, instanced code cards, the particle vortex
  (8 spiral arms echoing the 8 blades of the mark), the extruded 3D mark, the scan ring and the quality gate.
- `src/overlay.js`: headlines and 3D-anchored HTML labels (crisp text, re-projected every frame).
- Post-processing: NaN guard → bloom → vignette and dither → ACES tone mapping.
- `scripts/render.mjs`: renders frame `i` at `t = i / 60`, captures the master, plate and text layer
  from the same GPU frame, and pipes each to ffmpeg. Workers render in parallel from a static
  production build.

Brand palette in use: accent `#126ED3`, Vortex mark `#0070D9`, ink `#E9EBF0`, error `#F2555F`.
Fonts: Inter (headlines and body) and Space Mono (labels).
