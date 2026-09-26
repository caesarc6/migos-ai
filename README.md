# MIGO

MIGO turns a two-artist mic performance — rap and dance, one microphone — into a video starring characters you choose. Upload a reference image and a short name for each performer. A local portrait model cuts the figure out of the photo, then the app places those cutouts on the stage so you can play and download the result.

No account, database, or video API key is required.

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

The default provider (`VIDEO_PROVIDER` unset or `mock`) does not call a paid video API. It runs [MODNet](https://huggingface.co/Xenova/modnet) (Apache-2.0) through [Transformers.js](https://github.com/huggingface/transformers.js) and composites the transparent cutouts.

When `public/templates/Migos.mp4` is present, MIGO treats that clip as the performance template. It detects and tracks both faces for the whole shot, encodes each uploaded photo as an identity, and renders that identity onto the matching performer so head movement, expression, and mouth timing come from the source. The background, body, camera, and original audio stay. The render covers the first 30 seconds at 20 fps. `ffmpeg` has to be on `PATH`. The first run downloads the face models into `.cache/faces`.

An optional second face photo per performer is averaged into that identity. Person 1 is locked to the performer who starts on the left, and Person 2 to the other. That mapping does not switch mid-video.

Without the source file:

- If `ffmpeg` is on `PATH`, the result is a short stand-in MP4.
- If `ffmpeg` is missing, the result is a self-contained HTML preview the page can play and download.

The first generation downloads the model weights from Hugging Face into the temp directory. Later generations reuse that cache. No `VIDEO_API_KEY` is required.

`VIDEO_PROVIDER=external` is a stub. It expects `VIDEO_API_KEY` and `VIDEO_API_URL`, does not call that URL, and returns `provider not configured` instead of a fake success.

Copy `.env.example` if you want those variables set locally. They are optional.

## Deploy

The app is ready for Vercel.

1. Import the repository.
2. Leave the framework preset as Next.js. The build command is `next build`.
3. Do not set secrets for the default path. Leave `VIDEO_PROVIDER` unset.
4. Add `public/templates/Migos.mp4` and redeploy when the master performance is ready.

The server needs outbound access to Hugging Face the first time a cut is generated so the portrait model can download. `ffmpeg` is optional on the host; without it, MIGO returns the HTML preview of the same cutouts.

## Rights

Only upload characters and likenesses you have the rights to use. MIGO is a general creative tool for your own performance template.
