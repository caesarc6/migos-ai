import { Studio } from "@/components/studio";
import { hasTemplateVideo, templateVideoVersion } from "@/lib/template";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cast the performance",
  description: "Upload two characters and replace the performers in Migos.mp4. The source clip stays the same.",
};

export default function CreatePage() {
  const configured =
    (process.env.VIDEO_PROVIDER ?? "").trim().toLowerCase() === "fal" && Boolean(process.env.FAL_KEY?.trim());
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <p className="text-xs font-medium tracking-[0.22em] text-primary uppercase">Studio</p>
        <h1 className="mt-3 font-display text-4xl leading-none tracking-tight sm:text-5xl">
          Cast the performance
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Migos.mp4 stays the shot. Person 1 and Person 2 each replace one performer, one pass at a time, and both
          are placed back on the original frame. 480p is about $0.04 per second per person for the first 12 seconds.
        </p>
      </div>
      <Studio
        hasTemplateVideo={hasTemplateVideo()}
        templateVersion={templateVideoVersion()}
        configured={configured}
      />
    </main>
  );
}
