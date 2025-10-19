import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hey Spruce App - Property Maintenance Management",
  description: "Complete property maintenance management system for clients, subcontractors, and administrators",
  icons: {
    icon: "https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/67edc7c88e3151d3b0668b6b_favicon-fresh-x-webflow-template.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors />
      </body>
    </html>
  );
}
