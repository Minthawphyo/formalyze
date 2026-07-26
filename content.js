(function () {
  const PROCESSED_ATTR = 'data-formalyze-injected';
  const states = new Map(); // bodyEl -> control state

  // Gmail labels its compose body "Message Body" on a div. Outlook on the
  // web labels its body "Message body" too, but not necessarily on a div,
  // so match any element type on a case-insensitive prefix instead of
  // hardcoding either provider's exact tag or label casing.
  function findComposeBodies() {
    return Array.from(document.querySelectorAll('[contenteditable="true"][aria-label]'))
      .filter((el) => el.getAttribute('aria-label').trim().toLowerCase().startsWith('message body'))
      .filter((el) => !el.hasAttribute(PROCESSED_ATTR));
  }

  const ICON_SPARKLE =
    '<svg class="formalyze-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3c.7 3.4 1.9 4.6 5 5-3.1.4-4.3 1.6-5 5-.7-3.4-1.9-4.6-5-5 3.1-.4 4.3-1.6 5-5zM19 13c.4 1.7.9 2.3 2.5 2.7-1.6.4-2.1 1-2.5 2.7-.4-1.7-.9-2.3-2.5-2.7 1.6-.4 2.1-1 2.5-2.7z"/></svg>';
  const ICON_UNDO =
    '<svg class="formalyze-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62C8.77 11.22 10.55 10.5 12.5 10.5c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>';
  const ICON_COMPARE =
    '<svg class="formalyze-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9.01 14H2v2h7.01v3L13 15l-3.99-4v3zm5.98-2v3H22v-2h-7.01V12l-4 3.5 4 3.5v-3H22"/></svg>';

  function makePill(iconSvg, label, extraClass) {
    const btn = document.createElement('div');
    btn.className = `formalyze-pill ${extraClass || ''}`.trim();
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.innerHTML = `${iconSvg}<span class="formalyze-label">${label}</span>`;
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') btn.click();
    });
    return btn;
  }

  function createControls(bodyEl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'formalyze-wrapper';

    const formalizeBtn = makePill(ICON_SPARKLE, 'Formalize', 'formalyze-btn-main');
    const undoBtn = makePill(ICON_UNDO, 'Undo', 'formalyze-btn-undo');
    const diffBtn = makePill(ICON_COMPARE, 'Changes', 'formalyze-btn-diff');
    undoBtn.style.display = 'none';
    diffBtn.style.display = 'none';

    const diffPanel = document.createElement('div');
    diffPanel.className = 'formalyze-diff-panel';
    diffPanel.style.display = 'none';

    wrapper.append(formalizeBtn, undoBtn, diffBtn);
    document.body.append(wrapper, diffPanel);

    const state = {
      wrapper,
      formalizeBtn,
      undoBtn,
      diffBtn,
      diffPanel,
      originalText: null,
      rewrittenText: null,
      busy: false
    };

    formalizeBtn.addEventListener('click', () => onFormalizeClick(bodyEl, state));
    undoBtn.addEventListener('click', () => onUndoClick(bodyEl, state));
    diffBtn.addEventListener('click', () => onDiffToggle(state));

    return state;
  }

  function setFormalizeState(state, mode) {
    const btn = state.formalizeBtn;
    const label = btn.querySelector('.formalyze-label');
    btn.classList.remove('formalyze-loading', 'formalyze-error');
    if (mode === 'loading') {
      btn.classList.add('formalyze-loading');
      label.textContent = 'Formalizing…';
    } else if (mode === 'error') {
      btn.classList.add('formalyze-error');
      label.textContent = 'Formalize';
    } else {
      label.textContent = 'Formalize';
    }
  }

  function isExtensionContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  }

  function onFormalizeClick(bodyEl, state) {
    if (state.busy) return;

    if (!isExtensionContextValid()) {
      setFormalizeState(state, 'error');
      alert(
        'Formalyze was reloaded/updated — please refresh this Gmail tab (Ctrl+Shift+R) and try again.'
      );
      return;
    }

    const text = bodyEl.innerText;
    state.busy = true;
    setFormalizeState(state, 'loading');

    chrome.storage.local.get('tone', ({ tone }) => {
      chrome.runtime.sendMessage({ type: 'FORMALIZE', text, tone }, async (response) => {
        if (chrome.runtime.lastError || !response || response.error) {
          state.busy = false;
          setFormalizeState(state, 'error');
          alert(
            'Formalyze error: ' +
              (chrome.runtime.lastError?.message || response?.error || 'Unknown error')
          );
          return;
        }

        state.originalText = text;
        state.rewrittenText = response.text;

        await animateInsertText(bodyEl, response.text);
        flashHighlight(bodyEl);
        setFormalizeState(state, 'idle');
        state.busy = false;

        state.undoBtn.style.display = 'flex';
        state.diffBtn.style.display = 'flex';
        renderDiff(state);
      });
    });
  }

  function onUndoClick(bodyEl, state) {
    if (state.busy || state.originalText == null) return;
    insertText(bodyEl, state.originalText);
    flashHighlight(bodyEl);
    state.undoBtn.style.display = 'none';
    state.diffBtn.style.display = 'none';
    state.diffPanel.style.display = 'none';
    state.originalText = null;
    state.rewrittenText = null;
  }

  function onDiffToggle(state) {
    const willShow = state.diffPanel.style.display === 'none';
    state.diffPanel.style.display = willShow ? 'block' : 'none';
    if (willShow) positionDiffPanel(state);
  }

  function insertText(bodyEl, newText) {
    bodyEl.focus();
    // execCommand is deprecated but is the only reliable way to replace
    // contenteditable content that keeps Gmail's own editor state in sync.
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, newText);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const TYPE_CHUNK_DELAY_MS = 16;

  // Types the new text in word-sized chunks instead of dropping it in all at
  // once, so the rewrite visibly happens rather than just appearing.
  async function animateInsertText(bodyEl, newText) {
    bodyEl.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    const chunks = newText.split(/(\s+)/).filter((c) => c.length > 0);
    for (const chunk of chunks) {
      if (!document.contains(bodyEl)) return; // compose window closed mid-animation
      document.execCommand('insertText', false, chunk);
      await sleep(TYPE_CHUNK_DELAY_MS);
    }
  }

  function flashHighlight(bodyEl) {
    bodyEl.classList.remove('formalyze-flash');
    // force reflow so the animation restarts if it's already been applied
    void bodyEl.offsetWidth;
    bodyEl.classList.add('formalyze-flash');
    setTimeout(() => bodyEl.classList.remove('formalyze-flash'), 900);
  }

  // --- word-level diff (LCS-based), used to render the "Changes" panel ---

  function tokenize(text) {
    return text.split(/(\s+)/).filter((t) => t.length > 0);
  }

  function diffWords(oldText, newText) {
    const a = tokenize(oldText);
    const b = tokenize(newText);
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const result = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        result.push({ type: 'equal', value: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({ type: 'del', value: a[i] });
        i++;
      } else {
        result.push({ type: 'ins', value: b[j] });
        j++;
      }
    }
    while (i < n) result.push({ type: 'del', value: a[i++] });
    while (j < m) result.push({ type: 'ins', value: b[j++] });
    return result;
  }

  function renderDiff(state) {
    const panel = state.diffPanel;
    panel.textContent = '';

    const title = document.createElement('div');
    title.className = 'formalyze-diff-title';
    title.textContent = 'What changed';
    panel.appendChild(title);

    const body = document.createElement('div');
    body.className = 'formalyze-diff-body';

    const tokens = diffWords(state.originalText || '', state.rewrittenText || '');
    tokens.forEach(({ type, value }) => {
      if (type === 'equal') {
        body.appendChild(document.createTextNode(value));
        return;
      }
      const el = document.createElement(type === 'del' ? 'del' : 'ins');
      el.textContent = value;
      body.appendChild(el);
    });

    panel.appendChild(body);
  }

  // --- positioning: overlay is fixed and tracks the compose body's rect,
  // since Gmail's own toolbar markup is too obfuscated to inject into reliably ---

  function positionDiffPanel(state) {
    const wrapperRect = state.wrapper.getBoundingClientRect();
    state.diffPanel.style.top = `${wrapperRect.bottom + 6}px`;
    state.diffPanel.style.right = state.wrapper.style.right;
  }

  function positionControls(bodyEl, state) {
    if (!document.contains(bodyEl)) {
      state.wrapper.remove();
      state.diffPanel.remove();
      states.delete(bodyEl);
      return;
    }
    const rect = bodyEl.getBoundingClientRect();
    const hidden = rect.width === 0 || rect.height === 0;
    state.wrapper.style.display = hidden ? 'none' : 'flex';
    if (hidden) {
      state.diffPanel.style.display = 'none';
      return;
    }
    state.wrapper.style.top = `${Math.max(rect.top + 8, 8)}px`;
    state.wrapper.style.right = `${Math.max(window.innerWidth - rect.right + 8, 8)}px`;
    if (state.diffPanel.style.display === 'block') positionDiffPanel(state);
  }

  function injectButtons() {
    findComposeBodies().forEach((bodyEl) => {
      bodyEl.setAttribute(PROCESSED_ATTR, 'true');
      const state = createControls(bodyEl);
      states.set(bodyEl, state);
      positionControls(bodyEl, state);
    });
  }

  function repositionAll() {
    states.forEach((state, bodyEl) => positionControls(bodyEl, state));
  }

  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', repositionAll, true);
  window.addEventListener('resize', repositionAll);
  setInterval(repositionAll, 400);

  injectButtons();
})();
