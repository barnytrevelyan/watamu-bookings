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
        ocean: {
          50: "#e6f4fa",
          100: "#c0e3f3",
          200: "#96d1eb",
          300: "#6cbfe3",
          400: "#4db1dd",
          500: "#2ea3d7",
          600: "#2493c4",
          700: "#187eab",
          800: "#0e6a93",
          900: "#004a6b",
          950: "#003350",
        },
        sand: {
          50: "#fdf8f0",
          100: "#faefd8",
          200: "#f5dfb0",
          300: "#eecb82",
          400: "#e6b44e",
          500: "#dfa02a",
          600: "#c5851f",
          700: "#a4681c",
          800: "#85531e",
          900: "#6d441c",
          950: "#3e230d",
        },
        coral: {
          50: "#fff1f0",
          100: "#ffe0dd",
          200: "#ffc6c1",
          300: "#ff9f96",
          400: "#ff6b5b",
          500: "#ff4532",
          600: "#ed2510",
          700: "#c81a09",
          800: "#a5190d",
          900: "#881c13",
          950: "#4b0903",
        },
        palm: {
          50: "#effaeb",
          100: "#dbf4d3",
          200: "#b9e9ac",
          300: "#8dd979",
          400: "#66c44e",
          500: "#47a932",
          600: "#348724",
          700: "#2b6820",
          800: "#26531f",
          900: "#22461e",
          950: "#0e260c",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
