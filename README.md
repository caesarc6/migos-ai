# MIGO

MIGO turns a two-artist mic performance — rap and dance, one microphone — into a video starring characters you choose. The source clip stays the shot. Upload a reference image and a short name for each performer, and MIGO replaces those two people.

No account or database is required. The default path needs no video API key.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To bind a specific host and port:

```bash
npm run dev -- --hostname 0.0.0.0 --port 47291
```

## Source video slot

The template performance is one file:

`public/templates/Migos.mp4`

When that file is present, the studio plays it. When it is absent, the studio shows a placeholder stage — two performers, one microphone, rap and dance — and an **Add source video** control. Choose an MP4 (up to 200 MB) on the Create page and MIGO saves it to that path. You can also copy the file into place yourself. No other wiring is required.

## How a cut is made

The source file never changes between runs. Only the two characters you upload are swapped in.

### Free path

The default provider (`VIDEO_PROVIDER` unset or `mock`) does not call a paid video API.

When `public/templates/Migos.mp4` is present, MIGO treats that clip as the performance template. It detects and tracks both faces, encodes each uploaded photo as an identity, and renders that identity onto the matching performer so head movement, expression, and mouth timing come from the source. The background, body, camera, and original audio stay. The render covers the first 30 seconds at 20 fps. `ffmpeg` has to be on `PATH`. The first run downloads the face models into `.cache/faces`.

An optional second face photo per performer is averaged into that identity. Person 1 is locked to the performer who starts on the left, and Person 2 to the other. That mapping does not switch mid-video.

Without the source file, [MODNet](https://huggingface.co/Xenova/modnet) (Apache-2.0) through [Transformers.js](https://github.com/huggingface/transformers.js) mattes both photos. If `ffmpeg` is on `PATH`, the result is a short stand-in MP4. If `ffmpeg` is missing, the result is a self-contained HTML preview.

### Paid path

Set `VIDEO_PROVIDER=fal` and `FAL_KEY` in `.env.local` (that file is not committed). MIGO then uses Fal’s Wan VACE 14B inpainting model at 480p, which is about **$0.04 per video second for each person**.

The first 12 seconds of `Migos.mp4` are normalized once to 16 fps and 480p. Face tracking builds a mask for each performer. The source video and both masks are uploaded once and reused on later runs. Each character is a separate model call against that same video, then both results are composited back so the unmasked frame stays the original shot. Person 1 is whoever starts on the left. A missing `FAL_KEY` returns an error and does not fall back to a fake render.

`ffmpeg` is required for this path. Restart `npm run dev` after changing `.env.local`.

`VIDEO_PROVIDER=external` is a stub. It expects `VIDEO_API_KEY` and `VIDEO_API_URL`, does not call that URL, and returns `provider not configured` instead of a fake success.

Copy `.env.example` if you want those variables set locally. They are optional for the free path.

## Deploy

The app is ready for Vercel.

1. Import the repository.
2. Leave the framework preset as Next.js. The build command is `next build`.
3. Do not set secrets for the default path. Leave `VIDEO_PROVIDER` unset. For performer replacement, set `VIDEO_PROVIDER=fal` and `FAL_KEY`.
4. Add `public/templates/Migos.mp4` and redeploy when the master performance is ready.

The server needs outbound access to Hugging Face the first time a free cut is generated so the portrait model can download. The paid path also needs outbound access to Fal. `ffmpeg` is optional for the free path when the source file is absent; it is required to recast or replace performers in `Migos.mp4`.

## Rights

Only upload characters and likenesses you have the rights to use. MIGO is a general creative tool for your own performance template.
