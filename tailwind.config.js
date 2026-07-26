/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // 4-tier breakpoint system: Mobile (<768, default), Tablet (md, 768-1023),
      // Laptop (lg, 1024-1439), Desktop (this custom `desktop` tier, >=1440).
      // Appended after the Tailwind defaults so it's emitted last in the
      // generated stylesheet and correctly wins over xl:/2xl: at the same width.
      screens: {
        desktop: '1440px',
      },
      colors: {
        base: {
          950: '#0a0a0d',
          900: '#111114',
          850: '#15161a',
          800: '#1b1c21',
          700: '#26272e',
          600: '#33343d',
          500: '#4a4b56',
          400: '#6b6d7a',
          300: '#9a9ca8',
          200: '#c4c6cf',
          100: '#e6e7eb',
        },
        accent: {
          400: '#7c8fff',
          500: '#5b6cf0',
          600: '#4652d6',
          glow: 'rgba(91, 108, 240, 0.35)',
        },
        success: { DEFAULT: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
        warn: { DEFAULT: '#eab308', bg: 'rgba(234,179,8,0.12)' },
        danger: { DEFAULT: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(91,108,240,0.4), 0 0 24px rgba(91,108,240,0.25)',
      },
      borderRadius: {
        xl2: '1rem',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        fadeIn: 'fadeIn 0.15s ease-out',
        slideUp: 'slideUp 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
