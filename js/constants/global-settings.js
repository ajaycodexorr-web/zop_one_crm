/**
 * Global Settings for CRM
 * Manage project name, logo/icon, tagline, and favicon globally.
 * Changing properties on global_settings_CRM automatically updates throughout the project.
 */

export class global_settings_CRM {
  static #projectName = 'Zop One';
  static #projectTagline = 'CRM Panel';
  static #projectIcon = 'https://www.zopdealer.com/images/logo.png';
  static #projectFavicon = 'https://www.zopdealer.com/images/logo.png';

  // Getters & Setters
  static get projectName() {
    return this.#projectName;
  }

  static set projectName(val) {
    this.#projectName = val || 'Zop One';
    this.apply();
  }

  static get projectTagline() {
    return this.#projectTagline;
  }

  static set projectTagline(val) {
    this.#projectTagline = val || '';
    this.apply();
  }

  static get projectIcon() {
    return this.#projectIcon;
  }

  static set projectIcon(val) {
    this.#projectIcon = val || 'https://www.zopdealer.com/images/logo.png';
    if (!this.#projectFavicon || this.#projectFavicon === 'https://www.zopdealer.com/images/logo.png') {
      this.#projectFavicon = this.#projectIcon;
    }
    this.apply();
  }

  static get projectFavicon() {
    return this.#projectFavicon;
  }

  static set projectFavicon(val) {
    this.#projectFavicon = val || this.#projectIcon;
    this.apply();
  }

  /**
   * Configure multiple settings at once
   * @param {Object} config - { name, icon, tagline, favicon } or { projectName, projectIcon, projectTagline, projectFavicon }
   */
  static configure(config = {}) {
    if (config.name || config.projectName) {
      this.#projectName = config.name || config.projectName;
    }
    if (config.icon || config.projectIcon || config.logo || config.projectLogo) {
      this.#projectIcon = config.icon || config.projectIcon || config.logo || config.projectLogo;
    }
    if (config.tagline || config.projectTagline) {
      this.#projectTagline = config.tagline || config.projectTagline;
    }
    if (config.favicon || config.projectFavicon) {
      this.#projectFavicon = config.favicon || config.projectFavicon;
    }
    this.apply();
    return this;
  }

  /**
   * Apply settings across the entire project (DOM, title, favicon, sidebar, login overlay, etc.)
   */
  static apply() {
    const name = this.#projectName;
    const icon = this.#projectIcon;
    const tagline = this.#projectTagline;
    const favicon = this.#projectFavicon || icon;

    if (typeof document === 'undefined') return;

    // 1. Update Document Title & Meta
    const fullTitle = tagline ? `${name} ${tagline}` : name;
    document.title = fullTitle;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', `Real-time ${name} Leads & Conversations CRM Panel`);
    }

    // 2. Update Favicon Link
    let faviconLink = document.querySelector('link[rel="icon"]');
    if (faviconLink && favicon) {
      faviconLink.href = favicon;
    }

    // 3. Update Auth/Login Page Branding
    const authLogo = document.querySelector('.auth-logo-img');
    if (authLogo && icon) {
      authLogo.src = icon;
      authLogo.alt = `${name} Logo`;
    }

    const authTitle = document.querySelector('.auth-header h2');
    if (authTitle) {
      authTitle.textContent = `${name} CRM`;
    }

    // 4. Update Sidebar Branding
    const brandLogo = document.querySelector('.brand-logo-img');
    if (brandLogo && icon) {
      brandLogo.src = icon;
      brandLogo.alt = `${name} Logo`;
    }

    const brandName = document.querySelector('.brand-name');
    if (brandName) {
      brandName.textContent = name;
    }

    const brandTagline = document.querySelector('.brand-tagline');
    if (brandTagline) {
      brandTagline.textContent = tagline;
    }
  }

  /**
   * Constructor for instance-based usage: new global_settings_CRM({ name: "...", icon: "..." })
   */
  constructor(config = {}) {
    global_settings_CRM.configure(config);
  }
}

// Bind to window for global access in scripts or browser console
if (typeof window !== 'undefined') {
  window.global_settings_CRM = global_settings_CRM;
}
