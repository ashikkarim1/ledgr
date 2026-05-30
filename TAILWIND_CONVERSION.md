# Ledgr Tailwind CSS Conversion Guide

## Custom CSS → Tailwind Class Mappings

### Button Components
```
.btn = inline-flex items-center justify-center px-6 py-3 font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
.btn--primary = bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700
.btn--ghost = text-bg-800 hover:bg-bg-100 active:bg-bg-200
.btn--secondary = bg-bg-100 text-bg-800 hover:bg-bg-200 active:bg-bg-300
```

### Layout
```
.wrap = max-w-7xl mx-auto px-6
.container = w-full max-w-full
.section = py-12 md:py-16 lg:py-20
```

### Typography
```
.display = text-display-lg font-bold leading-tight
.heading-lg = text-heading-lg font-bold
.heading-md = text-heading-md font-semibold
.lede = text-lg text-bg-700
.eyebrow = text-xs uppercase tracking-wide text-primary-500 font-semibold
```

### Cards & Surfaces
```
.card = bg-white rounded-lg border border-bg-500 p-6 hover:shadow-md transition-all
.card--featured = bg-white border-2 border-primary-500 shadow-lg
.surface = bg-white rounded-md
```

### Forms & Inputs
```
.input = w-full px-4 py-3 border border-bg-500 rounded-md text-bg-800 focus:outline-none focus:ring-2 focus:ring-primary-500
.select = w-full px-4 py-3 border border-bg-500 rounded-md text-bg-800 appearance-none
.switch = relative inline-flex h-6 w-11 items-center rounded-full bg-bg-300 transition-colors
.range = w-full accent-primary-500
```

### Utilities & Helpers
```
.reveal = animation: fade-in / slide-in
.mono = font-mono
.nowrap = whitespace-nowrap
.truncate = truncate
.focus-ring = focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
```

### Components
```
.hero = py-16 md:py-24 lg:py-32
.pricing-tier = border border-bg-500 rounded-lg p-8
.pricing-tier.is-featured = border-2 border-primary-500 bg-primary-50 shadow-lg
.kpi = flex flex-col gap-2
.stat = text-center
.grid = grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
```

## Conversion Process

1. **Phase 1:** Update all HTML <link> tags (COMPLETE)
2. **Phase 2:** Convert button classes
   - Replace `.btn .btn--primary` with equivalent Tailwind
   - Replace `.btn .btn--ghost` with equivalent Tailwind
3. **Phase 3:** Convert layout & typography
4. **Phase 4:** Convert cards and surfaces
5. **Phase 5:** Convert forms and inputs
6. **Phase 6:** Convert animations and utilities
7. **Phase 7:** Test responsive behavior

## Notes
- All color references use the new Tailwind config colors (primary-500 = #FF5C00, etc.)
- Breakpoints: xs (600px), sm (760px), md (820px), lg (880px), xl (980px), 2xl (1100px)
- Font families configured in tailwind.config.js
- Shadow scale defined in tailwind.config.js
