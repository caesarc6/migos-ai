"use client";

import { CircleAlert, Download, ImagePlus, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { RightsNote } from "@/components/rights-note";
import { TemplateStage } from "@/components/template-stage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type SlotState = {
  name: string;
  styleNote: string;
  file: File | null;
  previewUrl: string | null;
  error: string | null;
};

type Cut = {
  url: string;
  filename: string;
  mimeType: string;
  performers: [string, string];
};

type Status = "idle" | "loading" | "ready" | "error";

const emptySlot = (): SlotState => ({
  name: "",
  styleNote: "",
  file: null,
  previewUrl: null,
  error: null,
});

export function Studio({ hasTemplateVideo }: { hasTemplateVideo: boolean }) {
  const [first, setFirst] = useState<SlotState>(emptySlot);
  const [second, setSecond] = useState<SlotState>(emptySlot);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cut, setCut] = useState<Cut | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const cutUrl = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    return () => {
      if (cutUrl.current) URL.revokeObjectURL(cutUrl.current);
    };
  }, []);

  useEffect(() => {
    if (status === "idle") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [status]);

  const ready = Boolean(first.file && first.name.trim() && second.file && second.name.trim());

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !first.file || !second.file) return;
    submitting.current = true;
    setStatus("loading");
    setError(null);
    if (cutUrl.current) {
      URL.revokeObjectURL(cutUrl.current);
      cutUrl.current = null;
    }
    setCut(null);

    try {
      const body = new FormData();
      body.set("performer1Name", first.name.trim());
      body.set("performer1Style", first.styleNote.replace(/\s+/g, " ").trim());
      body.set("performer1Image", first.file);
      body.set("performer2Name", second.name.trim());
      body.set("performer2Style", second.styleNote.replace(/\s+/g, " ").trim());
      body.set("performer2Image", second.file);

      const response = await fetch("/api/generate", { method: "POST", body });
      if (!response.ok) {
        let message = "The cut could not be rendered.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep the fallback message when the body is not JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      cutUrl.current = url;
      const headerName = response.headers.get("X-Migo-Filename") ?? "";
      const filename = /^[\w.-]+$/.test(headerName)
        ? headerName
        : blob.type.includes("html")
          ? "migo-cut.html"
          : "migo-cut.mp4";
      setCut({
        url,
        filename,
        mimeType: blob.type || response.headers.get("Content-Type") || "",
        performers: [first.name.trim(), second.name.trim()],
      });
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "The cut could not be rendered.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-8">
      <div className="grid gap-4 md:grid-cols-2">
        <PerformerSlot
          index={1}
          slot={first}
          placeholderName="Nova Vex"
          placeholderStyle="Loose shoulders, gold jacket, leans into the mic"
          description="The artist on the left of the mic."
          onChange={setFirst}
        />
        <PerformerSlot
          index={2}
          slot={second}
          placeholderName="Kite Morrow"
          placeholderStyle="Quick feet, looks camera-right on the hook"
          description="The artist on the right of the mic."
          onChange={setSecond}
        />
      </div>

      <TemplateStage hasTemplateVideo={hasTemplateVideo} />

      <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <RightsNote className="max-w-xl" />
          <Button type="submit" className="h-11 px-5 sm:min-w-44" disabled={!ready || status === "loading"}>
            {status === "loading" ? (
              <>
                <LoaderCircle className="animate-spin" />
                Generating…
              </>
            ) : (
              "Generate cut"
            )}
          </Button>
        </div>
        {!ready && status !== "loading" ? (
          <p className="text-sm text-muted-foreground">Add a reference image and a name for both performers.</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Each photo is matted here with a portrait model. The first cut on this machine downloads that model.
          Nothing is sent to a paid video API.
        </p>
      </div>

      <section ref={panelRef} aria-live="polite" className="mt-8">
        <h2 className="font-display text-2xl tracking-tight">Cut</h2>
        {status === "idle" ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="font-display text-2xl tracking-tight">Nothing on the monitors yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Add both performers, then generate. The cut plays here and downloads as a file, with your
              characters cut out of the photos.
            </p>
          </div>
        ) : null}
        {status === "loading" ? (
          <div role="status" className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 px-6 py-12 text-center">
            <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
            <p className="mt-4 font-display text-2xl tracking-tight">
              Cutting {first.name.trim() || "Performer 1"} and {second.name.trim() || "Performer 2"} out of
              their photos…
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              The portrait model is separating each figure from the background, then placing those cutouts
              on the mic.
            </p>
          </div>
        ) : null}
        {status === "error" && error ? (
          <div role="alert" className="mt-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-6 py-8">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div>
                <p className="font-display text-2xl tracking-tight text-destructive">The cut did not render.</p>
                <p className="mt-2 text-sm leading-relaxed">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 h-10 px-4"
                  onClick={() => formRef.current?.requestSubmit()}
                >
                  Try again
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {status === "ready" && cut ? <CutPlayer cut={cut} /> : null}
      </section>
    </form>
  );
}

function CutPlayer({ cut }: { cut: Cut }) {
  const isVideo = cut.mimeType.startsWith("video/");
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
      {isVideo ? (
        <video
          key={cut.url}
          src={cut.url}
          controls
          autoPlay
          muted
          loop
          playsInline
          className="aspect-video w-full bg-black"
          aria-label={`Generated cut starring ${cut.performers[0]} and ${cut.performers[1]}`}
        />
      ) : (
        <iframe
          title={`Animated preview starring ${cut.performers[0]} and ${cut.performers[1]}`}
          src={cut.url}
          className="aspect-video w-full bg-black"
          sandbox="allow-same-origin"
        />
      )}
      <div className="flex flex-col gap-4 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-xl tracking-tight">
            Starring {cut.performers[0]} and {cut.performers[1]}
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {isVideo
              ? "Short MP4. The figures are the matted cutouts from your uploads, standing on the stage around the mic."
              : "Animated preview of the same cutouts. Download the file to keep it."}
          </p>
        </div>
        <a href={cut.url} download={cut.filename} className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
          <Download />
          Download
        </a>
      </div>
    </div>
  );
}

function PerformerSlot({
  index,
  slot,
  placeholderName,
  placeholderStyle,
  description,
  onChange,
}: {
  index: 1 | 2;
  slot: SlotState;
  placeholderName: string;
  placeholderStyle: string;
  description: string;
  onChange: (next: SlotState) => void;
}) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const styleId = `${uid}-style`;
  const fileId = `${uid}-file`;

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED.has(file.type)) {
      onChange({ ...slot, error: "Use a PNG, JPG, WEBP, or GIF." });
      return;
    }
    if (file.size > MAX_BYTES) {
      onChange({ ...slot, error: "That image is larger than 8 MB." });
      return;
    }
    if (slot.previewUrl) URL.revokeObjectURL(slot.previewUrl);
    onChange({
      ...slot,
      file,
      previewUrl: URL.createObjectURL(file),
      error: null,
    });
  }

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <p className="text-[11px] tracking-[0.2em] text-primary uppercase">Slot 0{index}</p>
        <CardTitle className="font-display text-2xl">Performer {index}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label
          htmlFor={fileId}
          className="relative block cursor-pointer overflow-hidden rounded-xl border border-dashed border-border bg-background/40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring"
        >
          <input
            id={fileId}
            name={`performer${index}Image`}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          {slot.previewUrl ? (
            <span className="relative block">
              {/* Local object URLs are not supported by next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slot.previewUrl}
                alt={`Reference for Performer ${index}`}
                className="h-56 w-full object-cover sm:h-64"
              />
              <span className="absolute inset-x-0 bottom-0 bg-black/65 px-3 py-2 text-xs text-white">
                Replace image
              </span>
            </span>
          ) : (
            <span className="flex h-56 flex-col items-center justify-center gap-2 px-4 text-center sm:h-64">
              <ImagePlus className="size-5 text-primary" />
              <span className="font-medium">No reference yet</span>
              <span className="text-xs text-muted-foreground">PNG, JPG, WEBP, or GIF. Up to 8 MB.</span>
            </span>
          )}
        </label>
        {slot.error ? (
          <p role="alert" className="text-sm text-destructive">
            {slot.error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            name={`performer${index}Name`}
            value={slot.name}
            maxLength={40}
            autoComplete="off"
            placeholder={placeholderName}
            className="h-10"
            onChange={(event) => onChange({ ...slot, name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={styleId}>
            Style note <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Textarea
            id={styleId}
            name={`performer${index}Style`}
            value={slot.styleNote}
            maxLength={140}
            rows={2}
            placeholder={placeholderStyle}
            onChange={(event) => onChange({ ...slot, styleNote: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">One line of direction.</p>
        </div>
      </CardContent>
    </Card>
  );
}
