"use client";

import { BookOpen, ExternalLink, Server } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

const EXPLOITATION = [
  { href: "/", label: "Serveurs", icon: Server },
] as const;

const SYSTEM = [
  {
    href: "https://github.com/streamixs/factorio/blob/main/docs/runbook.md",
    label: "Documentation",
    icon: BookOpen,
  },
  {
    href: "https://github.com/streamixs/factorio/releases",
    label: "Release notes",
    icon: ExternalLink,
  },
] as const;

export function SidebarNav() {
  return (
    <nav className="flex flex-col gap-1" aria-label="Navigation principale">
      <p className="px-2.5 pb-1 pt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        Exploitation
      </p>
      {EXPLOITATION.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex h-9 items-center gap-2.5 rounded-lg bg-primary/10 px-2.5 text-sm font-medium text-primary transition-colors before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}

      <p className="px-2.5 pb-1 pt-4 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        Système
      </p>
      {SYSTEM.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
