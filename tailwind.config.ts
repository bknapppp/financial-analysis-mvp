import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#eef2ff",
        brand: "#0f766e",
        sand: "#f8fafc",
        accent: "#d97706",
        "bs-page": "rgb(var(--bs-page) / <alpha-value>)",
        "bs-surface": "rgb(var(--bs-surface) / <alpha-value>)",
        "bs-elevated": "rgb(var(--bs-surface-elevated) / <alpha-value>)",
        "bs-sidebar": "rgb(var(--bs-sidebar) / <alpha-value>)",
        "bs-sidebar-active": "rgb(var(--bs-sidebar-active) / <alpha-value>)",
        "bs-text-primary": "rgb(var(--bs-text-primary) / <alpha-value>)",
        "bs-text-secondary": "rgb(var(--bs-text-secondary) / <alpha-value>)",
        "bs-text-muted": "rgb(var(--bs-text-muted) / <alpha-value>)",
        "bs-border-subtle": "rgb(var(--bs-border-subtle) / <alpha-value>)",
        "bs-border-strong": "rgb(var(--bs-border-strong) / <alpha-value>)",
        "bs-primary": "rgb(var(--bs-action-primary) / <alpha-value>)",
        "bs-primary-hover": "rgb(var(--bs-action-primary-hover) / <alpha-value>)",
        "bs-focus": "rgb(var(--bs-focus-ring) / <alpha-value>)",
        "bs-success": "rgb(var(--bs-success) / <alpha-value>)",
        "bs-warning": "rgb(var(--bs-warning) / <alpha-value>)",
        "bs-danger": "rgb(var(--bs-danger) / <alpha-value>)",
        "bs-info": "rgb(var(--bs-info) / <alpha-value>)",
        "bs-neutral": "rgb(var(--bs-neutral) / <alpha-value>)"
      },
      boxShadow: {
        panel: "0 18px 45px -24px rgba(15, 23, 42, 0.35)",
        "bs-subtle": "var(--bs-shadow-subtle)",
        "bs-overlay": "var(--bs-shadow-overlay)"
      },
      borderRadius: {
        "bs-sm": "var(--bs-radius-sm)",
        "bs-md": "var(--bs-radius-md)",
        "bs-lg": "var(--bs-radius-lg)"
      },
      spacing: {
        "bs-compact": "var(--bs-space-compact)",
        "bs-table-row": "var(--bs-table-row-height)",
        "bs-sidebar": "var(--bs-sidebar-width)",
        "bs-sidebar-collapsed": "var(--bs-sidebar-collapsed-width)",
        "bs-topbar": "var(--bs-top-header-height)"
      },
      maxWidth: {
        "bs-content": "var(--bs-content-width)"
      },
      width: {
        "bs-inspector": "var(--bs-inspector-width)"
      }
    }
  },
  plugins: []
};

export default config;
