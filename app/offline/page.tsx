"use client";

import Link from "next/link";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <AuthShell title="Offline" subtitle="GroundOps needs an internet connection." icon={WifiOff}>
      <div className="rounded-xl border border-border/80 bg-card p-6 text-center shadow-sm space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <WifiOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-foreground">You&apos;re offline</h2>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
          <Button type="button" onClick={() => window.location.reload()}>
            Retry
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
