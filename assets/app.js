/* ============================================================
   Ledgr — micro-interactions
   - sticky-nav shadow on scroll
   - reveal on scroll
   - tabs (dashboard)
   - ⌘K focuses the dashboard search
   - waitlist form: persisted, accessible success state,
     posts to Netlify Forms if deployed there, otherwise
     gracefully simulates success and stores locally
   - UAE Pass authentication: mock OAuth flow, JWT tokens,
     session management, logout
   - Corgi animation enhancements: infinite carousel support,
     hardware-accelerated transforms, smooth looping
   ============================================================ */

/* ============================================================
   ANIMATION MODULE - Carousel & Scroll Reveal Helpers
   Provides hardware-accelerated infinite carousel animations
   and enhanced scroll-reveal support for dynamic content
   ============================================================ */
const AnimationModule = (() => {
  /**
   * Initialize infinite carousel animation
   * Adds CSS animation and hardware acceleration to carousel elements
   * @param {string} selector - CSS selector for carousel containers
   * @param {number} duration - Animation duration in seconds (default: 60)
   */
  function initCarousel(selector = ".carousel-infinite", duration = 60) {
    const carousels = document.querySelectorAll(selector);
    if (carousels.length === 0) {
      console.log("[Animation] No carousel elements found");
      return;
    }

    carousels.forEach((carousel) => {
      // Apply hardware acceleration
      carousel.style.transform = "translateZ(0)";
      carousel.style.willChange = "transform";
      
      // Add animation class with duration
      carousel.style.animation = `carousel-infinite ${duration}s linear infinite`;
      
      console.log(
        `[Animation] Carousel initialized: ${selector} (${duration}s duration)`
      );
    });

    // Inject CSS animation if not already present
    if (!document.getElementById("carousel-animation-styles")) {
      const style = document.createElement("style");
      style.id = "carousel-animation-styles";
      style.textContent = `
        @keyframes carousel-infinite {
          0% {
            transform: translateX(0) translateZ(0);
          }
          100% {
            transform: translateX(-100%) translateZ(0);
          }
        }
        
        @keyframes carousel-infinite-rtl {
          0% {
            transform: translateX(0) translateZ(0);
          }
          100% {
            transform: translateX(100%) translateZ(0);
          }
        }
      `;
      document.head.appendChild(style);
      console.log("[Animation] Carousel animation styles injected");
    }
  }

  /**
   * Initialize enhanced scroll-reveal for carousel sections
   * Supports both static reveal and infinite carousel animations
   * @param {string} revealSelector - CSS selector for reveal elements
   * @param {string} carouselSelector - CSS selector for carousel elements (optional)
   */
  function initScrollReveal(revealSelector = ".reveal", carouselSelector = null) {
    if (!("IntersectionObserver" in window)) {
      console.log("[Animation] IntersectionObserver not supported, adding is-in to all reveals");
      document
        .querySelectorAll(revealSelector)
        .forEach((el) => el.classList.add("is-in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            // Don't unobserve carousels — they may need to loop
            if (!e.target.matches(carouselSelector || ".carousel-infinite")) {
              io.unobserve(e.target);
            }
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(revealSelector).forEach((el) => io.observe(el));
    console.log(
      `[Animation] Scroll-reveal initialized for ${revealSelector}`
    );
  }

  /**
   * Pause/resume carousel animation
   * Useful for hover states or user interactions
   * @param {string} selector - CSS selector for carousel
   * @param {boolean} paused - True to pause, false to resume
   */
  function toggleCarouselPause(selector, paused = true) {
    document.querySelectorAll(selector).forEach((carousel) => {
      carousel.style.animationPlayState = paused ? "paused" : "running";
    });
  }

  // Public API
  return {
    initCarousel,
    initScrollReveal,
    toggleCarouselPause,
  };
})();

/* ============================================================
   STORAGE MODULE - Persistent localStorage with fallback
   Provides safe localStorage access with verification
   ============================================================ */
const StorageModule = (() => {
  /**
   * Check if localStorage is available and functional
   */
  function isAvailable() {
    try {
      const test = "__ledgr_storage_test__";
      localStorage.setItem(test, "1");
      localStorage.removeItem(test);
      return true;
    } catch (err) {
      console.warn("[Storage] localStorage unavailable:", err);
      return false;
    }
  }

  /**
   * Safely get item from localStorage
   */
  function getItem(key, fallback = null) {
    try {
      if (!isAvailable()) return fallback;
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (err) {
      console.warn(`[Storage] Failed to get ${key}:`, err);
      return fallback;
    }
  }

  /**
   * Safely set item in localStorage
   */
  function setItem(key, value) {
    try {
      if (!isAvailable()) return false;
      localStorage.setItem(key, JSON.stringify(value));
      console.log(`[Storage] Set ${key}`);
      return true;
    } catch (err) {
      console.warn(`[Storage] Failed to set ${key}:`, err);
      return false;
    }
  }

  /**
   * Safely remove item from localStorage
   */
  function removeItem(key) {
    try {
      if (!isAvailable()) return false;
      localStorage.removeItem(key);
      console.log(`[Storage] Removed ${key}`);
      return true;
    } catch (err) {
      console.warn(`[Storage] Failed to remove ${key}:`, err);
      return false;
    }
  }

  return {
    isAvailable,
    getItem,
    setItem,
    removeItem,
  };
})();

/* ============================================================
   AUTHENTICATION MODULE (UAE Pass + Session Management)
   ============================================================ */
const AuthModule = (() => {
  // Configuration
  const CONFIG = {
    STORAGE_KEY_TOKEN: "auth_token",
    STORAGE_KEY_USER: "auth_user",
    TOKEN_EXPIRY_MS: 3600000, // 1 hour in milliseconds
    MOCK_JWT: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2MjAwMDAwMDAwMDAwMDAwMDEiLCJlbnRpdHlfbmFtZSI6IkFjbWUgQ29uc3VsdGluZ3MgTExDIiwidHJhZGVfbGljZW5jZV9udW0iOiJUTEMvMjAyNS8wMDEyMzQ1NiIsImVtYWlsIjoiY2VvQGFjbWVjb25zdWx0aW5ncy5hZSIsImlhdCI6MTcxNzIyODgwMCwiZXhwIjoxNzE3MjMyNDAwfQ",
    UI_ELEMENTS: {
      displaySpan: "#auth-user-display",
      loginBtn: "#auth-login-btn",
      logoutBtn: "#auth-logout-btn",
      authContainer: "#auth-container",
      onboardingContainer: ".onb",
    },
  };

  /**
   * Mock JWT decoder - extracts claims without verification
   * In production, this would verify the signature with a public key
   */
  function decodeToken(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid token format");
      
      // Decode payload (second part)
      const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(payload);
    } catch (err) {
      console.warn("[Auth] Failed to decode token:", err);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  function isTokenExpired(decodedToken) {
    if (!decodedToken || !decodedToken.exp) return true;
    const expiryTime = decodedToken.exp * 1000; // Convert to milliseconds
    return Date.now() > expiryTime;
  }

  /**
   * Retrieve stored auth token from localStorage
   */
  function getStoredToken() {
    return StorageModule.getItem(CONFIG.STORAGE_KEY_TOKEN);
  }

  /**
   * Retrieve stored user data from localStorage
   */
  function getStoredUser() {
    return StorageModule.getItem(CONFIG.STORAGE_KEY_USER);
  }

  /**
   * Store token in localStorage
   */
  function storeToken(token, expiresAt) {
    StorageModule.setItem(CONFIG.STORAGE_KEY_TOKEN, token);
    StorageModule.setItem("auth_token_expires_at", expiresAt);
    console.log("[Auth] Token stored successfully, expires at:", new Date(expiresAt).toISOString());
  }

  /**
   * Store user data in localStorage
   */
  function storeUser(userData) {
    StorageModule.setItem(CONFIG.STORAGE_KEY_USER, userData);
    console.log("[Auth] User data stored:", userData.entity_name);
  }

  /**
   * Extract and normalize user info from decoded token
   */
  function extractUserFromToken(decodedToken) {
    if (!decodedToken) return null;
    return {
      entity_name: decodedToken.entity_name || "Unknown",
      trade_licence_num: decodedToken.trade_licence_num || "N/A",
      email: decodedToken.email || "",
      sub: decodedToken.sub || "",
    };
  }

  /**
   * Simulate UAE Pass OAuth redirect flow
   */
  async function simulateUAEPassFlow() {
    console.log("[Auth] Starting UAE Pass mock flow...");
    
    const displayMsg = (msg) => {
      const display = document.querySelector(CONFIG.UI_ELEMENTS.displaySpan);
      if (display) {
        display.textContent = msg;
      }
    };
    
    displayMsg("Redirecting to UAE Pass...");
    
    // Simulate 2-second redirect delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate expiry time: now + 1 hour
    const expiresAt = Date.now() + CONFIG.TOKEN_EXPIRY_MS;
    
    // Store token and user data
    storeToken(CONFIG.MOCK_JWT, expiresAt);
    
    // Decode and extract user info
    const decodedToken = decodeToken(CONFIG.MOCK_JWT);
    const userData = extractUserFromToken(decodedToken);
    storeUser(userData);
    
    console.log("[Auth] Mock UAE Pass flow complete, user authenticated:", userData);
    
    // Update UI state
    updateAuthUI();
  }

  /**
   * Logout: Clear token and user data
   */
  function logout() {
    console.log("[Auth] Logging out...");
    StorageModule.removeItem(CONFIG.STORAGE_KEY_TOKEN);
    StorageModule.removeItem(CONFIG.STORAGE_KEY_USER);
    StorageModule.removeItem("auth_token_expires_at");
    updateAuthUI();
  }

  /**
   * Check current auth state
   */
  function getAuthState() {
    const token = getStoredToken();
    
    if (!token) {
      console.log("[Auth] No token found");
      return { isAuthenticated: false, user: null, token: null };
    }
    
    const decoded = decodeToken(token);
    if (!decoded) {
      console.log("[Auth] Token decode failed");
      return { isAuthenticated: false, user: null, token: null };
    }
    
    if (isTokenExpired(decoded)) {
      console.log("[Auth] Token expired");
      logout();
      return { isAuthenticated: false, user: null, token: null, expired: true };
    }
    
    const user = getStoredUser() || extractUserFromToken(decoded);
    console.log("[Auth] User authenticated:", user.entity_name);
    
    return {
      isAuthenticated: true,
      user,
      token,
      expiresAt: decoded.exp ? decoded.exp * 1000 : null,
    };
  }

  /**
   * Update UI based on auth state
   */
  function updateAuthUI() {
    const state = getAuthState();
    const display = document.querySelector(CONFIG.UI_ELEMENTS.displaySpan);
    const loginBtn = document.querySelector(CONFIG.UI_ELEMENTS.loginBtn);
    const logoutBtn = document.querySelector(CONFIG.UI_ELEMENTS.logoutBtn);
    const onboardingContainer = document.querySelector(CONFIG.UI_ELEMENTS.onboardingContainer);
    
    if (state.isAuthenticated && state.user) {
      // User is logged in
      if (display) {
        display.textContent = `Logged in as: ${state.user.entity_name}`;
        display.classList.add("is-authenticated");
        display.classList.remove("is-unauthenticated");
      }
      if (loginBtn) loginBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "inline-block";
      if (onboardingContainer) onboardingContainer.style.display = "grid";
      
      // Pre-populate Step 1 with user entity name (if field exists)
      const entityNameField = document.querySelector("#step-1-entity-name");
      if (entityNameField) {
        entityNameField.value = state.user.entity_name;
      }
    } else {
      // User is not logged in
      if (display) {
        const msg = state.expired 
          ? "Session expired. Please re-authenticate."
          : "Please log in with UAE Pass";
        display.textContent = msg;
        display.classList.add("is-unauthenticated");
        display.classList.remove("is-authenticated");
      }
      if (loginBtn) loginBtn.style.display = "inline-block";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (onboardingContainer) onboardingContainer.style.display = "none";
    }
  }

  /**
   * Initialize auth system on page load
   */
  function init() {
    console.log("[Auth] Initializing authentication module...");
    
    const state = getAuthState();
    
    if (state.isAuthenticated) {
      console.log("[Auth] User already authenticated from previous session");
    } else {
      console.log("[Auth] No active session - user must authenticate");
    }
    
    // Update UI to reflect current auth state
    updateAuthUI();
    
    // Attach login button handler
    const loginBtn = document.querySelector(CONFIG.UI_ELEMENTS.loginBtn);
    if (loginBtn) {
      loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        simulateUAEPassFlow();
      });
      console.log("[Auth] Login button handler attached");
    }
    
    // Attach logout button handler
    const logoutBtn = document.querySelector(CONFIG.UI_ELEMENTS.logoutBtn);
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
      });
      console.log("[Auth] Logout button handler attached");
    }
    
    // Check token expiry periodically (every minute)
    setInterval(() => {
      const currentState = getAuthState();
      if (!currentState.isAuthenticated) {
        updateAuthUI();
      } else if (currentState.expiresAt) {
        const minutesLeft = Math.floor((currentState.expiresAt - Date.now()) / 60000);
        if (minutesLeft <= 5) {
          console.warn(`[Auth] Token expires in ${minutesLeft} minutes`);
        }
      }
    }, 60000);
    
    console.log("[Auth] Module initialized");
  }

  // Public API
  return {
    init,
    getAuthState,
    logout,
    simulateUAEPassFlow,
    updateAuthUI,
  };
})();

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
      if (link.getAttribute('aria-current') === 'page') {
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

  /* ---------- Carousel animation initialization ---------- */
  // Initialize infinite carousel animations on page load
  document.addEventListener("DOMContentLoaded", () => {
    // Initialize carousels for customers, guides, logos sections
    AnimationModule.initCarousel(".carousel-infinite", 60);
    
    // Pause carousel on hover
    document.querySelectorAll(".carousel-infinite").forEach((carousel) => {
      carousel.addEventListener("mouseenter", () => {
        AnimationModule.toggleCarouselPause(".carousel-infinite", true);
      });
      carousel.addEventListener("mouseleave", () => {
        AnimationModule.toggleCarouselPause(".carousel-infinite", false);
      });
    });
    
    console.log("[App] Carousel animations initialized");
  });

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
      const prior = StorageModule.getItem(STORAGE_KEY);
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
      StorageModule.setItem(STORAGE_KEY, data);

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
        StorageModule.setItem(STORAGE_KEY, data);
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

    [
      "clients",
      "plan",
      "months",
    ].forEach((k) =>
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


/* ============================================================
   Onboarding State Management
   Core state management layer for the 4-step onboarding wizard.
   Tracks: current step, step data, visibility, progress bar.
   ============================================================ */
(() => {
  const STORAGE_KEY = "onb_current_step";
  const DATA_PREFIX = "onb_data_";
  const TOTAL_STEPS = 4;
  let currentStep = 1;

  /**
   * Initialize onboarding state: detect current step from localStorage,
   * hide all steps except current one, update progress bar.
   */
  const init = () => {
    // Restore step from localStorage or default to 1
    const saved = StorageModule.getItem(STORAGE_KEY);
    if (saved && !isNaN(parseInt(saved))) {
      currentStep = Math.max(1, Math.min(TOTAL_STEPS, parseInt(saved)));
    } else {
      currentStep = 1;
    }

    console.log(`[Onboarding] Initialized at step ${currentStep}`);

    // Set up step visibility and progress
    updateStepVisibility();
    updateProgressBar();
    setupEventListeners();
  };

  /**
   * Hide all steps except the current one.
   */
  const updateStepVisibility = () => {
    const steps = document.querySelectorAll('[data-onb-step]');
    steps.forEach((step) => {
      const stepNum = parseInt(step.getAttribute('data-onb-step'));
      if (stepNum === currentStep) {
        step.style.display = '';
        console.log(`[Onboarding] Showing step ${stepNum}`);
      } else {
        step.style.display = 'none';
      }
    });
  };

  /**
   * Update progress bar text and width.
   * Format: "Step X of 4 · Y%"
   */
  const updateProgressBar = () => {
    const progressEl = document.querySelector('.onb__progress');
    const barEl = document.querySelector('.onb-bar span');

    if (progressEl) {
      const percent = Math.round((currentStep / TOTAL_STEPS) * 100);
      progressEl.textContent = `Step ${currentStep} of ${TOTAL_STEPS} · ${percent}%`;
      console.log(`[Onboarding] Progress: ${progressEl.textContent}`);
    }

    if (barEl) {
      const percent = (currentStep / TOTAL_STEPS) * 100;
      barEl.style.width = `${percent}%`;
    }
  };

  /**
   * Navigate to a specific step, updating visibility and progress.
   * Persists step to localStorage.
   */
  const goToStep = (stepNum) => {
    stepNum = Math.max(1, Math.min(TOTAL_STEPS, stepNum));
    if (stepNum === currentStep) return;

    currentStep = stepNum;
    StorageModule.setItem(STORAGE_KEY, currentStep);
    console.log(`[Onboarding] Navigated to step ${currentStep}`);

    updateStepVisibility();
    updateProgressBar();
  };

  /**
   * Save data for a specific step to localStorage.
   * Key format: onb_data_<stepNum>
   */
  const setStepData = (stepNum, data) => {
    const key = `${DATA_PREFIX}${stepNum}`;
    StorageModule.setItem(key, data);
    console.log(`[Onboarding] Saved data for step ${stepNum}:`, data);
  };

  /**
   * Retrieve saved data for a specific step.
   */
  const getStepData = (stepNum) => {
    const key = `${DATA_PREFIX}${stepNum}`;
    const data = StorageModule.getItem(key);
    if (data) {
      console.log(`[Onboarding] Retrieved data for step ${stepNum}:`, data);
      return data;
    }
    return null;
  };

  /**
   * Set up event listeners for:
   * - Step completion events (step<N>:complete)
   * - Back button
   * - Continue button
   */
  const setupEventListeners = () => {
    // Listen for step completion events
    document.addEventListener('step1:complete', handleStep1Complete);
    document.addEventListener('step2:complete', handleStep2Complete);
    document.addEventListener('step3:complete', handleStep3Complete);
    document.addEventListener('step4:complete', handleStep4Complete);

    // Back button: navigate to previous step
    const backBtn = document.querySelector('button[type="button"]:first-child');
    if (backBtn && backBtn.textContent.includes('Back')) {
      backBtn.addEventListener('click', () => {
        console.log('[Onboarding] Back button clicked');
        goToStep(currentStep - 1);
      });
    }
  };

  /**
   * Handle step 1 completion.
   * Save data, auto-advance to step 2.
   */
  const handleStep1Complete = (e) => {
    console.log('[Onboarding] Step 1 complete event received');
    if (e.detail) {
      setStepData(1, e.detail);
    }
    goToStep(2);
  };

  /**
   * Handle step 2 completion.
   * Save bank selection data, show step 3, start loading animation.
   */
  const handleStep2Complete = (e) => {
    console.log('[Onboarding] Step 2 complete event received');
    if (e.detail) {
      setStepData(2, e.detail);
    }
    // Start loading animation if element exists
    const loadingEl = document.querySelector('[data-onb-step="3"] .loading');
    if (loadingEl) {
      loadingEl.classList.add('is-active');
      console.log('[Onboarding] Started loading animation for step 3');
    }
    goToStep(3);
  };

  /**
   * Handle step 3 completion.
   * Save classification data, advance to step 4.
   */
  const handleStep3Complete = (e) => {
    console.log('[Onboarding] Step 3 complete event received');
    if (e.detail) {
      setStepData(3, e.detail);
    }
    goToStep(4);
  };

  /**
   * Handle step 4 completion.
   * Show "Onboarding complete!" message, offer "Go to dashboard" CTA.
   */
  const handleStep4Complete = (e) => {
    console.log('[Onboarding] Step 4 complete event received');
    if (e.detail) {
      setStepData(4, e.detail);
    }

    // Show completion message
    const step4El = document.querySelector('[data-onb-step="4"]');
    if (step4El) {
      const completionMsg = document.createElement('div');
      completionMsg.className = 'onb-completion';
      completionMsg.innerHTML = `
        <div style="text-align: center; padding: 48px 24px;">
          <h3 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">
            Onboarding complete!
          </h3>
          <p style="color: rgba(0,0,0,0.6); margin-bottom: 32px;">
            Your baseline tax position is ready. Your dedicated accountant will
            reach out within one working day to schedule your first review.
          </p>
          <a href="app.html" class="btn btn--primary" style="display: inline-block;">
            Go to dashboard
          </a>
        </div>
      `;
      step4El.replaceChildren(completionMsg);
      console.log('[Onboarding] Displayed completion message');
    }
  };

  // Expose module to window for external access
  window.OnboardingState = {
    goToStep,
    getStepData,
    setStepData,
    getCurrentStep: () => currentStep,
  };

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ============================================================
   Initialize Auth Module on Page Load
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof AuthModule !== 'undefined') {
    AuthModule.init();
  }
});

/* ============================================================
   ONBOARDING VISUAL POLISH HELPERS
   Loading spinners, transitions, modals, error & success states
   ============================================================ */

const OnboardingUI = (() => {
  let activeModal = null;
  let loaderInterval = null;

  /**
   * Show loading spinner with progress
   * @param {number} duration - Duration in seconds
   * @param {string} label - Optional label text
   * @returns {Promise<void>}
   */
  function showLoader(duration, label = 'Processing') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay visible';
      overlay.id = 'loader-modal';

      const content = document.createElement('div');
      content.className = 'modal-content';
      content.innerHTML = `
        <div class="loading-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-percent" id="progress-percent">0%</div>
          <div class="spinner-label">${label}</div>
          <div class="spinner-time" id="remaining-time">Loading...</div>
        </div>
      `;

      overlay.appendChild(content);
      document.body.appendChild(overlay);
      activeModal = overlay;

      const percentEl = content.querySelector('#progress-percent');
      const timeEl = content.querySelector('#remaining-time');

      let elapsed = 0;
      const durationMs = duration * 1000;
      const interval = 100;

      loaderInterval = setInterval(() => {
        elapsed += interval;
        const percent = Math.min(Math.round((elapsed / durationMs) * 100), 99);
        const remaining = Math.max(Math.ceil((durationMs - elapsed) / 1000), 0);

        percentEl.textContent = `${percent}%`;
        timeEl.textContent = `${remaining}s remaining`;

        if (elapsed >= durationMs) {
          clearInterval(loaderInterval);
          percentEl.textContent = '100%';
          timeEl.textContent = 'Complete';

          setTimeout(() => {
            hideLoader();
            resolve();
          }, 300);
        }
      }, interval);

      // Close on ESC
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          clearInterval(loaderInterval);
          hideLoader();
          document.removeEventListener('keydown', handleEsc);
          resolve();
        }
      };
      document.addEventListener('keydown', handleEsc);
    });
  }

  /**
   * Hide the active loader
   */
  function hideLoader() {
    if (loaderInterval) {
      clearInterval(loaderInterval);
      loaderInterval = null;
    }
    if (activeModal && activeModal.id === 'loader-modal') {
      activeModal.classList.remove('visible');
      setTimeout(() => {
        activeModal?.remove();
        activeModal = null;
      }, 300);
    }
  }

  /**
   * Show confirmation modal
   * @param {string} title - Modal title
   * @param {Object} data - Key-value pairs to display
   * @param {Function} onConfirm - Callback for proceed button
   * @param {Function} onEdit - Callback for edit button
   * @returns {Promise<void>}
   */
  function showConfirmation(title, data, onConfirm, onEdit) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay visible';
      overlay.id = 'confirm-modal';

      const dataHtml = Object.entries(data)
        .map(
          ([key, value]) =>
            `<div class="confirm-screen__item">
            <span class="confirm-screen__label">${key}</span>
            <span class="confirm-screen__value">${value}</span>
          </div>`
        )
        .join('');

      const content = document.createElement('div');
      content.className = 'modal-content';
      content.innerHTML = `
        <div class="confirm-screen">
          <div class="confirm-screen__header">
            <h2 class="confirm-screen__title">${title}</h2>
            <p class="confirm-screen__subtitle">Please review your selection</p>
          </div>
          <div class="confirm-screen__data">
            ${dataHtml}
          </div>
          <div class="confirm-screen__actions">
            <button class="confirm-screen__proceed">Proceed to next step</button>
            <button class="confirm-screen__edit">Edit selection</button>
          </div>
        </div>
      `;

      overlay.appendChild(content);
      document.body.appendChild(overlay);
      activeModal = overlay;

      const proceedBtn = content.querySelector('.confirm-screen__proceed');
      const editBtn = content.querySelector('.confirm-screen__edit');

      proceedBtn.addEventListener('click', () => {
        hideConfirmation();
        if (onConfirm) onConfirm();
        resolve();
      });

      editBtn.addEventListener('click', () => {
        hideConfirmation();
        if (onEdit) onEdit();
        resolve();
      });

      // Close on ESC
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          hideConfirmation();
          document.removeEventListener('keydown', handleEsc);
          resolve();
        }
      };
      document.addEventListener('keydown', handleEsc);
    });
  }

  /**
   * Hide confirmation modal
   */
  function hideConfirmation() {
    if (activeModal && activeModal.id === 'confirm-modal') {
      activeModal.classList.remove('visible');
      setTimeout(() => {
        activeModal?.remove();
        activeModal = null;
      }, 300);
    }
  }

  /**
   * Show error alert/dialog
   * @param {string} message - Error message
   * @param {Function} onRetry - Callback for retry button
   * @param {boolean} asModal - Show as modal instead of inline alert
   * @returns {Promise<void>}
   */
  function showError(message, onRetry, asModal = true) {
    return new Promise((resolve) => {
      if (asModal) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay visible';
        overlay.id = 'error-modal';

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.innerHTML = `
          <div class="error-dialog">
            <div class="error-dialog__icon">⚠️</div>
            <h2 class="error-dialog__title">Something went wrong</h2>
            <p class="error-dialog__message">${message}</p>
            <div class="error-dialog__actions">
              <button class="error-dialog__retry">Try again</button>
              <a href="mailto:support@ledgr.ae" class="error-dialog__support">Contact support</a>
            </div>
          </div>
        `;

        overlay.appendChild(content);
        document.body.appendChild(overlay);
        activeModal = overlay;

        const retryBtn = content.querySelector('.error-dialog__retry');
        retryBtn.addEventListener('click', () => {
          hideError();
          if (onRetry) onRetry();
          resolve();
        });

        // Close on ESC
        const handleEsc = (e) => {
          if (e.key === 'Escape') {
            hideError();
            document.removeEventListener('keydown', handleEsc);
            resolve();
          }
        };
        document.addEventListener('keydown', handleEsc);
      } else {
        // Inline alert
        const container = document.createElement('div');
        container.className = 'error-alert';
        container.innerHTML = `
          <h3 class="error-alert__title">Error</h3>
          <p class="error-alert__message">${message}</p>
          <div class="error-alert__actions">
            <button class="error-alert__retry">Retry</button>
            <a href="mailto:support@ledgr.ae" class="error-alert__support">Support</a>
          </div>
        `;

        const targetStep = document.querySelector('[data-onb-step].active');
        if (targetStep) {
          targetStep.insertAdjacentElement('afterbegin', container);
        } else {
          document.body.insertAdjacentElement('afterbegin', container);
        }

        const retryBtn = container.querySelector('.error-alert__retry');
        retryBtn.addEventListener('click', () => {
          container.remove();
          if (onRetry) onRetry();
          resolve();
        });
      }
    });
  }

  /**
   * Hide error modal
   */
  function hideError() {
    if (activeModal && activeModal.id === 'error-modal') {
      activeModal.classList.remove('visible');
      setTimeout(() => {
        activeModal?.remove();
        activeModal = null;
      }, 300);
    }
  }

  /**
   * Show success/completion screen
   * @param {string} title - Title text
   * @param {string} subtitle - Subtitle/message
   * @param {string} ctaText - CTA button text
   * @param {Function} onCta - Callback for CTA button
   * @param {number} redirectDelay - Auto-redirect delay in seconds (0 = disabled)
   * @returns {Promise<void>}
   */
  function showSuccess(
    title = 'Onboarding complete!',
    subtitle = 'Your accountant will contact you within 24 hours',
    ctaText = 'Go to dashboard',
    onCta = () => (window.location.href = 'app.html'),
    redirectDelay = 0
  ) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay visible';
      overlay.id = 'success-modal';
      overlay.style.pointerEvents = 'none'; // Prevent closing on click

      const content = document.createElement('div');
      content.className = 'modal-content';
      content.style.pointerEvents = 'auto'; // Re-enable for content
      content.innerHTML = `
        <div class="success-screen">
          <div class="success-screen__checkmark">✓</div>
          <h1 class="success-screen__title">${title}</h1>
          <p class="success-screen__subtitle">${subtitle}</p>
          <p class="success-screen__message">
            You can access your dashboard anytime to review classifications,
            export reports, and collaborate with your accountant.
          </p>
          <button class="success-screen__cta">${ctaText}</button>
          ${redirectDelay > 0 ? `<div class="success-screen__countdown">Redirecting in <span id="redirect-count">${redirectDelay}</span>s...</div>` : ''}
        </div>
      `;

      overlay.appendChild(content);
      document.body.appendChild(overlay);
      activeModal = overlay;

      const ctaBtn = content.querySelector('.success-screen__cta');
      ctaBtn.addEventListener('click', () => {
        hideSuccess();
        if (onCta) onCta();
        resolve();
      });

      // Auto-redirect countdown
      if (redirectDelay > 0) {
        let remaining = redirectDelay;
        const countdownEl = content.querySelector('#redirect-count');

        const countdown = setInterval(() => {
          remaining--;
          if (countdownEl) countdownEl.textContent = remaining;

          if (remaining <= 0) {
            clearInterval(countdown);
            hideSuccess();
            if (onCta) onCta();
            resolve();
          }
        }, 1000);
      }

      // Allow ESC to close (unlike loader/confirm)
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          hideSuccess();
          document.removeEventListener('keydown', handleEsc);
          resolve();
        }
      };
      document.addEventListener('keydown', handleEsc);
    });
  }

  /**
   * Hide success screen
   */
  function hideSuccess() {
    if (activeModal && activeModal.id === 'success-modal') {
      activeModal.classList.remove('visible');
      setTimeout(() => {
        activeModal?.remove();
        activeModal = null;
      }, 300);
    }
  }

  /**
   * Transition between steps with fade animation
   * @param {HTMLElement} fromEl - Element to fade out
   * @param {HTMLElement} toEl - Element to fade in
   * @returns {Promise<void>}
   */
  function transitionStep(fromEl, toEl) {
    return new Promise((resolve) => {
      if (!fromEl || !toEl) {
        resolve();
        return;
      }

      // Fade out current step
      fromEl.classList.add('step-transition-out');

      setTimeout(() => {
        fromEl.style.display = 'none';
        fromEl.classList.remove('step-transition-out');

        // Fade in next step
        toEl.style.display = 'block';
        toEl.classList.add('step-transition-in');

        setTimeout(() => {
          toEl.classList.remove('step-transition-in');
          resolve();
        }, 500);
      }, 200);
    });
  }

  /**
   * Close any active modal (for cleanup)
   */
  function closeActiveModal() {
    if (activeModal) {
      activeModal.classList.remove('visible');
      activeModal = null;
    }
    if (loaderInterval) {
      clearInterval(loaderInterval);
      loaderInterval = null;
    }
  }

  // Expose public API
  return {
    showLoader,
    hideLoader,
    showConfirmation,
    hideConfirmation,
    showError,
    hideError,
    showSuccess,
    hideSuccess,
    transitionStep,
    closeActiveModal,
  };
})();

// Make OnboardingUI globally accessible
window.OnboardingUI = OnboardingUI;

// Bank card selection interactivity
document.addEventListener('DOMContentLoaded', function() {
  const bankCards = document.querySelectorAll('.bank-card');
  
  bankCards.forEach(card => {
    card.addEventListener('click', function() {
      this.classList.toggle('is-selected');
      const selectedCount = document.querySelectorAll('.bank-card.is-selected').length;
      const callout = document.querySelector('.callout');
      if (callout) {
        callout.innerHTML = `<div><strong>${selectedCount} ${selectedCount === 1 ? 'bank' : 'banks'} selected.</strong> We'll pull 18 months of history and classify them in the next step. Estimated time: 90 seconds.</div>`;
      }
    });
    
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.click();
      }
    });
  });
});

// Step navigation and event handling
document.addEventListener('DOMContentLoaded', function() {
  const continueButtons = document.querySelectorAll('[id*="btn-step"][id*="continue"], [id*="btn-step"][id*="complete"]');
  const backButtons = document.querySelectorAll('[id*="btn-step"][id*="back"]');
  
  continueButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const stepContainer = this.closest('[data-onb-step]');
      if (stepContainer) {
        const currentStep = parseInt(stepContainer.dataset.onbStep);
        const eventName = `step${currentStep}:complete`;
        document.dispatchEvent(new CustomEvent(eventName, { 
          detail: { step: currentStep, timestamp: Date.now() }
        }));
      }
    });
  });
  
  backButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const stepContainer = this.closest('[data-onb-step]');
      if (stepContainer && window.OnboardingState) {
        const currentStep = parseInt(stepContainer.dataset.onbStep);
        if (currentStep > 1) {
          window.OnboardingState.goToStep(currentStep - 1);
        }
      }
    });
  });
  
  // Step 3: Simulate classification loading
  const step3Content = document.getElementById('step3-content');
  if (step3Content) {
    document.addEventListener('step2:complete', function() {
      setTimeout(() => {
        const loading = document.getElementById('step3-loading');
        const results = document.getElementById('step3-results');
        const progress = document.getElementById('step3-progress');
        const percent = document.getElementById('step3-percent');
        
        if (loading && results) {
          // Simulate progress
          let p = 0;
          const interval = setInterval(() => {
            p += Math.random() * 20;
            if (p > 100) p = 100;
            progress.style.width = p + '%';
            percent.textContent = Math.round(p);
            
            if (p >= 100) {
              clearInterval(interval);
              setTimeout(() => {
                loading.style.display = 'none';
                results.style.display = 'block';
                // Populate results
                const confirmed = document.getElementById('step3-confirmed');
                const flagged = document.getElementById('step3-flagged');
                if (confirmed) confirmed.textContent = '4,188';
                if (flagged) flagged.textContent = '12';
              }, 300);
            }
          }, 100);
        }
      }, 500);
    });
  }
  
  // Sample transaction data for Step 3
  const sampleTransactions = [
    { date: '2024-01-15', amount: 'AED 5,000', category: 'Revenue', confidence: 98, status: 'confirmed' },
    { date: '2024-01-18', amount: 'AED -500', category: 'Office Supplies', confidence: 72, status: 'flagged' },
    { date: '2024-01-22', amount: 'AED 3,500', category: 'Revenue', confidence: 96, status: 'confirmed' },
    { date: '2024-02-01', amount: 'AED -1,200', category: 'Software', confidence: 85, status: 'confirmed' },
    { date: '2024-02-05', amount: 'AED 2,100', category: 'Revenue', confidence: 55, status: 'flagged' },
    { date: '2024-02-10', amount: 'AED -350', category: 'Utilities', confidence: 91, status: 'confirmed' },
  ];
  
  const tableBody = document.getElementById('step3-table-body');
  if (tableBody) {
    sampleTransactions.forEach(tx => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--line)';
      if (tx.status === 'flagged') {
        row.style.backgroundColor = 'var(--accent-soft)';
      }
      row.innerHTML = `
        <td style="padding:12px 16px;color:var(--ink-1)">${tx.date}</td>
        <td style="padding:12px 16px;color:var(--ink-1);text-align:right;font-weight:500">${tx.amount}</td>
        <td style="padding:12px 16px;color:var(--ink-1)">${tx.category}</td>
        <td style="padding:12px 16px;text-align:center;color:var(--ink-2);font-size:13px">${tx.confidence}%</td>
        <td style="padding:12px 16px;text-align:center">
          <span style="display:inline-block;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${tx.status === 'flagged' ? 'var(--accent)' : 'var(--paper)'};color:${tx.status === 'flagged' ? 'white' : 'var(--ink-2)'}">
            ${tx.status === 'flagged' ? 'Flag' : 'OK'}
          </span>
        </td>
      `;
      tableBody.appendChild(row);
    });
  }
});
/* ============================================================
   STEP PROGRESS SYNC MODULE
   Synchronizes the progress rail (.onb__progress text and .onb-bar width)
   with step navigation and step indicator states (.onb-step elements)
   ============================================================ */
const StepProgressSync = (() => {
  const TOTAL_STEPS = 4;

  /**
   * Update progress rail text and bar width based on current step.
   * Format: "Step X of 4 · Y%" where Y = X * 25
   * @param {number} currentStep - Current step number (1-4)
   */
  function updateProgressRail(currentStep) {
    const progressEl = document.querySelector('.onb__progress');
    const barEl = document.querySelector('.onb-bar span');

    if (progressEl) {
      const percent = Math.round((currentStep / TOTAL_STEPS) * 100);
      progressEl.textContent = `Step ${currentStep} of ${TOTAL_STEPS} · ${percent}%`;
      console.log(`[Progress] Rail updated: Step ${currentStep} of ${TOTAL_STEPS} · ${percent}%`);
    }

    if (barEl) {
      const percent = (currentStep / TOTAL_STEPS) * 100;
      barEl.style.width = `${percent}%`;
      console.log(`[Progress] Bar width: ${percent}%`);
    }
  }

  /**
   * Update step indicator states (.onb-step elements).
   * - Remove .is-done and .is-active from all steps
   * - Add .is-done to steps 1 through currentStep-1
   * - Add .is-active to current step
   * @param {number} currentStep - Current step number (1-4)
   */
  function updateStepIndicators(currentStep) {
    const stepIndicators = document.querySelectorAll('.onb-step');

    if (stepIndicators.length === 0) {
      console.log('[Progress] No step indicators found (.onb-step)');
      return;
    }

    stepIndicators.forEach((indicator, index) => {
      const stepNum = index + 1;

      // Remove both classes first
      indicator.classList.remove('is-done', 'is-active');

      // Add appropriate classes
      if (stepNum < currentStep) {
        indicator.classList.add('is-done');
        console.log(`[Progress] Step ${stepNum}: marked as done`);
      } else if (stepNum === currentStep) {
        indicator.classList.add('is-active');
        console.log(`[Progress] Step ${stepNum}: marked as active`);
      } else {
        console.log(`[Progress] Step ${stepNum}: no special state`);
      }
    });
  }

  /**
   * Sync progress rail and step indicators on step change.
   * Called whenever OnboardingState.goToStep() is invoked.
   * @param {number} currentStep - Current step number (1-4)
   */
  function syncProgressOnStepChange(currentStep) {
    console.log(`[Progress] Syncing on step change to ${currentStep}`);
    updateProgressRail(currentStep);
    updateStepIndicators(currentStep);
  }

  /**
   * Initialize progress rail and indicators on page load.
   * Reads current step from localStorage via OnboardingState.getCurrentStep()
   */
  function init() {
    console.log('[Progress] Initializing StepProgressSync module');

    // Check if OnboardingState is available
    if (!window.OnboardingState) {
      console.warn('[Progress] OnboardingState not found, deferring init');
      // Try again when OnboardingState is ready
      const checkReady = setInterval(() => {
        if (window.OnboardingState) {
          clearInterval(checkReady);
          init();
        }
      }, 100);
      return;
    }

    // Get current step from OnboardingState
    const currentStep = window.OnboardingState.getCurrentStep();
    console.log(`[Progress] Current step from OnboardingState: ${currentStep}`);

    // Initialize rail and indicators
    syncProgressOnStepChange(currentStep);

    // Hook into step navigation
    // We'll wrap OnboardingState.goToStep to intercept calls
    const originalGoToStep = window.OnboardingState.goToStep;
    window.OnboardingState.goToStep = function(stepNum) {
      console.log(`[Progress] goToStep called with step ${stepNum}`);
      originalGoToStep.call(this, stepNum);
      // Sync after step change
      const newStep = this.getCurrentStep();
      syncProgressOnStepChange(newStep);
    };

    console.log('[Progress] Module initialized and hooked into OnboardingState');

    // Listen for step completion events and update rail
    document.addEventListener('step1:complete', () => {
      console.log('[Progress] Step 1 completion event detected');
      const newStep = window.OnboardingState.getCurrentStep();
      syncProgressOnStepChange(newStep);
    });

    document.addEventListener('step2:complete', () => {
      console.log('[Progress] Step 2 completion event detected');
      const newStep = window.OnboardingState.getCurrentStep();
      syncProgressOnStepChange(newStep);
    });

    document.addEventListener('step3:complete', () => {
      console.log('[Progress] Step 3 completion event detected');
      const newStep = window.OnboardingState.getCurrentStep();
      syncProgressOnStepChange(newStep);
    });

    document.addEventListener('step4:complete', () => {
      console.log('[Progress] Step 4 completion event detected');
      const newStep = window.OnboardingState.getCurrentStep();
      syncProgressOnStepChange(newStep);
    });
  }

  // Initialize on page load or when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded, initialize immediately
    setTimeout(init, 0);
  }

  // Expose module for manual control if needed
  return {
    syncProgressOnStepChange,
    updateProgressRail,
    updateStepIndicators,
  };
})();
