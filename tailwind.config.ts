import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FAF8F1",
        ink: "#20211D",
        forest: {
          DEFAULT: "#1B3B2F",
          light: "#2D5C48",
          dark: "#122A22",
        },
        gold: {
          DEFAULT: "#C89B3C",
          light: "#E2C378",
          dark: "#9C7726",
        },
        rust: {
          DEFAULT: "#B23A2E",
          light: "#D9695C",
        },
        line: "#E4DECE",
      },
      fontFamily: {
        slab: ["var(--font-slab)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
