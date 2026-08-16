/**
 * Centralized Ad Scripts Configuration
 * This file handles the loading and execution of all ad scripts
 * including social bars, banners, and native ads
 */

class AdsConfig {
  constructor() {
    this.globalAds = null;
    this.loaded = false;
  }

  /**
   * Load ad configuration from matches.json
   */
  async loadConfig() {
    try {
      const response = await fetch('./data/matches.json');
      const data = await response.json();
      this.globalAds = data.globalAds;
      this.loaded = true;
      return this.globalAds;
    } catch (error) {
      console.error('Error loading ad configuration:', error);
      return null;
    }
  }

  /**
   * Inject social bar script
   */
  loadSocialBar() {
    if (!this.loaded || !this.globalAds.social_bar_script) return;
    
    const container = document.getElementById('ad-social-bar');
    if (container) {
      container.innerHTML = this.globalAds.social_bar_script;
      this.executeScripts(container);
    }
  }

  /**
   * Inject 728x90 banner script
   */
  loadTopBanner() {
    if (!this.loaded || !this.globalAds.banner_728x90_script) return;
    
    const container = document.getElementById('ad-top-banner');
    if (container) {
      container.innerHTML = this.globalAds.banner_728x90_script;
      this.executeScripts(container);
    }
  }

  /**
   * Inject native banner script
   */
  loadNativeBanner() {
    if (!this.loaded || !this.globalAds.native_banner_script) return;
    
    const container = document.getElementById('ad-native-banner');
    if (container) {
      container.innerHTML = this.globalAds.native_banner_script;
      this.executeScripts(container);
    }
  }

  /**
   * Inject sidebar ad script
   */
  loadSidebarAd() {
    if (!this.loaded || !this.globalAds.native_banner_script) return;
    
    const container = document.getElementById('ad-sidebar');
    if (container) {
      container.innerHTML = this.globalAds.native_banner_script;
      this.executeScripts(container);
    }
  }

  /**
   * Execute scripts within a container
   * Safely executes script tags injected via innerHTML
   */
  executeScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  /**
   * Load all ads for the current page
   */
  async loadAllAds() {
    await this.loadConfig();
    this.loadSocialBar();
    this.loadTopBanner();
    this.loadNativeBanner();
    this.loadSidebarAd();
  }

  /**
   * Get popunder URL for homepage
   */
  getPopunderHome() {
    return this.globalAds?.popunder_home || '';
  }

  /**
   * Get popunder URL for player page
   */
  getPopunderPlayer() {
    return this.globalAds?.popunder_player || '';
  }
}

// Initialize ads configuration
const adsConfig = new AdsConfig();

// Auto-load ads when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    adsConfig.loadAllAds();
  });
} else {
  adsConfig.loadAllAds();
}