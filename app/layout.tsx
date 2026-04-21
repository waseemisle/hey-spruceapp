import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ViewControlsProvider } from "@/contexts/view-controls-context";

export const metadata: Metadata = {
  title: "GroundOps — Facility Maintenance Infrastructure",
  description: "Facility maintenance and work order management for clients, subcontractors, and administrators",
  applicationName: "GroundOps",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "GroundOps",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
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
