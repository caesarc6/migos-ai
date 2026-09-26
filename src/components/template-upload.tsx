"use client";

import { CircleAlert, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 200 * 1024 * 1024;

export function TemplateUpload({ hasVideo }: { hasVideo: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    const name = file.name.toLowerCase();
    const extensionOk = name.endsWith(".mp4") || name.endsWith(".m4v") || name.endsWith(".mov");
    if (!extensionOk) {
      setError("Use an MP4. A QuickTime .mov works when it is H.264.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That clip is over 200 MB. Export a smaller MP4.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("video", file);
      const response = await fetch("/api/template", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "The source clip could not be saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("The source clip could not be saved. Check the connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-4">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.m4v,.mov"
        className="sr-only"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        className="h-10 px-3"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
        {busy ? "Saving the source clip…" : hasVideo ? "Replace source video" : "Add source video"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
