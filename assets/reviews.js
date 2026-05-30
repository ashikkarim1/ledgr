/* ============================================================
   Ledgr Reviews
   - Seed firm directory (15 firms) + seed reviews
   - Filters: text search, jurisdiction, size, service
   - Selected-firm detail panel with breakdown + reviews
   - Mock sign-in (localStorage) — required to submit a review
   - Interactive 5-star widget
   - Reviews persisted to localStorage and merged with seed data
   ============================================================ */

(() => {
  const AUTH_KEY = "ledgr-auth";
  const REVIEWS_KEY = "ledgr-reviews";

  // ============================================================
  // SVG helpers
  // ============================================================
  const STAR_FILL =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7L5.8 21l1.6-7L2 9.3l7.1-.7L12 2z"/></svg>';
  const STAR_LINE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="m12 3 2.7 6.1 6.7.6-5 4.5 1.5 6.5L12 17.4 6.1 20.7l1.5-6.5-5-4.5 6.7-.6L12 3z"/></svg>';

  const starsHtml = (n, max = 5) => {
    const full = Math.round(n);
    let out = "";
    for (let i = 1; i <= max; i++)
      out += i <= full ? STAR_FILL : STAR_LINE;
    return out;
  };

  // ============================================================
  // Seed data
  // ============================================================
  const SEED_FIRMS = [
    {
      id: "khalifa-associates",
      name: "Khalifa & Associates Chartered Accountants",
      logo: "KA",
      jurisdiction: "DIFC",
      size: "Mid-tier (11–50)",
      services: [
        "VAT & Corporate Tax",
        "External audit",
        "CFO & advisory",
        "UBO / ESR / AML",
      ],
      languages: "Arabic · English · Hindi",
      founded: 2011,
      agent: "20040912",
      verified: true,
      about:
        "DIFC-licensed audit and advisory house specialising in family offices, trading SMEs and free-zone holding structures. Founding partners trained at PwC and EY. Long-standing relationships with mid-market banks.",
      score: 4.7,
      breakdown: { 5: 132, 4: 41, 3: 9, 2: 3, 1: 1 },
      reviews: [
        {
          author: "Ghada Al-Masri",
          role: "Co-founder · Yasamin Hospitality",
          rating: 5,
          title: "They actually care about getting it right.",
          text:
            "We moved from a much larger firm to Khalifa & Associates last year. The difference is that we get a partner on WhatsApp, not a junior with a script. They caught two SBR mis-classifications in our first quarter together and saved us a five-figure CT exposure.",
          signals: ["Quick to respond", "Saved us money", "Strategic advice"],
          when: "2 weeks ago",
        },
        {
          author: "Tariq Al Hashimi",
          role: "Finance Director · Hilal Trading",
          rating: 5,
          title: "Audit went from three weeks to four days.",
          text:
            "Our FY25 audit was the smoothest we've ever had. They use the Ledgr audit pack, the binder was 90% complete on day one, and we closed without a single PBC chase. They also pushed back on our auditor when a mark was wrong — rare and appreciated.",
          signals: ["Audit-ready", "Honest", "Recommend for groups"],
          when: "5 weeks ago",
        },
        {
          author: "Hessa Al Naqbi",
          role: "Founder · Najma Clinic",
          rating: 4,
          title: "Strong, but expensive for solos.",
          text:
            "Excellent work but pricing is geared to bigger groups. If you're a single-doctor clinic you might want to start with their associate firm and graduate up.",
          signals: ["Premium pricing"],
          when: "8 weeks ago",
        },
      ],
    },
    {
      id: "sayegh-co",
      name: "Sayegh & Co. Chartered Accountants",
      logo: "S",
      jurisdiction: "DIFC",
      size: "Boutique (1–10)",
      services: [
        "External audit",
        "VAT & Corporate Tax",
        "Transfer pricing",
      ],
      languages: "Arabic · English · French",
      founded: 2018,
      agent: "30126701",
      verified: true,
      about:
        "Founder-led boutique audit firm. Specialises in IFRS audits for tech-enabled SMEs and group consolidations. Tight team of eight; partner-led on every engagement.",
      score: 4.9,
      breakdown: { 5: 71, 4: 7, 3: 1, 2: 0, 1: 0 },
      reviews: [
        {
          author: "Omar Khedr",
          role: "CFO · OneOrbit Logistics",
          rating: 5,
          title: "Two partners in the same room as us, every week.",
          text:
            "We're a multi-entity logistics group and Tariq personally led our consolidation last year. Worth every dirham. Found a deferred-tax error from our previous auditor that had been there for three years.",
          signals: ["Partner attention", "Deep technical"],
          when: "1 month ago",
        },
        {
          author: "Priya Shenoy",
          role: "Founder · Sandalwood Studio",
          rating: 5,
          title: "They unlocked our seed round.",
          text:
            "Our prospective investor wanted IFRS audited accounts within six weeks. Sayegh got it done in five — they reorganised our chart of accounts, captured three years of historicals, and signed off cleanly. Round closed.",
          signals: ["Fast turnaround", "Investor-grade"],
          when: "3 months ago",
        },
      ],
    },
    {
      id: "al-mansouri-audit",
      name: "Al Mansouri Audit & Advisory",
      logo: "AM",
      jurisdiction: "Abu Dhabi mainland",
      size: "Mid-tier (11–50)",
      services: [
        "External audit",
        "Outsourced bookkeeping",
        "Payroll & WPS",
        "UBO / ESR / AML",
      ],
      languages: "Arabic · English",
      founded: 2007,
      agent: "20011109",
      verified: true,
      about:
        "Abu Dhabi mainland firm with deep public-sector experience. Trusted by family holdings and government-adjacent entities. Strong on ESR and AML registers.",
      score: 4.6,
      breakdown: { 5: 87, 4: 24, 3: 6, 2: 2, 1: 1 },
      reviews: [
        {
          author: "Mohammed Bin Suroor",
          role: "Group Controller · BinSuroor Holdings",
          rating: 5,
          title: "ESR filings handled silently every year.",
          text:
            "We have eleven entities, six of which need ESR. Al Mansouri tracks them all on a calendar and the paperwork lands on my desk pre-completed. I just sign.",
          signals: ["ESR specialist", "Organised"],
          when: "6 weeks ago",
        },
        {
          author: "Layla Al Khoori",
          role: "MD · KSAH Trading",
          rating: 4,
          title: "Solid mainland firm, slow to adopt tooling.",
          text:
            "Reliable work and good responsiveness from partners. They were initially resistant to Ledgr but switched when their juniors saw the time savings. Now they prefer it.",
          signals: ["Reliable", "Traditional"],
          when: "2 months ago",
        },
      ],
    },
    {
      id: "aurelia-audit",
      name: "Aurelia Audit DIFC",
      logo: "AU",
      jurisdiction: "DIFC",
      size: "National (51–250)",
      services: [
        "External audit",
        "CFO & advisory",
        "Transfer pricing",
        "VAT & Corporate Tax",
      ],
      languages: "Arabic · English · German",
      founded: 1994,
      agent: "20002201",
      verified: true,
      about:
        "Established national firm with a European partner network. Strong on financial services audits, regulated entities, and complex group structures. Known for being thorough.",
      score: 4.4,
      breakdown: { 5: 142, 4: 88, 3: 21, 2: 6, 1: 3 },
      reviews: [
        {
          author: "Karim Saab",
          role: "CFO · Marwan Capital DIFC",
          rating: 5,
          title: "The audit our regulator actually trusts.",
          text:
            "DIFC and DFSA know them well. Means our annual filings move quickly. Their financial-services bench is the deepest in the city.",
          signals: ["Regulator-trusted", "Financial services"],
          when: "4 weeks ago",
        },
        {
          author: "Isabel Park",
          role: "Founder · Park Architecture FZE",
          rating: 3,
          title: "Great firm, wrong fit for a 10-person studio.",
          text:
            "We outgrew our previous firm and jumped to Aurelia. The process felt heavy for our size. Moved to a boutique after one cycle. No drama on exit.",
          signals: ["Better for large clients"],
          when: "9 weeks ago",
        },
      ],
    },
    {
      id: "crescent-compliance",
      name: "Crescent Compliance Partners",
      logo: "CC",
      jurisdiction: "DMCC",
      size: "Boutique (1–10)",
      services: ["UBO / ESR / AML", "VAT & Corporate Tax", "Outsourced bookkeeping"],
      languages: "Arabic · English · Urdu",
      founded: 2020,
      agent: "30198844",
      verified: true,
      about:
        "Compliance-first boutique focused on regulated activity in DMCC and other free zones. Particularly strong on AML for precious metals, trading and crypto-adjacent businesses.",
      score: 4.8,
      breakdown: { 5: 52, 4: 11, 3: 2, 2: 0, 1: 0 },
      reviews: [
        {
          author: "Rashed Al Falasi",
          role: "MD · Gold Souk Trading FZ-LLC",
          rating: 5,
          title: "Saved our DMCC licence renewal.",
          text:
            "We were six weeks from a renewal and our AML register was a mess. Crescent rebuilt it in eight working days and the DMCC AML officer approved on first read. Heroes.",
          signals: ["AML specialists", "Crisis-handled"],
          when: "5 weeks ago",
        },
      ],
    },
    {
      id: "falcon-tax",
      name: "Falcon Tax Bureau",
      logo: "FT",
      jurisdiction: "Dubai mainland",
      size: "Boutique (1–10)",
      services: ["VAT & Corporate Tax", "CFO & advisory"],
      languages: "Arabic · English",
      founded: 2019,
      agent: "30087712",
      verified: true,
      about:
        "Tax-only boutique. No audit, no payroll. They specialise in VAT registrations, FTA voluntary disclosures, and CT structuring for free-zone holdings. Founder is ex-FTA.",
      score: 4.7,
      breakdown: { 5: 64, 4: 14, 3: 3, 2: 1, 1: 0 },
      reviews: [
        {
          author: "Noura Al Suwaidi",
          role: "Founder · NS Consultancy",
          rating: 5,
          title: "Wrote our QFZP election in plain English.",
          text:
            "I'd been told three different things by three accountants about QFZP. Falcon's founder walked through the test against our actual books in 45 minutes and gave me a one-page memo. We elected and it stuck.",
          signals: ["Clear advice", "Free-zone expert"],
          when: "3 weeks ago",
        },
      ],
    },
    {
      id: "habibi-hadi",
      name: "Habibi & Hadi LLP",
      logo: "HH",
      jurisdiction: "Dubai mainland",
      size: "Mid-tier (11–50)",
      services: [
        "Outsourced bookkeeping",
        "Payroll & WPS",
        "VAT & Corporate Tax",
      ],
      languages: "Arabic · English · Tagalog",
      founded: 2014,
      agent: "20089004",
      verified: true,
      about:
        "Workhorse bookkeeping and payroll house for hospitality and retail. Strong on multi-location WPS payroll and tip-pool accounting. Twenty-four-hour turnaround on most queries.",
      score: 4.3,
      breakdown: { 5: 78, 4: 41, 3: 12, 2: 5, 1: 2 },
      reviews: [
        {
          author: "Bilal Naqvi",
          role: "Ops Director · Spice Route F&B",
          rating: 4,
          title: "WPS payroll runs itself with them.",
          text:
            "We have 140 staff across six brands. The WPS file lands on the 26th every month without a chase. Bookkeeping side is solid; advisory is light.",
          signals: ["Operationally strong", "Payroll specialists"],
          when: "1 month ago",
        },
      ],
    },
    {
      id: "najjar-tax",
      name: "Najjar Tax Advisory",
      logo: "NT",
      jurisdiction: "DIFC",
      size: "Boutique (1–10)",
      services: ["VAT & Corporate Tax", "Transfer pricing", "CFO & advisory"],
      languages: "Arabic · English · French",
      founded: 2021,
      agent: "30221117",
      verified: true,
      about:
        "Transfer-pricing-focused boutique. Run by ex-Big Four senior managers. Best-in-class for mid-market groups dealing with Pillar 2 / DMTT planning and intercompany pricing.",
      score: 4.9,
      breakdown: { 5: 41, 4: 4, 3: 0, 2: 0, 1: 0 },
      reviews: [
        {
          author: "Reema Al Ali",
          role: "CFO · Khaleej Industrial Group",
          rating: 5,
          title: "Saved us seven figures on Pillar 2 structuring.",
          text:
            "Najjar's TP study and Pillar 2 model laid out three structuring options with the trade-offs. We picked one, FTA accepted, and we're saving materially every year. The work is genuinely world-class.",
          signals: ["TP specialists", "Pillar 2 ready"],
          when: "2 months ago",
        },
      ],
    },
    {
      id: "emirates-bookkeeping",
      name: "Emirates Bookkeeping Bureau",
      logo: "EB",
      jurisdiction: "JAFZA / RAKEZ",
      size: "Mid-tier (11–50)",
      services: ["Outsourced bookkeeping", "VAT & Corporate Tax", "Payroll & WPS"],
      languages: "Arabic · English",
      founded: 2009,
      agent: "20053311",
      verified: true,
      about:
        "Volume bookkeeping firm popular with JAFZA and RAKEZ trading businesses. Affordable, dependable, light on advisory. Good for businesses that want the books done quietly.",
      score: 3.9,
      breakdown: { 5: 41, 4: 36, 3: 22, 2: 9, 1: 4 },
      reviews: [
        {
          author: "Faisal Al Hammadi",
          role: "Owner · Hammadi Trading FZE",
          rating: 4,
          title: "Honest, cheap, and on time.",
          text:
            "I've been with them since 2017. They keep the books, file the VAT, and don't surprise me. Don't expect strategic advice — but for what I pay, that's fair.",
          signals: ["Affordable", "Steady"],
          when: "3 months ago",
        },
        {
          author: "Andrei Petrov",
          role: "Director · NorthBay General Trading",
          rating: 3,
          title: "OK on books, slow on tax.",
          text:
            "Bookkeeping side fine. They missed our VAT registration deadline by ten days. Penalty was small but the experience was not great.",
          signals: ["Slow on tax"],
          when: "4 months ago",
        },
      ],
    },
    {
      id: "onyx-audit",
      name: "Onyx Audit & Tax FZ-LLC",
      logo: "OX",
      jurisdiction: "DMCC",
      size: "Mid-tier (11–50)",
      services: ["External audit", "VAT & Corporate Tax", "UBO / ESR / AML"],
      languages: "Arabic · English · Russian",
      founded: 2016,
      agent: "20102204",
      verified: true,
      about:
        "DMCC-based firm with strong CIS-corridor client base. Russian-language partner means a lot of Russian and Kazakh family offices use them. Good on cross-border structuring.",
      score: 4.5,
      breakdown: { 5: 58, 4: 23, 3: 4, 2: 2, 1: 0 },
      reviews: [
        {
          author: "Yelena Markova",
          role: "Family-office director · MA Capital",
          rating: 5,
          title: "Bilingual end-to-end.",
          text:
            "Russian-language documents accepted as-is. Two of their partners are native speakers. For our family office that runs in two languages, this changes how much we offload to the firm.",
          signals: ["Russian-speaking", "Family offices"],
          when: "7 weeks ago",
        },
      ],
    },
    {
      id: "pearl-diver",
      name: "Pearl Diver Advisors",
      logo: "PD",
      jurisdiction: "ADGM",
      size: "Boutique (1–10)",
      services: ["CFO & advisory", "VAT & Corporate Tax"],
      languages: "English · Arabic",
      founded: 2022,
      agent: "30240098",
      verified: true,
      about:
        "ADGM-licensed advisory shop. Specialises in fractional-CFO engagements for venture-backed startups. Lightweight on bookkeeping (handled via Ledgr), heavyweight on board reporting.",
      score: 4.8,
      breakdown: { 5: 29, 4: 4, 3: 1, 2: 0, 1: 0 },
      reviews: [
        {
          author: "Sara El Sayed",
          role: "Founder · Sirocco Health",
          rating: 5,
          title: "Our fractional CFO actually moves the needle.",
          text:
            "We had four investor pitches in a quarter. Pearl Diver built the model, ran the data room, and joined two pitches. We raised a USD 3.4M seed. Worth every dirham.",
          signals: ["Fractional CFO", "Fundraising support"],
          when: "5 weeks ago",
        },
      ],
    },
    {
      id: "ibn-battuta-audit",
      name: "Ibn Battuta Audit",
      logo: "IB",
      jurisdiction: "Dubai mainland",
      size: "Boutique (1–10)",
      services: ["External audit", "Outsourced bookkeeping"],
      languages: "Arabic · English",
      founded: 2017,
      agent: "20094503",
      verified: true,
      about:
        "Small audit firm with a strong reputation in the Discovery Gardens / IMPZ / Production City corridor. Affordable for SMEs. Limited capacity — books up quickly.",
      score: 4.4,
      breakdown: { 5: 31, 4: 14, 3: 4, 2: 1, 1: 0 },
      reviews: [
        {
          author: "Hassan Al Kamali",
          role: "Founder · Kamali Media",
          rating: 4,
          title: "Solid audit, slightly slow comms.",
          text:
            "Audit was clean and they negotiated well with our auditor. Email turnaround is 2-3 days which is slower than I'd like. But the work is good and the pricing is fair.",
          signals: ["Affordable", "Email-only"],
          when: "10 weeks ago",
        },
      ],
    },
    {
      id: "riyada-ca",
      name: "Riyada Chartered Accountants",
      logo: "RC",
      jurisdiction: "Dubai mainland",
      size: "National (51–250)",
      services: [
        "External audit",
        "VAT & Corporate Tax",
        "Outsourced bookkeeping",
        "Payroll & WPS",
        "CFO & advisory",
      ],
      languages: "Arabic · English · Hindi · Urdu",
      founded: 2003,
      agent: "20008871",
      verified: true,
      about:
        "Full-service national firm with offices in Dubai, Sharjah and Abu Dhabi. The classic 'one-stop shop' for SMEs that want a single relationship. Quality varies by partner.",
      score: 4.1,
      breakdown: { 5: 188, 4: 142, 3: 64, 2: 18, 1: 8 },
      reviews: [
        {
          author: "Vivek Krishnan",
          role: "Director · VK Logistics LLC",
          rating: 5,
          title: "Excellent partner team — once you find one.",
          text:
            "Riyada is huge. The partner you get matters a lot. We were lucky to land Anil's team in our second year and have been with them ever since.",
          signals: ["Big firm energy", "Variable team"],
          when: "3 weeks ago",
        },
        {
          author: "Maitha Al Mahri",
          role: "Owner · Al Mahri Real Estate",
          rating: 3,
          title: "Felt anonymous as a small client.",
          text:
            "We were assigned a different junior every few months. Felt like our books were processed, not understood. Moved to a boutique.",
          signals: ["Junior-led"],
          when: "11 weeks ago",
        },
      ],
    },
    {
      id: "sahara-audit",
      name: "Sahara Audit Group",
      logo: "SA",
      jurisdiction: "Abu Dhabi mainland",
      size: "Mid-tier (11–50)",
      services: ["External audit", "UBO / ESR / AML", "VAT & Corporate Tax"],
      languages: "Arabic · English",
      founded: 2011,
      agent: "20039911",
      verified: true,
      about:
        "Abu Dhabi audit specialists. Long-standing relationships with ADGM, Khalifa City and Mussaffah industrial businesses. Strong on industrial and construction sector audit.",
      score: 4.2,
      breakdown: { 5: 47, 4: 31, 3: 11, 2: 4, 1: 2 },
      reviews: [
        {
          author: "Yousef Al Suweidi",
          role: "CFO · Suweidi Industrial Group",
          rating: 4,
          title: "Know our sector inside out.",
          text:
            "For industrial and construction, hard to beat. They understand retention, work-in-progress, and project costing. Less competitive for service businesses.",
          signals: ["Industry depth", "Construction"],
          when: "6 weeks ago",
        },
      ],
    },
    {
      id: "wadi-tax-studio",
      name: "Wadi Tax Studio",
      logo: "WT",
      jurisdiction: "IFZA / SHAMS / Meydan",
      size: "Boutique (1–10)",
      services: ["VAT & Corporate Tax", "Outsourced bookkeeping"],
      languages: "Arabic · English · Spanish",
      founded: 2023,
      agent: "30260441",
      verified: false,
      about:
        "New entrant. Founder-led tax studio popular with creator businesses and digital nomad consultants in IFZA and SHAMS. Heavy emphasis on async communication and clear docs.",
      score: 4.6,
      breakdown: { 5: 18, 4: 7, 3: 2, 2: 0, 1: 0 },
      reviews: [
        {
          author: "Camila Ruiz",
          role: "Founder · Camila Ruiz Creative FZ-LLC",
          rating: 5,
          title: "Async, fast, clear.",
          text:
            "Notion docs instead of email chains. Loom walkthroughs of my P&L. As a solo creator that's what I needed. Felt like working with a designer, not a bookkeeper.",
          signals: ["Async friendly", "Creator-focused"],
          when: "2 weeks ago",
        },
      ],
    },
  ];

  // ============================================================
  // State
  // ============================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  let selectedId = SEED_FIRMS[0].id;
  let filters = { q: "", jurisdiction: "", size: "", service: "" };
  let userReviews = loadUserReviews();

  function loadUserReviews() {
    try {
      return JSON.parse(localStorage.getItem(REVIEWS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveUserReviews() {
    try {
      localStorage.setItem(REVIEWS_KEY, JSON.stringify(userReviews));
    } catch {
      /* ignore */
    }
  }

  function getAuth() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setAuth(user) {
    if (user) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
    renderAuth();
    renderDetail();
  }

  // ============================================================
  // Filtering
  // ============================================================
  function applyFilters() {
    const q = filters.q.trim().toLowerCase();
    return SEED_FIRMS.filter((f) => {
      if (q) {
        const hay = [f.name, f.about, ...f.services].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.jurisdiction && f.jurisdiction !== filters.jurisdiction) return false;
      if (filters.size && f.size !== filters.size) return false;
      if (filters.service && !f.services.includes(filters.service)) return false;
      return true;
    });
  }

  // ============================================================
  // Rendering — directory
  // ============================================================
  function renderGrid() {
    const grid = $("#firm-grid");
    const matches = applyFilters();
    if (!matches.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:60px 24px;text-align:center;border:1px dashed var(--line);border-radius:var(--radius-lg);color:var(--ink-3)">
          No firms match those filters. <button type="button" class="btn btn--ghost" id="empty-reset" style="margin-left:8px">Reset filters</button>
        </div>`;
      $("#empty-reset")?.addEventListener("click", resetFilters);
      return;
    }
    grid.innerHTML = matches
      .map((f) => {
        const totalReviews = combinedReviews(f).length;
        const avg = combinedScore(f);
        return `
        <button class="firm-card${f.id === selectedId ? " is-selected" : ""}" data-firm="${f.id}" type="button">
          <div class="firm-card__head">
            <span class="firm-card__logo">${f.logo}</span>
            <div class="firm-card__meta">
              <span class="firm-card__name">${f.name}</span>
              <span class="firm-card__sub">
                <span>${f.jurisdiction}</span>
                <span aria-hidden="true">·</span>
                <span>${f.size}</span>
                ${f.verified ? '<span class="firm-card__verified">Verified</span>' : ""}
              </span>
            </div>
          </div>
          <div class="firm-card__rating">
            <span class="firm-card__score">${avg.toFixed(1)}</span>
            <span class="firm-card__stars" aria-hidden="true">${starsHtml(avg)}</span>
            <span class="firm-card__count">· ${totalReviews} reviews</span>
          </div>
          <div class="firm-card__tags">
            ${f.services
              .slice(0, 3)
              .map((s) => `<span class="firm-card__tag">${s}</span>`)
              .join("")}
            ${f.services.length > 3 ? `<span class="firm-card__tag">+${f.services.length - 3}</span>` : ""}
          </div>
          <div class="firm-card__foot">
            <span>Since ${f.founded} · ${f.languages.split(" · ")[0]}</span>
            <span class="firm-card__cta">
              View &amp; review
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:11px;height:11px"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </div>
        </button>`;
      })
      .join("");

    $$(".firm-card", grid).forEach((card) => {
      card.addEventListener("click", () => {
        selectedId = card.dataset.firm;
        renderGrid();
        renderDetail();
        $("#firm-detail-host").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  // ============================================================
  // Aggregation helpers — merge seed + user reviews
  // ============================================================
  function combinedReviews(f) {
    return [...(userReviews[f.id] || []), ...f.reviews];
  }

  function combinedBreakdown(f) {
    const out = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    Object.entries(f.breakdown).forEach(([k, v]) => (out[k] = v));
    (userReviews[f.id] || []).forEach((r) => {
      out[r.rating] = (out[r.rating] || 0) + 1;
    });
    return out;
  }

  function combinedScore(f) {
    const b = combinedBreakdown(f);
    let n = 0;
    let sum = 0;
    [1, 2, 3, 4, 5].forEach((k) => {
      n += b[k];
      sum += b[k] * k;
    });
    return n === 0 ? 0 : sum / n;
  }

  // ============================================================
  // Rendering — selected firm detail
  // ============================================================
  function renderDetail() {
    const host = $("#firm-detail-host");
    const f = SEED_FIRMS.find((x) => x.id === selectedId);
    if (!f) {
      host.innerHTML = "";
      return;
    }
    const auth = getAuth();
    const reviews = combinedReviews(f);
    const breakdown = combinedBreakdown(f);
    const score = combinedScore(f);
    const totalReviews = reviews.length;

    const maxCount = Math.max(...Object.values(breakdown));
    const bars = [5, 4, 3, 2, 1]
      .map((k) => {
        const pct = maxCount ? (breakdown[k] / maxCount) * 100 : 0;
        return `
        <div class="row">
          <span>${k} star${k === 1 ? "" : "s"}</span>
          <div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <span class="v">${breakdown[k]}</span>
        </div>`;
      })
      .join("");

    host.innerHTML = `
      <div class="firm-detail">
        <div class="firm-detail__head">
          <div>
            <div class="firm-detail__title-row">
              <span class="firm-detail__logo">${f.logo}</span>
              <div>
                <h2 class="firm-detail__name">${f.name}</h2>
                <div class="firm-detail__sub">
                  <span>${f.jurisdiction}</span>
                  <span aria-hidden="true">·</span>
                  <span>${f.size}</span>
                  <span aria-hidden="true">·</span>
                  <span>Since ${f.founded}</span>
                  ${f.verified ? '<span class="firm-card__verified">Verified · FTA agent #' + f.agent + "</span>" : ""}
                </div>
              </div>
            </div>
          </div>
          <div class="firm-detail__score-block">
            <span class="firm-detail__score">${score.toFixed(1)}</span>
            <span class="firm-card__stars" aria-hidden="true" style="color:var(--ink-1)">${starsHtml(score)}</span>
            <span class="firm-detail__count">${totalReviews} verified review${totalReviews === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div class="firm-detail__body">
          <div class="firm-detail__about">
            <p>${f.about}</p>
            <p style="color:var(--ink-3);font-size:13px">Languages: ${f.languages}</p>
            <div class="firm-detail__chips">
              ${f.services
                .map((s) => `<span class="firm-card__tag">${s}</span>`)
                .join("")}
            </div>
          </div>
          <div class="firm-detail__breakdown">${bars}</div>
        </div>

        <div class="review-list">
          <div class="review-list__head">
            <span class="review-list__title">${totalReviews} review${totalReviews === 1 ? "" : "s"}</span>
            <span class="muted" style="font-size:12.5px">Most recent first · all verified</span>
          </div>

          ${reviews
            .map(
              (r, i) => `
            <article class="review">
              <div class="review__avatar">${initials(r.author)}</div>
              <div class="review__body">
                <div class="review__row">
                  <div class="review__who">
                    <span class="review__name">${r.author}${r._isMine ? '<span class="you">YOU</span>' : ""}</span>
                    <span class="review__role">${r.role}</span>
                  </div>
                  <div class="review__meta">
                    <span class="review__stars" aria-label="${r.rating} of 5">${starsHtml(r.rating)}</span>
                    <span class="review__when">${r.when}</span>
                  </div>
                </div>
                <span class="review__title">${escapeHtml(r.title)}</span>
                <p class="review__text">${escapeHtml(r.text)}</p>
                ${
                  r.signals && r.signals.length
                    ? `<div class="review__signal">${r.signals
                        .map((s) => `<span class="chip">${escapeHtml(s)}</span>`)
                        .join("")}</div>`
                    : ""
                }
              </div>
            </article>`
            )
            .join("")}
        </div>

        <div class="review-form-wrap" id="review-form-wrap">
          ${renderReviewFormHtml(f, auth)}
        </div>
      </div>
    `;

    if (auth) {
      wireReviewForm(f);
    } else {
      $$("[data-open-signin]", host).forEach((b) =>
        b.addEventListener("click", openSignin)
      );
    }
  }

  function renderReviewFormHtml(f, auth) {
    if (!auth) {
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap">
          <div>
            <h3 class="review-form-wrap__title">Worked with ${f.name}?</h3>
            <p class="review-form-wrap__sub">Sign in with your Ledgr account to leave a verified review.</p>
          </div>
          <button class="btn btn--primary" type="button" data-open-signin>Sign in to review</button>
        </div>`;
    }

    return `
      <h3 class="review-form-wrap__title">Write a review for ${f.name}</h3>
      <p class="review-form-wrap__sub">Posting as <strong style="color:var(--ink-1);font-weight:500">${escapeHtml(
        auth.name
      )}</strong> from <strong style="color:var(--ink-1);font-weight:500">${escapeHtml(auth.company)}</strong>. <button type="button" data-signout style="background:none;border:0;color:var(--ink-3);font:inherit;text-decoration:underline;cursor:pointer;padding:0;margin-left:4px">Not you?</button></p>

      <form class="review-form" id="review-form">
        <div class="review-form__row">
          <label class="review-form__label">
            Your rating
            <span class="hint">Be honest — your firm depends on it.</span>
          </label>
          <div class="stars" id="star-input" role="radiogroup" aria-label="Star rating">
            ${[1, 2, 3, 4, 5]
              .map(
                (i) => `
              <button type="button" class="stars__btn" data-star="${i}" aria-label="${i} star${i === 1 ? "" : "s"}" role="radio">${STAR_FILL}</button>
            `
              )
              .join("")}
          </div>
        </div>

        <div class="review-form__row">
          <label class="review-form__label" for="r-title">
            Headline
            <span class="hint">A short summary of your experience.</span>
          </label>
          <input class="input" id="r-title" type="text" required maxlength="80" placeholder="They turned our audit around in a week." />
        </div>

        <div class="review-form__row is-stack">
          <label class="review-form__label" for="r-text">
            Your review
            <span class="hint">What did they do well, where can they improve?</span>
          </label>
          <textarea class="textarea" id="r-text" required minlength="40" maxlength="1200" placeholder="We hired ${f.name} for…"></textarea>
        </div>

        <div class="review-form__row is-stack">
          <label class="review-form__label">
            Tag what they're good at
            <span class="hint">Pick up to four.</span>
          </label>
          <div class="signals" id="r-signals">
            ${[
              "Quick to respond",
              "Partner attention",
              "Honest",
              "Audit-ready",
              "Affordable",
              "Premium pricing",
              "Strategic advice",
              "Multi-entity",
              "Free-zone expert",
              "Tax specialists",
              "Bilingual",
              "Async friendly",
            ]
              .map(
                (s) => `
              <label class="signal"><input type="checkbox" name="signal" value="${s}" />${s}</label>`
              )
              .join("")}
          </div>
        </div>

        <div class="review-form__actions">
          <span class="legal">By posting, you confirm you have a working relationship with this firm. We share verified reviews; we don't share your email.</span>
          <button class="btn" type="button" id="r-cancel">Discard</button>
          <button class="btn btn--primary" type="submit" id="r-submit">Post review</button>
        </div>
      </form>
    `;
  }

  function wireReviewForm(f) {
    const auth = getAuth();
    let rating = 0;

    // Stars
    const starButtons = $$("#star-input .stars__btn");
    const paint = (n) => {
      starButtons.forEach((b, i) => {
        b.classList.toggle("is-on", i < n);
      });
    };
    starButtons.forEach((b, i) => {
      b.addEventListener("mouseenter", () => paint(i + 1));
      b.addEventListener("focus", () => paint(i + 1));
      b.addEventListener("click", () => {
        rating = i + 1;
        paint(rating);
      });
    });
    $("#star-input").addEventListener("mouseleave", () => paint(rating));

    // Limit signals to four
    const checkboxes = $$('#r-signals input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.addEventListener("change", () => {
        const checked = checkboxes.filter((c) => c.checked);
        if (checked.length > 4) cb.checked = false;
      });
    });

    // Submit
    $("#review-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!rating) {
        $("#star-input").animate(
          [
            { transform: "translateX(-3px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 220 }
        );
        return;
      }
      const title = $("#r-title").value.trim();
      const text = $("#r-text").value.trim();
      const signals = checkboxes.filter((c) => c.checked).map((c) => c.value);
      const review = {
        author: auth.name,
        role: `From · ${auth.company}`,
        rating,
        title,
        text,
        signals,
        when: "Just now",
        _isMine: true,
      };
      userReviews[f.id] = [review, ...(userReviews[f.id] || [])];
      saveUserReviews();
      renderGrid();
      renderDetail();
      // Scroll to the new review
      setTimeout(() => {
        const firstReview = document.querySelector(".review");
        firstReview?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });

    $("#r-cancel").addEventListener("click", () => {
      $("#review-form").reset();
      rating = 0;
      paint(0);
    });

    $("[data-signout]")?.addEventListener("click", () => {
      setAuth(null);
    });
  }

  // ============================================================
  // Auth banner
  // ============================================================
  function renderAuth() {
    const banner = $("#auth-banner");
    const who = $("#auth-who");
    const actions = $("#auth-actions");
    const navAuth = $("#nav-auth");
    const auth = getAuth();

    if (auth) {
      banner.classList.add("is-authed");
      who.innerHTML = `Signed in as <strong>${escapeHtml(
        auth.name
      )}</strong> from <strong>${escapeHtml(auth.company)}</strong>. Pick a firm below to leave a review.`;
      actions.innerHTML = `<button class="btn" type="button" id="signout-btn" style="background:transparent;border-color:color-mix(in srgb, var(--accent) 35%, transparent);color:var(--accent-2)">Sign out</button>`;
      navAuth.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink-2)"><span style="width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)"></span> ${escapeHtml(
          auth.name.split(/\s+/)[0]
        )}</span>
        <a class="btn btn--primary" href="index.html#waitlist">Join the waitlist</a>
      `;
      $("#signout-btn").addEventListener("click", () => setAuth(null));
    } else {
      banner.classList.remove("is-authed");
      who.textContent =
        "Sign in with your Ledgr account to leave a review for any firm you've worked with.";
      actions.innerHTML = `<button class="btn btn--primary" type="button" data-open-signin>Sign in to review</button>`;
      navAuth.innerHTML = `
        <a class="btn btn--ghost" href="#" data-open-signin>Sign in</a>
        <a class="btn btn--primary" href="index.html#waitlist">Join the waitlist</a>
      `;
    }

    // Wire any open-signin buttons (banner, nav, etc.)
    $$("[data-open-signin]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        openSignin();
      })
    );
  }

  // ============================================================
  // Sign-in modal
  // ============================================================
  function openSignin() {
    $("#signin-modal").classList.add("is-open");
    setTimeout(() => $("#si-name")?.focus(), 80);
  }

  function closeSignin() {
    $("#signin-modal").classList.remove("is-open");
  }

  $("#signin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const user = {
      name: $("#si-name").value.trim(),
      email: $("#si-email").value.trim(),
      company: $("#si-company").value.trim(),
      since: Date.now(),
    };
    if (!user.name || !user.email || !user.company) return;
    setAuth(user);
    closeSignin();
  });

  $$("[data-close-signin]").forEach((b) =>
    b.addEventListener("click", closeSignin)
  );
  $("#signin-modal").addEventListener("click", (e) => {
    if (e.target.id === "signin-modal") closeSignin();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#signin-modal").classList.contains("is-open")) {
      closeSignin();
    }
  });

  // ============================================================
  // Filters
  // ============================================================
  $("#f-q").addEventListener("input", (e) => {
    filters.q = e.target.value;
    renderGrid();
  });
  $("#f-jurisdiction").addEventListener("change", (e) => {
    filters.jurisdiction = e.target.value;
    renderGrid();
  });
  $("#f-size").addEventListener("change", (e) => {
    filters.size = e.target.value;
    renderGrid();
  });
  $("#f-service").addEventListener("change", (e) => {
    filters.service = e.target.value;
    renderGrid();
  });
  $("#f-reset").addEventListener("click", resetFilters);

  function resetFilters() {
    filters = { q: "", jurisdiction: "", size: "", service: "" };
    $("#f-q").value = "";
    $("#f-jurisdiction").value = "";
    $("#f-size").value = "";
    $("#f-service").value = "";
    renderGrid();
  }

  // ============================================================
  // Helpers
  // ============================================================
  function initials(name) {
    return name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============================================================
  // Boot
  // ============================================================
  renderAuth();
  renderGrid();
  renderDetail();
})();
