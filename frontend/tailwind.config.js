/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        quant: {
          bg: "#070B19",
          card: "#0E162E",
          border: "#1E2B4D",
          cyan: "#00E5FF",
          purple: "#8B5CF6",
        },
      },
    },
  },
  plugins: [],
};
