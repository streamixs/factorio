"use client";

import { AppShell } from "@/components/app-shell";

import { HomeDashboard } from "./_components/home-dashboard";

export default function Page() {
  return (
    <AppShell>
      <HomeDashboard />
    </AppShell>
  );
}
