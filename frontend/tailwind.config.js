/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colours matching the visual design spec
        "lila-red":    "#FF6B6B",
        "lila-teal":   "#4ECDC4",
        "lila-blue":   "#45B7D1",
        "lila-gold":   "#F7DC6F",
        "lila-purple": "#BB8FCE",
      },
    },
  },
  plugins: [],
};
