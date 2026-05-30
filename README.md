# Ledgr — prototype

A deployable static prototype for **Ledgr**, the autonomous finance function
for UAE businesses. Built directly from the v1.0 business plan.

## What's in here

```
.
├── index.html        Marketing landing — hero, regulatory timeline,
│                     6 product modules, agent workflow, pricing,
│                     comparison vs. incumbents, FAQ, closing CTA.
├── app.html          Live product dashboard preview —
│                     KPIs, cash forecast, VAT meter, agent activity,
│                     transactions, spend breakdown, filings calendar.
├── assets/
│   ├── styles.css    Full design system (light + dark).
│   └── app.js        Theme toggle, sticky nav, scroll reveal, tabs.
├── vercel.json       Vercel deploy config (cache + security headers).
└── netlify.toml      Netlify deploy config (same).
```

Zero build step. Pure HTML / CSS / vanilla JS. Drag-and-drop deployable to
any static host.

## Run locally

```bash
# Python
python3 -m http.server 4321

# or Node
npx serve .
```

Then open <http://localhost:4321>.

## Push to the web

**Vercel** (fastest)
```bash
npx vercel deploy --prod
```

**Netlify**
```bash
npx netlify-cli deploy --prod --dir=.
```

**Cloudflare Pages / GitHub Pages**
Push to a GitHub repo and connect it — both auto-detect static sites with no
build command. Set the publish directory to the repo root.

## Design notes

- **One accent.** A single deep emerald is used sparingly — for live state,
  positive deltas, and the featured pricing CTA. Everything else is paper
  and ink.
- **Type.** Inter for UI, JetBrains Mono for figures and timestamps,
  Newsreader (italic) for editorial accents. Tight tracking on display
  sizes, loosened on small caps.
- **Whitespace as composition.** Sections use a 144 px rhythm at large
  viewports, collapsing to 80 px on mobile. Grids never get denser than
  they need to be.
- **Restraint with motion.** A 14 px / 0.7 s scroll reveal, a nav-shadow
  on scroll, and a theme cross-fade. Reduced-motion users see no
  transitions.
- **Real content.** Numbers (651k entities, AED 5.1B SAM, e-invoicing
  Phase 1 / 2 dates) come from the business plan and the FTA.

## Waitlist form — where submissions go

All form and contact emails route to **ceo@theupcapital.com**.

The waitlist form (`#waitlist-form` on `index.html`) posts to
[formsubmit.co](https://formsubmit.co), which forwards the structured
payload to that mailbox. No backend code, no signup needed — but the
**first submission triggers a one-time activation email** to
`ceo@theupcapital.com`. Click the link in that email once and every
subsequent submission lands in your inbox.

If the network fails, the submission is still persisted to
`localStorage` and the user sees confirmation; the next page load
shows the same success state.

`mailto:` links for security and Scale-plan enquiries also point to
`ceo@theupcapital.com`.

## Pages

| Path | Purpose |
| --- | --- |
| `/index.html` | Marketing landing — hero, proof strip, 6 modules, 6-step workflow, 15-industry grid, opportunity stats, 4-tier pricing, comparison, FAQ, waitlist |
| `/app.html` | Dashboard preview — KPIs, cash forecast, VAT meter, agent activity, transactions, spend, A/R aging, Izza chat, filings |
| `/customers.html` | Persona cards + featured case study + cohort stats |
| `/security.html` | Eight trust commitments + two principles + full security specs |
| `/onboarding.html` | Step-2 wizard mockup with bank picker, step deep-dive, FAQ |

## Theme

Light only. A single warm-paper background, deep-ink type, and one
emerald accent used sparingly. No theme toggle.
