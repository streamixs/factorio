"use client";

import Link from "next/link";

import { Breadcrumbs } from "./breadcrumbs";
import { CreateServerLink } from "./create-server-link";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border/80 bg-background/80 px-4 backdrop-blur-xl sm:px-6">
      <Link
        href="/"
        className="flex items-center gap-2 lg:hidden"
        aria-label="Factorio Platform, accueil"
      >
        <span className="grid size-8 place-items-center rounded-lg border border-primary/30 bg-primary/10 font-mono text-[10px] font-bold text-primary">
          FP
        </span>
        <span className="hidden text-xs font-bold tracking-wide sm:inline">
          PLATFORM
        </span>
      </Link>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1.5">
        <CreateServerLink />
        <ThemeToggle />
        <div
          className="grid size-8 place-items-center rounded-full border border-primary/25 bg-primary/10 font-mono text-[10px] font-bold text-primary"
          title="admin"
        >
          AD
        </div>
      </div>
    </header>
  );
}
