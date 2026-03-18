import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#eef2ff",
        brand: "#0f766e",
        sand: "#f8fafc",
        accent: "#d97706"
      },
      boxShadow: {
        panel: "0 18px 45px -24px rgba(15, 23, 42, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
