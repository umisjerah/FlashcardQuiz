/* Flashcard Quiz - vanilla JavaScript PWA */
(() => {
  'use strict';

  const STORAGE_KEY = 'flashcardQuizData_v1';
  const APP_VERSION = '1.0.0';
  const SUBJECTS = ['Mathematics', 'Science', 'English', 'Filipino', 'History', 'Social Studies', 'Computer Studies', 'Other'];
  const TONES = ['indigo', 'teal', 'yellow', 'green', 'pink'];
  const ICONS = ['▤', '✦', '∑', '⚛', '文', '⌘', '◈', '✎'];

  const appView = document.getElementById('appView');
  const modalRoot = document.getElementById('modalRoot');
  const toastRegion = document.getElementById('toastRegion');
  const pageCrumb = document.getElementById('pageCrumb');
  const sidebar = document.getElementById('sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const menuToggle = document.getElementById('menuToggle');

  let deferredInstallPrompt = null;
  let swRegistration = null;
  let isChangingController = false;
  let storageReadError = false;
  let state = {
    page: 'dashboard',
    selectedDeckId: null,
    deckSearch: '',
    deckSubject: 'all',
    deckSort: 'updated',
    progressFilter: 'all',
    study: null,
    quiz: null,
    lastQuizReviewCardIds: [],
    historyDetailId: null
  };

  function uid(prefix = 'id') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function nowISO() { return new Date().toISOString(); }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function safeText(value, fallback = '') { return typeof value === 'string' ? value : fallback; }
  function normalizeAnswer(value) {
    return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
  }
  function formatDate(value, includeTime = false) {
    if (!value) return 'Not yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not yet';
    const options = includeTime
      ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleString(undefined, options);
  }
  function relativeDate(value) {
    if (!value) return 'Not studied yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not studied yet';
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return formatDate(value);
  }
  function createEmptyData() {
    return {
      version: 1,
      initialized: true,
      decks: [],
      cards: [],
      progress: {},
      quizHistory: [],
      activities: [],
      profile: { displayName: 'Student', studyLabel: 'Keep learning', createdAt: nowISO() }
    };
  }

  function sampleData() {
    const data = createEmptyData();
    const samples = [
      {
        title: 'Biology - Cell Biology', subject: 'Science', description: 'Discover the structures and functions of cells.', color: 'teal', icon: '⚛',
        cards: [
          ['What is the basic unit of life?', 'The cell.'],
          ['What is the function of the nucleus?', 'It contains genetic material and controls cell activities.'],
          ['What is the main function of mitochondria?', 'Producing ATP through cellular respiration.'],
          ['What controls what enters and leaves the cell?', 'The cell membrane.'],
          ['What is the jelly-like substance inside a cell?', 'Cytoplasm.']
        ]
      },
      {
        title: 'Mathematics - Algebra Basics', subject: 'Mathematics', description: 'Review important introductory algebra terms.', color: 'yellow', icon: '∑',
        cards: [
          ['What is a variable?', 'A symbol representing an unknown or changing value.'],
          ['What is a coefficient?', 'A number multiplied by a variable.'],
          ['What is the value of x in x + 5 = 12?', '7.'],
          ['What is an expression?', 'A mathematical phrase containing numbers, variables, and operations.'],
          ['What is a linear equation?', 'An equation whose graph forms a straight line.']
        ]
      },
      {
        title: 'English - Parts of Speech', subject: 'English', description: 'Practice the basic parts of English grammar.', color: 'pink', icon: '文',
        cards: [
          ['What is a noun?', 'A word that names a person, place, thing, or idea.'],
          ['What is a verb?', 'A word expressing an action or state of being.'],
          ['What is an adjective?', 'A word that describes a noun or pronoun.'],
          ['What is an adverb?', 'A word that modifies a verb, adjective, or another adverb.'],
          ['What is a pronoun?', 'A word used in place of a noun.']
        ]
      }
    ];
    samples.forEach((sample, index) => {
      const deckId = uid('deck');
      const createdAt = new Date(Date.now() - (index + 1) * 3600000).toISOString();
      data.decks.push({
        id: deckId, title: sample.title, subject: sample.subject, description: sample.description,
        color: sample.color, icon: sample.icon, createdAt, updatedAt: createdAt, isSample: true
      });
      sample.cards.forEach(([question, answer]) => data.cards.push({
        id: uid('card'), deckId, question, answer, createdAt, updatedAt: createdAt
      }));
    });
    return data;
  }

  function loadData() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageReadError = true;
      console.error('LocalStorage is unavailable:', error);
      return createEmptyData();
    }
    if (raw === null) {
      const fresh = sampleData();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch (error) { console.error('Could not initialize local data:', error); }
      return fresh;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) throw new Error('Invalid data structure');
      const empty = createEmptyData();
      const seenDeckIds = new Set();
      const decks = parsed.decks.filter(deck => {
        const valid = deck && typeof deck.id === 'string' && deck.id && !seenDeckIds.has(deck.id) && typeof deck.title === 'string' && deck.title.trim() && typeof deck.subject === 'string' && deck.subject.trim();
        if (valid) seenDeckIds.add(deck.id);
        return valid;
      }).map(deck => ({
        id: deck.id, title: deck.title, subject: deck.subject,
        description: safeText(deck.description), color: TONES.includes(deck.color) ? deck.color : 'indigo',
        icon: safeText(deck.icon, '▤'), createdAt: deck.createdAt || nowISO(), updatedAt: deck.updatedAt || deck.createdAt || nowISO(), isSample: Boolean(deck.isSample)
      }));
      const seenCardIds = new Set();
      const cards = parsed.cards.filter(card => {
        const valid = card && typeof card.id === 'string' && card.id && !seenCardIds.has(card.id) && seenDeckIds.has(card.deckId) && typeof card.question === 'string' && card.question.trim() && typeof card.answer === 'string' && card.answer.trim();
        if (valid) seenCardIds.add(card.id);
        return valid;
      }).map(card => ({
        id: card.id, deckId: card.deckId, question: card.question, answer: card.answer,
        createdAt: card.createdAt || nowISO(), updatedAt: card.updatedAt || card.createdAt || nowISO()
      }));
      const progress = {};
      if (parsed.progress && typeof parsed.progress === 'object' && !Array.isArray(parsed.progress)) {
        Object.entries(parsed.progress).forEach(([cardId, record]) => {
          if (!seenCardIds.has(cardId) || !record || typeof record !== 'object') return;
          progress[cardId] = {
            id: safeText(record.id, `progress_${cardId}`), cardId,
            status: ['new', 'learning', 'mastered'].includes(record.status) ? record.status : 'new',
            timesReviewed: Math.max(0, Number(record.timesReviewed) || 0),
            lastReviewed: typeof record.lastReviewed === 'string' ? record.lastReviewed : null,
            correctCount: Math.max(0, Number(record.correctCount) || 0),
            incorrectCount: Math.max(0, Number(record.incorrectCount) || 0)
          };
        });
      }
      const quizHistory = Array.isArray(parsed.quizHistory) ? parsed.quizHistory.filter(session => session && typeof session.id === 'string' && seenDeckIds.has(session.deckId) && Array.isArray(session.results)).map(session => {
        const results = session.results.filter(result => result && seenCardIds.has(result.cardId) && typeof result.question === 'string' && typeof result.correctAnswer === 'string');
        const correctAnswers = results.filter(result => Boolean(result.correct)).length;
        return { ...session, results, reviewedCardIds: results.map(result => result.cardId), totalQuestions: results.length, answeredQuestions: results.length, correctAnswers, incorrectAnswers: results.length - correctAnswers, score: results.length ? Math.round(correctAnswers / results.length * 100) : 0 };
      }) : [];
      const activities = Array.isArray(parsed.activities) ? parsed.activities.filter(item => item && typeof item.id === 'string' && typeof item.message === 'string').slice(0, 80) : [];
      const profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {};
      return {
        ...empty, version: 1, initialized: true, decks, cards, progress, quizHistory, activities,
        profile: {
          displayName: typeof profile.displayName === 'string' ? profile.displayName.slice(0, 40) : empty.profile.displayName,
          studyLabel: typeof profile.studyLabel === 'string' ? profile.studyLabel.slice(0, 50) : empty.profile.studyLabel,
          createdAt: typeof profile.createdAt === 'string' ? profile.createdAt : empty.profile.createdAt
        }
      };
    } catch (error) {
      storageReadError = true;
      console.error('Could not read saved Flashcard Quiz data:', error);
      return createEmptyData();
    }
  }

  let db = loadData();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return true;
    } catch (error) {
      console.error('Could not save data:', error);
      showToast('Your browser could not save the latest changes. Check available storage space.', 'error');
      return false;
    }
  }

  function addActivity(type, message) {
    db.activities.unshift({ id: uid('activity'), type, message, timestamp: nowISO() });
    db.activities = db.activities.slice(0, 80);
  }
  function getDeck(deckId) { return db.decks.find(deck => deck.id === deckId) || null; }
  function getCard(cardId) { return db.cards.find(card => card.id === cardId) || null; }
  function deckCards(deckId) { return db.cards.filter(card => card.deckId === deckId); }
  function getProgress(cardId) {
    return db.progress[cardId] || { id: `progress_${cardId}`, cardId, status: 'new', timesReviewed: 0, lastReviewed: null, correctCount: 0, incorrectCount: 0 };
  }
  function setCardProgress(cardId, status, isCorrect) {
    const previous = getProgress(cardId);
    db.progress[cardId] = {
      ...previous,
      id: previous.id || uid('progress'),
      cardId,
      status,
      timesReviewed: Number(previous.timesReviewed || 0) + 1,
      lastReviewed: nowISO(),
      correctCount: Number(previous.correctCount || 0) + (isCorrect ? 1 : 0),
      incorrectCount: Number(previous.incorrectCount || 0) + (isCorrect ? 0 : 1)
    };
  }
  function deckStats(deckId) {
    const cards = deckCards(deckId);
    const mastered = cards.filter(card => getProgress(card.id).status === 'mastered').length;
    const learning = cards.filter(card => getProgress(card.id).status === 'learning').length;
    const reviewed = cards.filter(card => Number(getProgress(card.id).timesReviewed || 0) > 0).length;
    return { total: cards.length, mastered, learning, new: Math.max(0, cards.length - mastered - learning), reviewed, percent: cards.length ? Math.round(mastered / cards.length * 100) : 0 };
  }
  function allStats() {
    const totalCards = db.cards.length;
    const mastered = db.cards.filter(card => getProgress(card.id).status === 'mastered').length;
    const learning = db.cards.filter(card => getProgress(card.id).status === 'learning').length;
    const reviewed = db.cards.filter(card => Number(getProgress(card.id).timesReviewed || 0) > 0).length;
    const average = db.quizHistory.length
      ? Math.round(db.quizHistory.reduce((sum, quiz) => sum + Number(quiz.score || 0), 0) / db.quizHistory.length)
      : 0;
    return { totalDecks: db.decks.length, totalCards, mastered, learning, reviewed, quizSessions: db.quizHistory.length, average };
  }
  function reviewCards(deckId = null) {
    return db.cards.filter(card => (!deckId || card.deckId === deckId) && getProgress(card.id).status === 'learning');
  }
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }
  function closeModal() { modalRoot.innerHTML = ''; }
  function openModal(content, wide = false) {
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${content}</div></div>`;
    const firstInput = modalRoot.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (firstInput) firstInput.focus({ preventScroll: true });
  }
  function modalHeader(title, description) {
    return `<div class="modal-header"><div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(description || '')}</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Close dialog">×</button></div>`;
  }
  function closeMobileNav() {
    sidebar.classList.remove('open');
    mobileOverlay.classList.remove('show');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
  function setPage(page) {
    state.page = page;
    closeMobileNav();
    render();
  }

  function render() {
    const page = state.page;
    document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === page || (page === 'detail' && button.dataset.nav === 'decks') || (page === 'study-session' && button.dataset.nav === 'study') || (page === 'quiz-session' && button.dataset.nav === 'quiz') || (page === 'quiz-results' && button.dataset.nav === 'quiz') || (page === 'history-detail' && button.dataset.nav === 'progress')));
    pageCrumb.textContent = ({ dashboard: 'Dashboard', decks: 'My Decks', detail: 'Deck Details', study: 'Study', 'study-session': 'Study Session', 'study-complete': 'Study Complete', quiz: 'Quiz', 'quiz-session': 'Quiz Session', 'quiz-results': 'Quiz Results', progress: 'My Progress', settings: 'Settings', 'history-detail': 'Quiz History' })[page] || 'Dashboard';
    if (page === 'dashboard') appView.innerHTML = renderDashboard();
    else if (page === 'decks') appView.innerHTML = renderDecksPage();
    else if (page === 'detail') appView.innerHTML = renderDeckDetail();
    else if (page === 'study') appView.innerHTML = renderStudyLanding();
    else if (page === 'study-session') appView.innerHTML = renderStudySession();
    else if (page === 'study-complete') appView.innerHTML = renderStudyComplete();
    else if (page === 'quiz') appView.innerHTML = renderQuizSetup();
    else if (page === 'quiz-session') appView.innerHTML = renderQuizSession();
    else if (page === 'quiz-results') appView.innerHTML = renderQuizResults();
    else if (page === 'progress') appView.innerHTML = renderProgressPage();
    else if (page === 'settings') appView.innerHTML = renderSettingsPage();
    else if (page === 'history-detail') appView.innerHTML = renderHistoryDetail();
    else appView.innerHTML = renderDashboard();
    if (storageReadError) {
      storageReadError = false;
      showToast('Saved data could not be read. A fresh local workspace was opened; check your browser storage before making new changes.', 'error');
    }
  }

  function renderHeading(kicker, title, subtitle, actions = '') {
    return `<div class="page-heading"><div><p class="eyebrow">${escapeHTML(kicker)}</p><h1>${escapeHTML(title)}</h1><p class="page-subtitle">${escapeHTML(subtitle)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
  }
  function installButton() {
    if (isAppInstalled()) return `<button class="btn btn-ghost" type="button" disabled>✓ Installed</button>`;
    return `<button class="btn btn-ghost" type="button" data-action="install-app">⇧ Install App</button>`;
  }
  function renderStat(label, value, note, icon, tone = '') {
    return `<div class="stat-card"><div class="stat-icon ${tone}">${icon}</div><div><p class="stat-label">${escapeHTML(label)}</p><p class="stat-value">${escapeHTML(value)}</p><p class="stat-note">${escapeHTML(note)}</p></div></div>`;
  }
  function renderDeckCard(deck, compact = false) {
    const stats = deckStats(deck.id);
    const cards = deckCards(deck.id);
    const tone = TONES.includes(deck.color) ? deck.color : 'indigo';
    const last = cards.map(card => getProgress(card.id).lastReviewed).filter(Boolean).sort().at(-1);
    return `<article class="deck-card" data-deck-id="${escapeHTML(deck.id)}">
      <div class="deck-card-top"><div class="deck-symbol" data-tone="${tone}">${escapeHTML(deck.icon || '▤')}</div><div class="deck-main"><h3>${escapeHTML(deck.title)}</h3><p>${escapeHTML(deck.subject)}${deck.description ? ` · ${escapeHTML(deck.description)}` : ''}</p></div>${!compact ? `<div class="deck-menu"><button class="mini-icon-button" title="Edit deck" data-action="edit-deck" data-id="${escapeHTML(deck.id)}">✎</button><button class="mini-icon-button" title="More options" data-action="deck-options" data-id="${escapeHTML(deck.id)}">⋯</button></div>` : ''}</div>
      <div class="deck-progress-row"><span>${stats.mastered} of ${stats.total} mastered</span><span>${stats.percent}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${stats.percent}%"></div></div>
      <div class="deck-actions"><button class="btn btn-primary btn-small" data-action="study-deck" data-id="${escapeHTML(deck.id)}" ${stats.total ? '' : 'disabled'}>Study</button><button class="btn btn-secondary btn-small" data-action="quiz-deck" data-id="${escapeHTML(deck.id)}" ${stats.total ? '' : 'disabled'}>Quiz</button><button class="btn btn-ghost btn-small" data-action="open-deck" data-id="${escapeHTML(deck.id)}">View</button></div>
      <p class="form-hint">${stats.total} cards · ${last ? `Studied ${escapeHTML(relativeDate(last).toLowerCase())}` : `Updated ${escapeHTML(formatDate(deck.updatedAt))}`}</p>
    </article>`;
  }
  function renderActivityList(limit = 6) {
    const items = db.activities.slice(0, limit);
    if (!items.length) return `<div class="empty-state"><div class="empty-icon">✦</div><h3>Your activity will appear here</h3><p>Create a deck or start studying. Your recent actions will be recorded on this device.</p></div>`;
    const symbols = { deck: '▤', card: '✎', study: '▱', quiz: '✓', profile: '☺', data: '⇧' };
    return `<div class="activity-list">${items.map(item => `<div class="activity-item"><div class="activity-dot">${symbols[item.type] || '•'}</div><div class="activity-copy"><p>${escapeHTML(item.message)}</p><time>${escapeHTML(formatDate(item.timestamp, true))}</time></div></div>`).join('')}</div>`;
  }

  function renderDashboard() {
    const stats = allStats();
    const name = safeText(db.profile.displayName, 'Student').trim() || 'Student';
    const recentDecks = [...db.decks].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 3);
    return `<section class="hero-card"><div class="hero-content"><p class="hero-kicker">${escapeHTML(safeText(db.profile.studyLabel, 'YOUR PERSONAL STUDY SPACE').toLocaleUpperCase())}</p><h1>Ready to learn something new, ${escapeHTML(name)}?</h1><p>Small study sessions lead to big improvements. Pick a deck, review a few cards, and keep building your confidence.</p><div class="hero-actions"><button class="btn btn-primary" data-action="new-deck">＋ Create New Deck</button><button class="btn btn-secondary" data-nav="study">Start Studying →</button></div></div><div class="hero-illustration" aria-hidden="true"><div class="study-stack"><span></span><span></span><span></span></div></div></section>
      <div class="stats-grid">${renderStat('Total Decks', stats.totalDecks, 'Your saved subjects', '▤')}${renderStat('Total Flashcards', stats.totalCards, 'Questions in your decks', '▱', 'teal')}${renderStat('Cards Mastered', stats.mastered, `${stats.totalCards ? Math.round(stats.mastered / stats.totalCards * 100) : 0}% of all cards`, '✓', 'green')}${renderStat('Quiz Sessions', stats.quizSessions, `Average accuracy ${stats.average}%`, '◔', 'yellow')}</div>
      <div class="content-grid"><div><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Continue Studying</h2><p class="panel-subtitle">Pick up where you left off</p></div><button class="text-button" data-nav="decks">View all decks →</button></div>${recentDecks.length ? `<div class="deck-list">${recentDecks.map(deck => renderDeckCard(deck, true)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">＋</div><h3>Your first deck starts here</h3><p>Create a deck for one of your school subjects and add the concepts you want to remember.</p><button class="btn btn-primary btn-small" data-action="new-deck">Create a Deck</button></div>`}</section></div><div><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Recent Activity</h2><p class="panel-subtitle">Your latest study actions</p></div><button class="text-button" data-nav="progress">See progress →</button></div>${renderActivityList(7)}</section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Quick Access</h2><p class="panel-subtitle">Keep your study space ready</p></div></div><div class="setting-row"><div><strong>Review difficult cards</strong><small>${reviewCards().length} card(s) need more practice</small></div><button class="btn btn-secondary btn-small" data-action="review-all" ${reviewCards().length ? '' : 'disabled'}>Review</button></div><div class="setting-row"><div><strong>Install on this device</strong><small>Use your decks like an app</small></div>${installButton()}</div></section></div></div>`;
  }

  function filteredDecks() {
    let decks = [...db.decks];
    const query = state.deckSearch.trim().toLocaleLowerCase();
    if (query) decks = decks.filter(deck => `${deck.title} ${deck.subject} ${deck.description || ''}`.toLocaleLowerCase().includes(query));
    if (state.deckSubject !== 'all') decks = decks.filter(deck => deck.subject === state.deckSubject);
    if (state.deckSort === 'title') decks.sort((a, b) => a.title.localeCompare(b.title));
    else if (state.deckSort === 'cards') decks.sort((a, b) => deckCards(b.id).length - deckCards(a.id).length);
    else decks.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return decks;
  }
  function renderDecksPage() {
    const decks = filteredDecks();
    const subjectOptions = [...new Set([...SUBJECTS.filter(subject => subject !== 'Other'), ...db.decks.map(deck => deck.subject)])].sort();
    return `${renderHeading('YOUR LIBRARY', 'My Decks', 'Organize your study materials by subject and build a deck for every lesson.', `<button class="btn btn-primary" data-action="new-deck">＋ New Deck</button>`)}
      <div class="toolbar"><label class="search-field"><span>⌕</span><input class="search-input" id="deckSearch" type="search" placeholder="Search decks or subjects…" value="${escapeHTML(state.deckSearch)}" aria-label="Search decks"></label><select class="control" id="deckSubjectFilter" aria-label="Filter by subject"><option value="all">All subjects</option>${subjectOptions.map(subject => `<option value="${escapeHTML(subject)}" ${state.deckSubject === subject ? 'selected' : ''}>${escapeHTML(subject)}</option>`).join('')}</select><select class="control" id="deckSort" aria-label="Sort decks"><option value="updated" ${state.deckSort === 'updated' ? 'selected' : ''}>Recently updated</option><option value="title" ${state.deckSort === 'title' ? 'selected' : ''}>Alphabetical</option><option value="cards" ${state.deckSort === 'cards' ? 'selected' : ''}>Most flashcards</option></select><button class="btn btn-ghost btn-small" data-action="clear-deck-filters">Clear filters</button></div>
      <div id="deckGridRegion">${renderDeckGrid(decks)}</div>`;
  }
  function renderDeckGrid(decks) {
    if (!decks.length) return `<div class="empty-state"><div class="empty-icon">⌕</div><h3>${db.decks.length ? 'No decks found' : 'No decks yet'}</h3><p>${db.decks.length ? 'Try a different search or clear your filters.' : 'Create your first flashcard deck to get started.'}</p>${db.decks.length ? `<button class="btn btn-ghost btn-small" data-action="clear-deck-filters">Clear filters</button>` : `<button class="btn btn-primary btn-small" data-action="new-deck">Create a Deck</button>`}</div>`;
    return `<div class="deck-grid">${decks.map(deck => renderDeckCard(deck)).join('')}</div>`;
  }
  function renderDeckDetail() {
    const deck = getDeck(state.selectedDeckId);
    if (!deck) return `${renderHeading('YOUR LIBRARY', 'Deck not found', 'This deck may have been deleted.') }<button class="btn btn-primary" data-nav="decks">Back to My Decks</button>`;
    const cards = deckCards(deck.id);
    const stats = deckStats(deck.id);
    return `${renderHeading('DECK DETAILS', deck.title, `${deck.subject} · Created ${formatDate(deck.createdAt)}`, `<button class="btn btn-ghost" data-action="edit-deck" data-id="${escapeHTML(deck.id)}">✎ Edit Deck</button><button class="btn btn-primary" data-action="add-card" data-id="${escapeHTML(deck.id)}">＋ Add Flashcards</button>`)}
      <section class="detail-hero"><div class="detail-top"><div class="deck-symbol" data-tone="${TONES.includes(deck.color) ? deck.color : 'indigo'}">${escapeHTML(deck.icon || '▤')}</div><div><p class="eyebrow">${escapeHTML(deck.subject)}</p><h1>${escapeHTML(deck.title)}</h1><p class="detail-description">${escapeHTML(deck.description || 'No description added yet.')}</p></div></div><div class="detail-meta"><span><strong>${stats.total}</strong> total cards</span><span><strong>${stats.mastered}</strong> mastered</span><span><strong>${stats.learning}</strong> need practice</span><span><strong>${stats.new}</strong> new</span><span><strong>${stats.percent}%</strong> mastered</span></div><div class="progress-track" style="margin-top:14px;height:8px"><div class="progress-fill" style="width:${stats.percent}%"></div></div><div class="heading-actions" style="margin-top:17px"><button class="btn btn-primary btn-small" data-action="study-deck" data-id="${escapeHTML(deck.id)}" ${cards.length ? '' : 'disabled'}>Study This Deck</button><button class="btn btn-secondary btn-small" data-action="quiz-deck" data-id="${escapeHTML(deck.id)}" ${cards.length ? '' : 'disabled'}>Quiz Yourself</button></div></section>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Flashcards</h2><p class="panel-subtitle">Questions and answers in this deck</p></div><button class="btn btn-secondary btn-small" data-action="add-card" data-id="${escapeHTML(deck.id)}">＋ Add Card</button></div>${cards.length ? `<div class="flashcard-list">${cards.map((card, index) => renderFlashcardRow(card, index)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">▱</div><h3>No flashcards in this deck</h3><p>Add a question and answer to begin studying this subject.</p><button class="btn btn-primary btn-small" data-action="add-card" data-id="${escapeHTML(deck.id)}">Add the First Card</button></div>`}</section>
      <div style="margin-top:14px"><button class="text-button" data-nav="decks">← Back to My Decks</button></div>`;
  }
  function renderFlashcardRow(card, index) {
    const status = getProgress(card.id).status || 'new';
    return `<div class="flashcard-row"><div class="flashcard-number">${index + 1}</div><div class="flashcard-text"><strong>${escapeHTML(card.question)}</strong><span>${escapeHTML(card.answer)}</span></div><span class="status-pill status-${status}">${status === 'new' ? 'New' : status === 'learning' ? 'Review' : 'Mastered'}</span><div class="row-actions"><button class="mini-icon-button" title="Edit card" data-action="edit-card" data-id="${escapeHTML(card.id)}">✎</button><button class="mini-icon-button" title="Duplicate card" data-action="duplicate-card" data-id="${escapeHTML(card.id)}">⧉</button><button class="mini-icon-button" title="Delete card" data-action="delete-card" data-id="${escapeHTML(card.id)}">×</button></div></div>`;
  }
  function renderStudyLanding() {
    const decks = [...db.decks].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return `${renderHeading('ACTIVE RECALL', 'Study your flashcards', 'Choose a deck and reveal each answer. Rate what you know so your learning progress stays accurate.', `<button class="btn btn-secondary" data-nav="progress">View My Progress</button>`)}${decks.length ? `<div class="deck-grid">${decks.map(deck => renderDeckCard(deck, true)).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">▱</div><h3>Create a deck before studying</h3><p>Your study sessions will use the questions and answers you add to a deck.</p><button class="btn btn-primary btn-small" data-action="new-deck">Create a Deck</button></div>`}`;
  }

  function startStudy(deckId, cardIds = null) {
    const cards = cardIds ? cardIds.map(getCard).filter(card => card && card.deckId === deckId) : deckCards(deckId);
    if (!cards.length) { showToast('This deck does not have any flashcards to study yet.', 'error'); return; }
    state.selectedDeckId = deckId;
    state.study = { deckId, cardIds: cards.map(card => card.id), index: 0, revealed: false, ratedCurrent: false, results: {} };
    setPage('study-session');
  }
  function renderStudySession() {
    const session = state.study;
    if (!session) return `<div class="empty-state"><h3>No study session is active</h3><button class="btn btn-primary" data-nav="study">Choose a deck</button></div>`;
    const deck = getDeck(session.deckId);
    const card = getCard(session.cardIds[session.index]);
    if (!deck || !card) return `<div class="empty-state"><h3>Study session unavailable</h3><button class="btn btn-primary" data-nav="study">Choose a deck</button></div>`;
    const total = session.cardIds.length;
    const progress = Math.round((session.index + 1) / total * 100);
    const reviewedCount = Object.keys(session.results).length;
    return `<div class="study-wrap"><div class="session-top"><div><p class="eyebrow">STUDY SESSION</p><h1>${escapeHTML(deck.title)}</h1><p>${escapeHTML(deck.subject)} · ${reviewedCount} of ${total} assessed</p></div><button class="btn btn-ghost btn-small" data-action="exit-study">Exit Study</button></div>
      <div class="session-progress"><span>Card ${session.index + 1} of ${total}</span><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div><span>${progress}%</span></div>
      <div class="study-card ${session.revealed ? 'is-answer' : ''}" role="button" tabindex="0" data-action="flip-card" aria-label="${session.revealed ? 'Show question' : 'Reveal answer'}"><span class="card-side-label">${session.revealed ? 'ANSWER' : 'QUESTION'}</span><p class="card-main-text">${escapeHTML(session.revealed ? card.answer : card.question)}</p><span class="card-tap-hint">${session.revealed ? 'Tap to see question again' : 'Tap card or use Reveal Answer'}</span></div>
      <div class="study-controls"><div class="study-controls-group"><button class="btn btn-ghost" data-action="study-prev" ${session.index === 0 ? 'disabled' : ''}>← Previous</button><button class="btn btn-ghost" data-action="study-shuffle">⤨ Shuffle</button></div><button class="btn btn-primary" data-action="flip-card">${session.revealed ? 'Show Question' : 'Reveal Answer'}</button><button class="btn btn-ghost" data-action="study-next">${session.index === total - 1 ? 'Finish Session →' : 'Next →'}</button></div>
      ${session.revealed && !session.ratedCurrent ? `<div class="assessment-row"><button class="btn btn-success" data-action="study-rate" data-status="mastered">✓ Got It</button><button class="btn btn-secondary" data-action="study-rate" data-status="learning">↻ Need More Practice</button></div>` : session.ratedCurrent ? `<p class="session-note">Rating saved: <strong>${session.results[card.id] === 'mastered' ? 'Mastered' : 'Need More Practice'}</strong>. Continue to the next card.</p>` : `<p class="session-note">Reveal the answer, then choose how well you know this card.</p>`}</div>`;
  }
  function finishStudy() {
    const session = state.study;
    if (!session) return;
    const values = Object.values(session.results);
    session.summary = { reviewed: values.length, mastered: values.filter(value => value === 'mastered').length, learning: values.filter(value => value === 'learning').length, total: session.cardIds.length };
    const deck = getDeck(session.deckId);
    addActivity('study', `Studied ${deck ? deck.title : 'a deck'}: reviewed ${session.summary.reviewed} card(s).`);
    persist();
    setPage('study-complete');
  }
  function renderStudyComplete() {
    const summary = state.study && state.study.summary ? state.study.summary : { reviewed: 0, mastered: 0, learning: 0, total: 0 };
    const deck = state.study ? getDeck(state.study.deckId) : null;
    return `<div class="completion-card"><div class="completion-icon">✓</div><p class="eyebrow">STUDY SESSION COMPLETE</p><h1>Nice work!</h1><p>You finished this study session${deck ? ` for <strong>${escapeHTML(deck.title)}</strong>` : ''}. Keep revisiting the cards that need more practice.</p><div class="completion-stats"><div class="completion-stat"><strong>${summary.reviewed}</strong><span>Cards assessed</span></div><div class="completion-stat"><strong>${summary.mastered}</strong><span>Got it</span></div><div class="completion-stat"><strong>${summary.learning}</strong><span>Need practice</span></div></div><div class="completion-actions"><button class="btn btn-primary" data-action="study-again">Study Again</button><button class="btn btn-ghost" data-action="return-dashboard">Dashboard</button></div></div>`;
  }

  function renderQuizSetup(prefill = {}) {
    const decks = db.decks.filter(deck => deckCards(deck.id).length);
    const selectedDeck = prefill.deckId || state.selectedDeckId || (decks[0] && decks[0].id) || '';
    const deck = getDeck(selectedDeck);
    const cards = deck ? deckCards(deck.id) : [];
    const defaultMode = prefill.mode || 'multiple';
    const canStart = decks.length > 0 && cards.length > 0;
    return `${renderHeading('CHECK YOUR KNOWLEDGE', 'Quiz yourself', 'Turn your flashcards into a quick knowledge check. Review what you know and find what needs more practice.')}
      ${canStart ? `<form class="quiz-setup" id="quizSetupForm"><div class="form-group"><label class="form-label" for="quizDeck">Choose a deck</label><select class="form-control" id="quizDeck" name="deckId" required>${decks.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === selectedDeck ? 'selected' : ''}>${escapeHTML(item.title)} · ${deckCards(item.id).length} cards</option>`).join('')}</select><p class="form-hint" id="quizDeckHint">${cards.length} flashcards available in this deck.</p></div>
      <div class="form-group"><span class="form-label">Quiz mode</span><div class="quiz-mode-options"><label class="choice-card"><input type="radio" name="mode" value="multiple" ${defaultMode === 'multiple' ? 'checked' : ''}><span><strong>Multiple Choice</strong><small>Choose the correct answer from the options provided.</small></span></label><label class="choice-card"><input type="radio" name="mode" value="written" ${defaultMode === 'written' ? 'checked' : ''}><span><strong>Written Recall</strong><small>Recall the answer yourself, then self-assess.</small></span></label></div></div>
      <div class="form-grid"><div class="form-group"><label class="form-label" for="quizCount">Number of questions</label><select class="form-control" id="quizCount" name="count"><option value="5" ${prefill.count === 5 ? 'selected' : ''}>5 Questions</option><option value="10" ${prefill.count === 10 ? 'selected' : ''}>10 Questions</option><option value="all" ${!prefill.count || prefill.count === 'all' ? 'selected' : ''}>All Questions</option></select></div><div class="form-group"><label class="form-label" for="quizShuffle">Question order</label><select class="form-control" id="quizShuffle" name="shuffle"><option value="yes">Shuffle questions</option><option value="no">Keep deck order</option></select></div></div>
      ${prefill.cardIds ? `<p class="form-hint">This retry will include only the questions you missed.</p>` : ''}<div class="form-actions"><button class="btn btn-primary" type="submit">Start Quiz →</button></div></form>` : `<div class="empty-state"><div class="empty-icon">✓</div><h3>No quiz-ready decks yet</h3><p>Create a deck and add at least one flashcard before starting a quiz.</p><button class="btn btn-primary btn-small" data-action="new-deck">Create a Deck</button></div>`}`;
  }
  function uniqueAnswerOptions(correctAnswer, cards, currentCardId) {
    const correct = String(correctAnswer).trim();
    const seen = new Set([normalizeAnswer(correct)]);
    const distractors = [];
    cards.forEach(card => {
      if (card.id === currentCardId) return;
      const value = String(card.answer || '').trim();
      const normalized = normalizeAnswer(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      distractors.push(value);
    });
    const options = [correct, ...distractors.slice(0, 3)];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { options, meaningful: options.length >= 2 };
  }
  function startQuiz(deckId, mode = 'multiple', count = 'all', shuffle = true, onlyCardIds = null) {
    const deck = getDeck(deckId);
    if (!deck) { showToast('Choose a valid deck before starting a quiz.', 'error'); return; }
    let cards = onlyCardIds ? onlyCardIds.map(getCard).filter(card => card && card.deckId === deckId) : deckCards(deckId);
    if (!cards.length) { showToast('This deck does not contain any flashcards.', 'error'); return; }
    if (shuffle) cards = [...cards].sort(() => Math.random() - .5);
    const requested = count === 'all' ? cards.length : Number(count);
    const actual = Math.min(cards.length, Number.isFinite(requested) && requested > 0 ? requested : cards.length);
    cards = cards.slice(0, actual);
    const allCards = deckCards(deckId);
    const questions = cards.map(card => {
      const choiceData = uniqueAnswerOptions(card.answer, allCards, card.id);
      return {
        cardId: card.id, question: card.question, correctAnswer: card.answer,
        options: choiceData.options, fallbackWritten: mode === 'multiple' && !choiceData.meaningful
      };
    });
    state.selectedDeckId = deckId;
    state.quiz = { deckId, mode, questions, index: 0, selectedOption: null, submitted: false, revealed: false, writtenResponse: '', results: [], retry: Boolean(onlyCardIds) };
    setPage('quiz-session');
    if (mode === 'multiple' && questions.some(question => question.fallbackWritten)) showToast('Some cards do not have enough distinct answers for choices, so they will use written recall.', 'info');
  }
  function renderQuizSession() {
    const quiz = state.quiz;
    if (!quiz) return `<div class="empty-state"><h3>No quiz is active</h3><button class="btn btn-primary" data-nav="quiz">Set up a quiz</button></div>`;
    const question = quiz.questions[quiz.index];
    if (!question) return `<div class="empty-state"><h3>Question unavailable</h3><button class="btn btn-primary" data-nav="quiz">Back to Quiz</button></div>`;
    const written = quiz.mode === 'written' || question.fallbackWritten;
    const actualType = written && quiz.mode === 'multiple' ? 'Written recall for this card' : (written ? 'Written recall' : 'Multiple choice');
    const done = quiz.results.length;
    const percent = Math.round((quiz.index + 1) / quiz.questions.length * 100);
    let interaction = '';
    if (!written) {
      interaction = `<div class="answer-options">${question.options.map((option, index) => {
        const selected = quiz.selectedOption === index;
        let cls = selected ? 'selected' : '';
        if (quiz.submitted && normalizeAnswer(option) === normalizeAnswer(question.correctAnswer)) cls = 'correct';
        else if (quiz.submitted && selected && normalizeAnswer(option) !== normalizeAnswer(question.correctAnswer)) cls = 'incorrect';
        return `<button class="answer-option ${cls}" data-action="select-option" data-index="${index}" ${quiz.submitted ? 'disabled' : ''}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option)}</span></button>`;
      }).join('')}</div>`;
      if (quiz.submitted) interaction += `<div class="feedback-box ${quiz.results[quiz.results.length - 1].correct ? 'good' : 'bad'}">${quiz.results[quiz.results.length - 1].correct ? 'Correct! Nice work.' : `Not quite. The correct answer is: ${escapeHTML(question.correctAnswer)}`}</div>`;
      interaction += `<div class="quiz-footer"><small>${quiz.submitted ? 'Your answer has been recorded.' : 'Select one answer, then submit.'}</small>${quiz.submitted ? `<button class="btn btn-primary" data-action="quiz-next">${quiz.index === quiz.questions.length - 1 ? 'See Results →' : 'Next Question →'}</button>` : `<button class="btn btn-primary" data-action="quiz-submit" ${quiz.selectedOption === null ? 'disabled' : ''}>Submit Answer</button>`}</div>`;
    } else {
      interaction = `<label class="form-label" for="writtenResponse">Your answer</label><textarea class="form-control written-answer" id="writtenResponse" placeholder="Type what you remember…" ${quiz.revealed ? 'disabled' : ''}>${escapeHTML(quiz.writtenResponse)}</textarea>`;
      if (quiz.revealed) {
        interaction += `<div class="feedback-box good"><strong>Saved answer:</strong> ${escapeHTML(question.correctAnswer)}<br><span style="font-weight:400">Compare this with what you wrote, then assess yourself honestly.</span></div><div class="assessment-row" style="margin-top:12px"><button class="btn btn-success" data-action="written-rate" data-correct="true">✓ I Got It Right</button><button class="btn btn-secondary" data-action="written-rate" data-correct="false">↻ Need More Practice</button></div>`;
      } else {
        interaction += `<div class="quiz-footer"><small>Reveal the saved answer before rating your response.</small><button class="btn btn-primary" data-action="quiz-reveal" ${quiz.writtenResponse.trim() ? '' : 'disabled'}>Reveal Answer</button></div>`;
      }
    }
    return `<div class="study-wrap"><div class="session-top"><div><p class="eyebrow">${quiz.retry ? 'RETRY MISSED QUESTIONS' : 'QUIZ SESSION'}</p><h1>${escapeHTML(getDeck(quiz.deckId)?.title || 'Quiz')}</h1><p>${escapeHTML(actualType)} · ${done} of ${quiz.questions.length} completed</p></div><button class="btn btn-ghost btn-small" data-action="exit-quiz">Exit Quiz</button></div><div class="quiz-question-card"><div class="question-top"><span>Question ${quiz.index + 1} of ${quiz.questions.length}</span><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><span>${percent}%</span></div><p class="quiz-question">${escapeHTML(question.question)}</p>${interaction}</div></div>`;
  }
  function recordQuizAnswer(correct, studentAnswer, isWritten) {
    const quiz = state.quiz;
    const question = quiz.questions[quiz.index];
    const card = getCard(question.cardId);
    const result = {
      cardId: question.cardId,
      question: question.question,
      correctAnswer: question.correctAnswer,
      studentAnswer: String(studentAnswer ?? ''),
      correct: Boolean(correct),
      isWritten: Boolean(isWritten)
    };
    quiz.results.push(result);
    setCardProgress(question.cardId, correct ? 'mastered' : 'learning', Boolean(correct));
    quiz.submitted = true;
    persist();
    if (!card) console.warn('Quiz card missing after answer was recorded.');
  }
  function nextQuizQuestion() {
    const quiz = state.quiz;
    if (!quiz) return;
    if (quiz.index >= quiz.questions.length - 1) finishQuiz();
    else {
      quiz.index += 1;
      quiz.selectedOption = null;
      quiz.submitted = false;
      quiz.revealed = false;
      quiz.writtenResponse = '';
      render();
    }
  }
  function finishQuiz() {
    const quiz = state.quiz;
    if (!quiz) return;
    const correct = quiz.results.filter(result => result.correct).length;
    const incorrect = quiz.results.length - correct;
    const total = quiz.questions.length;
    const record = {
      id: uid('quiz'), deckId: quiz.deckId, deckTitle: getDeck(quiz.deckId)?.title || 'Deleted deck',
      quizMode: quiz.mode, totalQuestions: total, answeredQuestions: quiz.results.length,
      correctAnswers: correct, incorrectAnswers: incorrect,
      score: total ? Math.round(correct / total * 100) : 0,
      completedAt: nowISO(), reviewedCardIds: quiz.results.map(result => result.cardId), results: quiz.results,
      retry: quiz.retry
    };
    db.quizHistory.unshift(record);
    db.quizHistory = db.quizHistory.slice(0, 100);
    state.lastQuizReviewCardIds = quiz.results.filter(result => !result.correct).map(result => result.cardId);
    addActivity('quiz', `Completed a ${quiz.mode === 'multiple' ? 'multiple-choice' : 'written recall'} quiz for ${record.deckTitle}: ${record.score}% (${correct}/${total}).`);
    persist();
    state.quizResultId = record.id;
    setPage('quiz-results');
  }
  function currentQuizRecord() { return db.quizHistory.find(item => item.id === state.quizResultId) || null; }
  function renderQuizResults() {
    const record = currentQuizRecord();
    if (!record) return `<div class="empty-state"><h3>Quiz result unavailable</h3><button class="btn btn-primary" data-nav="quiz">Start another quiz</button></div>`;
    const score = Number(record.score || 0);
    const review = record.results.filter(result => !result.correct);
    return `<div class="completion-card"><div class="completion-icon">${score >= 70 ? '✓' : '✦'}</div><p class="eyebrow">QUIZ COMPLETED</p><h1>${score >= 70 ? 'Well done!' : 'Good effort!'}</h1><p>You scored <strong>${score}%</strong> on ${escapeHTML(record.deckTitle)}. Every attempt helps you see what to review next.</p><div class="completion-stats"><div class="completion-stat"><strong>${record.totalQuestions}</strong><span>Total questions</span></div><div class="completion-stat"><strong>${record.correctAnswers}</strong><span>Correct answers</span></div><div class="completion-stat"><strong>${record.incorrectAnswers}</strong><span>Need review</span></div></div><div class="completion-actions">${review.length ? `<button class="btn btn-primary" data-action="retry-incorrect">Retry Incorrect (${review.length})</button>` : ''}<button class="btn btn-secondary" data-action="retake-quiz">Retake Quiz</button><button class="btn btn-ghost" data-action="return-dashboard">Dashboard</button></div></div>
      <section class="panel" style="max-width:760px;margin:0 auto"><div class="panel-header"><div><h2 class="panel-title">Answer Review</h2><p class="panel-subtitle">See which answers were correct</p></div></div><div class="flashcard-list">${record.results.map((result, index) => `<div class="flashcard-row"><div class="flashcard-number">${index + 1}</div><div class="flashcard-text"><strong>${escapeHTML(result.question)}</strong><span>Your answer: ${escapeHTML(result.studentAnswer || 'No response')} · Correct answer: ${escapeHTML(result.correctAnswer)}</span></div><span class="status-pill ${result.correct ? 'status-mastered' : 'status-learning'}">${result.correct ? 'Correct' : 'Review'}</span></div>`).join('')}</div></section>`;
  }

  function renderProgressPage() {
    const stats = allStats();
    const cards = [...db.cards].filter(card => state.progressFilter === 'all' || getProgress(card.id).status === state.progressFilter);
    const quizHistory = db.quizHistory.slice(0, 8);
    return `${renderHeading('YOUR LEARNING JOURNEY', 'My Progress', 'See what you have reviewed, what you have mastered, and which questions deserve another look.')}
      <div class="progress-overview">${renderStat('Cards Reviewed', stats.reviewed, 'Unique cards with a review', '▱', 'teal')}${renderStat('Cards Mastered', stats.mastered, 'Currently marked as known', '✓', 'green')}${renderStat('Average Quiz Accuracy', `${stats.average}%`, `${stats.quizSessions} completed quizzes`, '◔', 'yellow')}</div>
      <div class="content-grid"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Flashcard Learning Status</h2><p class="panel-subtitle">Filter every card by its current status</p></div></div><div class="status-tabs"><button class="status-tab ${state.progressFilter === 'all' ? 'active' : ''}" data-action="progress-filter" data-filter="all">All (${db.cards.length})</button><button class="status-tab ${state.progressFilter === 'new' ? 'active' : ''}" data-action="progress-filter" data-filter="new">New (${db.cards.filter(card => getProgress(card.id).status === 'new').length})</button><button class="status-tab ${state.progressFilter === 'learning' ? 'active' : ''}" data-action="progress-filter" data-filter="learning">Learning (${stats.learning})</button><button class="status-tab ${state.progressFilter === 'mastered' ? 'active' : ''}" data-action="progress-filter" data-filter="mastered">Mastered (${stats.mastered})</button></div>${cards.length ? `<div class="flashcard-list">${cards.map((card, index) => { const deck = getDeck(card.deckId); const status = getProgress(card.id).status; return `<div class="flashcard-row"><div class="flashcard-number">${index + 1}</div><div class="flashcard-text"><strong>${escapeHTML(card.question)}</strong><span>${escapeHTML(deck ? deck.title : 'Unknown deck')} · ${escapeHTML(card.answer)}</span></div><span class="status-pill status-${status}">${status === 'new' ? 'New' : status === 'learning' ? 'Learning' : 'Mastered'}</span></div>`; }).join('')}</div>` : `<div class="empty-state"><div class="empty-icon">◔</div><h3>No cards in this category</h3><p>Cards will appear here as you create and study your decks.</p></div>`}</section>
      <div><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Review Again</h2><p class="panel-subtitle">Cards marked for more practice</p></div><span class="status-pill status-learning">${reviewCards().length} cards</span></div>${reviewCards().length ? `<div class="flashcard-list">${reviewCards().slice(0,5).map(card => `<div class="flashcard-row"><div class="flashcard-text"><strong>${escapeHTML(card.question)}</strong><span>${escapeHTML(getDeck(card.deckId)?.title || 'Deck')}</span></div><button class="mini-icon-button" title="Mark mastered" data-action="mark-mastered" data-id="${escapeHTML(card.id)}">✓</button></div>`).join('')}</div><button class="btn btn-secondary btn-small btn-block" style="margin-top:13px" data-action="review-all">Study Difficult Cards</button>` : `<div class="empty-state"><div class="empty-icon">✓</div><h3>All caught up</h3><p>Cards you mark as needing practice will appear here.</p></div>`}</section>
      <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Quiz History</h2><p class="panel-subtitle">Your recent completed quizzes</p></div></div>${quizHistory.length ? `<div class="history-table-wrap"><table class="history-table"><thead><tr><th>DECK / MODE</th><th>DATE</th><th>SCORE</th><th></th></tr></thead><tbody>${quizHistory.map(item => `<tr><td><strong>${escapeHTML(item.deckTitle)}</strong><br><span style="color:#9AA3AE">${item.quizMode === 'multiple' ? 'Multiple choice' : 'Written recall'}</span></td><td>${escapeHTML(formatDate(item.completedAt))}</td><td class="score-text">${item.score}%</td><td><button class="text-button" data-action="open-history" data-id="${escapeHTML(item.id)}">View</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state"><div class="empty-icon">✓</div><h3>No quizzes completed yet</h3><p>Completed quiz results will be saved here.</p><button class="btn btn-primary btn-small" data-nav="quiz">Take a Quiz</button></div>`}</section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Recent Study Activity</h2><p class="panel-subtitle">Your latest actions across the app</p></div></div>${renderActivityList(5)}</section></div></div>`;
  }
  function renderHistoryDetail() {
    const record = db.quizHistory.find(item => item.id === state.historyDetailId);
    if (!record) return `<div class="empty-state"><h3>Quiz history not found</h3><button class="btn btn-primary" data-nav="progress">Back to Progress</button></div>`;
    return `${renderHeading('QUIZ HISTORY', record.deckTitle, `Completed ${formatDate(record.completedAt, true)} · ${record.score}% score`, `<button class="btn btn-ghost" data-nav="progress">← Back to Progress</button>`)}<section class="panel"><div class="completion-stats"><div class="completion-stat"><strong>${record.totalQuestions}</strong><span>Total questions</span></div><div class="completion-stat"><strong>${record.correctAnswers}</strong><span>Correct</span></div><div class="completion-stat"><strong>${record.incorrectAnswers}</strong><span>Incorrect</span></div></div><div class="flashcard-list">${(record.results || []).map((result, index) => `<div class="flashcard-row"><div class="flashcard-number">${index + 1}</div><div class="flashcard-text"><strong>${escapeHTML(result.question)}</strong><span>Your answer: ${escapeHTML(result.studentAnswer || 'No response')} · Correct: ${escapeHTML(result.correctAnswer)}</span></div><span class="status-pill ${result.correct ? 'status-mastered' : 'status-learning'}">${result.correct ? 'Correct' : 'Review'}</span></div>`).join('')}</div></section>`;
  }

  function isAppInstalled() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function renderSettingsPage() {
    const profile = db.profile;
    const installed = isAppInstalled();
    return `${renderHeading('PERSONALIZE YOUR SPACE', 'Settings', 'Manage your profile, application preferences, and study data.')}
      <div class="settings-layout"><section class="settings-card"><h2>Student Profile</h2><p>Your display name appears on your dashboard. No account or email is required.</p><form id="profileForm"><div class="form-group"><label class="form-label" for="displayName">Display name</label><input class="form-control" id="displayName" name="displayName" maxlength="40" value="${escapeHTML(profile.displayName || 'Student')}" required></div><div class="form-group"><label class="form-label" for="studyLabel">Preferred study label</label><input class="form-control" id="studyLabel" name="studyLabel" maxlength="50" value="${escapeHTML(profile.studyLabel || 'Keep learning')}"></div><div class="form-actions"><button class="btn btn-primary" type="submit">Save Profile</button></div></form></section>
      <section class="settings-card"><h2>Application</h2><p>Details about this study space and how it is installed.</p><div class="setting-row"><div><strong>Application name</strong><small>Flashcard Quiz</small></div></div><div class="setting-row"><div><strong>Version</strong><small>${APP_VERSION}</small></div></div><div class="setting-row"><div><strong>Installation status</strong><small>${installed ? 'Running as an installed app' : 'Opened in a browser'}</small></div><span class="install-status"><span class="online-dot"></span>${installed ? 'Installed' : 'Not installed'}</span></div><div class="setting-row"><div><strong>Install this app</strong><small>Use Flashcard Quiz from your home screen or desktop.</small></div>${installed ? `<button class="btn btn-ghost btn-small" disabled>Installed</button>` : `<button class="btn btn-primary btn-small" data-action="install-app">Install</button>`}</div></section>
      <section class="settings-card"><h2>Backup and Restore</h2><p>Keep a backup of your decks, cards, progress, and quiz history. The backup file stays under your control.</p><div class="setting-row"><div><strong>Export study data</strong><small>Download all saved records as a JSON backup.</small></div><button class="btn btn-secondary btn-small" data-action="export-data">Export JSON</button></div><div class="setting-row"><div><strong>Import study data</strong><small>Restore a backup created by Flashcard Quiz.</small></div><button class="btn btn-secondary btn-small" data-action="choose-import">Import JSON</button><input class="file-input-hidden" id="importFile" type="file" accept="application/json,.json"></div></section>
      <section class="settings-card"><h2>Reset Application Data</h2><p>This removes your locally saved decks, flashcards, progress, profile preferences, activities, and quiz history from this browser.</p><div class="setting-row"><div><strong>Delete all local study data</strong><small>This action cannot be undone unless you exported a backup.</small></div><button class="btn btn-danger btn-small" data-action="reset-data">Reset Data</button></div></section></div>
      <section class="settings-card" style="margin-top:17px"><h2>About local storage and offline access</h2><p>Flashcard Quiz stores data in this browser using LocalStorage. Data is not automatically synchronized between devices or shared with other students. Export your data to move it manually. After the app files have been cached by the service worker, the app shell can open offline on this same device.</p></section>`;
  }

  function openDeckModal(deckId = null) {
    const deck = deckId ? getDeck(deckId) : null;
    const selectedSubject = deck?.subject || 'Mathematics';
    const isCustom = !SUBJECTS.includes(selectedSubject);
    openModal(`${modalHeader(deck ? 'Edit Deck' : 'Create a New Deck', 'Add a subject deck for the lessons you want to study.')}<form id="deckForm" data-deck-id="${escapeHTML(deckId || '')}">
      <div class="form-group"><label class="form-label" for="deckTitle">Deck title</label><input class="form-control" id="deckTitle" name="title" maxlength="70" placeholder="e.g. Introduction to Biology" value="${escapeHTML(deck?.title || '')}" required></div>
      <div class="form-group"><label class="form-label" for="deckSubject">Subject</label><select class="form-control" id="deckSubject" name="subject">${SUBJECTS.map(subject => `<option value="${escapeHTML(subject)}" ${(!isCustom && selectedSubject === subject) ? 'selected' : ''}>${escapeHTML(subject)}</option>`).join('')}${isCustom ? `<option value="${escapeHTML(selectedSubject)}" selected>${escapeHTML(selectedSubject)}</option>` : ''}</select></div>
      <div class="form-group" id="customSubjectGroup" style="${isCustom || selectedSubject === 'Other' ? '' : 'display:none'}"><label class="form-label" for="customSubject">Custom subject</label><input class="form-control" id="customSubject" name="customSubject" maxlength="40" placeholder="Enter subject name" value="${escapeHTML(isCustom ? selectedSubject : '')}"></div>
      <div class="form-group"><label class="form-label" for="deckDescription">Description (optional)</label><textarea class="form-control" id="deckDescription" name="description" maxlength="180" placeholder="What will this deck help you remember?">${escapeHTML(deck?.description || '')}</textarea></div>
      <div class="form-grid"><div class="form-group"><label class="form-label" for="deckColor">Deck color</label><select class="form-control" id="deckColor" name="color">${TONES.map(tone => `<option value="${tone}" ${(deck?.color || 'indigo') === tone ? 'selected' : ''}>${tone[0].toUpperCase() + tone.slice(1)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label" for="deckIcon">Deck icon</label><select class="form-control" id="deckIcon" name="icon">${ICONS.map(icon => `<option value="${escapeHTML(icon)}" ${(deck?.icon || '▤') === icon ? 'selected' : ''}>${escapeHTML(icon)}</option>`).join('')}</select></div></div>
      <p class="form-error" id="deckFormError"></p><div class="form-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${deck ? 'Save Changes' : 'Create Deck'}</button></div></form>`);
  }

  function cardEditorBlock(question = '', answer = '', index = 1, removeAllowed = true) {
    return `<div class="flashcard-editor" data-card-row><div class="editor-card-heading"><span>FLASHCARD ${index}</span>${removeAllowed ? `<button class="text-button" type="button" data-action="remove-card-row">Remove</button>` : ''}</div><div><label class="form-label">Front · Question</label><textarea class="form-control card-question" maxlength="500" placeholder="Write a question, term, or concept…" required>${escapeHTML(question)}</textarea></div><div><label class="form-label">Back · Answer</label><textarea class="form-control card-answer" maxlength="1000" placeholder="Write the answer or explanation…" required>${escapeHTML(answer)}</textarea></div></div>`;
  }
  function openFlashcardModal(deckId, cardId = null) {
    const deck = getDeck(deckId);
    if (!deck) return;
    const card = cardId ? getCard(cardId) : null;
    if (card && card.deckId !== deckId) return;
    openModal(`${modalHeader(card ? 'Edit Flashcard' : 'Add Flashcards', `${escapeHTML(deck.title)} · Both sides are required.`)}<form id="flashcardForm" data-deck-id="${escapeHTML(deckId)}" data-card-id="${escapeHTML(cardId || '')}"><div id="cardEditorList">${cardEditorBlock(card?.question || '', card?.answer || '', 1, !card)}</div><p class="form-error" id="cardFormError"></p><div class="modal-footer"><button class="btn btn-secondary btn-small" type="button" data-action="add-card-row" ${card ? 'disabled' : ''}>＋ Add Another Card</button><div class="modal-footer-right"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${card ? 'Save Flashcard' : 'Save Flashcards'}</button></div></div></form>`, true);
  }

  function confirmDialog(title, message, confirmText, action, id = '') {
    openModal(`${modalHeader(title, message)}<div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-danger" data-action="${action}" data-id="${escapeHTML(id)}">${escapeHTML(confirmText)}</button></div>`);
  }

  function handleDeckSubmit(form) {
    const formData = new FormData(form);
    const title = String(formData.get('title') || '').trim();
    let subject = String(formData.get('subject') || '').trim();
    const customSubject = String(formData.get('customSubject') || '').trim();
    const description = String(formData.get('description') || '').trim();
    if (subject === 'Other') subject = customSubject;
    if (!title) return showFormError('deckFormError', 'Please enter a deck title.');
    if (!subject) return showFormError('deckFormError', 'Please choose or enter a subject.');
    if (title.length > 70 || subject.length > 40) return showFormError('deckFormError', 'Please shorten the title or subject.');
    const existingId = form.dataset.deckId;
    if (existingId) {
      const deck = getDeck(existingId);
      if (!deck) { closeModal(); showToast('This deck no longer exists.', 'error'); return; }
      Object.assign(deck, { title, subject, description, color: String(formData.get('color')), icon: String(formData.get('icon')), updatedAt: nowISO() });
      addActivity('deck', `Updated the ${title} deck.`);
      state.selectedDeckId = deck.id;
      persist(); closeModal(); render(); showToast('Deck updated successfully.', 'success');
    } else {
      const deck = { id: uid('deck'), title, subject, description, color: String(formData.get('color')), icon: String(formData.get('icon')), createdAt: nowISO(), updatedAt: nowISO(), isSample: false };
      db.decks.push(deck);
      addActivity('deck', `Created a new deck: ${title}.`);
      state.selectedDeckId = deck.id;
      persist(); closeModal(); setPage('detail'); showToast('Your new deck is ready.', 'success');
    }
  }
  function handleFlashcardSubmit(form) {
    const deckId = form.dataset.deckId;
    const deck = getDeck(deckId);
    if (!deck) { closeModal(); showToast('The selected deck could not be found.', 'error'); return; }
    const rows = [...form.querySelectorAll('[data-card-row]')];
    const entries = rows.map(row => ({
      question: row.querySelector('.card-question')?.value.trim() || '',
      answer: row.querySelector('.card-answer')?.value.trim() || ''
    }));
    if (!entries.length || entries.some(item => !item.question || !item.answer)) return showFormError('cardFormError', 'Every flashcard needs both a question and an answer.');
    const existingId = form.dataset.cardId;
    if (existingId) {
      const card = getCard(existingId);
      if (!card || card.deckId !== deckId) { closeModal(); showToast('This flashcard no longer exists.', 'error'); return; }
      Object.assign(card, { question: entries[0].question, answer: entries[0].answer, updatedAt: nowISO() });
      addActivity('card', `Updated a flashcard in ${deck.title}.`);
      showToast('Flashcard updated.', 'success');
    } else {
      entries.forEach(entry => db.cards.push({ id: uid('card'), deckId, ...entry, createdAt: nowISO(), updatedAt: nowISO() }));
      addActivity('card', `Added ${entries.length} flashcard(s) to ${deck.title}.`);
      showToast(`${entries.length} flashcard(s) saved.`, 'success');
    }
    deck.updatedAt = nowISO();
    persist(); closeModal(); render();
  }
  function showFormError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = message;
    else showToast(message, 'error');
  }

  function deleteDeck(deckId) {
    const deck = getDeck(deckId);
    if (!deck) return;
    const cardIds = new Set(deckCards(deckId).map(card => card.id));
    db.decks = db.decks.filter(item => item.id !== deckId);
    db.cards = db.cards.filter(card => card.deckId !== deckId);
    cardIds.forEach(id => delete db.progress[id]);
    db.quizHistory = db.quizHistory.filter(session => session.deckId !== deckId);
    addActivity('deck', `Deleted the ${deck.title} deck and its flashcards.`);
    if (state.selectedDeckId === deckId) state.selectedDeckId = null;
    persist(); closeModal(); setPage('decks'); showToast('Deck and related progress deleted.', 'success');
  }
  function deleteFlashcard(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    const deck = getDeck(card.deckId);
    db.cards = db.cards.filter(item => item.id !== cardId);
    delete db.progress[cardId];
    db.quizHistory.forEach(session => {
      session.results = (session.results || []).filter(result => result.cardId !== cardId);
      session.reviewedCardIds = (session.reviewedCardIds || []).filter(id => id !== cardId);
      session.totalQuestions = session.results.length;
      session.answeredQuestions = session.results.length;
      session.correctAnswers = session.results.filter(result => result.correct).length;
      session.incorrectAnswers = session.results.length - session.correctAnswers;
      session.score = session.results.length ? Math.round(session.correctAnswers / session.results.length * 100) : 0;
    });
    if (deck) { deck.updatedAt = nowISO(); addActivity('card', `Deleted a flashcard from ${deck.title}.`); }
    persist(); closeModal(); render(); showToast('Flashcard deleted.', 'success');
  }
  function duplicateFlashcard(cardId) {
    const card = getCard(cardId);
    if (!card) return;
    const duplicate = { id: uid('card'), deckId: card.deckId, question: `${card.question} (copy)`, answer: card.answer, createdAt: nowISO(), updatedAt: nowISO() };
    db.cards.push(duplicate);
    const deck = getDeck(card.deckId);
    if (deck) { deck.updatedAt = nowISO(); addActivity('card', `Duplicated a flashcard in ${deck.title}.`); }
    persist(); render(); showToast('Flashcard duplicated.', 'success');
  }

  function showInstallGuide() {
    const ua = navigator.userAgent || '';
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instructions = ios
      ? `<ol><li>Open this deployed website in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Enable <strong>Open as Web App</strong> when the option is available.</li><li>Tap <strong>Add</strong>.</li></ol>`
      : `<ol><li>Open the deployed HTTPS website in a supported browser such as Chrome or Edge.</li><li>Open the browser menu and look for <strong>Install app</strong> or <strong>Add to Home Screen</strong>.</li><li>Confirm the installation prompt.</li><li>Launch Flashcard Quiz from your app list, home screen, or desktop.</li></ol>`;
    openModal(`${modalHeader(ios ? 'Add to Home Screen' : 'Install Flashcard Quiz', 'Installation availability depends on your browser and device.')}${instructions}<p class="form-hint">This is a Progressive Web App (PWA), not an Android APK or a separate Windows installer. The website must be deployed over HTTPS (or tested on localhost) for service worker features.</p><div class="form-actions"><button class="btn btn-primary" data-action="close-modal">Got it</button></div>`);
  }
  async function installApp() {
    if (isAppInstalled()) { showToast('Flashcard Quiz is already installed on this device.', 'info'); return; }
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') showToast('Installation accepted. Check your app list or home screen.', 'success');
        else showToast('Installation was not completed. You can try again from your browser menu.', 'info');
      } catch (error) {
        console.error('Install prompt failed:', error);
        showToast('The browser could not open its installation prompt. Use the browser menu instead.', 'error');
      } finally {
        deferredInstallPrompt = null;
        render();
      }
    } else showInstallGuide();
  }

  function exportData() {
    addActivity('data', 'Exported a study data backup.');
    persist();
    const payload = { app: 'Flashcard Quiz', version: APP_VERSION, exportedAt: nowISO(), data: db };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `flashcard-quiz-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    showToast('Backup downloaded.', 'success');
  }
  function validateImport(payload) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') return { ok: false, message: 'This file is not a Flashcard Quiz backup.' };
    const imported = payload.data;
    if (!Array.isArray(imported.decks) || !Array.isArray(imported.cards) || !imported.progress || typeof imported.progress !== 'object' || Array.isArray(imported.progress) || !Array.isArray(imported.quizHistory)) return { ok: false, message: 'The backup is missing required data sections.' };
    const deckIds = new Set();
    for (const deck of imported.decks) {
      if (!deck || typeof deck.id !== 'string' || !deck.id || deckIds.has(deck.id) || typeof deck.title !== 'string' || !deck.title.trim() || typeof deck.subject !== 'string' || !deck.subject.trim()) return { ok: false, message: 'A deck record is incomplete or has a duplicate ID.' };
      deckIds.add(deck.id);
    }
    const cardIds = new Set();
    for (const card of imported.cards) {
      if (!card || typeof card.id !== 'string' || !card.id || cardIds.has(card.id) || !deckIds.has(card.deckId) || typeof card.question !== 'string' || !card.question.trim() || typeof card.answer !== 'string' || !card.answer.trim()) return { ok: false, message: 'A flashcard is invalid or refers to a missing deck.' };
      cardIds.add(card.id);
    }
    for (const id of Object.keys(imported.progress)) if (!cardIds.has(id) || !imported.progress[id] || !['new', 'learning', 'mastered'].includes(imported.progress[id].status || 'new')) return { ok: false, message: 'The backup contains progress for an unknown card or an invalid status.' };
    for (const session of imported.quizHistory) {
      if (!session || typeof session.id !== 'string' || !deckIds.has(session.deckId) || !Array.isArray(session.results)) return { ok: false, message: 'The backup contains an invalid quiz history record.' };
      if (session.results.some(result => !result || typeof result.cardId !== 'string' || !cardIds.has(result.cardId) || typeof result.question !== 'string' || typeof result.correctAnswer !== 'string')) return { ok: false, message: 'A quiz result refers to a missing or invalid flashcard.' };
    }
    const profile = imported.profile && typeof imported.profile === 'object' ? imported.profile : {};
    const normalizedProgress = {};
    Object.entries(imported.progress).forEach(([cardId, record]) => {
      normalizedProgress[cardId] = { ...record, id: safeText(record.id, `progress_${cardId}`), cardId };
    });
    return { ok: true, data: {
      version: 1, initialized: true,
      decks: imported.decks.map(deck => ({ ...deck })),
      cards: imported.cards.map(card => ({ ...card })),
      progress: normalizedProgress,
      quizHistory: imported.quizHistory.map(session => ({ ...session, results: session.results.map(result => ({ ...result })) })),
      activities: Array.isArray(imported.activities) ? imported.activities.slice(0, 80) : [],
      profile: { displayName: typeof profile.displayName === 'string' ? profile.displayName.slice(0, 40) : 'Student', studyLabel: typeof profile.studyLabel === 'string' ? profile.studyLabel.slice(0, 50) : 'Keep learning', createdAt: profile.createdAt || nowISO() }
    }};
  }
  async function importDataFile(file) {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('This backup is larger than 8 MB and cannot be imported here.');
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = validateImport(payload);
      if (!result.ok) throw new Error(result.message);
      openModal(`${modalHeader('Replace local study data?', `This backup contains ${result.data.decks.length} deck(s) and ${result.data.cards.length} flashcard(s).`)}<p class="page-subtitle" style="margin-bottom:18px">Importing replaces the current decks, progress, profile, activities, and quiz history in this browser. Export your current data first if you may need it later.</p><div class="form-actions"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="confirm-import">Import Backup</button></div>`);
      state.pendingImportData = result.data;
    } catch (error) {
      console.error('Import failed:', error);
      showToast(error.message || 'The selected backup could not be imported.', 'error');
    }
  }
  function confirmImport() {
    if (!state.pendingImportData) return;
    db = state.pendingImportData;
    delete state.pendingImportData;
    addActivity('data', 'Imported a study data backup.');
    persist(); closeModal(); state.selectedDeckId = null; setPage('dashboard'); showToast('Backup imported successfully.', 'success');
  }
  function resetData() {
    db = createEmptyData();
    db.initialized = true;
    persist();
    state.selectedDeckId = null; state.study = null; state.quiz = null; state.lastQuizReviewCardIds = [];
    closeModal(); setPage('dashboard'); showToast('All local study data has been reset.', 'success');
  }

  function handleAction(action, target) {
    const id = target.dataset.id || '';
    switch (action) {
      case 'new-deck': openDeckModal(); break;
      case 'edit-deck': openDeckModal(id); break;
      case 'deck-options': {
        const deck = getDeck(id);
        if (deck) openModal(`${modalHeader(deck.title, 'Deck actions')}<div class="setting-row"><div><strong>Edit deck details</strong><small>Change title, subject, or description.</small></div><button class="btn btn-secondary btn-small" data-action="edit-deck" data-id="${escapeHTML(id)}">Edit</button></div><div class="setting-row"><div><strong>Delete deck</strong><small>Also removes its flashcards and progress.</small></div><button class="btn btn-danger btn-small" data-action="ask-delete-deck" data-id="${escapeHTML(id)}">Delete</button></div>`);
        break;
      }
      case 'ask-delete-deck': { const deck = getDeck(id); if (deck) confirmDialog('Delete this deck?', `Delete “${deck.title}” and all its flashcards, deck-specific progress, and quiz history? This cannot be undone.`, 'Delete Deck', 'confirm-delete-deck', id); break; }
      case 'confirm-delete-deck': deleteDeck(id); break;
      case 'open-deck': state.selectedDeckId = id; setPage('detail'); break;
      case 'add-card': openFlashcardModal(id || state.selectedDeckId); break;
      case 'edit-card': { const card = getCard(id); if (card) openFlashcardModal(card.deckId, card.id); break; }
      case 'delete-card': { const card = getCard(id); if (card) confirmDialog('Delete this flashcard?', `Delete “${card.question}”? Its learning progress will also be removed.`, 'Delete Card', 'confirm-delete-card', id); break; }
      case 'confirm-delete-card': deleteFlashcard(id); break;
      case 'duplicate-card': duplicateFlashcard(id); break;
      case 'study-deck': startStudy(id); break;
      case 'quiz-deck': state.selectedDeckId = id; setPage('quiz'); break;
      case 'clear-deck-filters': state.deckSearch = ''; state.deckSubject = 'all'; state.deckSort = 'updated'; render(); break;
      case 'flip-card': if (state.study) { state.study.revealed = !state.study.revealed; render(); } break;
      case 'study-prev': if (state.study && state.study.index > 0) { state.study.index--; state.study.revealed = false; state.study.ratedCurrent = false; render(); } break;
      case 'study-next': if (state.study) { if (state.study.index === state.study.cardIds.length - 1) finishStudy(); else { state.study.index++; state.study.revealed = false; state.study.ratedCurrent = false; render(); } } break;
      case 'study-shuffle': if (state.study) { const current = state.study.cardIds[state.study.index]; const remaining = state.study.cardIds.filter(cardId => cardId !== current).sort(() => Math.random() - .5); state.study.cardIds = [current, ...remaining]; state.study.index = 0; state.study.revealed = false; state.study.ratedCurrent = false; render(); showToast('The remaining cards have been shuffled.', 'success'); } break;
      case 'study-rate': if (state.study && state.study.revealed) { const cardId = state.study.cardIds[state.study.index]; const status = target.dataset.status; const isCorrect = status === 'mastered'; setCardProgress(cardId, status, isCorrect); state.study.results[cardId] = status; state.study.ratedCurrent = true; persist(); render(); } break;
      case 'exit-study': if (state.study) { setPage('detail'); } else setPage('study'); break;
      case 'study-again': if (state.study) startStudy(state.study.deckId, state.study.cardIds); break;
      case 'return-dashboard': setPage('dashboard'); break;
      case 'select-option': if (state.quiz && !state.quiz.submitted) { state.quiz.selectedOption = Number(target.dataset.index); render(); } break;
      case 'quiz-submit': if (state.quiz && state.quiz.selectedOption !== null) { const question = state.quiz.questions[state.quiz.index]; const chosen = question.options[state.quiz.selectedOption]; recordQuizAnswer(normalizeAnswer(chosen) === normalizeAnswer(question.correctAnswer), chosen, false); render(); } break;
      case 'quiz-next': nextQuizQuestion(); break;
      case 'quiz-reveal': if (state.quiz && state.quiz.writtenResponse.trim()) { state.quiz.revealed = true; render(); } break;
      case 'written-rate': if (state.quiz && state.quiz.revealed) { const correct = target.dataset.correct === 'true'; recordQuizAnswer(correct, state.quiz.writtenResponse, true); nextQuizQuestion(); } break;
      case 'exit-quiz': confirmDialog('Exit this quiz?', 'Your unfinished quiz will not be added to quiz history. Progress from already answered questions remains saved.', 'Exit Quiz', 'confirm-exit-quiz'); break;
      case 'confirm-exit-quiz': state.quiz = null; closeModal(); setPage('quiz'); break;
      case 'retry-incorrect': { const record = currentQuizRecord(); if (!record) break; const ids = record.results.filter(result => !result.correct).map(result => result.cardId); if (!ids.length) showToast('There are no incorrect questions to retry.', 'info'); else startQuiz(record.deckId, record.quizMode, 'all', false, ids); break; }
      case 'retake-quiz': { const record = currentQuizRecord(); if (record) startQuiz(record.deckId, record.quizMode, record.totalQuestions, true); break; }
      case 'progress-filter': state.progressFilter = target.dataset.filter || 'all'; render(); break;
      case 'review-all': { const cards = reviewCards(); if (!cards.length) { showToast('There are no cards needing extra practice right now.', 'info'); break; } const deckIds = [...new Set(cards.map(card => card.deckId))]; if (deckIds.length === 1) startStudy(deckIds[0], cards.map(card => card.id)); else { state.reviewDeckIds = deckIds; openReviewChooser(cards); } break; }
      case 'mark-mastered': setCardProgress(id, 'mastered', true); persist(); render(); showToast('Card marked as mastered.', 'success'); break;
      case 'open-history': state.historyDetailId = id; setPage('history-detail'); break;
      case 'install-app': installApp(); break;
      case 'export-data': exportData(); break;
      case 'choose-import': document.getElementById('importFile')?.click(); break;
      case 'confirm-import': confirmImport(); break;
      case 'reset-data': confirmDialog('Reset all application data?', 'This permanently deletes all decks, flashcards, learning progress, activities, and quiz history saved in this browser. Export a backup first if you want to keep your records.', 'Reset Everything', 'confirm-reset-data'); break;
      case 'confirm-reset-data': resetData(); break;
      case 'close-modal': closeModal(); break;
      case 'add-card-row': addCardEditorRow(); break;
      case 'remove-card-row': target.closest('[data-card-row]')?.remove(); renumberCardRows(); break;
      case 'refresh-app': if (swRegistration?.waiting) swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' }); break;
      default: break;
    }
  }
  function addCardEditorRow() {
    const list = document.getElementById('cardEditorList');
    if (!list) return;
    const count = list.querySelectorAll('[data-card-row]').length + 1;
    list.insertAdjacentHTML('beforeend', cardEditorBlock('', '', count, true));
    const last = list.querySelector('[data-card-row]:last-child .card-question');
    if (last) last.focus();
  }
  function renumberCardRows() {
    const rows = [...document.querySelectorAll('#cardEditorList [data-card-row]')];
    rows.forEach((row, index) => { const label = row.querySelector('.editor-card-heading span'); if (label) label.textContent = `FLASHCARD ${index + 1}`; });
    if (rows.length === 1) rows[0].querySelector('[data-action="remove-card-row"]')?.setAttribute('disabled', 'disabled');
  }
  function openReviewChooser(cards) {
    const byDeck = [...new Set(cards.map(card => card.deckId))].map(deckId => getDeck(deckId)).filter(Boolean);
    openModal(`${modalHeader('Choose a deck to review', `${cards.length} cards across ${byDeck.length} decks need practice.`)}<div class="flashcard-list">${byDeck.map(deck => `<div class="flashcard-row"><div class="deck-symbol">${escapeHTML(deck.icon || '▤')}</div><div class="flashcard-text"><strong>${escapeHTML(deck.title)}</strong><span>${cards.filter(card => card.deckId === deck.id).length} card(s) to review</span></div><button class="btn btn-primary btn-small" data-action="review-deck" data-id="${escapeHTML(deck.id)}">Study</button></div>`).join('')}</div>`);
  }

  // Main application interactions are delegated so dynamically-rendered views remain functional.
  appView.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { setPage(nav.dataset.nav); return; }
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget);
  });
  modalRoot.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      if (actionTarget.dataset.action === 'review-deck') {
        const deckId = actionTarget.dataset.id;
        const cards = reviewCards(deckId);
        closeModal(); startStudy(deckId, cards.map(card => card.id));
        return;
      }
      handleAction(actionTarget.dataset.action, actionTarget);
      return;
    }
    if (event.target.classList.contains('modal-backdrop')) closeModal();
  });
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav && !appView.contains(nav)) setPage(nav.dataset.nav);
  });
  appView.addEventListener('input', event => {
    if (event.target.id === 'deckSearch') {
      state.deckSearch = event.target.value;
      const region = document.getElementById('deckGridRegion');
      if (region) region.innerHTML = renderDeckGrid(filteredDecks());
    }
    if (event.target.id === 'writtenResponse' && state.quiz && !state.quiz.revealed) {
      state.quiz.writtenResponse = event.target.value;
      const reveal = appView.querySelector('[data-action="quiz-reveal"]');
      if (reveal) reveal.disabled = !event.target.value.trim();
    }
  });
  appView.addEventListener('change', event => {
    if (event.target.id === 'deckSubjectFilter') { state.deckSubject = event.target.value; const region = document.getElementById('deckGridRegion'); if (region) region.innerHTML = renderDeckGrid(filteredDecks()); }
    if (event.target.id === 'deckSort') { state.deckSort = event.target.value; const region = document.getElementById('deckGridRegion'); if (region) region.innerHTML = renderDeckGrid(filteredDecks()); }
    if (event.target.id === 'importFile' && event.target.files && event.target.files[0]) { importDataFile(event.target.files[0]); event.target.value = ''; }
    if (event.target.id === 'quizDeck') {
      const deck = getDeck(event.target.value);
      const hint = document.getElementById('quizDeckHint');
      if (hint) hint.textContent = `${deck ? deckCards(deck.id).length : 0} flashcards available in this deck.`;
    }
  });
  appView.addEventListener('submit', event => {
    if (event.target.id === 'quizSetupForm') {
      event.preventDefault();
      const formData = new FormData(event.target);
      const deckId = String(formData.get('deckId') || '');
      const deck = getDeck(deckId);
      if (!deck || !deckCards(deckId).length) { showToast('Choose a deck with at least one flashcard.', 'error'); return; }
      startQuiz(deckId, String(formData.get('mode') || 'multiple'), String(formData.get('count') || 'all'), formData.get('shuffle') !== 'no');
    } else if (event.target.id === 'profileForm') {
      event.preventDefault();
      const formData = new FormData(event.target);
      const displayName = String(formData.get('displayName') || '').trim();
      const studyLabel = String(formData.get('studyLabel') || '').trim();
      if (!displayName) { showToast('Please enter a display name.', 'error'); return; }
      db.profile.displayName = displayName.slice(0, 40);
      db.profile.studyLabel = studyLabel.slice(0, 50) || 'Keep learning';
      addActivity('profile', 'Updated the student profile.');
      persist(); render(); showToast('Profile saved.', 'success');
    } else if (event.target.id === 'deckForm') {
      event.preventDefault(); handleDeckSubmit(event.target);
    } else if (event.target.id === 'flashcardForm') {
      event.preventDefault(); handleFlashcardSubmit(event.target);
    }
  });
  modalRoot.addEventListener('change', event => {
    if (event.target.id === 'deckSubject') {
      const group = document.getElementById('customSubjectGroup');
      if (group) group.style.display = event.target.value === 'Other' ? '' : 'none';
    }
  });
  modalRoot.addEventListener('submit', event => {
    if (event.target.id === 'deckForm') {
      event.preventDefault();
      handleDeckSubmit(event.target);
    } else if (event.target.id === 'flashcardForm') {
      event.preventDefault();
      handleFlashcardSubmit(event.target);
    }
  });
  appView.addEventListener('keydown', event => {
    if (event.target.matches('.study-card') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (state.study) { state.study.revealed = !state.study.revealed; render(); } }
  });

  menuToggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    mobileOverlay.classList.toggle('show', open);
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  mobileOverlay.addEventListener('click', closeMobileNav);
  document.getElementById('profileShortcut').addEventListener('click', () => setPage('settings'));

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (state.page === 'settings' || state.page === 'dashboard') render();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    showToast('Flashcard Quiz was installed successfully.', 'success');
    render();
  });

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    try {
      swRegistration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      swRegistration.addEventListener('updatefound', () => {
        const installing = swRegistration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) showUpdateNotice();
        });
      });
      if (swRegistration.waiting && navigator.serviceWorker.controller) showUpdateNotice();
      window.addEventListener('online', () => showToast('You are back online.', 'success'));
      window.addEventListener('offline', () => showToast('You are offline. Cached app files remain available.', 'info'));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isChangingController) return;
        isChangingController = true;
        window.location.reload();
      });
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  }
  function showUpdateNotice() {
    const toast = document.createElement('div');
    toast.className = 'toast info';
    const text = document.createElement('span');
    text.textContent = 'A new version is ready.';
    const button = document.createElement('button');
    button.className = 'text-button';
    button.textContent = 'Reload';
    button.addEventListener('click', () => { if (swRegistration?.waiting) swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' }); });
    toast.append(text, button);
    toastRegion.appendChild(toast);
  }

  // Simple navigation utility used by action buttons from the progress screen.
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-nav="study"], [data-nav="quiz"], [data-nav="progress"], [data-nav="settings"], [data-nav="dashboard"], [data-nav="decks"]');
    if (!target) return;
    if (target.closest('#sidebar') || target.closest('#appView') || target.id === 'profileShortcut') return;
    setPage(target.dataset.nav);
  });

  render();
  if (document.readyState === 'complete') registerServiceWorker();
  else window.addEventListener('load', registerServiceWorker, { once: true });
})();
