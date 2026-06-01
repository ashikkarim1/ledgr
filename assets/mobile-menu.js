/**
 * Mobile Menu Handler
 * Manages hamburger menu toggle for responsive navigation
 * Mobile-first approach: hamburger visible on <768px
 */

class MobileMenu {
  constructor() {
    this.toggle = null;
    this.navLinks = null;
    this.nav = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    // Get DOM elements
    this.toggle = document.querySelector('.nav__menu-toggle');
    this.navLinks = document.querySelector('.nav__links');
    this.nav = document.querySelector('.nav');

    if (!this.toggle || !this.navLinks) {
      console.warn('Mobile menu elements not found');
      return;
    }

    // Event listeners
    this.toggle.addEventListener('click', (e) => this.handleToggle(e));
    
    // Close menu when clicking on a link
    this.navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => this.close());
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => this.handleOutsideClick(e));

    // Close menu on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        this.close();
      }
    });
  }

  handleToggle(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.toggle.classList.add('is-open');
    this.navLinks.classList.add('is-open');
    document.body.style.overflow = 'hidden'; // Prevent scrolling when menu is open
  }

  close() {
    this.isOpen = false;
    this.toggle.classList.remove('is-open');
    this.navLinks.classList.remove('is-open');
    document.body.style.overflow = 'auto';
  }

  handleOutsideClick(e) {
    if (!this.isOpen) return;
    
    // Check if click is outside nav
    if (!this.nav.contains(e.target)) {
      this.close();
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MobileMenu();
  });
} else {
  new MobileMenu();
}
