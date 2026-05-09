import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--bg)",
        "surface-card": "var(--bg-card)",
        "surface-elevated": "var(--bg-elevated)",
        "border-default": "var(--border)",
        "text-primary": "var(--text)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent)",
        "accent-deep": "var(--accent-deep)",
        "state-success": "var(--state-success)",
        "state-danger": "var(--state-danger)",
        "state-warning": "var(--state-warning)",
        "state-info": "var(--state-info)",
      },
      fontSize: {
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.05em", fontWeight: "500" }],
        body: ["0.8125rem", { lineHeight: "1.15rem", fontWeight: "400" }],
        heading: ["0.9375rem", { lineHeight: "1.25rem", fontWeight: "600" }],
        stat: ["1.125rem", { lineHeight: "1.5rem", fontWeight: "700" }],
        "stat-lg": ["1.5rem", { lineHeight: "1.75rem", fontWeight: "700" }],
      },
      width: {
        "modal-sm": "28rem",
        "modal-md": "32rem",
        "modal-lg": "36rem",
      },
      maxWidth: {
        dashboard: "1480px",
      },
      keyframes: {
        "slide-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
