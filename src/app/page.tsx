import Link from "next/link";
import { RightsNote } from "@/components/rights-note";
import { StageIllustration } from "@/components/stage-illustration";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

const steps = [
  {
    number: "01",
    title: "Bring two characters",
    body: "A reference image and a short name for each performer. Add a one-line style note if you want a specific read: jacket, posture, where they look.",
  },
  {
    number: "02",
    title: "Check the template",
    body: "The piece is two artists rapping and dancing in front of one microphone. That source clip plays in the studio when public/templates/performance.mp4 is added. Until then you get a stand-in stage.",
  },
  {
    number: "03",
    title: "Generate the cut",
    body: "MIGO mattes each reference with a local portrait model and places those cutouts on the stage. Play the result here, then download the file. No video API key.",
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-primary uppercase">Mic performance</p>
          <h1 className="mt-4 max-w-xl font-display text-4xl leading-[0.95] tracking-tight text-balance sm:text-6xl">
            Your characters take the mic.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            The template is two artists rapping and dancing in front of one microphone. MIGO keeps that
            performance and swaps both performers for characters you bring. Upload a reference image and a
            name for each. A portrait model cuts them out of the photo, then the cut puts those figures on
            the stage.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/create" className={cn(buttonVariants(), "h-11 px-5")}>
              Cast two characters
            </Link>
            <a
              href="#method"
              className={cn(buttonVariants({ variant: "outline" }), "h-11 px-5")}
            >
              See the three steps
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-40px_oklch(0.82_0.15_82/0.55)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            <span>Stage monitor</span>
            <span className="text-primary">Standby</span>
          </div>
          <StageIllustration />
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            Two artists. One microphone. Rap and dance. Your characters replace them after the cutout.
          </p>
        </div>
      </section>

      <section id="method" className="border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.number} className="rounded-2xl border border-border bg-card/70 p-5">
              <p className="text-xs tracking-[0.2em] text-primary uppercase">{step.number}</p>
              <h2 className="mt-3 font-display text-2xl tracking-tight">{step.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl tracking-tight sm:text-4xl">The mic stays. The cast is yours.</h2>
            <RightsNote className="mt-4" />
          </div>
          <Link href="/create" className={cn(buttonVariants(), "h-11 px-5")}>
            Cast two characters
          </Link>
        </div>
      </section>
    </main>
  );
}
