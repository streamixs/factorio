"use client";

import { AppShell } from "@/components/app-shell";

import { NewServerPage } from "../../_components/new-server-page";

export default function Page() {
  return (
    <AppShell>
      <NewServerPage />
    </AppShell>
  );
}
