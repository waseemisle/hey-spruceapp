"use client";

import Link from "next/link";
import { AuthShell } from "@/components/ui/auth-shell";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <AuthShell title="Offline" subtitle="GroundOps needs an internet connection." icon={WifiOff}>
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <WifiOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-foreground">You&apos;re offline</h2>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
