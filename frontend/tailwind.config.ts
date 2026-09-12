import type { Config } from "tailwindcss";

/**
 * HomeGrown design tokens — a light, warm, agricultural palette.
 * Deliberately not a dashboard theme: cream paper, deep forest ink,
 * sage surfaces and a little terracotta for warmth.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FBFAF5",
          deep: "#F4F2E9",
        },
        forest: {
          DEFAULT: "#1B3B2A",
          deep: "#122A1D",
          soft: "#2F5A42",
        },
        moss: {
          DEFAULT: "#4A8F5F",
          light: "#6FB77F",
          dark: "#357048",
        },
        sage: {
          DEFAULT: "#E9F0E6",
          deep: "#D6E4D2",
          tint: "#F2F6EE",
        },
        earth: {
          DEFAULT: "#B4703C",
          light: "#E4C9AE",
          tint: "#F6EDE3",
        },
        ink: {
          DEFAULT: "#1B3B2A",
          muted: "#5F6F64",
          faint: "#8B978F",
        },
        line: "#E3E5DA",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: {
        card: "1.25rem",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(27, 59, 42, 0.04), 0 8px 24px -12px rgba(27, 59, 42, 0.14)",
        lift: "0 2px 4px rgba(27, 59, 42, 0.05), 0 18px 40px -18px rgba(27, 59, 42, 0.28)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0)", opacity: "0" },
          "70%": { transform: "scale(1.12)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        pop: "pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
