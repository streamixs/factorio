"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function Breadcrumbs() {
  return (
    <nav
      aria-label="Fil d'Ariane"
      className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex"
    >
      <Link
        href="/"
        className="shrink-0 transition-colors hover:text-foreground"
      >
        Exploitation
      </Link>
      <ChevronRight
        className="size-3 shrink-0 text-muted-foreground/50"
        aria-hidden
      />
      <span className="truncate font-medium text-foreground">Serveurs</span>
    </nav>
  );
}
