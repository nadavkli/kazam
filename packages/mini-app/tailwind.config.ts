import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0f0f23",
          secondary: "#1a1a3e",
          card: "rgba(30, 30, 60, 0.6)",
        },
        accent: {
          purple: "#8B5CF6",
          pink: "#EC4899",
          cyan: "#06B6D4",
          green: "#10B981",
          red: "#EF4444",
          orange: "#F59E0B",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#94A3B8",
          muted: "#64748B",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      backdropBlur: {
        glass: "12px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "coin-tick": "coinTick 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "confetti": "confetti 1s ease-out forwards",
      },
      keyframes: {
        coinTick: {
          "0%": { transform: "scale(1.2)", color: "#10B981" },
          "100%": { transform: "scale(1)", color: "#FFFFFF" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        confetti: {
          "0%": { transform: "scale(0) rotate(0deg)", opacity: "1" },
          "50%": { transform: "scale(1.2) rotate(180deg)", opacity: "0.8" },
          "100%": { transform: "scale(1) rotate(360deg)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
