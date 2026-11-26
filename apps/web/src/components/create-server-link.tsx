"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";

export function CreateServerLink() {
  return (
    <Link
      href="/servers/new"
      className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
    >
      <Plus className="size-4" aria-hidden />
      <span className="hidden sm:inline">Nouveau serveur</span>
      <span className="sm:hidden">Nouveau</span>
    </Link>
  );
}
