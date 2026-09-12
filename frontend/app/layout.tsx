import type { Metadata } from "next";

import "./globals.css";
import { AppNav } from "@/components/layout/AppNav";
import { Footer } from "@/components/layout/Footer";
import { GardenStoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "GardenAI — Grow what you actually eat",
  description:
    "Turn your household's food habits, available space, and local growing conditions into a personalized garden plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <GardenStoreProvider>
          <AppNav />
          <main className="pb-10">{children}</main>
          <Footer />
        </GardenStoreProvider>
      </body>
    </html>
  );
}
