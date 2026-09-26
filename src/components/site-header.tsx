"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

export function SiteHeader() {
  const pathname = usePathname();
  const onStudio = pathname.startsWith("/create");

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-foreground">
          <MicMark />
          <span className="font-display text-xl tracking-tight">MIGO</span>
        </Link>
        <Link
          href={onStudio ? "/" : "/create"}
          className={cn(buttonVariants({ variant: onStudio ? "outline" : "default" }), "h-10 px-4")}
        >
          {onStudio ? "About the stage" : "Open the studio"}
        </Link>
      </div>
    </header>
  );
}

function MicMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
      <rect width="32" height="32" rx="9" fill="currentColor" className="text-primary" />
      <rect x="13" y="6" width="6" height="12" rx="3" fill="#1a140f" />
      <path d="M10 15a6 6 0 0 0 12 0" fill="none" stroke="#1a140f" strokeWidth="1.6" />
      <path d="M16 21v4M12 25h8" stroke="#1a140f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
