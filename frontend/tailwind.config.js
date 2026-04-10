/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('./src/brand/tailwind.preset.js')],
  theme: {
    extend: {},
  },
  plugins: [],
}
