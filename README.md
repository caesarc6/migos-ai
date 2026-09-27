# MIGO

MIGO turns a two-artist mic performance — rap and dance, one microphone — into a video starring characters you choose. The source clip stays the shot. Upload a reference image and a short name for each performer, and MIGO replaces those two people.

No account or database is required. Replacing the performers needs `VIDEO_PROVIDER=fal` and `FAL_KEY`. Without both, Generate returns an error.

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

The source file never changes between runs. Only the two characters you upload are replaced. The first 12 seconds are the part that is rendered. Timing and audio stay with that clip.

Set `VIDEO_PROVIDER=fal` and `FAL_KEY` in `.env.local` (that file is not committed). MIGO uses Fal’s Wan VACE 14B inpainting model at 480p, which is about **$0.04 per video second for each person**.

The first 12 seconds of `Migos.mp4` are normalized once to 16 fps and 480p. Face tracking builds a mask for each performer. The source video and both masks are uploaded once and reused on later runs. Each character is a separate model call against that same video, then both results are composited back so the unmasked frame stays the original shot. Person 1 is whoever starts on the left.

If `VIDEO_PROVIDER` is not `fal`, or `FAL_KEY` is missing, Generate returns an error. It does not fall back to a face swap.

`ffmpeg` is required. Restart `npm run dev` after changing `.env.local`.

## Deploy

The app is ready for Vercel.

1. Import the repository.
2. Leave the framework preset as Next.js. The build command is `next build`.
3. Set `VIDEO_PROVIDER=fal` and `FAL_KEY`.
4. Add `public/templates/Migos.mp4` and redeploy when the master performance is ready.

The server needs outbound access to Fal when a cut is generated, and to download the face detector used for the performer masks. `ffmpeg` is required.

## Rights

Only upload characters and likenesses you have the rights to use. MIGO is a general creative tool for your own performance template.
