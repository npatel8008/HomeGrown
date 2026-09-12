import { lbs, sqft, usd } from "@/lib/format";
import type { GardenSummary } from "@/lib/types";
import { Stat } from "@/components/ui/Stat";
import { BasketIcon, CoinIcon, LeafIcon, RulerIcon, SparkIcon } from "@/components/ui/Icons";

/** The row of headline metrics above the recommendation list. */
export function SavingsSummary({ summary }: { summary: GardenSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Stat
        label="Growing area"
        value={sqft(summary.total_area_sqft)}
        sub={`${sqft(summary.used_area_sqft)} planted, rest is paths and margins`}
        icon={<RulerIcon className="h-4 w-4" />}
      />
      <Stat
        label="Estimated produce"
        value={lbs(summary.estimated_yield_lbs)}
        sub={`${summary.total_plants} plants across the season`}
        icon={<BasketIcon className="h-4 w-4" />}
      />
      <Stat
        label="Grocery value"
        value={usd(summary.estimated_grocery_value_usd)}
        sub="What this produce would cost at the store"
        icon={<CoinIcon className="h-4 w-4" />}
      />
      <Stat
        label="Seasonal savings"
        value={usd(summary.estimated_savings_usd)}
        sub={`After ${usd(summary.estimated_cost_usd)} of seeds, starts and soil`}
        icon={<SparkIcon className="h-4 w-4" />}
        accent="earth"
      />
      <Stat
        label="Recommended crops"
        value={summary.crop_count}
        sub={summary.within_budget ? "Fits inside your budget" : "Slightly over your budget"}
        icon={<LeafIcon className="h-4 w-4" />}
      />
    </div>
  );
}
