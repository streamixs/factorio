"use client";

import { Boxes, Cpu } from "lucide-react";
import Link from "next/link";

import { SidebarNav } from "./sidebar-nav";

export function Sidebar() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-xl px-2 pb-5"
        aria-label="Factorio Platform, accueil"
      >
        <span className="grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <Cpu className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-[9px] tracking-[0.22em] text-muted-foreground">
            FACTORIO
          </span>
          <span className="block text-sm font-bold tracking-wide">
            PLATFORM
          </span>
        </span>
      </Link>

      <SidebarNav />

      <div className="mt-auto border-t border-sidebar-border px-2 pt-4">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Boxes className="size-3.5" aria-hidden />
          <span>Kubernetes</span>
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground/70">
          <span>v{version}</span>
          <a
            href="https://github.com/streamixs/factorio/releases"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            release
          </a>
        </div>
      </div>
    </aside>
  );
}
