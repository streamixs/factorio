"use client";

import { useEffect, useState } from "react";

import { ServerDetailPage } from "@/app/_components/server-detail";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

function DetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1460px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-10 w-full max-w-3xl" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}

function ViewRoute() {
  const [name, setName] = useState("");

  useEffect(() => {
    // The detail is a static page with a query parameter so the shell and the
    // client data hooks hydrate like the dashboard. Avoid useParams here.
    // The /servers/<name> URL is rewritten to this page with ?name=<name>.
    const search = new URLSearchParams(window.location.search);
    const segments = window.location.pathname.split("/").filter(Boolean);
    const fromPath =
      segments[0] === "servers" &&
      segments[1] !== undefined &&
      segments[1] !== "view" &&
      segments[1] !== "new"
        ? decodeURIComponent(segments[1])
        : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(search.get("name") ?? fromPath ?? "");
  }, []);

  return name === "" ? (
    <DetailSkeleton />
  ) : (
    <ServerDetailPage name={name} />
  );
}

export default function Page() {
  return (
    <AppShell>
      <ViewRoute />
    </AppShell>
  );
}
