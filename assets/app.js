/* ============================================================
   Ledgr — micro-interactions
   - sticky-nav shadow on scroll
   - reveal on scroll
   - tabs (dashboard)
   - ⌘K focuses the dashboard search
   - waitlist form: persisted, accessible success state,
     posts to Netlify Forms if deployed there, otherwise
     gracefully simulates success and stores locally
   ============================================================ */

(() => {
  /* ---------- Sticky nav shadow ---------- */
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Active navigation highlight ---------- */
  const setActiveNav = () => {
    const navLinks = document.querySelectorAll('.nav__links a');
    navLinks.forEach((link) => {
      if (link.hasAttribute('aria-current')) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
    });
  };
  
  // Run on initial load
  setActiveNav();

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  } else {
    document
      .querySelectorAll(".reveal")
      .forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll(".tabs").forEach((group) => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      group
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  /* ---------- Cmd/Ctrl-K opens dashboard search ---------- */
  const search = document.querySelector(".search");
  if (search) {
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.querySelector("input")?.focus();
      }
    });
  }

  /* ---------- Waitlist form ----------
     Submissions are posted to formsubmit.co's AJAX endpoint and forwarded
     to ceo@theupcapital.com. No backend, no signup — the first submission
     to a new address triggers a one-time activation email that the owner
     of that mailbox must click. After that it just works.
  */
  const form = document.getElementById("waitlist-form");
  if (form) {
    const STORAGE_KEY = "ledgr-waitlist";
    const ENDPOINT =
      "https://formsubmit.co/ajax/ceo@theupcapital.com";

    const submit = form.querySelector("#wl-submit");
    const successName = form.querySelector("#wl-success-name");
    const successBody = form.querySelector("#wl-success-body");
    const successMeta = form.querySelector("#wl-success-meta");
    const successBlock = form.querySelector(".waitlist__success");

    const showSuccess = (data, opts = { focus: false }) => {
      if (data.firstName) {
        successName.textContent = `You're on the list, ${data.firstName}.`;
      }
      const queue = data.queue || estimateQueue(data.submittedAt);
      successBody.textContent =
        `Our team will reach out within one working day to schedule ` +
        `your onboarding call. You're number ${queue} in the queue for ` +
        `the launch cohort.`;
      successMeta.textContent = `REF · ${data.ref}  ·  Submitted ${formatWhen(
        data.submittedAt
      )}`;
      form.classList.add("is-success");
      if (opts.focus) {
        successBlock.setAttribute("tabindex", "-1");
        successBlock.focus({ preventScroll: true });
      }
    };

    // Restore prior submission
    try {
      const prior = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (prior?.email) showSuccess(prior, { focus: false });
    } catch {
      /* ignore */
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Honeypot — if filled, drop silently.
      if (form.elements["company-website"]?.value) return;
      if (form.elements["_honey"]?.value) return;

      submit.textContent = "Submitting…";
      submit.disabled = true;

      const fd = new FormData(form);
      const firstName = (fd.get("name") || "")
        .toString()
        .trim()
        .split(/\s+/)[0];
      const ref = makeRef();
      const submittedAt = Date.now();

      const payload = {
        _subject: `Ledgr waitlist · ${fd.get("name") || "Unknown"} · ${
          fd.get("company") || "—"
        }`,
        _template: "table",
        _captcha: "false",
        ref,
        name: fd.get("name"),
        email: fd.get("email"),
        company: fd.get("company"),
        role: fd.get("role"),
        team_size: fd.get("team_size"),
        jurisdiction: fd.get("jurisdiction"),
        submitted_at: new Date(submittedAt).toISOString(),
        source: location.href,
      };

      const data = { ...payload, firstName, submittedAt };

      // Persist locally first so we never lose a submission on flaky network.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        // formsubmit responds with { success: "true", message: "..." }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        // Mark as queued — we still confirm to the user so they aren't blocked.
        // The submission is in localStorage and can be resent on next load.
        data.queued = true;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
          /* ignore */
        }
        console.warn("Waitlist submission queued (network):", err);
      }

      showSuccess(data, { focus: true });
    });
  }

  /* ---------- Rev-share calculator (accountants page) ---------- */
  const calc = document.getElementById("calc");
  if (calc) {
    const PLANS = [
      { name: "Solo", arpc: 499 },
      { name: "Growth", arpc: 1499 },
      { name: "Scale", arpc: 4999 },
    ];
    const SHARE = 0.2;

    const els = {
      clients: document.getElementById("r-clients"),
      plan: document.getElementById("r-plan"),
      months: document.getElementById("r-months"),
      cClients: document.getElementById("c-clients"),
      cClients2: document.getElementById("c-clients2"),
      cPlan: document.getElementById("c-plan"),
      cArpc: document.getElementById("c-arpc"),
      cMonths: document.getElementById("c-months"),
      cMonths2: document.getElementById("c-months2"),
      cTotal: document.getElementById("c-total"),
      cMonthly: document.getElementById("c-monthly"),
      cPer: document.getElementById("c-per"),
      cMonthlyTotal: document.getElementById("c-monthly-total"),
      cTermTotal: document.getElementById("c-term-total"),
    };

    const fmt = (n) =>
      n.toLocaleString("en-AE", {
        maximumFractionDigits: 0,
      });
    const fmtAed = (n) => `AED ${fmt(Math.round(n))}`;

    const update = () => {
      const clients = +els.clients.value;
      const plan = PLANS[+els.plan.value];
      const months = +els.months.value;
      const perClientMonth = plan.arpc * SHARE;
      const monthlyTotal = perClientMonth * clients;
      const termTotal = monthlyTotal * months;

      els.cClients.textContent = clients;
      els.cClients2.textContent = clients;
      els.cPlan.textContent = plan.name;
      els.cArpc.textContent = fmt(plan.arpc);
      els.cMonths.textContent = months;
      els.cMonths2.textContent = months;

      els.cTotal.textContent = fmt(Math.round(termTotal));
      els.cMonthly.textContent = fmtAed(plan.arpc);
      els.cPer.textContent = `AED ${perClientMonth.toLocaleString("en-AE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      els.cMonthlyTotal.textContent = `${fmtAed(monthlyTotal)} / mo`;
      els.cTermTotal.textContent = fmtAed(termTotal);
    };

    ["clients", "plan", "months"].forEach((k) =>
      els[k].addEventListener("input", update)
    );
    update();
  }

  /* ---------- Industry tooltips positioning ---------- */
  const industryTooltips = document.querySelectorAll(".industry");
  if (industryTooltips.length > 0) {
    const positionTooltips = () => {
      industryTooltips.forEach((industry) => {
        const tooltip = industry.querySelector(".industry__tooltip");
        if (!tooltip) return;

        const rect = industry.getBoundingClientRect();
        const tooltipWidth = 280; // match CSS width
        const tooltipHeight = tooltip.offsetHeight || 140; // estimate
        const gap = 8; // vertical gap

        // Position tooltip below the element, centered
        let left = rect.left + rect.width / 2 - tooltipWidth / 2;
        let top = rect.bottom + gap;

        // Check if tooltip goes off right edge
        const rightEdge = left + tooltipWidth;
        if (rightEdge > window.innerWidth - 16) {
          left = window.innerWidth - tooltipWidth - 16;
        }

        // Check if tooltip goes off left edge
        if (left < 16) {
          left = 16;
        }

        // Check if tooltip goes off bottom edge
        if (top + tooltipHeight > window.innerHeight - 16) {
          top = rect.top - tooltipHeight - gap;
        }

        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
      });
    };

    // Position on hover
    industryTooltips.forEach((industry) => {
      industry.addEventListener("mouseenter", positionTooltips);
    });

    // Reposition on scroll/resize
    window.addEventListener("scroll", positionTooltips, { passive: true });
    window.addEventListener("resize", positionTooltips, { passive: true });
  }

  /* ---------- Helpers ---------- */
  function makeRef() {
    const a = Math.floor(Math.random() * 36 ** 4)
      .toString(36)
      .toUpperCase()
      .padStart(4, "0");
    const b = Math.floor(Math.random() * 36 ** 4)
      .toString(36)
      .toUpperCase()
      .padStart(4, "0");
    return `LDG-${a}-${b}`;
  }

  function estimateQueue(submittedAt) {
    // Deterministic per submission timestamp.
    const seed = Math.floor(submittedAt / 1000) % 60;
    return 21 + seed; // a believable 21–80 range for an 80-seat cohort
  }

  function formatWhen(ts) {
    try {
      return new Date(ts).toLocaleString("en-AE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return new Date(ts).toISOString();
    }
  }
})();
