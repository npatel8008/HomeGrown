import Link from "next/link";

import { ArrowRightIcon, BasketIcon, CubeIcon, LeafIcon, SparkIcon, SunIcon } from "@/components/ui/Icons";
import { DemoSeedButton } from "@/components/layout/DemoSeedButton";

const FLOW = [
  {
    step: "What you eat",
    body: "Tacos on Tuesday, pasta midweek, salads for lunch. We turn that into a ranked list of the ingredients your household actually goes through.",
    icon: <BasketIcon className="h-5 w-5" />,
  },
  {
    step: "What you can grow",
    body: "Your plot size, sunlight, budget and experience decide which of those ingredients are realistic to grow — and how many plants of each.",
    icon: <SunIcon className="h-5 w-5" />,
  },
  {
    step: "Your personalized garden",
    body: "A planted layout you can walk through in 3D, with expected yield, grocery savings, and a short list of what to do today.",
    icon: <CubeIcon className="h-5 w-5" />,
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="section pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up">
            <span className="chip mb-6 !border-sage-deep !bg-sage !text-forest">
              <LeafIcon className="h-3.5 w-3.5" />
              Personalized micro-agriculture
            </span>
            <h1 className="font-display text-[44px] leading-[1.05] tracking-tight text-forest sm:text-6xl">
              Grow what you
              <br />
              actually eat.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              Turn your household&apos;s food habits, available space, and local growing conditions
              into a personalized garden plan.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/onboarding/food" className="btn-primary !px-7 !py-3.5 text-base">
                Build My Garden
                <ArrowRightIcon />
              </Link>
              <DemoSeedButton />
            </div>
            <p className="mt-5 text-xs text-ink-faint">
              No account needed. Demo data is bundled — nothing leaves your machine.
            </p>
          </div>

          <HeroArt />
        </div>
      </section>

      {/* Flow */}
      <section className="section mt-24 sm:mt-32">
        <div className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-forest sm:text-4xl">
            Three inputs. One garden that pays for itself.
          </h2>
        </div>

        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {FLOW.map((item, index) => (
            <li key={item.step} className="card relative flex flex-col gap-4 p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sage text-forest">
                {item.icon}
              </span>
              <div>
                <span className="font-display text-sm text-ink-faint">0{index + 1}</span>
                <h3 className="mt-1 font-display text-xl text-forest">{item.step}</h3>
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">{item.body}</p>
              {index < FLOW.length - 1 ? (
                <span className="absolute -right-3.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-cream text-forest md:flex">
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Outcome strip */}
      <section className="section mt-24">
        <div className="card grid gap-6 bg-forest p-8 text-cream sm:grid-cols-3 sm:p-10">
          <Outcome value="Ranked crops" label="Chosen from what your household eats most" />
          <Outcome value="Plant counts" label="Sized to your plot, budget and experience" />
          <Outcome value="Season savings" label="Estimated grocery value of everything you grow" />
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
          <SparkIcon className="h-3.5 w-3.5" />
          Scaffold build — crop data, yields and prices are demo placeholders.
        </p>
      </section>
    </>
  );
}

function Outcome({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl text-[#8FD69C]">{value}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-cream/70">{label}</p>
    </div>
  );
}

/** Decorative isometric-ish garden bed, drawn in plain SVG. */
function HeroArt() {
  const rows = [
    { z: 0, color: "#E2543F", count: 5, r: 9 },
    { z: 1, color: "#4F9D5B", count: 7, r: 7 },
    { z: 2, color: "#3F7D45", count: 6, r: 8 },
    { z: 3, color: "#2F6B3A", count: 9, r: 6 },
  ];

  return (
    <div className="card relative overflow-hidden bg-gradient-to-br from-[#F6F8F1] to-[#EAF0E4] p-8">
      <div className="absolute right-6 top-6 h-20 w-20 rounded-full bg-[#F7E4B8] blur-xl" />
      <svg viewBox="0 0 360 280" className="relative w-full" role="img" aria-label="Illustration of a planted garden bed">
        <defs>
          <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7A5C3E" />
            <stop offset="100%" stopColor="#5A4632" />
          </linearGradient>
        </defs>

        {/* bed frame */}
        <polygon points="30,150 180,80 330,150 180,220" fill="url(#soil)" />
        <polygon points="30,150 180,220 180,240 30,170" fill="#8A6A45" />
        <polygon points="330,150 180,220 180,240 330,170" fill="#6F5236" />

        {/* plant rows in perspective */}
        {rows.map((row, rowIndex) =>
          Array.from({ length: row.count }).map((_, index) => {
            const t = (index + 0.5) / row.count;
            const depth = (rowIndex + 0.6) / (rows.length + 0.4);
            const left = 30 + depth * 150;
            const right = 330 - depth * 150;
            const x = left + (right - left) * t;
            const y = 150 + depth * 70 - (1 - depth) * 0;
            return (
              <g key={`${rowIndex}-${index}`}>
                <line x1={x} y1={y} x2={x} y2={y - row.r * 2.2} stroke="#3F6B45" strokeWidth="2" strokeLinecap="round" />
                <circle cx={x} cy={y - row.r * 2.4} r={row.r} fill={row.color} opacity={0.92} />
              </g>
            );
          }),
        )}

        {/* sun */}
        <circle cx="300" cy="46" r="20" fill="#F2C75C" opacity="0.85" />
      </svg>

      <div className="relative mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ["12 × 8 ft", "plot"],
          ["6 crops", "recommended"],
          ["$592", "est. savings"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl bg-white/70 px-2 py-3">
            <p className="font-display text-base text-forest">{value}</p>
            <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
