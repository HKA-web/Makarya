const PrimeUI = require('tailwindcss-primeui')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '.dark-mode'],
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        ide: {
          darkest: '#18181b',
          dark: '#27272a',
          surface: '#3f3f46',
          border: '#52525b',
          accent: '#6366f1'
        }
      }
    }
  },
  plugins: [PrimeUI]
}
