import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";

import { ARClient } from "@/components/ar/ARClient";
import { loginHref } from "@/lib/auth-user";
import { getSessionUser, isAuth0Configured } from "@/lib/auth0";

export const metadata: Metadata = {
  title: "AR garden — HomeGrown",
};

// Full-bleed camera view: let it use the whole screen on a notched phone, and
// stop pinch-zoom fighting the drag-to-look gesture.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function ARGardenPage() {
  // middleware.ts already guards /garden/*, but this route puts a camera on
  // screen, so it checks for itself rather than trusting one layer.
  if (isAuth0Configured()) {
    const user = await getSessionUser();
    if (!user) redirect(loginHref("/garden/ar"));
  }

  return <ARClient />;
}
