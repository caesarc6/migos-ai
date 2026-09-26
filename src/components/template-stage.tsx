import { StageIllustration } from "@/components/stage-illustration";
import { TemplateUpload } from "@/components/template-upload";
import { TEMPLATE_ASSET_PATH, TEMPLATE_PUBLIC_URL } from "@/lib/template-path";

export function TemplateStage({
  hasTemplateVideo,
  templateVersion,
}: {
  hasTemplateVideo: boolean;
  templateVersion: string | null;
}) {
  const src = templateVersion ? `${TEMPLATE_PUBLIC_URL}?v=${templateVersion}` : TEMPLATE_PUBLIC_URL;

  return (
    <section aria-label="Template performance" className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-2xl tracking-tight">Template</h2>
        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">Rap and dance · one mic</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {hasTemplateVideo ? (
          <video
            key={src}
            src={src}
            controls
            playsInline
            className="aspect-video w-full bg-black"
            aria-label="Source performance"
          />
        ) : (
          <StageIllustration />
        )}
        <div className="border-t border-border px-4 py-4 sm:px-5">
          {hasTemplateVideo ? (
            <>
              <p className="font-display text-xl tracking-tight">Source performance</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Playing <code className="text-foreground">{TEMPLATE_ASSET_PATH}</code>. This is the
                two-artist mic performance your characters step into.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-xl tracking-tight">The source clip will appear here.</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Add an MP4 on this page. MIGO saves it as{" "}
                <code className="text-foreground">{TEMPLATE_ASSET_PATH}</code> and plays the two artists
                rapping and dancing. Until that file is in the project, the stage above stands in for them.
              </p>
            </>
          )}
          <TemplateUpload hasVideo={hasTemplateVideo} />
        </div>
      </div>
    </section>
  );
}
