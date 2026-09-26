"use client";

import { Button } from "@/components/ui/button";

export default function CreateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <p className="text-xs font-medium tracking-[0.22em] text-destructive uppercase">Studio error</p>
      <h1 className="mt-3 font-display text-4xl tracking-tight">The studio hit a snag.</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">
        This page could not be shown. Try it again. If a cut was already generating, start that step over
        once the form is back.
      </p>
      <Button type="button" className="mt-6 h-11 px-4" onClick={() => reset()}>
        Try the studio again
      </Button>
    </main>
  );
}
