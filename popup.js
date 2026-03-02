// YouTube Wide Grid - Popup Script
(function () {
  'use strict';

  const slider = document.getElementById('colSlider');
  const colValue = document.getElementById('colValue');
  const colInput = document.getElementById('colInput');
  const previewCount = document.getElementById('previewCount');
  const gridPreview = document.getElementById('gridPreview');
  const currentStatus = document.getElementById('currentStatus');
  const autoBadge = document.getElementById('autoBadge');
  const ticks = document.querySelectorAll('.tick');
  const quickBtns = document.querySelectorAll('.quick-btn');

  let currentCols = 4;
  let applyTimer = null;

  function updateSliderFill() {
    const min = +slider.min, max = +slider.max, val = +slider.value;
    const pct = ((val - min) / (max - min) * 100).toFixed(1) + '%';
    slider.style.setProperty('--pct', pct);
  }

  // Init: load saved value
  chrome.storage.sync.get(['ytGridCols'], (result) => {
    currentCols = result.ytGridCols || 4;
    syncAllControls(currentCols, false);
    updateSliderFill();
    currentStatus.textContent = `${currentCols} cột`;
  });

  function buildPreview(cols) {
    // Cap preview at 10 cols to avoid tiny cells
    const previewCols = Math.min(cols, 10);
    gridPreview.style.gridTemplateColumns = `repeat(${previewCols}, 1fr)`;
    gridPreview.innerHTML = '';
    const total = previewCols * 2; // 2 rows
    for (let i = 0; i < total; i++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (i < previewCols ? ' active' : '');
      gridPreview.appendChild(cell);
    }
  }

  function updateUI(cols) {
    colValue.textContent = cols;
    previewCount.textContent = cols;
    buildPreview(cols);

    // Update ticks
    ticks.forEach(t => {
      t.classList.toggle('active', parseInt(t.dataset.val) === cols);
    });

    // Update quick buttons
    quickBtns.forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.val) === cols);
    });
  }

  // Sync slider, input box, and UI together
  function syncAllControls(cols, triggerApply = true) {
    const clamped = Math.max(1, Math.min(20, cols));
    currentCols = clamped;
    slider.value = clamped;
    colInput.value = clamped;
    updateSliderFill();
    updateUI(clamped);
    if (triggerApply) autoApply(clamped);
  }

  // Auto-apply with short debounce so rapid slider drag doesn't spam messages
  function autoApply(cols) {
    clearTimeout(applyTimer);

    autoBadge.textContent = 'Đang áp dụng…';
    autoBadge.classList.add('applying');

    applyTimer = setTimeout(() => {
      chrome.storage.sync.set({ ytGridCols: cols });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_COLS', cols }, () => {
            if (chrome.runtime.lastError) { /* tab may not have content script yet */ }
          });
        }
      });

      currentStatus.textContent = `${cols} cột`;
      autoBadge.textContent = 'Đã áp dụng ✓';
      autoBadge.classList.remove('applying');

      setTimeout(() => {
        autoBadge.textContent = 'Bật';
      }, 1200);
    }, 300);
  }

  // ── Slider ────────────────────────────────────────────────
  slider.addEventListener('input', () => {
    syncAllControls(parseInt(slider.value));
  });

  // ── Number input ──────────────────────────────────────────
  colInput.addEventListener('input', () => {
    const val = parseInt(colInput.value);
    if (!isNaN(val) && val >= 1 && val <= 20) {
      currentCols = val;
      slider.value = val;
      updateUI(val);
      autoApply(val);
    }
  });

  colInput.addEventListener('change', () => {
    // On blur/enter: clamp and re-sync
    let val = parseInt(colInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 20) val = 20;
    syncAllControls(val);
  });

  colInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') colInput.blur();
  });

  // ── Tick clicks ───────────────────────────────────────────
  ticks.forEach(t => {
    t.addEventListener('click', () => {
      syncAllControls(parseInt(t.dataset.val));
    });
  });

  // ── Quick buttons ─────────────────────────────────────────
  quickBtns.forEach(b => {
    b.addEventListener('click', () => {
      syncAllControls(parseInt(b.dataset.val));
    });
  });

})();
