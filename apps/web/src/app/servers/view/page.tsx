"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ServerDetailPage } from "@/app/_components/server-detail";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { serverNameFromLocation } from "@/lib/server-route";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const name = serverNameFromLocation(searchParams.toString(), pathname);

  return name === "" ? (
    <DetailSkeleton />
  ) : (
    <ServerDetailPage name={name} />
  );
}

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<DetailSkeleton />}>
        <ViewRoute />
      </Suspense>
    </AppShell>
  );
}
