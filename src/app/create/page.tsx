import { Studio } from "@/components/studio";
import { hasTemplateVideo, templateVideoVersion } from "@/lib/template";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cast the performance",
  description: "Upload two characters, cut them out, and generate a mic performance starring them.",
};

export default function CreatePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <p className="text-xs font-medium tracking-[0.22em] text-primary uppercase">Studio</p>
        <h1 className="mt-3 font-display text-4xl leading-none tracking-tight sm:text-5xl">
          Cast the performance
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Performer 1 and Performer 2 take the place of the two artists in Migos.mp4. Give each a reference
          image and a short name. A one-line style note is optional. MIGO cuts each figure out of the photo,
          follows the two performers in that footage, and builds a cut you can play and download. No video API key.
        </p>
      </div>
      <Studio hasTemplateVideo={hasTemplateVideo()} templateVersion={templateVideoVersion()} />
    </main>
  );
}
