/**
 * Homepage Application Logic
 * Handles match data loading, UI rendering,
 * real-time status updates, and modal interactions.
 */

class App {
  constructor() {
    this.matches = [];
    this.globalAds = null;
    this.statusUpdateInterval = null;

    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    await this.loadData();
    this.renderMatches();
    this.setupEventListeners();

    // Start real-time status updates
    this.startRealTimeStatusUpdates();
  }

  /**
   * Load matches and ad configuration from JSON
   */
  async loadData() {
    try {
      const response = await fetch('./data/matches.json', {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      this.matches = Array.isArray(data.matches)
        ? data.matches
        : [];

      this.globalAds = data.globalAds || {};

    } catch (error) {
      console.error('Error loading data:', error);

      this.matches = [];
      this.globalAds = {};

      this.showError(
        'فشل في تحميل البيانات. يرجى المحاولة مرة أخرى.'
      );
    }
  }

  /**
   * Parse match date and time from the match ID and displayed time.
   *
   * Example:
   * match-como-liverpool-20260816
   *
   * Time:
   * 01:30 PM
   *
   * The backend formats match time in UTC+3.
   * Iraq/KSA are UTC+3, so the local browser time
   * can be used directly for the current website.
   */
  getMatchDateTime(match) {
    if (!match || !match.id || !match.time) {
      return null;
    }

    try {
      /*
       * Extract YYYYMMDD from the end of the ID.
       *
       * Example:
       * match-como-liverpool-20260816
       */
      const dateMatch = match.id.match(/-(\d{8})$/);

      if (!dateMatch) {
        console.warn(
          `Could not extract date from match ID: ${match.id}`
        );

        return null;
      }

      const dateString = dateMatch[1];

      const year = parseInt(
        dateString.substring(0, 4),
        10
      );

      const month = parseInt(
        dateString.substring(4, 6),
        10
      );

      const day = parseInt(
        dateString.substring(6, 8),
        10
      );

      /*
       * Extract time.
       *
       * Expected:
       * 01:30 PM
       * 05:00 PM
       * 09:00 AM
       */
      const timeMatch = match.time.match(
        /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
      );

      if (!timeMatch) {
        console.warn(
          `Could not parse match time: ${match.time}`
        );

        return null;
      }

      let hour = parseInt(
        timeMatch[1],
        10
      );

      const minute = parseInt(
        timeMatch[2],
        10
      );

      const period = timeMatch[3].toUpperCase();

      // Convert 12-hour time to 24-hour time
      if (period === 'AM') {
        if (hour === 12) {
          hour = 0;
        }
      } else {
        if (hour !== 12) {
          hour += 12;
        }
      }

      /*
       * Create local datetime.
       *
       * The displayed match time is already UTC+3,
       * which matches Iraq local time.
       */
      const matchDateTime = new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
        0
      );

      if (isNaN(matchDateTime.getTime())) {
        return null;
      }

      return matchDateTime;

    } catch (error) {
      console.error(
        'Error parsing match date/time:',
        error
      );

      return null;
    }
  }

  /**
   * Determine real-time match status.
   *
   * UPCOMING:
   * Match has not started yet.
   *
   * LIVE:
   * Match has started and is within the first 2 hours.
   *
   * ENDED:
   * Match started more than 2 hours ago.
   */
  determineRealTimeStatus(match) {
    if (!match) {
      return 'UPCOMING';
    }

    const matchDateTime =
      this.getMatchDateTime(match);

    /*
     * If we cannot determine the datetime,
     * use the status supplied by the server.
     */
    if (!matchDateTime) {
      return match.status || 'UPCOMING';
    }

    const now = new Date();

    const difference =
      now.getTime() -
      matchDateTime.getTime();

    const twoHours =
      2 * 60 * 60 * 1000;

    /*
     * Future match
     */
    if (difference < 0) {
      return 'UPCOMING';
    }

    /*
     * Match started less than 2 hours ago
     */
    if (difference <= twoHours) {
      return 'LIVE';
    }

    /*
     * More than 2 hours after scheduled start
     */
    return 'ENDED';
  }

  /**
   * Update real-time status for all matches
   */
  updateMatchStatuses() {
    if (!Array.isArray(this.matches)) {
      return;
    }

    let hasChanged = false;

    this.matches.forEach(match => {
      const oldStatus = match.status;

      const newStatus =
        this.determineRealTimeStatus(match);

      if (oldStatus !== newStatus) {
        match.status = newStatus;
        hasChanged = true;

        console.log(
          `[STATUS UPDATE] ${match.homeTeam?.name || ''} vs ${match.awayTeam?.name || ''}: ${oldStatus} -> ${newStatus}`
        );
      }
    });

    /*
     * Only re-render when something actually changed.
     */
    if (hasChanged) {
      this.renderMatches();
    } else {
      /*
       * Also update button data attributes and classes
       * in case the page was opened around the exact
       * start/end moment.
       */
      this.updateRenderedStatuses();
    }
  }

  /**
   * Start automatic status updates.
   *
   * Updates every 30 seconds.
   */
  startRealTimeStatusUpdates() {
    /*
     * Clear previous interval if one exists.
     */
    if (this.statusUpdateInterval) {
      clearInterval(
        this.statusUpdateInterval
      );
    }

    /*
     * Immediately calculate status.
     */
    this.updateMatchStatuses();

    /*
     * Then check every 30 seconds.
     */
    this.statusUpdateInterval =
      setInterval(() => {
        this.updateMatchStatuses();
      }, 30000);
  }

  /**
   * Update rendered match status without
   * unnecessarily rebuilding the entire page.
   */
  updateRenderedStatuses() {
    this.matches.forEach(match => {
      const status =
        this.determineRealTimeStatus(match);

      match.status = status;

      const card =
        document.querySelector(
          `[data-match-card-id="${match.id}"]`
        );

      if (!card) {
        return;
      }

      /*
       * Update status badge.
       */
      const badgeContainer =
        card.querySelector(
          '[data-status-badge]'
        );

      if (badgeContainer) {
        badgeContainer.innerHTML =
          this.getStatusBadge(status);
      }

      /*
       * Update watch button.
       */
      const watchButton =
        card.querySelector(
          '[data-watch-button]'
        );

      if (watchButton) {
        watchButton.dataset.status =
          status;

        /*
         * Update button class.
         */
        watchButton.classList.remove(
          'animate-pulse',
          'opacity-50',
          'cursor-not-allowed'
        );

        const statusClass =
          this.getStatusClass(status);

        if (statusClass) {
          statusClass
            .split(' ')
            .forEach(className => {
              if (className) {
                watchButton.classList.add(
                  className
                );
              }
            });
        }
      }
    });
  }

  /**
   * Render all match cards
   */
  renderMatches() {
    const container =
      document.getElementById(
        'matches-container'
      );

    if (!container) {
      return;
    }

    if (this.matches.length === 0) {
      container.innerHTML =
        `
        <div class="col-span-full text-center text-gray-400 py-8">
          لا توجد مباريات حالياً
        </div>
        `;

      return;
    }

    container.innerHTML =
      this.matches
        .map(match =>
          this.createMatchCard(match)
        )
        .join('');
  }

  /**
   * Create HTML for a single match card
   */
  createMatchCard(match) {
    /*
     * IMPORTANT:
     * Never trust the old status from JSON.
     * Calculate it from the actual match time.
     */
    const currentStatus =
      this.determineRealTimeStatus(match);

    /*
     * Keep the in-memory object synchronized.
     */
    match.status = currentStatus;

    const statusBadge =
      this.getStatusBadge(
        currentStatus
      );

    const statusClass =
      this.getStatusClass(
        currentStatus
      );

    return `
      <div
        class="match-card bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-red-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10"
        data-match-card-id="${match.id}"
      >

        <!-- League Header -->
        <div class="flex items-center justify-between mb-4">

          <div class="flex items-center gap-2">

            <span class="text-xs font-medium text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
              ${match.league || ''}
            </span>

          </div>

          <div data-status-badge>
            ${statusBadge}
          </div>

        </div>

        <!-- Teams -->
        <div class="flex items-center justify-between mb-4">

          <!-- Home Team -->
          <div class="flex-1 text-center">

            <img
              src="${match.homeTeam.logo}"
              alt="${match.homeTeam.name}"
              class="w-16 h-16 mx-auto mb-2 object-contain"
              onerror="this.onerror=null;this.src='https://via.placeholder.com/64?text=Logo';"
            >

            <h3 class="font-bold text-white text-sm">
              ${match.homeTeam.name}
            </h3>

          </div>

          <!-- VS / Time -->
          <div class="px-4 text-center">

            <div class="text-2xl font-bold text-red-500 mb-1">
              ${match.time}
            </div>

            <div class="text-xs text-slate-500">
              VS
            </div>

          </div>

          <!-- Away Team -->
          <div class="flex-1 text-center">

            <img
              src="${match.awayTeam.logo}"
              alt="${match.awayTeam.name}"
              class="w-16 h-16 mx-auto mb-2 object-contain"
              onerror="this.onerror=null;this.src='https://via.placeholder.com/64?text=Logo';"
            >

            <h3 class="font-bold text-white text-sm">
              ${match.awayTeam.name}
            </h3>

          </div>

        </div>

        <!-- Match Info -->
        <div class="flex items-center justify-between text-xs text-slate-400 mb-4 pb-4 border-b border-slate-700/50">

          <!-- Channel -->
          <div class="flex items-center gap-1">

            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              ></path>
            </svg>

            <span>
              ${match.channel || ''}
            </span>

          </div>

          <!-- Commentator -->
          <div class="flex items-center gap-1">

            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              ></path>
            </svg>

            <span>
              ${match.commentator || ''}
            </span>

          </div>

        </div>

        <!-- Watch Button -->
        <button
          onclick="app.handleWatchClick('${match.id}')"
          class="watch-btn w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:shadow-red-500/25 flex items-center justify-center gap-2 ${statusClass}"
          data-match-id="${match.id}"
          data-status="${currentStatus}"
          data-watch-button
        >

          <svg
            class="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z"/>
          </svg>

          مشاهدة البث المباشر

        </button>

      </div>
    `;
  }

  /**
   * Get status badge HTML based on match status
   */
  getStatusBadge(status) {
    switch (status) {

      case 'LIVE':
        return `
          <div class="flex items-center gap-2">

            <span class="relative flex h-3 w-3">

              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
              ></span>

              <span
                class="relative inline-flex rounded-full h-3 w-3 bg-red-500"
              ></span>

            </span>

            <span class="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded-full">
              مباشر
            </span>

          </div>
        `;

      case 'UPCOMING':
        return `
          <span class="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">
          لم تبدأ بعد
          
          </span>
        `;

      case 'ENDED':
        return `
          <span class="text-xs font-medium text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">
            أنتهت
          </span>
        `;

      default:
        return '';
    }
  }

  /**
   * Get CSS class for button based on status
   */
  getStatusClass(status) {
    switch (status) {

      case 'LIVE':
        return 'animate-pulse';

      case 'ENDED':
        return 'opacity-50 cursor-not-allowed';

      default:
        return '';
    }
  }

  /**
   * Handle watch button click
   */
  handleWatchClick(matchId) {
    const match =
      this.matches.find(
        m => m.id === matchId
      );

    if (!match) {
      return;
    }

    /*
     * IMPORTANT:
     * Recalculate the status at the exact
     * moment the user clicks.
     */
    const matchStatus =
      this.determineRealTimeStatus(match);

    /*
     * Synchronize object.
     */
    match.status = matchStatus;

    // Match ended
    if (matchStatus === 'ENDED') {

      this.showModal(
        'المباراة انتهت',
        'info'
      );

      return;
    }

    // Match upcoming
    if (matchStatus === 'UPCOMING') {

      this.showModal(
        `تنويه: ينطلق البث المباشر قبل انطلاق المباراة بدقائق.<br><br>
         موعد المباراة: ${match.time}<br>
         القناة: ${match.channel}`,
        'warning'
      );

      return;
    }

    // Match live
    if (matchStatus === 'LIVE') {

      /*
       * Check sessionStorage for ad click
       */
      const storageKey =
        `home_ad_clicked_${matchId}`;

      const hasClickedAd =
        sessionStorage.getItem(
          storageKey
        );

      if (!hasClickedAd) {

        /*
         * First click - open ad in new tab
         */
        if (this.globalAds?.popunder_home) {

          window.open(
            this.globalAds.popunder_home,
            '_blank'
          );
        }

        /*
         * Mark as clicked
         */
        sessionStorage.setItem(
          storageKey,
          'true'
        );

        /*
         * Show modal
         */
        this.showModal(
          'اضغط مرة أخرى للانتقال إلى البث المباشر',
          'info'
        );

      } else {

        /*
         * Already clicked -
         * navigate to stream page
         */
        window.location.href =
          `stream.html?id=${matchId}`;
      }
    }
  }

  /**
   * Show custom modal popup
   */
  showModal(message, type = 'info') {

    /*
     * Remove existing modal if present
     */
    const existingModal =
      document.getElementById(
        'custom-modal'
      );

    if (existingModal) {
      existingModal.remove();
    }

    /*
     * Create modal HTML
     */
    const modalHtml = `
      <div
        id="custom-modal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >

        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onclick="app.closeModal()"
        ></div>

        <!-- Modal Content -->
        <div
          class="relative bg-slate-800 rounded-xl max-w-md w-full p-6 border border-slate-700 shadow-2xl transform transition-all"
        >

          <!-- Close Button -->
          <button
            onclick="app.closeModal()"
            class="absolute top-4 left-4 text-slate-400 hover:text-white transition-colors"
            aria-label="إغلاق"
          >

            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>

          </button>

          <!-- Icon based on type -->
          <div class="flex justify-center mb-4">

            ${
              type === 'warning'
                ? `
                  <div
                    class="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center"
                  >

                    <svg
                      class="w-8 h-8 text-yellow-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >

                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v4m0 4h.01M10.29 3.86L2.82 17a2 2 0 001.74 3h14.88a2 2 0 001.74-3L13.71 3.86a2 2 0 00-3.42 0z"
                      ></path>

                    </svg>

                  </div>
                `
                : `
                  <div
                    class="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center"
                  >

                    <svg
                      class="w-8 h-8 text-blue-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >

                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>

                    </svg>

                  </div>
                `
            }

          </div>

          <!-- Message -->
          <div class="text-center mb-6">

            <p class="text-white text-lg leading-relaxed">
              ${message}
            </p>

          </div>

          <!-- Close Button -->
          <button
            onclick="app.closeModal()"
            class="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300"
          >
            إغلاق
          </button>

        </div>

      </div>
    `;

    /*
     * Add modal to body
     */
    document.body.insertAdjacentHTML(
      'beforeend',
      modalHtml
    );

    /*
     * Prevent body scroll
     */
    document.body.style.overflow =
      'hidden';
  }

  /**
   * Close modal popup
   */
  closeModal() {

    const modal =
      document.getElementById(
        'custom-modal'
      );

    if (modal) {

      modal.remove();

      document.body.style.overflow =
        '';
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {

    /*
     * Close modal on Escape key
     */
    document.addEventListener(
      'keydown',
      (e) => {

        if (e.key === 'Escape') {
          this.closeModal();
        }

      }
    );
  }

  /**
   * Show error message
   */
  showError(message) {

    const container =
      document.getElementById(
        'matches-container'
      );

    if (container) {

      container.innerHTML = `
        <div class="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-center">

          <p class="text-red-400">
            ${message}
          </p>

        </div>
      `;
    }
  }
}


/*
 * Initialize app when DOM is ready
 */
let app;

if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      app = new App();
    }
  );

} else {

  app = new App();

}