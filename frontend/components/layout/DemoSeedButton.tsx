"use client";

import { useRouter } from "next/navigation";

import { useGardenStore } from "@/lib/store";
import { SparkIcon } from "@/components/ui/Icons";

/** Fills the flow with the seeded demo household and jumps to step one. */
export function DemoSeedButton({ label = "Use the demo household" }: { label?: string }) {
  const router = useRouter();
  const { loadDemo } = useGardenStore();

  return (
    <button
      type="button"
      className="btn-secondary !px-6 !py-3.5 text-base"
      onClick={() => {
        loadDemo();
        router.push("/onboarding/food");
      }}
    >
      <SparkIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
