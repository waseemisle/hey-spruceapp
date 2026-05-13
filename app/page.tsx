'use client';

import Link from 'next/link';
import Logo from '@/components/ui/logo';
import { AuthShell } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, HardHat, LayoutDashboard, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <AuthShell
      title="GroundOps"
      subtitle="Facility maintenance built for scale. Sign in, register, or open the portal that matches your role."
      icon={Sparkles}
      contentClassName="max-w-5xl"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo href="/" size="xl" showWordmark />
        <p className="text-sm text-muted-foreground max-w-md">
          Work orders, quotes, and billing for clients, subcontractors, and administrators.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin-portal" className="group block min-h-[44px]">
          <Card className="h-full rounded-xl border-border/80 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <LayoutDashboard className="h-6 w-6" aria-hidden />
              </div>
              <CardTitle className="text-lg">Admin Portal</CardTitle>
              <CardDescription>
                Users, approvals, work orders, invoices, and reporting.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground group-hover:text-foreground">
              Opens the admin app — you may be asked to sign in.
            </CardContent>
          </Card>
        </Link>

        <Link href="/client-portal" className="group block min-h-[44px]">
          <Card className="h-full rounded-xl border-border/80 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Building2 className="h-6 w-6" aria-hidden />
              </div>
              <CardTitle className="text-lg">Client Portal</CardTitle>
              <CardDescription>
                Locations, work orders, quotes, invoices, and messages.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground group-hover:text-foreground">
              Opens the client app — you may be asked to sign in.
            </CardContent>
          </Card>
        </Link>

        <Link href="/subcontractor-portal" className="group block min-h-[44px]">
          <Card className="h-full rounded-xl border-border/80 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <HardHat className="h-6 w-6" aria-hidden />
              </div>
              <CardTitle className="text-lg">Subcontractor Portal</CardTitle>
              <CardDescription>
                Bidding, assigned work, quotes, and completed jobs.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground group-hover:text-foreground">
              Opens the subcontractor app — you may be asked to sign in.
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-[200px]">
          <Link href="/portal-login">Sign in</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link href="/forgot-password">Forgot password</Link>
        </Button>
      </div>

      <div className="rounded-xl border border-border/80 bg-muted/30 p-6 text-center">
        <p className="text-sm font-medium text-foreground">New here?</p>
        <p className="mt-1 text-xs text-muted-foreground">Create an account for approval by your administrator.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/register-client">Register as client</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/register-subcontractor">Register as subcontractor</Link>
          </Button>
        </div>
      </div>

      <footer className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} GroundOps LLC. All rights reserved.</p>
        <p className="mt-2">
          <a
            href="mailto:info@groundops.com"
            className="text-primary underline-offset-4 hover:underline"
          >
            info@groundops.com
          </a>
          {' · '}
          <a
            href="https://www.groundops.co"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            groundops.co
          </a>
        </p>
      </footer>
    </AuthShell>
  );
}
