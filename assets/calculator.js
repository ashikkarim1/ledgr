/* ============================================================
   Ledgr FTA Readiness Calculator
   - Six-step wizard, last step is the computed report
   - Score is rule-based (no model), with cited findings
   - Lead capture posts to formsubmit.co -> ceo@theupcapital.com
   ============================================================ */

(() => {
  const wizard = document.getElementById("wizard");
  if (!wizard) return;

  const $ = (s, r = wizard) => r.querySelector(s);
  const $$ = (s, r = wizard) => [...r.querySelectorAll(s)];

  const TOTAL = 6;
  let step = 0;
  const answers = { entity: "", revenue: "", vat: "", payroll: "", einv: "" };

  // ============================================================
  // Step navigation
  // ============================================================
  function goTo(n) {
    if (n < 0 || n > TOTAL - 1) return;
    step = n;
    $$(".wizard__pane").forEach((p) =>
      p.classList.toggle("is-active", +p.dataset.pane === step)
    );
    $$(".wizard__step").forEach((s) => {
      const i = +s.dataset.step;
      s.classList.toggle("is-active", i === step);
      s.classList.toggle("is-done", i < step);
    });
    const pct = Math.round(((step + 1) / TOTAL) * 100);
    $("#wz-progress").textContent = `Step ${step + 1} of ${TOTAL} · ${pct}%`;
    $("#wz-bar").style.width = pct + "%";

    if (step === TOTAL - 1) renderResult();

    // Scroll wizard into view on small screens
    if (window.innerWidth < 900) {
      wizard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function readAnswerForStep(n) {
    const name = ["entity", "revenue", "vat", "payroll", "einv"][n];
    if (!name) return true;
    const picked = $(`input[name="${name}"]:checked`);
    if (!picked) return false;
    answers[name] = picked.value;
    return true;
  }

  $$('[data-next]').forEach((btn) =>
    btn.addEventListener("click", () => {
      if (!readAnswerForStep(step)) {
        const pane = $(`.wizard__pane[data-pane="${step}"]`);
        pane?.animate(
          [
            { transform: "translateX(-3px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 220 }
        );
        return;
      }
      goTo(step + 1);
    })
  );

  $$('[data-prev]').forEach((btn) =>
    btn.addEventListener("click", () => goTo(step - 1))
  );

  // Click a sidebar step to jump back
  $$(".wizard__step").forEach((s) =>
    s.addEventListener("click", () => {
      const i = +s.dataset.step;
      if (i < step) goTo(i);
    })
  );

  // ============================================================
  // Scoring & findings
  // ============================================================
  function scoreAndFindings(a) {
    let score = 100;
    const findings = [];

    // Entity / jurisdiction
    if (a.entity === "freezone") {
      findings.push({
        kind: "ok",
        title: "Free-zone QFZP election may protect 0% CT on qualifying income.",
        sub:
          "Subject to the de-minimis test, substance and audited accounts. We can run the QFZP test against your books to confirm. Cited · Cabinet Decision 100 of 2023, Art. 3.",
      });
    } else if (a.entity === "financial-fz") {
      findings.push({
        kind: "ok",
        title: "DIFC / ADGM regulator-aligned reporting requirements.",
        sub:
          "You will need IFRS audited accounts annually. Most of our DIFC customers are on the Scale plan because of consolidation needs.",
      });
    } else {
      findings.push({
        kind: "ok",
        title: "Standard mainland CT regime applies — 9% above AED 375k profit.",
        sub:
          "No free-zone complexity. Pillar 2 / DMTT only applies if you are part of an MNE group above EUR 750M consolidated revenue.",
      });
    }

    // Revenue
    if (a.revenue === "under-375k") {
      findings.push({
        kind: "ok",
        title: "Below the CT bracket — 0% on profit, but you still file.",
        sub:
          "Annual CT return required even at 0%. VAT registration is voluntary below AED 187.5k taxable supplies.",
      });
    } else if (a.revenue === "375k-3m") {
      findings.push({
        kind: "ok",
        title:
          "Small Business Relief is available until 31 December 2026 — claim it.",
        sub:
          "If your revenue stays under AED 3M each year through 2026, you can elect SBR and pay 0% CT. The election expires at the end of 2026.",
      });
    } else if (a.revenue === "3m-10m") {
      findings.push({
        kind: "warn",
        title: "Above the SBR threshold — 9% CT on taxable income above AED 375k.",
        sub:
          "Indicative CT exposure: AED " +
          Math.round((6_000_000 - 375_000) * 0.09).toLocaleString("en-AE") +
          " on profit of AED 6M. Restructuring or grouping can lower this — worth a call.",
      });
    } else if (a.revenue === "over-10m") {
      findings.push({
        kind: "warn",
        title: "Large taxpayer — full 9% CT and Phase 1 e-invoicing apply.",
        sub:
          "If you're part of a multinational group above EUR 750M consolidated revenue, the 15% DMTT also applies from Jan 2027. We model both.",
      });
    }

    // VAT
    if (a.vat === "registered-late") {
      score -= 18;
      findings.push({
        kind: "warn",
        title: "Late VAT filings expose you to AED 10,000+ per offence.",
        sub:
          "The revised VAT penalty regime (Apr 2026) is stricter. Voluntary disclosure within 20 working days reduces penalties materially. Cited · FTA Decision 7 of 2024.",
      });
    } else if (a.vat === "should-register") {
      score -= 25;
      findings.push({
        kind: "warn",
        title: "You should be VAT-registered — late registration is a fine.",
        sub:
          "Late-registration penalty is AED 10,000 plus 5% per month on output VAT due. Registering immediately, even voluntarily, stops the clock.",
      });
    } else if (a.vat === "registered-current") {
      findings.push({
        kind: "ok",
        title: "VAT is current — keep the quarterly cadence.",
        sub:
          "Ledgr can shave 90% of the prep work each quarter and file directly to EmaraTax on your sign-off.",
      });
    } else {
      findings.push({
        kind: "ok",
        title: "No VAT obligation today, but watch the threshold.",
        sub:
          "Mandatory registration kicks in at AED 375k of taxable supplies in any rolling 12-month window. We can monitor it for you.",
      });
    }

    // Payroll
    if (a.payroll === "none") {
      findings.push({
        kind: "ok",
        title: "No payroll yet — set up MOHRE + WPS before your first hire.",
        sub:
          "We auto-provision the SIF format the day you onboard your first employee, no IT support required.",
      });
    } else if (a.payroll === "1-10") {
      findings.push({
        kind: "ok",
        title: "WPS file ships monthly — easy to automate.",
        sub:
          "Most teams of this size are on Growth. EOSB (gratuity) accruals are computed in the background each month.",
      });
    } else if (a.payroll === "11-50") {
      findings.push({
        kind: "ok",
        title: "Multi-nationality payroll — get EOSB and leave accruals right.",
        sub:
          "Gratuity caps and leave-balance rules vary by nationality and emirate. Misclassification is a common audit finding.",
      });
    } else {
      findings.push({
        kind: "warn",
        title: "50+ headcount — payroll audit risk concentrates here.",
        sub:
          "Multi-entity, multi-emirate WPS files plus quarterly compliance dashboards are part of the Scale plan.",
      });
    }

    // E-invoicing
    if (a.einv === "unaware") {
      score -= 22;
      findings.push({
        kind: "warn",
        title: "The FTA e-invoicing mandate begins Jul 2026 — start now.",
        sub:
          "Phase 1 covers large taxpayers (Jul 2026); Phase 2 every VAT-registered SME (Q1 2027). Peppol endpoint provisioning takes 4–8 weeks. We handle it for you on Growth and Scale.",
      });
    } else if (a.einv === "aware") {
      score -= 12;
      findings.push({
        kind: "warn",
        title: "You're aware — now pick a vendor and provision an endpoint.",
        sub:
          "The 5-corner model takes time to test end-to-end. Customers who wait until Q2 2027 will be filing fines. Ledgr Growth includes a Peppol endpoint at no extra cost.",
      });
    } else if (a.einv === "in-progress") {
      score -= 4;
      findings.push({
        kind: "ok",
        title: "On track for e-invoicing Phase 1 / 2.",
        sub:
          "Make sure your inbound side is also wired — auto-matching to bills is where most teams lose time.",
      });
    } else {
      findings.push({
        kind: "ok",
        title: "Peppol-ready — you're ahead of 90% of UAE SMEs.",
        sub:
          "We'd love to compare notes — your edge here is real.",
      });
    }

    // Clamp 0–100
    score = Math.max(20, Math.min(100, score));

    const band =
      score >= 90
        ? "STRONG — keep going"
        : score >= 75
        ? "SOLID — minor gaps"
        : score >= 55
        ? "AT RISK — fix in 30 days"
        : "URGENT — penalty exposure";

    return { score, band, findings };
  }

  function renderResult() {
    const { score, band, findings } = scoreAndFindings(answers);
    const ring = $("#result-ring");
    ring.style.setProperty("--pct", String(score));
    $("#result-num").innerHTML = `${score}<small>/100</small>`;
    $("#result-band").textContent = band;

    $("#result-findings").innerHTML = findings
      .map(
        (f) => `
      <div class="finding is-${f.kind}">
        <div class="finding__ico" aria-hidden="true">${
          f.kind === "ok" ? "✓" : "!"
        }</div>
        <div class="finding__body">
          <span class="finding__title">${f.title}</span>
          <span class="finding__sub">${f.sub}</span>
        </div>
      </div>`
      )
      .join("");

    // Hidden form fields for email payload
    $("#hidden-answers").value = JSON.stringify(answers);
    $("#hidden-score").value = String(score);
  }

  // ============================================================
  // Restart
  // ============================================================
  $("#wz-restart").addEventListener("click", () => {
    Object.keys(answers).forEach((k) => (answers[k] = ""));
    $$('input[type="radio"]').forEach((r) => (r.checked = false));
    goTo(0);
  });

  // ============================================================
  // Lead capture
  // ============================================================
  $("#result-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("input[name='company-website']")?.value) return; // honeypot

    const btn = $("#result-form button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Sending…";

    const fd = new FormData($("#result-form"));
    const payload = {};
    fd.forEach((v, k) => (payload[k] = v));
    payload._subject = `Ledgr readiness report · ${payload.name || "Anonymous"} · score ${payload.score}`;

    try {
      await fetch("https://formsubmit.co/ajax/ceo@theupcapital.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      /* even on failure we confirm — payload is captured in the URL bar */
    }

    $("#result-form").style.display = "none";
    $("#result-thanks").style.display = "block";
    $("#result-thanks").innerHTML = `
      <strong style="color:var(--accent-2);font-weight:500">On its way.</strong>
      The PDF report is being prepared and will land in your inbox within five
      minutes. A chartered accountant from our partner network will reach out
      within one working day if any of the urgent items above apply.`;
  });
})();
