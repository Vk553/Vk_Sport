/**
 * ============================================================
 * VK SPORT - Player
 * ============================================================
 *
 * Supports:
 * - IFRAME / Embed URLs
 * - HLS / M3U8 URLs
 * - Native HLS
 * - HLS.js / MSE
 *
 * HLS improvements:
 * - HLS.js 1.6.16
 * - attachMedia() BEFORE loadSource()
 * - capLevelToPlayerSize disabled
 * - Handles playlists with missing CODECS / resolution
 * - Live-edge recovery
 * - Media error recovery
 * - Network recovery
 * - Buffer stall recovery
 * - Detailed diagnostics
 * ============================================================
 */

class Player {

  constructor() {

    // Match
    this.match = null;
    this.matchId = null;
    this.globalAds = null;

    // Current server
    this.currentServer = null;

    // Timers
    this.statusInterval = null;
    this.stallTimer = null;

    // HLS
    this.hls = null;
    this.videoElement = null;

    // Loading state
    this.loadingUrl = null;
    this.loadGeneration = 0;

    // Recovery
    this.networkRecoveryAttempts = 0;
    this.mediaRecoveryAttempts = 0;
    this.stallRecoveryAttempts = 0;

    this.maxNetworkRecoveryAttempts = 5;
    this.maxMediaRecoveryAttempts = 3;
    this.maxStallRecoveryAttempts = 5;

    // HLS.js version
    this.hlsVersion = '1.6.16';

    this.init();
  }


  /**
   * ============================================================
   * INITIALIZE
   * ============================================================
   */

  async init() {

    const urlParams =
      new URLSearchParams(window.location.search);

    const rawId =
      urlParams.get('id') || '';

    try {

      this.matchId =
        decodeURIComponent(rawId).trim();

    } catch {

      this.matchId =
        rawId.trim();
    }

    if (!this.matchId) {

      this.showError(
        'عذراً، معرف المباراة غير موجود'
      );

      return;
    }

    await this.loadData();

    if (!this.match) {

      this.showError(
        'عذراً، المباراة غير موجودة في الجدول'
      );

      return;
    }

    this.clearError();

    this.updateRealTimeStatus();

    this.renderMatchInfo();

    this.renderServerButtons();

    this.validateAndLoadFirstServer();

    this.setupEventListeners();

    this.startStatusUpdater();
  }


  /**
   * ============================================================
   * LOAD DATA
   * ============================================================
   */

  async loadData() {

    try {

      const response =
        await fetch('./data/matches.json', {
          cache: 'no-cache'
        });

      if (!response.ok) {

        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      this.globalAds =
        data.globalAds;

      if (!Array.isArray(data.matches)) {

        throw new Error(
          'matches.json does not contain a valid matches array.'
        );
      }

      this.match =
        data.matches.find(
          m => m.id === this.matchId
        );

      if (!this.match) {

        this.match =
          data.matches.find(
            m =>
              String(m.id).toLowerCase() ===
              this.matchId.toLowerCase()
          );
      }

      if (
        this.match &&
        Array.isArray(this.match.servers) &&
        this.match.servers.length > 0
      ) {

        this.currentServer =
          this.match.servers[0];
      }

    } catch (error) {

      console.error(
        '[VK SPORT] Error loading match data:',
        error
      );

      this.showError(
        'فشل في تحميل البيانات. يرجى المحاولة مرة أخرى.'
      );
    }
  }


  /**
   * ============================================================
   * TIME PARSER
   * ============================================================
   */

  parseMatchTime(timeString) {

    if (!timeString) {
      return null;
    }

    const cleanTime =
      String(timeString)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');

    const match =
      cleanTime.match(
        /(\d{1,2}):(\d{2})\s*(AM|PM)/
      );

    if (!match) {

      console.warn(
        '[VK SPORT] Unable to parse match time:',
        timeString
      );

      return null;
    }

    let hours =
      parseInt(match[1], 10);

    const minutes =
      parseInt(match[2], 10);

    const period =
      match[3];

    if (
      period === 'PM' &&
      hours !== 12
    ) {

      hours += 12;
    }

    if (
      period === 'AM' &&
      hours === 12
    ) {

      hours = 0;
    }

    return {
      hours,
      minutes
    };
  }


  /**
   * ============================================================
   * GET DATE FROM MATCH ID
   * ============================================================
   */

  getMatchDateFromId() {

    if (!this.matchId) {
      return null;
    }

    const dateMatch =
      this.matchId.match(/(\d{8})$/);

    if (!dateMatch) {

      console.warn(
        '[VK SPORT] Could not find date in match ID:',
        this.matchId
      );

      return null;
    }

    const dateString =
      dateMatch[1];

    const year =
      parseInt(
        dateString.substring(0, 4),
        10
      );

    const month =
      parseInt(
        dateString.substring(4, 6),
        10
      ) - 1;

    const day =
      parseInt(
        dateString.substring(6, 8),
        10
      );

    return {
      year,
      month,
      day
    };
  }


  /**
   * ============================================================
   * REAL TIME STATUS
   * ============================================================
   */

  determineRealTimeStatus() {

    if (!this.match) {
      return 'UPCOMING';
    }

    const dateInfo =
      this.getMatchDateFromId();

    const timeInfo =
      this.parseMatchTime(
        this.match.time
      );

    if (
      !dateInfo ||
      !timeInfo
    ) {

      return this.match.status ||
        'UPCOMING';
    }

    const matchStart =
      new Date(
        dateInfo.year,
        dateInfo.month,
        dateInfo.day,
        timeInfo.hours,
        timeInfo.minutes,
        0,
        0
      );

    const now =
      new Date();

    const MATCH_DURATION_MINUTES =
      150;

    const matchEnd =
      new Date(
        matchStart.getTime() +
        MATCH_DURATION_MINUTES *
        60 *
        1000
      );

    if (now < matchStart) {
      return 'UPCOMING';
    }

    if (
      now >= matchStart &&
      now < matchEnd
    ) {

      return 'LIVE';
    }

    return 'ENDED';
  }


  updateRealTimeStatus() {

    if (!this.match) {
      return;
    }

    const newStatus =
      this.determineRealTimeStatus();

    this.match.status =
      newStatus;

    console.log(
      `[VK SPORT] Match status: ${newStatus}`
    );
  }


  startStatusUpdater() {

    if (this.statusInterval) {

      clearInterval(
        this.statusInterval
      );
    }

    this.statusInterval =
      setInterval(() => {

        if (!this.match) {
          return;
        }

        const oldStatus =
          this.match.status;

        const newStatus =
          this.determineRealTimeStatus();

        if (
          oldStatus !== newStatus
        ) {

          console.log(
            `[VK SPORT] Status changed: ${oldStatus} -> ${newStatus}`
          );

          this.match.status =
            newStatus;

          this.renderMatchInfo();
        }

      }, 30000);
  }


  /**
   * ============================================================
   * ERROR UI
   * ============================================================
   */

  showError(message) {

    this.hidePlayerContainers();

    const container =
      document.getElementById(
        'match-info'
      );

    if (!container) {
      return;
    }

    container.innerHTML = `

      <div class="bg-red-500/10 border border-red-500/50 rounded-lg p-6 text-center">

        <svg
          class="w-12 h-12 text-red-500 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >

          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 1.667 1.732 1.667L13.732 20c1.5 0 2.502-1.667 1.732-3L13.732 4"
          ></path>

        </svg>

        <p class="text-red-400 text-lg font-bold mb-4">
          ${message}
        </p>

        <a
          href="index.html"
          class="inline-block bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300"
        >
          العودة للرئيسية
        </a>

      </div>

    `;
  }


  clearError() {

    const container =
      document.getElementById(
        'match-info'
      );

    if (container) {

      container.innerHTML =
        '';
    }

    this.showPlayerContainers();
  }


  hidePlayerContainers() {

    const videoWrapper =
      document.getElementById(
        'video-wrapper'
      );

    const serverButtons =
      document.getElementById(
        'server-buttons'
      );

    if (videoWrapper) {

      videoWrapper.style.display =
        'none';
    }

    if (serverButtons) {

      serverButtons.style.display =
        'none';
    }
  }


  showPlayerContainers() {

    const videoWrapper =
      document.getElementById(
        'video-wrapper'
      );

    const serverButtons =
      document.getElementById(
        'server-buttons'
      );

    if (videoWrapper) {

      videoWrapper.style.display =
        'block';
    }

    if (serverButtons) {

      serverButtons.style.display =
        'grid';
    }
  }


  /**
   * ============================================================
   * MATCH INFORMATION
   * ============================================================
   */

  renderMatchInfo() {

    const container =
      document.getElementById(
        'match-info'
      );

    if (
      !container ||
      !this.match
    ) {

      return;
    }

    this.updateRealTimeStatus();

    const statusBadge =
      this.getStatusBadge(
        this.match.status
      );

    container.innerHTML = `

      <div class="flex items-center gap-4 mb-4">

        <span class="text-sm font-medium text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
          ${this.match.league || ''}
        </span>

        ${statusBadge}

      </div>

      <div class="flex items-center justify-between">

        <div class="flex-1 text-center">

          <img
            src="${this.match.homeTeam?.logo || ''}"
            alt="${this.match.homeTeam?.name || ''}"
            class="w-20 h-20 mx-auto mb-2 object-contain"
            onerror="this.onerror=null;this.src='https://via.placeholder.com/80?text=Logo';"
          >

          <h3 class="font-bold text-white text-lg">
            ${this.match.homeTeam?.name || ''}
          </h3>

        </div>

        <div class="px-6 text-center">

          <div class="text-3xl font-bold text-red-500 mb-2">
            ${this.match.time || ''}
          </div>

          <div class="text-sm text-slate-500">
            VS
          </div>

        </div>

        <div class="flex-1 text-center">

          <img
            src="${this.match.awayTeam?.logo || ''}"
            alt="${this.match.awayTeam?.name || ''}"
            class="w-20 h-20 mx-auto mb-2 object-contain"
            onerror="this.onerror=null;this.src='https://via.placeholder.com/80?text=Logo';"
          >

          <h3 class="font-bold text-white text-lg">
            ${this.match.awayTeam?.name || ''}
          </h3>

        </div>

      </div>

      <div class="flex items-center justify-center gap-6 mt-4 text-sm text-slate-400">

        <div class="flex items-center gap-2">

          <svg
            class="w-5 h-5"
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
            ${this.match.channel || ''}
          </span>

        </div>

        <div class="flex items-center gap-2">

          <svg
            class="w-5 h-5"
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
            ${this.match.commentator || ''}
          </span>

        </div>

      </div>

    `;

    document.title =
      `${this.match.homeTeam?.name || ''} vs ${this.match.awayTeam?.name || ''} - بث مباشر`;
  }


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

            <span class="text-sm font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full">
              مباشر
            </span>

          </div>

        `;

      case 'UPCOMING':

        return `

          <span class="text-sm font-medium text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
            قادم
          </span>

        `;

      case 'ENDED':

        return `

          <span class="text-sm font-medium text-slate-400 bg-slate-700/50 px-3 py-1 rounded-full">
            انتهى
          </span>

        `;

      default:

        return '';
    }
  }


  /**
   * ============================================================
   * HLS DETECTION
   * ============================================================
   */

  isHLSUrl(url) {

    if (
      !url ||
      typeof url !== 'string'
    ) {

      return false;
    }

    const cleanUrl =
      url.trim().toLowerCase();

    return (
      cleanUrl.includes('.m3u8') ||
      cleanUrl.includes(
        'application/vnd.apple.mpegurl'
      ) ||
      cleanUrl.includes(
        'application/x-mpegurl'
      )
    );
  }


  /**
   * ============================================================
   * SERVER BUTTONS
   * ============================================================
   */

  renderServerButtons() {

    const container =
      document.getElementById(
        'server-buttons'
      );

    if (
      !container ||
      !this.match
    ) {

      return;
    }

    container.innerHTML =
      '';

    if (
      !Array.isArray(this.match.servers) ||
      this.match.servers.length === 0
    ) {

      container.innerHTML = `

        <div class="col-span-full text-center py-4 text-slate-400 text-sm">
          لا توجد سيرفرات متاحة
        </div>

      `;

      return;
    }

    container.innerHTML =
      this.match.servers
        .map(
          (server, index) => {

            const isValidEmbed =
              server.embedUrl &&
              server.embedUrl !==
                'PASTE_YOUR_EMBED_URL_HERE' &&
              String(server.embedUrl).trim() !== '';

            const statusClass =
              isValidEmbed
                ? ''
                : 'opacity-50 cursor-not-allowed';

            const serverType =
              isValidEmbed
                ? (
                    this.isHLSUrl(
                      server.embedUrl
                    )
                      ? 'HLS'
                      : 'IFRAME'
                  )
                : '';

            return `

              <button
                type="button"
                onclick="player.switchServer('${String(server.id).replace(/'/g, "\\'")}')"
                class="server-btn flex-1 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 hover:border-red-500/50 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                  index === 0
                    ? 'border-red-500 bg-red-500/10'
                    : ''
                } ${statusClass}"
                data-server-id="${server.id}"
                ${!isValidEmbed ? 'disabled' : ''}
              >

                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >

                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2m-2-4h.01M17 16h.01"
                  ></path>

                </svg>

                <div class="text-right">

                  <div class="text-sm font-bold">
                    ${server.name || `Server ${index + 1}`}
                  </div>

                  <div class="text-xs text-slate-400">
                    ${server.quality || ''}${
                      serverType
                        ? ` • ${serverType}`
                        : ''
                    }
                  </div>

                </div>

              </button>

            `;
          }
        )
        .join('');
  }


  /**
   * ============================================================
   * FIRST SERVER
   * ============================================================
   */

  validateAndLoadFirstServer() {

    if (!this.currentServer) {

      this.showVideoError(
        'لا توجد سيرفرات متاحة لهذه المباراة'
      );

      return;
    }

    const embedUrl =
      this.currentServer.embedUrl;

    if (
      !embedUrl ||
      embedUrl ===
        'PASTE_YOUR_EMBED_URL_HERE' ||
      String(embedUrl).trim() === ''
    ) {

      this.showVideoError(
        'جاري تجهيز سيرفر البث لهذه المباراة.. يرجى العودة وقت انطلاق اللقاء'
      );

      return;
    }

    this.loadVideo(
      String(embedUrl).trim()
    );
  }


  /**
   * ============================================================
   * VIDEO ERROR
   * ============================================================
   */

  showVideoError(message) {

    this.destroyHLS();

    const videoContainer =
      document.getElementById(
        'video-container'
      );

    if (!videoContainer) {
      return;
    }

    videoContainer.innerHTML = `

      <div class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-8 text-center">

        <div class="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mb-4">

          <svg
            class="w-8 h-8 text-yellow-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >

            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 1.667 1.732 1.667L13.732 20c1.5 0 2.502-1.667 1.732-3L13.732 4"
            ></path>

          </svg>

        </div>

        <p class="text-white text-lg font-bold mb-4">
          ${message}
        </p>

        <button
          type="button"
          onclick="location.reload()"
          class="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-2 px-6 rounded-lg transition-all duration-300"
        >
          تحديث الصفحة
        </button>

      </div>

    `;
  }


  /**
   * ============================================================
   * LOAD HLS.JS
   * ============================================================
   */

  loadHLSLibrary() {

    return new Promise(
      (resolve, reject) => {

        if (window.Hls) {

          console.log(
            '[VK SPORT] HLS.js already loaded:',
            window.Hls.version || 'unknown'
          );

          resolve(
            window.Hls
          );

          return;
        }

        const existingScript =
          document.querySelector(
            'script[data-vk-hls-js="true"]'
          );

        if (existingScript) {

          existingScript.addEventListener(
            'load',
            () => {

              if (window.Hls) {

                resolve(
                  window.Hls
                );

              } else {

                reject(
                  new Error(
                    'HLS.js loaded but window.Hls is unavailable.'
                  )
                );
              }

            },
            {
              once: true
            }
          );

          existingScript.addEventListener(
            'error',
            () => {

              reject(
                new Error(
                  'Failed to load HLS.js.'
                )
              );

            },
            {
              once: true
            }
          );

          return;
        }

        const script =
          document.createElement(
            'script'
          );

        script.src =
          `https://cdn.jsdelivr.net/npm/hls.js@${this.hlsVersion}/dist/hls.min.js`;

        script.async =
          true;

        script.dataset.vkHlsJs =
          'true';

        script.onload =
          () => {

            if (window.Hls) {

              console.log(
                '[VK SPORT] HLS.js loaded:',
                window.Hls.version || this.hlsVersion
              );

              resolve(
                window.Hls
              );

            } else {

              reject(
                new Error(
                  'HLS.js loaded but window.Hls is unavailable.'
                )
              );
            }
          };

        script.onerror =
          () => {

            reject(
              new Error(
                'Failed to load HLS.js.'
              )
            );
          };

        document.head.appendChild(
          script
        );
      }
    );
  }


  /**
   * ============================================================
   * CREATE VIDEO ELEMENT
   * ============================================================
   */

  createVideoElement(
    videoContainer
  ) {

    videoContainer.innerHTML =
      '';

    const video =
      document.createElement(
        'video'
      );

    video.className =
      'w-full h-full';

    video.controls =
      true;

    video.autoplay =
      true;

    video.playsInline =
      true;

    video.preload =
      'auto';

    /*
     * IMPORTANT:
     *
     * Do not mute permanently.
     * Browser autoplay policies may block audio.
     * User interaction will still allow playback.
     */
    video.muted =
      false;

    /*
     * HLS CORS
     */
    video.crossOrigin =
      'anonymous';

    video.setAttribute(
      'crossorigin',
      'anonymous'
    );

    video.setAttribute(
      'controlsList',
      'nodownload'
    );

    video.setAttribute(
      'playsinline',
      ''
    );

    /*
     * IMPORTANT:
     *
     * #video-container's parent (.video-container) uses the
     * padding-bottom aspect-ratio trick, meaning its OWN height
     * is 0 and the visible box is created purely by padding.
     * Any child must be position:absolute + inset:0 to actually
     * occupy that visible box. The CSS previously only applied
     * this to <iframe>, not <video>, so a dynamically created
     * <video> collapsed to 0px height (audio still played, but
     * nothing was visually rendered). Setting it explicitly here
     * ensures correct layout even if the external CSS changes.
     */

    video.style.position =
      'absolute';

    video.style.top =
      '0';

    video.style.left =
      '0';

    video.style.width =
      '100%';

    video.style.height =
      '100%';

    video.style.display =
      'block';

    video.style.backgroundColor =
      '#000';

    /*
     * ==========================================================
     * VIDEO EVENTS
     * ==========================================================
     */

    video.addEventListener(
      'loadstart',
      () => {

        console.log(
          '[VK SPORT] VIDEO loadstart'
        );
      }
    );

    video.addEventListener(
      'loadedmetadata',
      () => {

        console.log(
          '[VK SPORT] VIDEO metadata:',
          {
            videoWidth:
              video.videoWidth,

            videoHeight:
              video.videoHeight,

            duration:
              video.duration,

            readyState:
              video.readyState,

            networkState:
              video.networkState
          }
        );

        this.tryPlayVideo();
      }
    );

    video.addEventListener(
      'durationchange',
      () => {

        console.log(
          '[VK SPORT] VIDEO durationchange:',
          video.duration
        );
      }
    );

    video.addEventListener(
      'loadeddata',
      () => {

        console.log(
          '[VK SPORT] VIDEO loadeddata:',
          {
            width:
              video.videoWidth,

            height:
              video.videoHeight,

            readyState:
              video.readyState
          }
        );
      }
    );

    video.addEventListener(
      'canplay',
      () => {

        console.log(
          '[VK SPORT] VIDEO canplay:',
          {
            width:
              video.videoWidth,

            height:
              video.videoHeight,

            currentTime:
              video.currentTime,

            readyState:
              video.readyState
          }
        );

        this.tryPlayVideo();
      }
    );

    video.addEventListener(
      'canplaythrough',
      () => {

        console.log(
          '[VK SPORT] VIDEO canplaythrough'
        );
      }
    );

    video.addEventListener(
      'playing',
      () => {

        console.log(
          '[VK SPORT] VIDEO PLAYING:',
          {
            width:
              video.videoWidth,

            height:
              video.videoHeight,

            currentTime:
              video.currentTime,

            readyState:
              video.readyState,

            paused:
              video.paused
          }
        );
      }
    );

    video.addEventListener(
      'pause',
      () => {

        console.log(
          '[VK SPORT] VIDEO PAUSED'
        );
      }
    );

    video.addEventListener(
      'waiting',
      () => {

        console.warn(
          '[VK SPORT] VIDEO WAITING'
        );

        this.startStallRecovery();
      }
    );

    video.addEventListener(
      'stalled',
      () => {

        console.warn(
          '[VK SPORT] VIDEO STALLED'
        );
      }
    );

    video.addEventListener(
      'progress',
      () => {

        if (
          video.buffered &&
          video.buffered.length
        ) {

          const last =
            video.buffered.length - 1;

          console.log(
            '[VK SPORT] VIDEO BUFFER:',
            {
              start:
                video.buffered.start(last),

              end:
                video.buffered.end(last),

              currentTime:
                video.currentTime
            }
          );
        }
      }
    );

    video.addEventListener(
      'timeupdate',
      () => {

        /*
         * Reset stall recovery once
         * currentTime is actually moving.
         */

        this.stallRecoveryAttempts =
          0;
      }
    );

    video.addEventListener(
      'error',
      () => {

        const error =
          video.error;

        console.error(
          '[VK SPORT] ======================================='
        );

        console.error(
          '[VK SPORT] HTML5 VIDEO ERROR'
        );

        console.error(
          '[VK SPORT] Error object:',
          error
        );

        if (error) {

          console.error(
            '[VK SPORT] Error code:',
            error.code
          );

          console.error(
            '[VK SPORT] Error message:',
            error.message
          );
        }

        console.error(
          '[VK SPORT] Video dimensions:',
          video.videoWidth,
          'x',
          video.videoHeight
        );

        console.error(
          '[VK SPORT] ReadyState:',
          video.readyState
        );

        console.error(
          '[VK SPORT] NetworkState:',
          video.networkState
        );

        console.error(
          '[VK SPORT] CurrentTime:',
          video.currentTime
        );

        console.error(
          '[VK SPORT] ======================================='
        );
      }
    );

    videoContainer.appendChild(
      video
    );

    this.videoElement =
      video;

    return video;
  }


  /**
   * ============================================================
   * TRY PLAY
   * ============================================================
   */

  tryPlayVideo() {

    const video =
      this.videoElement;

    if (!video) {
      return;
    }

    if (
      video.readyState <
      HTMLMediaElement.HAVE_CURRENT_DATA
    ) {

      return;
    }

    video.play()
      .then(() => {

        console.log(
          '[VK SPORT] video.play() SUCCESS'
        );

      })
      .catch(error => {

        console.warn(
          '[VK SPORT] video.play() blocked:',
          error
        );

        console.warn(
          '[VK SPORT] User interaction may be required to start audio.'
        );
      });
  }


  /**
   * ============================================================
   * HLS DIAGNOSTIC
   * ============================================================
   */

  printVideoDiagnostics() {

    const video =
      this.videoElement;

    if (!video) {
      return;
    }

    let buffered = [];

    try {

      for (
        let i = 0;
        i < video.buffered.length;
        i++
      ) {

        buffered.push({
          start:
            video.buffered.start(i),

          end:
            video.buffered.end(i)
        });
      }

    } catch {}

    console.log(
      '[VK SPORT] VIDEO DIAGNOSTICS:',
      {
        width:
          video.videoWidth,

        height:
          video.videoHeight,

        duration:
          video.duration,

        currentTime:
          video.currentTime,

        paused:
          video.paused,

        ended:
          video.ended,

        readyState:
          video.readyState,

        networkState:
          video.networkState,

        muted:
          video.muted,

        volume:
          video.volume,

        buffered
      }
    );
  }


  /**
   * ============================================================
   * DESTROY HLS
   * ============================================================
   */

  destroyHLS() {

    this.stopStallRecovery();

    /*
     * Invalidate old async load
     */
    this.loadGeneration++;

    if (this.hls) {

      try {

        this.hls.stopLoad();

      } catch {}

      try {

        this.hls.detachMedia();

      } catch {}

      try {

        this.hls.destroy();

      } catch (error) {

        console.warn(
          '[VK SPORT] HLS destroy error:',
          error
        );
      }

      this.hls =
        null;
    }

    if (this.videoElement) {

      try {

        this.videoElement.pause();

      } catch {}

      try {

        this.videoElement.removeAttribute(
          'src'
        );

      } catch {}

      try {

        this.videoElement.load();

      } catch {}
    }

    this.videoElement =
      null;

    this.loadingUrl =
      null;

    this.networkRecoveryAttempts =
      0;

    this.mediaRecoveryAttempts =
      0;

    this.stallRecoveryAttempts =
      0;
  }


  /**
   * ============================================================
   * LOAD HLS
   * ============================================================
   */

  async loadHLS(hlsUrl) {

    const videoContainer =
      document.getElementById(
        'video-container'
      );

    if (!videoContainer) {
      return;
    }

    if (!hlsUrl) {
      return;
    }

    /*
     * New generation ID.
     *
     * Prevents an old HLS instance from
     * continuing after changing server.
     */

    const generation =
      ++this.loadGeneration;

    this.loadingUrl =
      hlsUrl;

    /*
     * Reset recovery
     */

    this.networkRecoveryAttempts =
      0;

    this.mediaRecoveryAttempts =
      0;

    this.stallRecoveryAttempts =
      0;

    console.log(
      '[VK SPORT] ======================================='
    );

    console.log(
      '[VK SPORT] HLS LOAD START'
    );

    console.log(
      '[VK SPORT] URL:',
      hlsUrl
    );

    console.log(
      '[VK SPORT] Generation:',
      generation
    );

    console.log(
      '[VK SPORT] ======================================='
    );

    /*
     * Destroy previous player
     *
     * IMPORTANT:
     * Do not use destroyHLS() here because it
     * increments loadGeneration again.
     */

    if (this.hls) {

      try {
        this.hls.stopLoad();
      } catch {}

      try {
        this.hls.detachMedia();
      } catch {}

      try {
        this.hls.destroy();
      } catch {}

      this.hls =
        null;
    }

    if (this.videoElement) {

      try {
        this.videoElement.pause();
      } catch {}

      try {
        this.videoElement.removeAttribute('src');
      } catch {}

      try {
        this.videoElement.load();
      } catch {}
    }

    this.videoElement =
      null;

    /*
     * Create a NEW video element
     */

    const video =
      this.createVideoElement(
        videoContainer
      );

    try {

      /*
       * ========================================================
       * BROWSER INFO
       * ========================================================
       */

      console.log(
        '[VK SPORT] Browser:',
        navigator.userAgent
      );

      console.log(
        '[VK SPORT] MediaSource:',
        !!window.MediaSource
      );

      console.log(
        '[VK SPORT] Native HLS:',
        video.canPlayType(
          'application/vnd.apple.mpegurl'
        )
      );

      /*
       * ========================================================
       * LOAD HLS.JS
       * ========================================================
       */

      const Hls =
        await this.loadHLSLibrary();

      /*
       * Make sure this load is still current.
       */

      if (
        generation !==
        this.loadGeneration
      ) {

        console.warn(
          '[VK SPORT] Ignoring stale HLS load.'
        );

        return;
      }

      /*
       * ========================================================
       * NATIVE HLS
       * ========================================================
       */

      const nativeHLS =
        video.canPlayType(
          'application/vnd.apple.mpegurl'
        );

      if (nativeHLS) {

        console.log(
          '[VK SPORT] Native HLS supported:',
          nativeHLS
        );

        video.src =
          hlsUrl;

        video.addEventListener(
          'loadedmetadata',
          () => {

            console.log(
              '[VK SPORT] Native HLS metadata:',
              {
                width:
                  video.videoWidth,

                height:
                  video.videoHeight,

                duration:
                  video.duration
              }
            );

            this.tryPlayVideo();

          },
          {
            once: true
          }
        );

        return;
      }


      /*
       * ========================================================
       * HLS.JS SUPPORT
       * ========================================================
       */

      if (
        !Hls ||
        !Hls.isSupported()
      ) {

        console.error(
          '[VK SPORT] HLS.js / MSE is not supported.'
        );

        this.showVideoError(
          'المتصفح الحالي لا يدعم تشغيل بث HLS.'
        );

        return;
      }


      console.log(
        '[VK SPORT] HLS.js supported.'
      );

      console.log(
        '[VK SPORT] HLS.js version:',
        Hls.version || this.hlsVersion
      );


      /*
       * ========================================================
       * HLS CONFIG
       * ========================================================
       *
       * IMPORTANT CHANGES:
       *
       * 1. capLevelToPlayerSize = false
       *
       *    Your previous logs showed:
       *
       *    width: 0
       *    height: 0
       *
       *    We don't want HLS.js to use a 0x0
       *    player size to cap the level.
       *
       * 2. startLevel = 0
       *
       *    Your playlist currently appears to expose
       *    a single usable level.
       *
       * 3. lowLatencyMode = false
       *
       *    More stable for this stream.
       */

      const config = {

        enableWorker:
          true,

        lowLatencyMode:
          false,

        capLevelToPlayerSize:
          false,

        startLevel:
          0,

        autoStartLoad:
          true,

        startFragPrefetch:
          true,

        backBufferLength:
          30,

        maxBufferLength:
          30,

        maxMaxBufferLength:
          60,

        maxBufferHole:
          0.5,

        maxFragLookUpTolerance:
          0.25,

        liveSyncDurationCount:
          3,

        liveMaxLatencyDurationCount:
          10,

        liveDurationInfinity:
          true,

        maxLiveSyncPlaybackRate:
          1.5,

        abrEwmaDefaultEstimate:
          800000,

        abrEwmaFastLive:
          3,

        abrEwmaSlowLive:
          9,

        fragLoadingMaxRetry:
          6,

        fragLoadingRetryDelay:
          1000,

        manifestLoadingMaxRetry:
          6,

        manifestLoadingRetryDelay:
          1000,

        levelLoadingMaxRetry:
          6,

        levelLoadingRetryDelay:
          1000,

        fragLoadingTimeOut:
          20000,

        manifestLoadingTimeOut:
          15000,

        levelLoadingTimeOut:
          15000
      };


      console.log(
        '[VK SPORT] HLS CONFIG:',
        config
      );


      /*
       * ========================================================
       * CREATE HLS INSTANCE
       * ========================================================
       */

      const hls =
        new Hls(config);

      this.hls =
        hls;


      /*
       * ========================================================
       * MEDIA ATTACHED
       * ========================================================
       */

      hls.on(
        Hls.Events.MEDIA_ATTACHED,
        () => {

          console.log(
            '[VK SPORT] MEDIA_ATTACHED'
          );

          /*
           * IMPORTANT:
           *
           * Source is loaded AFTER media is attached.
           */

          if (
            generation !==
            this.loadGeneration
          ) {

            return;
          }

          console.log(
            '[VK SPORT] Loading HLS source AFTER media attachment...'
          );

          hls.loadSource(
            hlsUrl
          );
        }
      );


      /*
       * ========================================================
       * MANIFEST LOADING
       * ========================================================
       */

      hls.on(
        Hls.Events.MANIFEST_LOADING,
        (event, data) => {

          console.log(
            '[VK SPORT] MANIFEST_LOADING:',
            data?.url
          );
        }
      );


      /*
       * ========================================================
       * MANIFEST LOADED
       * ========================================================
       */

      hls.on(
        Hls.Events.MANIFEST_LOADED,
        (event, data) => {

          console.log(
            '[VK SPORT] MANIFEST_LOADED:',
            {
              url:
                data?.url,

              stats:
                data?.stats
            }
          );
        }
      );


      /*
       * ========================================================
       * MANIFEST PARSED
       * ========================================================
       */

      hls.on(
        Hls.Events.MANIFEST_PARSED,
        (event, data) => {

          console.log(
            '[VK SPORT] ======================================='
          );

          console.log(
            '[VK SPORT] MANIFEST_PARSED'
          );

          console.log(
            '[VK SPORT] Number of levels:',
            data?.levels?.length
          );

          console.log(
            '[VK SPORT] ======================================='
          );


          /*
           * IMPORTANT:
           *
           * Do NOT consider:
           *
           * width: 0
           * height: 0
           * videoCodec: undefined
           *
           * to be a fatal error.
           *
           * The actual TS fragments are loading.
           */

          if (
            Array.isArray(
              data?.levels
            )
          ) {

            data.levels.forEach(
              (level, index) => {

                console.log(
                  `[VK SPORT] LEVEL ${index}:`,
                  {
                    index,

                    width:
                      level.width,

                    height:
                      level.height,

                    bitrate:
                      level.bitrate,

                    videoCodec:
                      level.videoCodec,

                    audioCodec:
                      level.audioCodec,

                    codecs:
                      level.attrs?.CODECS,

                    url:
                      level.url
                  }
                );
              }
            );
          }


          /*
           * Force level 0.
           *
           * Your current stream is successfully
           * requesting level 0 fragments.
           */

          if (
            hls.levels &&
            hls.levels.length > 0
          ) {

            try {

              hls.currentLevel =
                0;

              hls.nextLevel =
                0;

              hls.loadLevel =
                0;

              console.log(
                '[VK SPORT] Forced HLS level 0.'
              );

            } catch (error) {

              console.warn(
                '[VK SPORT] Could not force level 0:',
                error
              );
            }
          }


          /*
           * Try playback.
           */

          setTimeout(
            () => {

              if (
                generation !==
                this.loadGeneration
              ) {

                return;
              }

              this.tryPlayVideo();

            },
            300
          );
        }
      );


      /*
       * ========================================================
       * LEVEL LOADED
       * ========================================================
       */

      hls.on(
        Hls.Events.LEVEL_LOADED,
        (event, data) => {

          const details =
            data?.details;

          console.log(
            '[VK SPORT] LEVEL_LOADED:',
            {
              level:
                data?.level,

              live:
                details?.live,

              totalduration:
                details?.totalduration,

              targetduration:
                details?.targetduration,

              fragments:
                details?.fragments?.length,

              startSN:
                details?.startSN,

              endSN:
                details?.endSN
            }
          );


          /*
           * Live stream:
           *
           * If current time is far behind live edge,
           * move closer to live edge.
           */

          if (
            details?.live &&
            video.duration === Infinity
          ) {

            this.ensureLivePosition(
              hls,
              video,
              details
            );
          }
        }
      );


      /*
       * ========================================================
       * FRAG LOADING
       * ========================================================
       */

      hls.on(
        Hls.Events.FRAG_LOADING,
        (event, data) => {

          console.log(
            '[VK SPORT] FRAG_LOADING:',
            {
              sn:
                data?.frag?.sn,

              level:
                data?.frag?.level,

              url:
                data?.frag?.url
            }
          );
        }
      );


      /*
       * ========================================================
       * FRAG LOADED
       * ========================================================
       */

      hls.on(
        Hls.Events.FRAG_LOADED,
        (event, data) => {

          console.log(
            '[VK SPORT] FRAG_LOADED:',
            {
              sn:
                data?.frag?.sn,

              level:
                data?.frag?.level,

              duration:
                data?.frag?.duration,

              url:
                data?.frag?.url
            }
          );
        }
      );


      /*
       * ========================================================
       * BUFFER CREATED
       * ========================================================
       */

      hls.on(
        Hls.Events.BUFFER_CREATED,
        (event, data) => {

          console.log(
            '[VK SPORT] BUFFER_CREATED:',
            data
          );
        }
      );


      /*
       * ========================================================
       * BUFFER APPENDED
       * ========================================================
       */

      hls.on(
        Hls.Events.BUFFER_APPENDED,
        () => {

          console.log(
            '[VK SPORT] BUFFER_APPENDED'
          );

          this.printVideoDiagnostics();
        }
      );


      /*
       * ========================================================
       * LEVEL SWITCHED
       * ========================================================
       */

      hls.on(
        Hls.Events.LEVEL_SWITCHED,
        (event, data) => {

          console.log(
            '[VK SPORT] LEVEL_SWITCHED:',
            data?.level
          );
        }
      );


      /*
       * ========================================================
       * AUDIO TRACKS
       * ========================================================
       */

      hls.on(
        Hls.Events.AUDIO_TRACKS_UPDATED,
        (event, data) => {

          console.log(
            '[VK SPORT] AUDIO_TRACKS_UPDATED:',
            data?.audioTracks
          );
        }
      );


      hls.on(
        Hls.Events.AUDIO_TRACK_SWITCHED,
        (event, data) => {

          console.log(
            '[VK SPORT] AUDIO_TRACK_SWITCHED:',
            data
          );
        }
      );


      /*
       * ========================================================
       * ERROR HANDLER
       * ========================================================
       */

      hls.on(
        Hls.Events.ERROR,
        (event, data) => {

          console.error(
            '[VK SPORT] ======================================='
          );

          console.error(
            '[VK SPORT] HLS ERROR'
          );

          console.error(
            '[VK SPORT] Type:',
            data?.type
          );

          console.error(
            '[VK SPORT] Details:',
            data?.details
          );

          console.error(
            '[VK SPORT] Fatal:',
            data?.fatal
          );

          console.error(
            '[VK SPORT] Response:',
            data?.response
          );

          console.error(
            '[VK SPORT] Reason:',
            data?.reason
          );

          console.error(
            '[VK SPORT] Error:',
            data?.error
          );

          console.error(
            '[VK SPORT] Network details:',
            data?.networkDetails
          );

          console.error(
            '[VK SPORT] ======================================='
          );


          /*
           * Ignore non-fatal errors.
           */

          if (!data?.fatal) {

            return;
          }


          /*
           * ======================================================
           * NETWORK ERROR
           * ======================================================
           */

          if (
            data.type ===
            Hls.ErrorTypes.NETWORK_ERROR
          ) {

            if (
              this.networkRecoveryAttempts <
              this.maxNetworkRecoveryAttempts
            ) {

              this.networkRecoveryAttempts++;

              console.warn(
                `[VK SPORT] Network recovery ${this.networkRecoveryAttempts}/${this.maxNetworkRecoveryAttempts}`
              );

              setTimeout(
                () => {

                  if (
                    !this.hls ||
                    this.hls !== hls ||
                    generation !==
                    this.loadGeneration
                  ) {

                    return;
                  }

                  try {

                    hls.startLoad();

                  } catch (error) {

                    console.error(
                      '[VK SPORT] startLoad() failed:',
                      error
                    );
                  }

                },
                1000
              );

            } else {

              console.error(
                '[VK SPORT] Network recovery limit reached.'
              );

              this.showVideoError(
                'تعذر الاتصال بسيرفر البث. يرجى تجربة سيرفر آخر.'
              );
            }

            return;
          }


          /*
           * ======================================================
           * MEDIA ERROR
           * ======================================================
           */

          if (
            data.type ===
            Hls.ErrorTypes.MEDIA_ERROR
          ) {

            if (
              this.mediaRecoveryAttempts <
              this.maxMediaRecoveryAttempts
            ) {

              this.mediaRecoveryAttempts++;

              console.warn(
                `[VK SPORT] Media recovery ${this.mediaRecoveryAttempts}/${this.maxMediaRecoveryAttempts}`
              );


              /*
               * First recovery:
               *
               * Swap audio codec.
               *
               * This can help when the audio/video
               * track causes a decode problem.
               */

              if (
                this.mediaRecoveryAttempts === 1
              ) {

                try {

                  console.warn(
                    '[VK SPORT] Trying swapAudioCodec()...'
                  );

                  hls.swapAudioCodec();

                } catch (error) {

                  console.warn(
                    '[VK SPORT] swapAudioCodec() failed:',
                    error
                  );
                }
              }


              try {

                hls.recoverMediaError();

              } catch (error) {

                console.error(
                  '[VK SPORT] recoverMediaError() failed:',
                  error
                );
              }

            } else {

              console.error(
                '[VK SPORT] Media recovery limit reached.'
              );

              this.printVideoDiagnostics();

              this.showVideoError(
                'تعذر فك ترميز الفيديو في هذا المتصفح. جرّب Chrome أو Edge أو سيرفر بث آخر.'
              );
            }

            return;
          }


          /*
           * ======================================================
           * OTHER FATAL ERROR
           * ======================================================
           */

          console.error(
            '[VK SPORT] Unrecoverable HLS error.'
          );

          this.showVideoError(
            'تعذر تشغيل بث HLS. يرجى تجربة سيرفر آخر.'
          );
        }
      );


      /*
       * ========================================================
       * ATTACH MEDIA
       * ========================================================
       *
       * IMPORTANT:
       *
       * We attach first.
       *
       * Then MEDIA_ATTACHED triggers loadSource().
       *
       * This is intentionally different from your old code.
       */

      console.log(
        '[VK SPORT] Attaching media...'
      );

      hls.attachMedia(
        video
      );


      /*
       * Safety timeout:
       *
       * If MEDIA_ATTACHED does not fire,
       * report the problem.
       */

      setTimeout(
        () => {

          if (
            generation !==
            this.loadGeneration
          ) {

            return;
          }

          if (
            this.hls !== hls
          ) {

            return;
          }

          if (
            !hls.media
          ) {

            console.error(
              '[VK SPORT] MEDIA_ATTACHED timeout.'
            );
          }

        },
        5000
      );

    } catch (error) {

      console.error(
        '[VK SPORT] HLS loading exception:',
        error
      );

      this.showVideoError(
        'تعذر تحميل مشغل HLS. يرجى المحاولة مرة أخرى.'
      );
    }
  }


  /**
   * ============================================================
   * LIVE POSITION
   * ============================================================
   */

  ensureLivePosition(
    hls,
    video,
    details
  ) {

    if (!details) {
      return;
    }

    if (!details.live) {
      return;
    }

    /*
     * HLS.js provides liveSyncPosition
     * when available.
     */

    const liveSyncPosition =
      hls.liveSyncPosition;

    if (
      typeof liveSyncPosition ===
      'number' &&
      Number.isFinite(liveSyncPosition)
    ) {

      const difference =
        Math.abs(
          video.currentTime -
          liveSyncPosition
        );

      console.log(
        '[VK SPORT] Live position:',
        {
          currentTime:
            video.currentTime,

          liveSyncPosition,

          difference
        }
      );


      /*
       * If we are far behind,
       * move to the live sync point.
       */

      if (
        !video.currentTime ||
        difference > 12
      ) {

        try {

          console.log(
            '[VK SPORT] Moving to live sync position:',
            liveSyncPosition
          );

          video.currentTime =
            liveSyncPosition;

        } catch (error) {

          console.warn(
            '[VK SPORT] Could not seek to live position:',
            error
          );
        }
      }
    }
  }


  /**
   * ============================================================
   * STALL RECOVERY
   * ============================================================
   */

  startStallRecovery() {

    this.stopStallRecovery();

    this.stallTimer =
      setTimeout(
        () => {

          this.recoverFromStall();

        },
        6000
      );
  }


  stopStallRecovery() {

    if (this.stallTimer) {

      clearTimeout(
        this.stallTimer
      );

      this.stallTimer =
        null;
    }
  }


  recoverFromStall() {

    const video =
      this.videoElement;

    const hls =
      this.hls;

    if (
      !video ||
      !hls
    ) {

      return;
    }

    if (
      this.stallRecoveryAttempts >=
      this.maxStallRecoveryAttempts
    ) {

      console.error(
        '[VK SPORT] Stall recovery limit reached.'
      );

      return;
    }

    this.stallRecoveryAttempts++;

    console.warn(
      `[VK SPORT] Stall recovery ${this.stallRecoveryAttempts}/${this.maxStallRecoveryAttempts}`
    );


    /*
     * If live stream:
     * jump close to live edge.
     */

    if (
      hls.liveSyncPosition &&
      Number.isFinite(
        hls.liveSyncPosition
      )
    ) {

      try {

        video.currentTime =
          hls.liveSyncPosition;

        console.log(
          '[VK SPORT] Jumped to live sync position:',
          hls.liveSyncPosition
        );

      } catch (error) {

        console.warn(
          '[VK SPORT] Live seek failed:',
          error
        );
      }
    }


    /*
     * Resume playback.
     */

    this.tryPlayVideo();


    /*
     * Restart HLS loading.
     */

    try {

      hls.startLoad();

    } catch (error) {

      console.warn(
        '[VK SPORT] Stall startLoad failed:',
        error
      );
    }
  }


  /**
   * ============================================================
   * LOAD VIDEO
   * ============================================================
   */

  loadVideo(embedUrl) {

    const videoContainer =
      document.getElementById(
        'video-container'
      );

    if (!videoContainer) {
      return;
    }

    if (!embedUrl) {
      return;
    }

    const cleanUrl =
      String(embedUrl).trim();

    if (!cleanUrl) {
      return;
    }

    console.log(
      '[VK SPORT] ======================================='
    );

    console.log(
      '[VK SPORT] Loading URL:',
      cleanUrl
    );

    console.log(
      '[VK SPORT] ======================================='
    );


    /*
     * Stop current HLS.
     */

    this.destroyHLS();


    /*
     * ========================================================
     * HLS
     * ========================================================
     */

    if (
      this.isHLSUrl(
        cleanUrl
      )
    ) {

      console.log(
        '[VK SPORT] Detected HLS/M3U8.'
      );

      this.loadHLS(
        cleanUrl
      );

      return;
    }


    /*
     * ========================================================
     * IFRAME
     * ========================================================
     */

    console.log(
      '[VK SPORT] Detected IFRAME/Embed.'
    );

    videoContainer.innerHTML = '';

    const iframe =
      document.createElement(
        'iframe'
      );

    iframe.src =
      cleanUrl;

    iframe.className =
      'w-full h-full';

    iframe.frameBorder =
      '0';

    iframe.allowFullscreen =
      true;

    iframe.setAttribute(
      'allowfullscreen',
      ''
    );

    iframe.setAttribute(
      'allow',
      'autoplay; encrypted-media; picture-in-picture; fullscreen'
    );

    iframe.setAttribute(
      'referrerpolicy',
      'no-referrer-when-downgrade'
    );

    videoContainer.appendChild(
      iframe
    );
  }


  /**
   * ============================================================
   * SWITCH SERVER
   * ============================================================
   */

  switchServer(serverId) {

    if (!this.match) {
      return;
    }

    const server =
      this.match.servers?.find(
        s =>
          String(s.id) ===
          String(serverId)
      );

    if (!server) {

      console.warn(
        '[VK SPORT] Server not found:',
        serverId
      );

      return;
    }

    const embedUrl =
      server.embedUrl;

    if (
      !embedUrl ||
      embedUrl ===
        'PASTE_YOUR_EMBED_URL_HERE' ||
      String(embedUrl).trim() === ''
    ) {

      this.showVideoError(
        'جاري تجهيز سيرفر البث لهذه المباراة.. يرجى العودة وقت انطلاق اللقاء'
      );

      return;
    }

    this.currentServer =
      server;


    /*
     * Update buttons
     */

    document
      .querySelectorAll(
        '.server-btn'
      )
      .forEach(
        btn => {

          const active =
            String(
              btn.dataset.serverId
            ) ===
            String(serverId);

          if (active) {

            btn.classList.add(
              'border-red-500',
              'bg-red-500/10'
            );

            btn.classList.remove(
              'border-slate-600/50',
              'bg-slate-700/50'
            );

          } else {

            btn.classList.remove(
              'border-red-500',
              'bg-red-500/10'
            );

            btn.classList.add(
              'border-slate-600/50',
              'bg-slate-700/50'
            );
          }
        }
      );


    /*
     * Load selected server
     */

    this.loadVideo(
      String(embedUrl).trim()
    );
  }


  /**
   * ============================================================
   * EVENT LISTENERS
   * ============================================================
   */

  setupEventListeners() {

    window.addEventListener(
      'beforeunload',
      () => {

        if (
          this.statusInterval
        ) {

          clearInterval(
            this.statusInterval
          );

          this.statusInterval =
            null;
        }

        this.stopStallRecovery();

        this.destroyHLS();
      }
    );


    /*
     * User interaction:
     *
     * Try playback again after clicking/touching
     * the page. This is useful when browser
     * autoplay policy blocks audio.
     */

    const resumePlayback =
      () => {

        if (
          this.videoElement &&
          this.videoElement.paused
        ) {

          this.tryPlayVideo();
        }
      };

    document.addEventListener(
      'click',
      resumePlayback,
      {
        passive: true
      }
    );

    document.addEventListener(
      'touchstart',
      resumePlayback,
      {
        passive: true
      }
    );
  }
}


/**
 * ============================================================
 * INITIALIZE PLAYER
 * ============================================================
 */

let player;

if (
  document.readyState ===
  'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    () => {

      player =
        new Player();

    },
    {
      once: true
    }
  );

} else {

  player =
    new Player();
}