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

  /* ---------- Dashboard header scroll effect ---------- */
  const dashboardHeader = document.querySelector(".dashboard__header");
  if (dashboardHeader) {
    const onScroll = () => {
      dashboardHeader.classList.toggle("is-scrolled", window.scrollY > 8);
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
    
    // Initialize password visibility toggle
    initPasswordToggle();
    
    console.log("[App] Carousel animations initialized");
    console.log("[App] Password toggle initialized");
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
              <a href="mailto:ceo@theupcapital.com" class="error-dialog__support">Contact support</a>
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
            <a href="mailto:ceo@theupcapital.com" class="error-alert__support">Support</a>
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

/* ============================================================
   DASHBOARD MODULE
   Live metrics, 90-day forecast chart, agent activity feed,
   compliance status, bank reconciliation
   ============================================================ */
const DashboardModule = (() => {
  let financialData = null;
  let forecastChart = null;
  const activityAgents = ['Capture', 'VAT', 'Payroll', 'Revenue'];
  let activityUpdateInterval = null;

  /**
   * Load financial data from JSON file
   */
  async function loadFinancialData() {
    try {
      const response = await fetch('/demo-data/financial-dataset.json');
      if (!response.ok) throw new Error('Failed to load financial data');
      financialData = await response.json();
      console.log('[Dashboard] Financial data loaded:', financialData);
      return financialData;
    } catch (error) {
      console.error('[Dashboard] Error loading financial data:', error);
      return null;
    }
  }

  /**
   * Update metric card values from financial data
   */
  function updateMetrics() {
    if (!financialData) return;

    const metrics = {
      cash: financialData.cash.onHand,
      vat: financialData.vat.amountDue,
      tax: financialData.tax.ctEstimate,
      payroll: 14.2, // runway months
    };

    Object.entries(metrics).forEach(([key, value]) => {
      const el = document.querySelector(`[data-metric="${key}"]`);
      if (el) {
        const displayValue = typeof value === 'number' 
          ? value.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
          : value;
        el.textContent = displayValue;
      }
    });

    console.log('[Dashboard] Metrics updated');
  }

  /**
   * Draw 90-day cash forecast chart with Canvas
   */
  function drawForecastChart() {
    if (!financialData) return;

    const canvas = document.getElementById('forecast-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    const container = canvas.parentElement;
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    ctx.scale(dpr, dpr);

    const data = financialData.cash.forecastNext90Days;
    const padding = { top: 40, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate data range
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal;
    const yMin = Math.floor((minVal - range * 0.1) / 10000) * 10000;
    const yMax = Math.ceil((maxVal + range * 0.1) / 10000) * 10000;

    // Draw background grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#191919';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Draw chart area (fill)
    ctx.fillStyle = 'rgba(255, 92, 0, 0.08)';
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);

    data.forEach((val, idx) => {
      const x = padding.left + (chartWidth / (data.length - 1)) * idx;
      const y = height - padding.bottom - ((val - yMin) / (yMax - yMin)) * chartHeight;
      if (idx === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.closePath();
    ctx.fill();

    // Draw chart line
    ctx.strokeStyle = '#FF5C00';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    data.forEach((val, idx) => {
      const x = padding.left + (chartWidth / (data.length - 1)) * idx;
      const y = height - padding.bottom - ((val - yMin) / (yMax - yMin)) * chartHeight;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw safety threshold line (90-day runway)
    const safetyThreshold = financialData.payroll.monthlyPayroll * 3;
    const thresholdY = height - padding.bottom - ((safetyThreshold - yMin) / (yMax - yMin)) * chartHeight;
    ctx.strokeStyle = '#d9d9d9';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, thresholdY);
    ctx.lineTo(width - padding.right, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw axis labels
    ctx.fillStyle = '#4a4a4a';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
      const val = yMin + ((yMax - yMin) / 4) * i;
      const y = padding.top + (chartHeight / 4) * i;
      ctx.fillText(`${Math.round(val / 1000)}k`, padding.left - 12, y);
    }

    // Draw x-axis day markers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    [0, Math.floor(data.length / 3), Math.floor((data.length * 2) / 3), data.length - 1].forEach((idx) => {
      if (idx >= 0 && idx < data.length) {
        const x = padding.left + (chartWidth / (data.length - 1)) * idx;
        const day = idx + 1;
        ctx.fillText(`Day ${day}`, x, height - padding.bottom + 12);
      }
    });

    console.log('[Dashboard] Forecast chart drawn');

    // Hide the loading spinner now that chart is drawn
    const loadingSpinner = document.querySelector('.forecast-loading');
    if (loadingSpinner) {
      loadingSpinner.classList.add('hidden');
      console.log('[Dashboard] Forecast loading spinner hidden');
    }
  }

  /**
   * Generate realistic agent activity entries
   */
  function generateAgentActivity() {
    const activities = [
      {
        agent: 'Capture',
        icon: '📄',
        description: 'Processed 4 transactions in last hour',
        time: '5m ago',
      },
      {
        agent: 'VAT',
        icon: '✓',
        description: 'Filed Q2 return 11 days early',
        time: '2d ago',
      },
      {
        agent: 'Payroll',
        icon: '💼',
        description: 'Automated WPS filing to EOSB',
        time: '16-May',
      },
      {
        agent: 'Revenue',
        icon: '💰',
        description: 'E-invoiced 42k AED via Peppol',
        time: '18-May',
      },
    ];

    return activities[Math.floor(Math.random() * activities.length)];
  }

  /**
   * Update agent activity feed with rotating entries
   */
  function updateActivityFeed() {
    const feed = document.getElementById('agent-activity');
    if (!feed) return;

    const activity = generateAgentActivity();
    const item = document.createElement('div');
    item.className = 'activity-item';
    
    const agentType = activity.agent.toLowerCase().replace(/\s+/g, '');
    item.innerHTML = `
      <div class="activity-icon ${agentType}">${activity.icon}</div>
      <div class="activity-text">
        <span class="activity-agent">${activity.agent} Agent</span>
        <div class="activity-description">${activity.description}</div>
      </div>
      <span class="activity-time">${activity.time}</span>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Keep only 4 most recent activities
    while (feed.children.length > 4) {
      feed.removeChild(feed.lastChild);
    }

    console.log('[Dashboard] Activity feed updated');
  }

  /**
   * Initialize agent activity update loop
   */
  function startActivityUpdates() {
    updateActivityFeed();
    
    if (activityUpdateInterval) clearInterval(activityUpdateInterval);
    
    activityUpdateInterval = setInterval(() => {
      updateActivityFeed();
    }, Math.random() * 5000 + 10000); // 10-15 second intervals

    console.log('[Dashboard] Activity update loop started');
  }

  /**
   * Initialize dashboard tabs functionality
   */
  function initTabs() {
    const tabs = document.querySelectorAll('.dashboard-tab');
    const panels = document.querySelectorAll('.dashboard-panel');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');

        // Update tabs
        tabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        // Update panels
        panels.forEach((panel) => {
          panel.classList.remove('active');
        });
        const activePanel = document.getElementById(`${tabName}-panel`);
        if (activePanel) {
          activePanel.classList.add('active');
        }

        // Redraw chart if switching to dashboard tab
        if (tabName === 'dashboard') {
          setTimeout(drawForecastChart, 100);
        }

        console.log(`[Dashboard] Tab switched to: ${tabName}`);
      });
    });
  }

  /**
   * Initialize period button functionality on forecast chart
   */
  function initForecastPeriods() {
    const buttons = document.querySelectorAll('.forecast-btn');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const period = btn.getAttribute('data-period');
        console.log(`[Dashboard] Forecast period changed to: ${period} days`);
        // In production, would reload data for different period
      });
    });
  }

  /**
   * Animate metric cards on scroll
   */
  function initMetricAnimations() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.metric-card').forEach((el) => {
        el.classList.add('is-in');
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.metric-card, .forecast-card, .reconciliation-card, .activity-feed-card, .compliance-lights').forEach((el) => {
      io.observe(el);
    });
  }

  /**
   * Initialize responsive chart resizing
   */
  function initChartResize() {
    let resizeTimeout;

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (document.querySelector('.dashboard-panel.active')) {
          drawForecastChart();
        }
      }, 250);
    });
  }

  /**
   * Main initialization function
   */
  async function init() {
    try {
      console.log('[Dashboard] Initializing module...');

      // Load data
      const data = await loadFinancialData();
      if (!data) {
        console.error('[Dashboard] Failed to load financial data, stopping initialization');
        return;
      }

      // Update metrics
      updateMetrics();

      // Draw chart
      await new Promise(resolve => setTimeout(() => {
        drawForecastChart();
        resolve();
      }, 200));

      // Start activity updates
      startActivityUpdates();

      // Initialize interactions
      initTabs();
      initForecastPeriods();
      initMetricAnimations();
      initChartResize();

      console.log('[Dashboard] Module initialized successfully');
    } catch (error) {
      console.error('[Dashboard] Initialization error:', error);
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Expose public API
  return {
    init,
    updateMetrics,
    drawForecastChart,
    updateActivityFeed,
    startActivityUpdates,
  };
})();


/**
 * ============================================================
 * Feedback System Module
 * ============================================================
 * Handles user feedback collection, GA4 event tracking,
 * localStorage persistence, and feedback dashboard
 */

const FeedbackSystem = (() => {
  // Configuration
  const STORAGE_KEY = 'ledgr_feedback_submissions';
  const FEEDBACK_TYPES = [
    'Bug Report',
    'Feature Request',
    'Enhancement Suggestion',
    'General Feedback'
  ];

  // Initialize feedback system
  function init() {
    createFeedbackButton();
    createFeedbackModal();
    attachEventListeners();
    console.log('[Feedback] System initialized');
  }

  // Create floating feedback button
  function createFeedbackButton() {
    if (document.querySelector('.feedback-button')) return;

    const button = document.createElement('button');
    button.className = 'feedback-button';
    button.textContent = '💬';
    button.title = 'Send Feedback';
    button.setAttribute('aria-label', 'Send feedback');

    document.body.appendChild(button);
  }

  // Create feedback modal structure
  function createFeedbackModal() {
    if (document.querySelector('.feedback-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'feedback-modal-overlay';
    overlay.id = 'feedbackModalOverlay';

    overlay.innerHTML = `
      <div class="feedback-modal">
        <div class="feedback-modal-header">
          <h2>Send us your feedback</h2>
          <button class="feedback-modal-close" aria-label="Close feedback modal">&times;</button>
        </div>
        <form class="feedback-form" id="feedbackForm">
          <div class="feedback-success" id="feedbackSuccess">
            ✓ Thank you! Your feedback helps us improve Ledgr.
          </div>

          <div class="feedback-form-group">
            <label for="feedbackEmail">Email</label>
            <input
              type="email"
              id="feedbackEmail"
              name="email"
              placeholder="your@email.com"
              required
            />
            <span class="feedback-form-error" id="emailError"></span>
          </div>

          <div class="feedback-form-group">
            <label for="feedbackType">Feedback Type</label>
            <select id="feedbackType" name="type" required>
              <option value="">Select type...</option>
              <option value="Bug Report">🐛 Bug Report</option>
              <option value="Feature Request">✨ Feature Request</option>
              <option value="Enhancement Suggestion">💡 Enhancement Suggestion</option>
              <option value="General Feedback">👍 General Feedback</option>
            </select>
            <span class="feedback-form-error" id="typeError"></span>
          </div>

          <div class="feedback-form-group">
            <label>Satisfaction Rating</label>
            <div class="feedback-rating">
              <button type="button" class="feedback-star" data-rating="1" title="Poor">★</button>
              <button type="button" class="feedback-star" data-rating="2" title="Fair">★</button>
              <button type="button" class="feedback-star" data-rating="3" title="Good">★</button>
              <button type="button" class="feedback-star" data-rating="4" title="Very Good">★</button>
              <button type="button" class="feedback-star" data-rating="5" title="Excellent">★</button>
              <span class="feedback-rating-value" id="ratingValue">-</span>
            </div>
            <input type="hidden" id="feedbackRating" name="rating" value="0" />
            <span class="feedback-form-error" id="ratingError"></span>
          </div>

          <div class="feedback-form-group">
            <label for="feedbackMessage">Message</label>
            <textarea
              id="feedbackMessage"
              name="message"
              placeholder="Tell us what you think... (min 10 characters)"
              required
            ></textarea>
            <span class="feedback-form-error" id="messageError"></span>
          </div>

          <button type="submit" class="feedback-form-submit">Send Feedback</button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // Attach event listeners
  function attachEventListeners() {
    // Open modal
    document.addEventListener('click', (e) => {
      if (e.target.closest('.feedback-button')) {
        openModal();
      }
    });

    // Close modal
    document.addEventListener('click', (e) => {
      if (e.target.closest('.feedback-modal-close') || e.target.id === 'feedbackModalOverlay') {
        closeModal();
      }
    });

    // Star rating
    document.addEventListener('click', (e) => {
      if (e.target.closest('.feedback-star')) {
        e.preventDefault();
        const rating = e.target.getAttribute('data-rating');
        selectRating(parseInt(rating));
      }
    });

    // Form submission
    const form = document.getElementById('feedbackForm');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('feedbackModalOverlay').classList.contains('active')) {
        closeModal();
      }
    });
  }

  // Open modal
  function openModal() {
    const overlay = document.getElementById('feedbackModalOverlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      document.getElementById('feedbackEmail').focus();
    }
  }

  // Close modal
  function closeModal() {
    const overlay = document.getElementById('feedbackModalOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      resetForm();
    }
  }

  // Select star rating
  function selectRating(rating) {
    document.getElementById('feedbackRating').value = rating;
    document.getElementById('ratingValue').textContent = rating + '/5';

    document.querySelectorAll('.feedback-star').forEach((star) => {
      const starRating = parseInt(star.getAttribute('data-rating'));
      if (starRating <= rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });

    clearError('ratingError');
  }

  // Validate form
  function validateForm() {
    let isValid = true;

    // Email validation
    const email = document.getElementById('feedbackEmail').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      showError('emailError', 'Email is required');
      isValid = false;
    } else if (!emailRegex.test(email)) {
      showError('emailError', 'Please enter a valid email');
      isValid = false;
    } else {
      clearError('emailError');
    }

    // Type validation
    const type = document.getElementById('feedbackType').value;
    if (!type) {
      showError('typeError', 'Please select a feedback type');
      isValid = false;
    } else {
      clearError('typeError');
    }

    // Rating validation
    const rating = document.getElementById('feedbackRating').value;
    if (!rating || rating === '0') {
      showError('ratingError', 'Please select a satisfaction rating');
      isValid = false;
    } else {
      clearError('ratingError');
    }

    // Message validation
    const message = document.getElementById('feedbackMessage').value.trim();
    if (!message) {
      showError('messageError', 'Please share your feedback');
      isValid = false;
    } else if (message.length < 10) {
      showError('messageError', 'Please provide at least 10 characters');
      isValid = false;
    } else {
      clearError('messageError');
    }

    return isValid;
  }

  // Show form error
  function showError(errorId, message) {
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = message;
      const group = errorEl.closest('.feedback-form-group');
      if (group) group.classList.add('error');
    }
  }

  // Clear form error
  function clearError(errorId) {
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = '';
      const group = errorEl.closest('.feedback-form-group');
      if (group) group.classList.remove('error');
    }
  }

  // Handle form submission
  function handleFormSubmit(e) {
    e.preventDefault();

    if (!validateForm()) return;

    const email = document.getElementById('feedbackEmail').value.trim();
    const type = document.getElementById('feedbackType').value;
    const rating = parseInt(document.getElementById('feedbackRating').value);
    const message = document.getElementById('feedbackMessage').value.trim();

    const feedback = {
      id: generateId(),
      email,
      type,
      rating,
      message,
      page: window.location.pathname,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };

    // Save to localStorage
    saveFeedback(feedback);

    // Fire GA4 event
    fireFeedbackEvent(feedback);

    // Show success message
    showSuccessMessage();

    // Reset form after delay
    setTimeout(() => {
      closeModal();
    }, 2000);
  }

  // Save feedback to localStorage
  function saveFeedback(feedback) {
    let submissions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    submissions.push(feedback);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));

    // Also save individual feedback by email
    const emailKey = `ledgr_feedback_${feedback.email}`;
    let userFeedback = JSON.parse(localStorage.getItem(emailKey) || '[]');
    userFeedback.push(feedback);
    localStorage.setItem(emailKey, JSON.stringify(userFeedback));

    console.log('[Feedback] Saved:', feedback.id);
  }

  // Fire GA4 event
  function fireFeedbackEvent(feedback) {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'user_feedback_submitted', {
        'feedback_type': feedback.type,
        'satisfaction_rating': feedback.rating,
        'page_source': feedback.page,
        'user_email': feedback.email
      });
      console.log('[Feedback] GA4 event fired');
    }
  }

  // Show success message
  function showSuccessMessage() {
    const successEl = document.getElementById('feedbackSuccess');
    if (successEl) {
      successEl.classList.add('show');
      setTimeout(() => {
        successEl.classList.remove('show');
      }, 4000);
    }
  }

  // Reset form
  function resetForm() {
    const form = document.getElementById('feedbackForm');
    if (form) {
      form.reset();
      document.getElementById('feedbackRating').value = '0';
      document.getElementById('ratingValue').textContent = '-';
      document.querySelectorAll('.feedback-star').forEach(star => star.classList.remove('active'));
      clearError('emailError');
      clearError('typeError');
      clearError('ratingError');
      clearError('messageError');
    }
  }

  // Generate unique ID
  function generateId() {
    return 'fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get all feedback (for dashboard)
  function getAllFeedback() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  // Get feedback by email
  function getFeedbackByEmail(email) {
    return JSON.parse(localStorage.getItem(`ledgr_feedback_${email}`) || '[]');
  }

  // Delete feedback
  function deleteFeedback(feedbackId) {
    let submissions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    submissions = submissions.filter(f => f.id !== feedbackId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
  }

  // Clear all feedback
  function clearAllFeedback() {
    if (confirm('Are you sure you want to clear all feedback? This cannot be undone.')) {
      localStorage.setItem(STORAGE_KEY, '[]');
      console.log('[Feedback] All feedback cleared');
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  // Expose public API
  return {
    init,
    getAllFeedback,
    getFeedbackByEmail,
    deleteFeedback,
    clearAllFeedback,
    openModal,
    closeModal
  };
})();


/* ============================================================================
   FEEDBACK INTELLIGENCE SYSTEM - Advanced Widget & Collection
   ============================================================================ */

const FeedbackIntelligence = (() => {
  const STORAGE_KEY = 'ledgr_feedback_intelligence';
  const TOTAL_QUESTIONS = 4;
  let currentQuestion = 0;
  let formData = {};
  let isWidgetOpen = false;

  // Context-aware question templates per page
  const QUESTION_TEMPLATES = {
    '/': {
      // Homepage
      context: 'Welcome to Ledgr',
      questions: [
        {
          id: 'interest',
          type: 'dropdown',
          label: 'What interests you most about Ledgr?',
          hint: 'Help us understand your priority',
          options: [
            'VAT compliance automation',
            'Real-time reporting',
            'Multi-currency support',
            'AI-powered insights',
            'Transparent pricing',
            'Regulatory compliance',
            "Don't know yet"
          ]
        }
      ]
    },
    '/pricing.html': {
      context: 'Exploring our pricing',
      questions: [
        {
          id: 'pricing-clarity',
          type: 'rating',
          label: 'How clear is our pricing structure?',
          hint: '1 = Confusing, 5 = Very Clear'
        },
        {
          id: 'pricing-value',
          type: 'dropdown',
          label: 'What would make pricing even better?',
          hint: 'Select the most important factor',
          options: [
            'Lower monthly cost',
            'Pay-per-transaction option',
            'Annual discount',
            'Free trial',
            'More features included',
            'Transparent add-on pricing'
          ]
        }
      ]
    },
    '/demo.html': {
      context: 'Viewing our demo',
      questions: [
        {
          id: 'demo-clarity',
          type: 'rating',
          label: 'How clear was the demo?',
          hint: '1 = Confusing, 5 = Crystal Clear'
        },
        {
          id: 'demo-features',
          type: 'checkboxes',
          label: 'Which features caught your interest?',
          hint: 'Select all that apply',
          options: [
            'Real-time VAT tracking',
            'Automated compliance updates',
            'Multi-currency FX handling',
            'Regulatory reporting',
            'Financial dashboards',
            'AI-powered insights'
          ]
        }
      ]
    },
    '/reviews.html': {
      context: 'Reading customer reviews',
      questions: [
        {
          id: 'reviews-trust',
          type: 'rating',
          label: 'How much do these reviews influence your decision?',
          hint: '1 = Not at all, 5 = Very much'
        }
      ]
    },
    '/calculator.html': {
      context: 'Using our calculator',
      questions: [
        {
          id: 'calculator-helpful',
          type: 'rating',
          label: 'Did the calculator help you understand your savings?',
          hint: '1 = Not helpful, 5 = Very helpful'
        }
      ]
    },
    'default': {
      context: 'Thank you for exploring Ledgr',
      questions: [
        {
          id: 'overall-interest',
          type: 'rating',
          label: 'How interested are you in Ledgr?',
          hint: '1 = Not interested, 5 = Very interested'
        },
        {
          id: 'main-need',
          type: 'dropdown',
          label: 'What is your main business need?',
          hint: 'Help us tailor our product',
          options: [
            'VAT compliance',
            'Tax planning',
            'Financial reporting',
            'Multi-currency management',
            'Regulatory compliance',
            'Time savings',
            'Cost reduction'
          ]
        }
      ]
    }
  };

  // Get context-aware questions for current page
  function getContextualQuestions() {
    const path = window.location.pathname;
    const template = QUESTION_TEMPLATES[path] || QUESTION_TEMPLATES.default;
    return template.questions;
  }

  // Initialize widget on page load
  function init() {
    createWidget();
    attachEventListeners();
    updateFeedbackCounter();
  }

  // Create the widget HTML structure
  function createWidget() {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'feedback-intelligence-toggle';
    toggleBtn.id = 'feedback-toggle-btn';
    toggleBtn.innerHTML = '💬';
    toggleBtn.title = 'Share feedback to help us improve';
    document.body.appendChild(toggleBtn);

    const widget = document.createElement('div');
    widget.className = 'feedback-intelligence-widget';
    widget.id = 'feedback-widget';
    widget.innerHTML = `
      <div class="feedback-intelligence-content" id="feedback-content">
        <!-- Form Section -->
        <div id="feedback-form-container">
          <div class="feedback-widget-header">
            <h3 class="feedback-widget-title">Help Shape Ledgr</h3>
            <p class="feedback-widget-subtitle">Your feedback directly shapes our roadmap</p>
          </div>

          <div class="feedback-progress-section">
            <div class="feedback-progress-label">
              <span>Progress</span>
              <span id="progress-text">0 of 4</span>
            </div>
            <div class="feedback-progress-bar">
              <div class="feedback-progress-fill" id="progress-fill"></div>
            </div>
          </div>

          <div class="feedback-context-message" id="context-message">
            Thank you for exploring Ledgr. Your insights help us build better.
          </div>

          <div class="feedback-social-proof">
            <span class="feedback-social-proof-number" id="feedback-count">2,847</span> users have shared feedback. Join them →
          </div>

          <form class="feedback-form-section" id="feedback-form">
            <!-- Questions will be injected here -->
          </form>

          <div class="feedback-form-actions">
            <button type="button" class="feedback-btn feedback-btn-cancel" id="feedback-cancel-btn">Close</button>
            <button type="submit" class="feedback-btn feedback-btn-submit" id="feedback-submit-btn" disabled>Next</button>
          </div>
        </div>

        <!-- Success State -->
        <div class="feedback-success-state" id="feedback-success-state">
          <div class="feedback-success-icon">✓</div>
          <h3 class="feedback-success-title">Thank you!</h3>
          <p class="feedback-success-message">Your feedback is being analyzed and will directly influence our product decisions.</p>
          <div class="feedback-success-cta">← Close & Continue Exploring</div>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    // Render initial questions
    renderQuestion(0);
  }

  // Render question at specific index
  function renderQuestion(index) {
    const questions = getContextualQuestions();
    if (index >= questions.length) {
      // All questions done, show submit button
      document.getElementById('feedback-submit-btn').textContent = 'Submit Feedback';
      document.getElementById('feedback-submit-btn').disabled = formData.notes ? false : true;
      return;
    }

    const question = questions[index];
    const form = document.getElementById('feedback-form');
    
    // Clear existing questions
    form.innerHTML = '';
    
    // Add rating question for the final one (always include rating)
    if (index === questions.length - 1 && !question.type.includes('rating')) {
      form.innerHTML += renderQuestion_Rating('overall-satisfaction', 'Overall, how satisfied are you with Ledgr?', '1 = Not satisfied, 5 = Very satisfied');
    }

    // Render current question
    form.innerHTML += renderQuestionHTML(question);

    // Update progress
    currentQuestion = index;
    updateProgress();
  }

  // Render question HTML based on type
  function renderQuestionHTML(question) {
    switch (question.type) {
      case 'rating':
        return renderQuestion_Rating(question.id, question.label, question.hint);
      case 'dropdown':
        return renderQuestion_Dropdown(question.id, question.label, question.hint, question.options);
      case 'checkboxes':
        return renderQuestion_Checkboxes(question.id, question.label, question.hint, question.options);
      case 'textarea':
        return renderQuestion_Textarea(question.id, question.label, question.hint);
      default:
        return '';
    }
  }

  function renderQuestion_Rating(id, label, hint) {
    return `
      <div class="feedback-question-item">
        <label class="feedback-question-label">${label}</label>
        <div class="feedback-question-hint">${hint}</div>
        <div class="feedback-rating-scale" data-question="${id}">
          ${[1, 2, 3, 4, 5].map(num => `<span class="feedback-star" data-value="${num}">★</span>`).join('')}
        </div>
      </div>
    `;
  }

  function renderQuestion_Dropdown(id, label, hint, options) {
    return `
      <div class="feedback-question-item">
        <label class="feedback-question-label">${label}</label>
        <div class="feedback-question-hint">${hint}</div>
        <select class="feedback-select" data-question="${id}" id="select-${id}">
          <option value="">— Select an option —</option>
          ${options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function renderQuestion_Checkboxes(id, label, hint, options) {
    return `
      <div class="feedback-question-item">
        <label class="feedback-question-label">${label}</label>
        <div class="feedback-question-hint">${hint}</div>
        <div class="feedback-checkbox-group" data-question="${id}">
          ${options.map((opt, idx) => `
            <label class="feedback-checkbox-item">
              <input type="checkbox" class="feedback-checkbox-input" value="${opt}" data-checkbox-idx="${idx}">
              <span class="feedback-checkbox-label">${opt}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderQuestion_Textarea(id, label, hint) {
    return `
      <div class="feedback-question-item">
        <label class="feedback-question-label">${label}</label>
        <div class="feedback-question-hint">${hint}</div>
        <textarea class="feedback-textarea" data-question="${id}" id="textarea-${id}" placeholder="Share your thoughts... (min 10 characters)"></textarea>
        <div class="feedback-char-count"><span id="char-count-${id}">0</span> / 500</div>
      </div>
    `;
  }

  // Update progress indicator
  function updateProgress() {
    const questions = getContextualQuestions();
    const percentage = ((currentQuestion + 1) / (questions.length + 1)) * 100;
    document.getElementById('progress-fill').style.width = percentage + '%';
    document.getElementById('progress-text').textContent = `${currentQuestion + 1} of ${TOTAL_QUESTIONS}`;
  }

  // Attach all event listeners
  function attachEventListeners() {
    const toggleBtn = document.getElementById('feedback-toggle-btn');
    const cancelBtn = document.getElementById('feedback-cancel-btn');
    const submitBtn = document.getElementById('feedback-submit-btn');
    const form = document.getElementById('feedback-form');

    // Toggle widget open/close
    toggleBtn.addEventListener('click', toggleWidget);
    cancelBtn.addEventListener('click', closeWidget);

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormNavigation();
    });

    // Question type event listeners (delegated)
    form.addEventListener('change', (e) => {
      collectFormData(e.target);
      updateSubmitButton();
    });

    // Textarea character counter
    form.addEventListener('input', (e) => {
      if (e.target.classList.contains('feedback-textarea')) {
        const id = e.target.dataset.question;
        const count = e.target.value.length;
        const countEl = document.getElementById(`char-count-${id}`);
        if (countEl) countEl.textContent = Math.min(count, 500);
      }
    });

    // Success state CTA
    const successCta = document.querySelector('.feedback-success-cta');
    if (successCta) {
      successCta.addEventListener('click', closeWidget);
    }
  }

  // Toggle widget visibility
  function toggleWidget() {
    if (isWidgetOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  function openWidget() {
    const widget = document.getElementById('feedback-widget');
    const toggleBtn = document.getElementById('feedback-toggle-btn');
    widget.classList.add('open');
    toggleBtn.classList.add('open');
    isWidgetOpen = true;
  }

  function closeWidget() {
    const widget = document.getElementById('feedback-widget');
    const toggleBtn = document.getElementById('feedback-toggle-btn');
    widget.classList.remove('open');
    toggleBtn.classList.remove('open');
    isWidgetOpen = false;
    // Reset form
    resetForm();
  }

  // Collect form data from inputs
  function collectFormData(target) {
    const questionId = target.dataset.question;
    
    if (target.classList.contains('feedback-star')) {
      // Rating
      formData[questionId] = parseInt(target.dataset.value);
      // Visual feedback
      const stars = target.parentElement.querySelectorAll('.feedback-star');
      stars.forEach((star, idx) => {
        if (idx < parseInt(target.dataset.value)) {
          star.classList.add('active');
        } else {
          star.classList.remove('active');
        }
      });
    } else if (target.classList.contains('feedback-select')) {
      // Dropdown
      formData[questionId] = target.value;
    } else if (target.classList.contains('feedback-checkbox-input')) {
      // Checkboxes
      if (!formData[questionId]) formData[questionId] = [];
      if (target.checked) {
        formData[questionId].push(target.value);
      } else {
        formData[questionId] = formData[questionId].filter(v => v !== target.value);
      }
    } else if (target.classList.contains('feedback-textarea')) {
      // Textarea (limit to 500 chars)
      formData[questionId] = target.value.substring(0, 500);
      target.value = formData[questionId];
    }
  }

  // Update submit button state
  function updateSubmitButton() {
    const btn = document.getElementById('feedback-submit-btn');
    const questions = getContextualQuestions();
    
    // Check if current question is answered
    const currentQ = questions[currentQuestion];
    let isAnswered = false;
    
    if (currentQ) {
      isAnswered = formData[currentQ.id] !== undefined && formData[currentQ.id] !== '';
    } else {
      // Final step - need notes
      isAnswered = formData.notes && formData.notes.length >= 10;
    }
    
    btn.disabled = !isAnswered;
  }

  // Handle form navigation (next/prev questions)
  function handleFormNavigation() {
    const questions = getContextualQuestions();
    
    // If on last question, submit feedback
    if (currentQuestion >= questions.length - 1) {
      submitFeedback();
      return;
    }

    // Move to next question
    currentQuestion++;
    renderQuestion(currentQuestion);
  }

  // Submit feedback
  function submitFeedback() {
    const feedback = {
      id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      page: window.location.pathname,
      url: window.location.href,
      data: { ...formData },
      metadata: {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        sessionId: getOrCreateSessionId()
      }
    };

    // Save to localStorage
    saveFeedback(feedback);

    // Fire GA4 event
    fireFeedbackEvent(feedback);

    // Show success state
    showSuccessState();
  }

  // Save feedback to localStorage
  function saveFeedback(feedback) {
    let allFeedback = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    allFeedback.push(feedback);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFeedback));

    // Also save to indexed by session
    const sessionId = feedback.metadata.sessionId;
    const sessionKey = `${STORAGE_KEY}_session_${sessionId}`;
    let sessionFeedback = JSON.parse(localStorage.getItem(sessionKey) || '[]');
    sessionFeedback.push(feedback.id);
    localStorage.setItem(sessionKey, JSON.stringify(sessionFeedback));
  }

  // Fire GA4 event
  function fireFeedbackEvent(feedback) {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'user_feedback_submitted', {
        'feedback_id': feedback.id,
        'page_source': feedback.page,
        'session_id': feedback.metadata.sessionId,
        'rating': feedback.data['overall-satisfaction'] || 0,
        'event_category': 'engagement'
      });
    }
  }

  // Show success state
  function showSuccessState() {
    const formContainer = document.getElementById('feedback-form-container');
    const successState = document.getElementById('feedback-success-state');
    formContainer.style.display = 'none';
    successState.classList.add('show');
    updateFeedbackCounter();
  }

  // Reset form to initial state
  function resetForm() {
    currentQuestion = 0;
    formData = {};
    const formContainer = document.getElementById('feedback-form-container');
    const successState = document.getElementById('feedback-success-state');
    formContainer.style.display = 'block';
    successState.classList.remove('show');
    renderQuestion(0);
  }

  // Update feedback counter display
  function updateFeedbackCounter() {
    const allFeedback = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const count = allFeedback.length;
    const displayCount = Math.max(2847 + count, 2847); // Start from 2,847
    document.getElementById('feedback-count').textContent = displayCount.toLocaleString();
  }

  // Get or create session ID
  function getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('ledgr_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('ledgr_session_id', sessionId);
    }
    return sessionId;
  }

  // Public API
  function getAllFeedback() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  }

  function getFeedbackBySession(sessionId) {
    const sessionKey = `${STORAGE_KEY}_session_${sessionId}`;
    const feedbackIds = JSON.parse(localStorage.getItem(sessionKey) || '[]');
    const allFeedback = getAllFeedback();
    return allFeedback.filter(fb => feedbackIds.includes(fb.id));
  }

  function deleteFeedback(feedbackId) {
    let allFeedback = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    allFeedback = allFeedback.filter(fb => fb.id !== feedbackId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allFeedback));
  }

  function clearAllFeedback() {
    localStorage.removeItem(STORAGE_KEY);
    // Clear all session keys
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_KEY + '_session_')) {
        localStorage.removeItem(key);
      }
    });
  }

  // ===== PHASE 5: EMAIL DIGEST & NOTIFICATIONS =====

  // Generate and store weekly email digest
  function generateWeeklyDigest() {
    const allFeedback = getAllFeedback();
    const digest = FeedbackAnalyzer.generateEmailDigest(allFeedback, 7);
    
    // Store digest in localStorage with timestamp
    const digests = JSON.parse(localStorage.getItem('ledgr_email_digests') || '[]');
    digests.push({
      id: 'digest_' + Date.now(),
      timestamp: new Date().toISOString(),
      weekOf: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      subject: digest.subject,
      html: digest.html,
      sent: false
    });
    
    localStorage.setItem('ledgr_email_digests', JSON.stringify(digests));
    console.log('[Feedback] Weekly digest generated', digest.subject);
    
    return digest;
  }

  // Send digest via webhook or email service
  function sendDigest(digestId, emailService) {
    const digests = JSON.parse(localStorage.getItem('ledgr_email_digests') || '[]');
    const digest = digests.find(d => d.id === digestId);
    
    if (!digest) {
      console.error('Digest not found:', digestId);
      return Promise.reject('Digest not found');
    }

    // Use webhooks to send
    const webhooks = FeedbackAnalyzer.getWebhooks();
    const emailWebhook = webhooks.find(w => w.events.includes('email_digest'));
    
    if (emailWebhook) {
      return FeedbackAnalyzer.sendToWebhook(emailWebhook, {
        type: 'email_digest',
        subject: digest.subject,
        html: digest.html,
        recipientEmail: emailService || 'ceo@theupcapital.com'
      }, 'email_digest').then(() => {
        // Mark as sent
        digest.sent = true;
        digest.sentAt = new Date().toISOString();
        localStorage.setItem('ledgr_email_digests', JSON.stringify(digests));
        console.log('[Feedback] Digest sent:', digestId);
        return { success: true, digestId };
      });
    }

    return Promise.reject('No email webhook configured');
  }

  // Get all generated digests
  function getDigests() {
    return JSON.parse(localStorage.getItem('ledgr_email_digests') || '[]');
  }

  // Schedule weekly digest (called on init)
  function scheduleWeeklyDigest() {
    // Check if digest was already generated this week
    const lastDigest = JSON.parse(localStorage.getItem('ledgr_last_digest_date') || 'null');
    const today = new Date().toISOString().split('T')[0];
    
    if (lastDigest !== today) {
      // Generate digest every Monday
      const now = new Date();
      if (now.getDay() === 1) { // Monday
        generateWeeklyDigest();
        localStorage.setItem('ledgr_last_digest_date', today);
      }
    }
  }

  // Admin notification: Show banner when new feedback arrives
  function notifyAdminNewFeedback(feedback) {
    // Only notify if multiple submissions in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const allFeedback = getAllFeedback();
    const recentCount = allFeedback.filter(fb => 
      new Date(fb.timestamp) > oneHourAgo
    ).length;

    if (recentCount >= 5) {
      const notification = {
        id: 'notif_' + Date.now(),
        type: 'batch_feedback',
        count: recentCount,
        message: `${recentCount} new feedback submissions in the last hour!`,
        timestamp: new Date().toISOString(),
        actionUrl: '/admin/feedback-intelligence.html'
      };

      // Store notification
      const notifications = JSON.parse(localStorage.getItem('ledgr_admin_notifications') || '[]');
      notifications.push(notification);
      localStorage.setItem('ledgr_admin_notifications', JSON.stringify(notifications));

      // Trigger webhook
      const webhooks = FeedbackAnalyzer.getWebhooks();
      webhooks.forEach(wh => {
        if (wh.events.includes('admin_notification')) {
          FeedbackAnalyzer.sendToWebhook(wh, notification, 'admin_notification');
        }
      });
    }
  }

  // Get admin notifications
  function getAdminNotifications() {
    return JSON.parse(localStorage.getItem('ledgr_admin_notifications') || '[]');
  }

  // Clear admin notification
  function clearAdminNotification(notificationId) {
    const notifications = JSON.parse(localStorage.getItem('ledgr_admin_notifications') || '[]');
    const filtered = notifications.filter(n => n.id !== notificationId);
    localStorage.setItem('ledgr_admin_notifications', JSON.stringify(filtered));
  }

  // ===== PASSWORD TOGGLE FUNCTIONALITY =====
  // Initialize password visibility toggle for all input-toggle-btn elements
  function initPasswordToggle() {
    document.addEventListener('click', function(e) {
      const toggleBtn = e.target.closest('.input-toggle-btn');
      if (!toggleBtn) return;
      
      e.preventDefault();
      const targetSelector = toggleBtn.getAttribute('data-toggle');
      const targetInput = document.querySelector(targetSelector);
      
      if (!targetInput) return;
      
      // Toggle input type between 'password' and 'text'
      const isPassword = targetInput.type === 'password';
      targetInput.type = isPassword ? 'text' : 'password';
      
      // Toggle icon appearance by changing stroke-dashoffset or class
      const eyeIcon = toggleBtn.querySelector('.eye-icon');
      if (eyeIcon) {
        toggleBtn.classList.toggle('eye-open', !isPassword);
        // Update path for visual feedback (optional: use CSS classes instead)
        const paths = eyeIcon.querySelectorAll('path');
        if (paths.length > 1) {
          // Hide/show circle for "eye open" vs "eye closed"
          paths[1].style.opacity = isPassword ? '0' : '1';
        }
      }
      
      console.log(`[Password Toggle] Input type changed to: ${targetInput.type}`);
    });
  }

  // ===== END PHASE 5 =====

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  return {
    init,
    getAllFeedback,
    getFeedbackBySession,
    deleteFeedback,
    clearAllFeedback,
    openWidget,
    closeWidget,
    // Phase 5 additions
    generateWeeklyDigest,
    sendDigest,
    getDigests,
    scheduleWeeklyDigest,
    notifyAdminNewFeedback,
    getAdminNotifications,
    clearAdminNotification
  };

  // Disable 14-day trial links site-wide (waiting on feedback)
  document.addEventListener('click', function(e) {
    if (e.target.closest('a[href="trial.html"]')) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Ledgr] Trial CTA disabled - waiting on user feedback before launch');
      return false;
    }
  }, true);

  // Disable partner sign-on CTAs (Q2 2026 release - collecting feedback before go-live)
  document.addEventListener('click', function(e) {
    const partnerLink = e.target.closest('a[href="#"], a[href="accountants.html#apply"]');
    if (partnerLink) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Ledgr] Partner CTA disabled - partner program launching Q3 2026');
      return false;
    }
  }, true);
})();
