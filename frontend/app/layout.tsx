import type { Metadata } from "next";

import "./globals.css";
import { AppNav } from "@/components/layout/AppNav";
import { Footer } from "@/components/layout/Footer";
import { GardenSync } from "@/components/garden/GardenSync";
import { getSessionUser, isAuth0Configured } from "@/lib/auth0";
import { GardenStoreProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GardenAI — Grow what you actually eat",
  description:
    "Turn your household's food habits, available space, and local growing conditions into a personalized garden plan.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authEnabled = isAuth0Configured();
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <GardenStoreProvider>
          {/* Keeps the signed-in account's saved garden in step. Renders
              nothing, and no-ops when signed out. */}
          <GardenSync />
          <AppNav authEnabled={authEnabled} user={user} />
          <main className="pb-10">{children}</main>
          <Footer />
        </GardenStoreProvider>
      </body>
    </html>
  );
}
