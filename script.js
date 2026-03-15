/**
 * Love Quiz - Interactive single-page flow
 * Includes: navigation, quiz logic, event logger, session recorder (rrweb),
 * run-away NO button, debug stats, and session data export.
 */

(function () {
  'use strict';

  // =============================================================================
  // STORAGE KEYS (single place for localStorage keys)
  // =============================================================================
  const STORAGE_KEYS = {
    events: 'loveQuiz_events',
    sessionId: 'loveQuiz_sessionId',
    sessionStart: 'loveQuiz_sessionStart',
    recordedSessions: 'loveQuiz_recordedSessions',
  };

  // =============================================================================
  // EVENT LOGGER
  // =============================================================================

  /**
   * Get or create a persistent session ID (stored in localStorage).
   * @returns {string}
   */
  function getSessionId() {
    let id = localStorage.getItem(STORAGE_KEYS.sessionId);
    if (!id) {
      id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      localStorage.setItem(STORAGE_KEYS.sessionId, id);
    }
    return id;
  }

  /**
   * Persist a single event to localStorage (append to events array).
   * @param {Object} event - { event, timestamp, sessionId, data }
   */
  function saveEvent(event) {
    const raw = localStorage.getItem(STORAGE_KEYS.events);
    const list = raw ? JSON.parse(raw) : [];
    list.push(event);
    try {
      localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(list));
    } catch (e) {
      console.warn('Love Quiz: could not save event to localStorage', e);
    }
  }

  /**
   * Track a named event with optional metadata. Persists to localStorage.
   * @param {string} name - Event name (e.g. 'quiz_started', 'question_answered')
   * @param {Object} [data] - Optional metadata (e.g. { question, answer })
   */
  function trackEvent(name, data = {}) {
    const event = {
      event: name,
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      data: typeof data === 'object' && data !== null ? data : {},
    };
    saveEvent(event);
  }

  /**
   * Load all stored events from localStorage.
   * @returns {Array<Object>}
   */
  function getStoredEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.events);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // =============================================================================
  // SESSION RECORDER (rrweb)
  // =============================================================================

  let recordingStopFn = null;
  let recordingStartedAt = null;
  const RECORD_SAVE_INTERVAL_MS = 10 * 1000; // 10 seconds
  let recordSaveTimerId = null;

  /**
   * Current session's recorded events (in-memory). Used when saving to
   * recordedSessions and for export.
   */
  let currentRecordedEvents = [];

  /**
   * Persist recordedSessions to localStorage. If a session with the same
   * sessionId exists, update its events; otherwise append a new entry.
   */
  function saveRecordedSessionsToStorage(sessionId, startedAt, events) {
    const raw = localStorage.getItem(STORAGE_KEYS.recordedSessions);
    const list = raw ? JSON.parse(raw) : [];
    const copy = events.slice();
    const idx = list.findIndex((s) => s.sessionId === sessionId);
    const entry = { sessionId, startedAt, events: copy };
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.recordedSessions, JSON.stringify(list));
    } catch (e) {
      console.warn('Love Quiz: could not save recording to localStorage', e);
    }
  }

  /**
   * Start rrweb recording. Call when quiz starts.
   * Events are accumulated in currentRecordedEvents and saved every 10s.
   */
  function startSessionRecording() {
    if (typeof window.rrweb === 'undefined' || !window.rrweb.record) {
      return;
    }
    currentRecordedEvents = [];
    const sessionId = getSessionId();
    const startedAt = new Date().toISOString();
    recordingStartedAt = startedAt;

    recordingStopFn = window.rrweb.record({
      emit(event) {
        currentRecordedEvents.push(event);
      },
    });

    function flushRecording() {
      if (currentRecordedEvents.length > 0) {
        saveRecordedSessionsToStorage(sessionId, startedAt, currentRecordedEvents);
      }
    }

    recordSaveTimerId = setInterval(flushRecording, RECORD_SAVE_INTERVAL_MS);

    // Expose stop and flush for quiz_completed (so we save one last time and clear timer)
    window.__loveQuizStopRecording = function () {
      if (recordSaveTimerId) {
        clearInterval(recordSaveTimerId);
        recordSaveTimerId = null;
      }
      flushRecording();
      if (recordingStopFn) {
        recordingStopFn();
        recordingStopFn = null;
      }
      recordingStartedAt = null;
      window.__loveQuizStopRecording = null;
    };
  }

  /**
   * Stop recording and do final save. Call when quiz is completed (e.g. screen 10).
   */
  function stopSessionRecording() {
    if (typeof window.__loveQuizStopRecording === 'function') {
      window.__loveQuizStopRecording();
    }
  }

  // =============================================================================
  // PAGE / QUIZ STATE (for time-on-page and quiz start)
  // =============================================================================

  function getSessionStartTime() {
    const raw = localStorage.getItem(STORAGE_KEYS.sessionStart);
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return isNaN(t) ? null : t;
  }

  function setSessionStartTime() {
    localStorage.setItem(STORAGE_KEYS.sessionStart, new Date().toISOString());
  }

  // =============================================================================
  // DEBUG VIEWER & EXPORT
  // =============================================================================

  /**
   * Print a simple stats report to the console (session, questions answered,
   * NO attempts, YES clicked, time on page).
   */
  function showLoveStats() {
    const events = getStoredEvents();
    const sessionId = getSessionId();
    const questionsAnswered = events.filter((e) => e.event === 'question_answered').length;
    const noAttempts = events.filter((e) => e.event === 'attempted_click_no_button').length;
    const yesClicked = events.some((e) => e.event === 'yes_clicked');
    const start = getSessionStartTime();
    const end = Date.now();
    const totalMs = start && end > start ? end - start : 0;
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const timeStr = start ? `${mins}m ${secs}s` : 'N/A';

    const lines = [
      'Love Quiz Report',
      '----------------',
      `Session: ${sessionId}`,
      `Questions Answered: ${questionsAnswered}`,
      `NO Button Attempts: ${noAttempts}`,
      `YES Clicked: ${yesClicked}`,
      `Time on Page: ${timeStr}`,
    ];
    console.log(lines.join('\n'));
  }

  /**
   * Build the full session payload (events + recordedSessions) for export or save.
   * @returns {{ events: Array, recordedSessions: Array, exportedAt: string }}
   */
  function buildSessionPayload() {
    const events = getStoredEvents();
    let recordedSessions = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.recordedSessions);
      recordedSessions = raw ? JSON.parse(raw) : [];
    } catch (e) {
      recordedSessions = [];
    }
    if (currentRecordedEvents.length > 0 && recordingStartedAt) {
      const sessionId = getSessionId();
      const idx = recordedSessions.findIndex((s) => s.sessionId === sessionId);
      const entry = { sessionId, startedAt: recordingStartedAt, events: currentRecordedEvents.slice() };
      if (idx >= 0) {
        recordedSessions[idx] = entry;
      } else {
        recordedSessions.push(entry);
      }
    }
    return { events, recordedSessions, exportedAt: new Date().toISOString() };
  }

  /**
   * Export all tracked events and recorded sessions as a JSON file download.
   */
  function downloadSessionData() {
    const payload = buildSessionPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `love-quiz-session-${getSessionId()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Save session data to the project's JSON file (requires the Node server running).
   * POSTs to /api/save-session; data is appended to data/sessions.json.
   * Call this manually via window.saveToProject() or it runs automatically when quiz completes.
   * @returns {Promise<boolean>} true if save succeeded, false otherwise
   */
  async function saveToProject() {
    const payload = buildSessionPayload();
    try {
      const res = await fetch('/api/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        console.log('Love Quiz: session saved to project data/sessions.json');
        return true;
      }
      console.warn('Love Quiz: save to project failed', data.error || res.status);
      return false;
    } catch (e) {
      console.warn('Love Quiz: could not reach server (run "npm start" to save to project).', e.message);
      return false;
    }
  }

  // Expose to window for console use
  window.showLoveStats = showLoveStats;
  window.downloadSessionData = downloadSessionData;
  window.saveToProject = saveToProject;

  // =============================================================================
  // DOM & QUIZ FLOW
  // =============================================================================

  const container = document.querySelector('.container');
  const screens = document.querySelectorAll('.screen');
  const finalButtonsWrap = document.getElementById('final-buttons');
  const btnNo = document.getElementById('btn-no');
  const btnYes = document.getElementById('btn-yes');

  /**
   * Show only the screen with the given number (1–14).
   */
  function goToScreen(screenNumber) {
    screens.forEach((screen) => {
      const num = parseInt(screen.getAttribute('data-screen'), 10);
      screen.classList.toggle('active', num === screenNumber);
    });
    if (screenNumber === 14) loadGallery();
  }

  /**
   * Navigate to next screen when a button with data-next is clicked.
   * Fires quiz_started when moving to screen 2; quiz_completed when moving to screen 10.
   */
  function handleNextClick(e) {
    const btn = e.target.closest('[data-next]');
    if (!btn) return;
    const next = parseInt(btn.getAttribute('data-next'), 10);
    if (!next) return;

    const currentScreen = Array.from(screens).find((s) => s.classList.contains('active'));
    const currentNum = currentScreen ? parseInt(currentScreen.getAttribute('data-screen'), 10) : 0;

    if (currentNum === 1 && next === 2) {
      setSessionStartTime();
      trackEvent('quiz_started');
      startSessionRecording();
    } else if (next === 13) {
      trackEvent('quiz_completed');
      stopSessionRecording();
      saveToProject();
    }

    goToScreen(next);
  }

  /**
   * Gallery: load list from gallery/list.json and render grid; lightbox on click.
   */
  const galleryGrid = document.getElementById('gallery-grid');
  const lightbox = document.getElementById('gallery-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxClose = document.getElementById('lightbox-close');

  async function loadGallery() {
    if (!galleryGrid) return;
    let list = [];
    try {
      const res = await fetch('gallery/list.json');
      if (res.ok) {
        const data = await res.json();
        list = Array.isArray(data) ? data : (data.images || []);
      }
    } catch (e) {
      list = [];
    }
    galleryGrid.innerHTML = '';
    if (list.length === 0) {
      galleryGrid.innerHTML = '<p class="gallery-empty">Add your photos to the <code>gallery/</code> folder and list them in <code>gallery/list.json</code>.</p>';
      return;
    }
    list.forEach((filename, i) => {
      const src = 'gallery/' + filename.replace(/^gallery\//, '');
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'Photo ' + (i + 1);
      img.loading = 'lazy';
      item.appendChild(img);
      item.addEventListener('click', () => openLightbox(src));
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(src); } });
      galleryGrid.appendChild(item);
    });
  }

  function openLightbox(src) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('is-open');
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
  }

  /**
   * Helper to wire a question screen: on option click, track question_answered
   * and optionally show feedback / next button.
   */
  function wireQuestionScreen(screenId, questionNumber, getAnswerLabel) {
    const card = document.querySelector(`#screen-${screenId} .card`);
    if (!card) return;
    const nextBtn = card.querySelector('.btn-next');
    const options = card.querySelectorAll('.btn-option');
    const feedback = card.querySelector('.feedback');

    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => {
          o.classList.add('selected');
          o.disabled = true;
        });
        const answer = getAnswerLabel ? getAnswerLabel(option) : (option.textContent || '').trim();
        trackEvent('question_answered', { question: questionNumber, answer });

        if (feedback) feedback.hidden = false;
        if (nextBtn) nextBtn.hidden = false;
      });
    });
  }

  function setupScreen2() {
    const card = document.querySelector('#screen-2 .card');
    const feedback = document.getElementById('feedback-2');
    const nextBtn = card.querySelector('.btn-next');
    const options = card.querySelectorAll('.btn-option');

    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => {
          o.classList.add('selected');
          o.disabled = true;
        });
        const label = (option.textContent || '').trim();
        trackEvent('question_answered', { question: 1, answer: label });
        if (option.getAttribute('data-answer') === 'maybe') feedback.hidden = false;
        nextBtn.hidden = false;
      });
    });
  }

  function setupScreen3() {
    wireQuestionScreen(3, 2, (opt) => (opt.textContent || '').trim());
  }

  function setupScreen4() {
    wireQuestionScreen(4, 3, (opt) => (opt.textContent || '').trim());
  }

  function setupScreen5() {
    wireQuestionScreen(5, 4, (opt) => (opt.textContent || '').trim());
  }

  function setupScreen6() {
    const card = document.querySelector('#screen-6 .card');
    const feedback = document.getElementById('feedback-6');
    const nextBtn = card.querySelector('.btn-next');
    const options = card.querySelectorAll('.btn-option');

    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => {
          o.classList.add('selected');
          o.disabled = true;
        });
        const label = (option.textContent || '').trim();
        trackEvent('question_answered', { question: 5, answer: label });
        if (option.getAttribute('data-answer') === 'never') feedback.hidden = false;
        nextBtn.hidden = false;
      });
    });
  }

  function setupScreen7() {
    const card = document.querySelector('#screen-7 .card');
    const feedback = document.getElementById('feedback-7');
    const nextBtn = card.querySelector('.btn-next');
    const options = card.querySelectorAll('.btn-option');
    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => { o.classList.add('selected'); o.disabled = true; });
        const label = (option.textContent || '').trim();
        trackEvent('question_answered', { question: 6, answer: label });
        if (option.getAttribute('data-answer') === 'who') feedback.hidden = false;
        nextBtn.hidden = false;
      });
    });
  }

  function setupScreen8() {
    const card = document.querySelector('#screen-8 .card');
    const feedback = document.getElementById('feedback-8');
    const nextBtn = card.querySelector('.btn-next');
    const options = card.querySelectorAll('.btn-option');
    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => { o.classList.add('selected'); o.disabled = true; });
        const label = (option.textContent || '').trim();
        trackEvent('question_answered', { question: 7, answer: label });
        if (option.getAttribute('data-answer') === 'forgot') feedback.hidden = false;
        nextBtn.hidden = false;
      });
    });
  }

  function setupScreen9() {
    const card = document.querySelector('#screen-9 .card');
    const feedback = document.getElementById('feedback-9');
    const nextBtn = card.querySelector('.btn-next');
    const options = card.querySelectorAll('.btn-option');
    options.forEach((option) => {
      option.addEventListener('click', () => {
        options.forEach((o) => { o.classList.add('selected'); o.disabled = true; });
        const label = (option.textContent || '').trim();
        trackEvent('question_answered', { question: 8, answer: label });
        if (option.getAttribute('data-answer') === 'glasses') feedback.hidden = false;
        nextBtn.hidden = false;
      });
    });
  }

  /**
   * Run-away NO button: starts above the YES button; when you move the cursor
   * toward it to click, it runs away to a random spot inside the container.
   */
  function setupRunAwayNo() {
    if (!finalButtonsWrap || !btnNo) return;

    const padding = 10;
    const runAwayDistance = 90; // run away when cursor gets this close (px)

    function getRandomPosition() {
      const w = finalButtonsWrap.offsetWidth;
      const h = finalButtonsWrap.offsetHeight;
      const noRect = btnNo.getBoundingClientRect();
      const maxX = Math.max(0, w - noRect.width - padding * 2);
      const maxY = Math.max(0, h - noRect.height - padding * 2);
      return {
        x: padding + Math.random() * maxX,
        y: padding + Math.random() * maxY,
      };
    }

    function moveNoButton() {
      btnNo.classList.add('run-away');
      const pos = getRandomPosition();
      btnNo.style.left = pos.x + 'px';
      btnNo.style.top = pos.y + 'px';
      btnNo.style.transform = 'none';
    }

    // Start NO button above YES: centered, near top of the container
    btnNo.style.position = 'absolute';
    btnNo.style.left = '50%';
    btnNo.style.top = '8px';
    btnNo.style.transform = 'translateX(-50%)';

    // Run away when cursor moves toward the NO button
    finalButtonsWrap.addEventListener('mousemove', (e) => {
      const rect = finalButtonsWrap.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const noRect = btnNo.getBoundingClientRect();
      const noCenterX = noRect.left - rect.left + noRect.width / 2;
      const noCenterY = noRect.top - rect.top + noRect.height / 2;
      const distance = Math.hypot(mouseX - noCenterX, mouseY - noCenterY);
      if (distance < runAwayDistance) {
        moveNoButton();
      }
    });

    btnNo.addEventListener('mousedown', (e) => {
      e.preventDefault();
      trackEvent('attempted_click_no_button');
      moveNoButton();
    });
    btnNo.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function setupFinalYes() {
    if (!btnYes) return;
    btnYes.addEventListener('click', () => {
      trackEvent('yes_clicked');
      goToScreen(12);
    });
  }

  function addFloatingHearts() {
    const heartsContainer = document.querySelector('.floating-hearts');
    if (!heartsContainer) return;
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart';
      heart.textContent = '♥';
      heart.setAttribute('aria-hidden', 'true');
      heartsContainer.appendChild(heart);
    }
  }

  container.addEventListener('click', handleNextClick);
  setupScreen2();
  setupScreen3();
  setupScreen4();
  setupScreen5();
  setupScreen6();
  setupScreen7();
  setupScreen8();
  setupScreen9();
  setupRunAwayNo();
  setupFinalYes();
  addFloatingHearts();
  goToScreen(1);

  // Background music: start when page loads (or on first click if browser blocks autoplay)
  (function initBgMusic() {
    const bgMusic = document.getElementById('bg-music');
    if (!bgMusic) return;
    function tryPlay() {
      bgMusic.volume = 0.5;
      bgMusic.play().catch(function () {});
    }
    tryPlay();
    document.body.addEventListener('click', function startOnClick() {
      tryPlay();
      document.body.removeEventListener('click', startOnClick);
    }, { once: true });
  })();
})();
