import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ViewControlsProvider } from "@/contexts/view-controls-context";

export const metadata: Metadata = {
  title: "GroundOps — Facility Maintenance Infrastructure",
  description: "Facility maintenance and work order management for clients, subcontractors, and administrators",
  icons: {
    icon: "https://www.groundops.co/deck/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ViewControlsProvider>
            {children}
            <Toaster />
            <SonnerToaster position="top-right" richColors />
          </ViewControlsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
