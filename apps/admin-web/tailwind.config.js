/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e9f7ef",
          100: "#cdeedd",
          500: "#1a9e54",
          600: "#138043",
          700: "#0f6936",
          900: "#0b3d22",
        },
      },
    },
  },
  plugins: [],
};
