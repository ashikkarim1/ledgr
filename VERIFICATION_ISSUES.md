# VERIFICATION ISSUES — CORGI MIGRATION PHASE D

## CRITICAL ISSUE #1: Emerald Color Hardcoding in Dashboard

**Severity:** CRITICAL  
**Component:** dashboard.html  
**Status:** REQUIRES FIX BEFORE RELEASE

### Issue Details
Dashboard.html contains 5 instances of deprecated emerald color (#10b981) hardcoded in inline CSS styles, breaking the Corgi design system color consistency.

### Affected Locations
1. **Line 398:** `.agent-card__status { color: #10b981; }`
   - Impact: Agent status "Active" indicator shows green instead of orange
   
2. **Line 442:** `.activity-feed__title::before { color: #10b981; }`
   - Impact: Live activity indicator pulse is green
   
3. **Line 474:** `.activity-item.success { border-left-color: #10b981; }`
   - Impact: Success activity items have green left border
   
4. **Line 544:** `.task-section.success .task-section__label { color: #10b981; }`
   - Impact: "Complete" task label is green
   
5. **Line 762:** `.status-dot { background: #10b981; }`
   - Impact: Status indicator dot is green

### Root Cause
These colors were hardcoded during initial dashboard development before the Corgi design system was finalized. CSS variables weren't used for the success state colors.

### Required Fix
Replace all instances with the new orange accent system:

**Option 1 (Recommended): Use orange for all success states**
```css
/* Line 398 */
.agent-card__status {
  color: var(--accent);  /* #FF5C00 */
}

/* Line 442 */
.activity-feed__title::before {
  color: var(--accent);
}

/* Line 474 */
.activity-item.success {
  border-left-color: var(--accent);
  background: rgba(255, 92, 0, 0.02);  /* Slight orange tint */
}

/* Line 544 */
.task-section.success .task-section__label {
  color: var(--accent);
}

/* Line 762 */
.status-dot {
  background: var(--accent);
}
```

**Option 2: Use accent-soft for backgrounds**
```css
.activity-item.success {
  border-left-color: var(--accent);
  background: var(--accent-soft);  /* #ffdecc */
}
```

### Testing After Fix
1. Open dashboard.html in Chrome, Safari, Firefox
2. Verify all status indicators are now orange (#FF5C00)
3. Check contrast ratio: orange on white/light backgrounds
4. Verify no other emerald colors remain (`grep "#10b981" dashboard.html`)

### Estimated Fix Time
5 minutes

---

## MINOR ISSUE #1: Carousel Animation Duration

**Severity:** MINOR  
**Status:** INFORMATIONAL (may not apply to current feature set)

### Issue Details
The requirement specified "60-second carousel cycles" but no carousel animation with this duration was found in the codebase.

### Analysis
- 7 keyframe animations are defined (pulse, fade, slide, slideIn, slideUp, rotate, etc.)
- Pulse animation: 2-second cycle (appropriate for indicators)
- Slide animations: Variable durations (0.3s-0.5s for interactions)
- No 60-second carousel detected

### Possible Scenarios
1. Carousel feature may not be implemented yet (out of current scope)
2. Animation duration may be managed by JavaScript (not CSS)
3. 60-second cycle may not be necessary for current requirements

### Recommendation
Verify with product team if carousel with 60-second animation cycle is required. If yes, implement:
```css
@keyframes carousel-slide {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}

.carousel {
  animation: carousel-slide 60s linear infinite;
}
```

---

## ENHANCEMENT SUGGESTIONS

### 1. CSS File Size Optimization
**Status:** SUGGESTION  
**Current Size:** 121KB (styles.css) + 14KB (tailwind-output.css) = 135KB combined

**Optimization Potential:**
- Remove unused Tailwind utilities with PurgeCSS
- Minify CSS for production
- Consider critical CSS extraction

**Estimated Savings:** ~30-40KB (20-30% reduction)

### 2. Color System Documentation
**Status:** SUGGESTION  
**Action:** Create a design system guide documenting Corgi colors

**Content:**
- Primary accent: #FF5C00 (use var(--accent))
- Text hierarchy: ink-1, ink-2, ink-3
- Background variants: paper, paper-2, surface
- Status colors: warn (#ff405d), rose (#ff405d)
- Always use CSS variables, never hardcode colors

---

## SUMMARY TABLE

| Issue | Severity | Type | Status | ETA |
|-------|----------|------|--------|-----|
| Emerald colors in dashboard.html | CRITICAL | Color | REQUIRES FIX | 5 min |
| Carousel animation duration | MINOR | Clarification | INFO ONLY | N/A |
| CSS size optimization | ENHANCEMENT | Performance | OPTIONAL | N/A |
| Design system documentation | ENHANCEMENT | Docs | OPTIONAL | N/A |

---

## SIGN-OFF

**Identified By:** Agent D, Phase D Verification  
**Date:** May 31, 2026  
**Overall Impact:** 1 Critical issue requires remediation before release
