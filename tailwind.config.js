/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './app.html',
    './pricing.html',
    './accountants.html',
    './reviews.html',
    './customers.html',
    './resources.html',
    './calculator.html',
    './security.html',
    './extractor.html',
    './onboarding.html',
    './guide-e-invoicing.html',
    './404.html',
  ],
  theme: {
    extend: {
      colors: {
        // Brand Colors - Orange Corgi Palette
        primary: {
          50: '#fff8f3',
          100: '#ffe9d5',
          200: '#ffd4a8',
          300: '#ffbe99',
          400: '#ff9966',
          500: '#FF5C00',      // Primary Orange
          600: '#cc4a00',      // Dark Orange
          700: '#994600',
          800: '#663300',
          900: '#331900',
        },
        // Grayscale - Light Gray Background
        bg: {
          50: '#ffffff',
          100: '#fafafa',
          150: '#f5f5f5',
          200: '#f9f9f9',      // Light page background
          300: '#f0f0f0',
          400: '#e0e0e0',
          500: '#d9d9d9',      // Border color
          600: '#999999',      // Tertiary text
          700: '#4a4a4a',      // Secondary text
          800: '#191919',      // Primary text
          900: '#000000',
        },
        // Status Colors
        success: '#34c759',
        error: '#ff405d',
        warning: '#ff9500',
        
        // Legacy support for old variable names
        emerald: {
          50: '#f0fdf4',
          500: '#0b6e54',  // Old primary (kept for reference)
        },
        warm: {
          50: '#fbfaf7',   // Old paper (kept for reference)
        },
      },
      fontFamily: {
        sans: [
          'ui-rounded',
          'Satoshi',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Newsreader', 'Georgia', 'serif'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
        '5xl': ['48px', { lineHeight: '52px' }],
        '6xl': ['60px', { lineHeight: '64px' }],
        '7xl': ['72px', { lineHeight: '78px' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
        '4xl': '40px',
        '5xl': '48px',
        '6xl': '56px',
        '7xl': '64px',
      },
      borderRadius: {
        none: '0',
        xs: '2px',
        sm: '4px',
        base: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
        sm: '0 2px 4px rgba(0, 0, 0, 0.08)',
        base: '0 4px 8px rgba(0, 0, 0, 0.1)',
        md: '0 8px 16px rgba(0, 0, 0, 0.12)',
        lg: '0 12px 24px rgba(0, 0, 0, 0.15)',
        xl: '0 16px 32px rgba(0, 0, 0, 0.18)',
        '2xl': '0 24px 48px rgba(0, 0, 0, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-in-out',
        'slide-in-bottom': 'slideInBottom 0.5s ease-out',
        'slide-in-left': 'slideInLeft 0.5s ease-out',
        'scroll-reveal': 'scrollReveal 0.8s ease-out',
        'infinite-carousel': 'carousel 60s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInBottom: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scrollReveal: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        carousel: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      screens: {
        xs: '600px',
        sm: '760px',
        md: '820px',
        lg: '880px',
        xl: '980px',
        '2xl': '1100px',
      },
    },
  },
  plugins: [],
}
