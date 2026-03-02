// YouTube Wide Grid - Content Script
(function () {
  'use strict';

  let currentCols = 4;
  let styleEl = null;

  chrome.storage.sync.get(['ytGridCols'], (result) => {
    currentCols = result.ytGridCols || 4;
    applyLayout(currentCols);
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SET_COLS') {
      currentCols = msg.cols;
      applyLayout(currentCols);
      sendResponse({ ok: true });
    }
    if (msg.type === 'GET_COLS') {
      sendResponse({ cols: currentCols });
    }
  });

  function applyLayout(cols) {
    if (styleEl) styleEl.remove();
    styleEl = document.createElement('style');
    styleEl.id = 'ytwidegrid-style';

    const itemWidthFull = `${100 / cols}%`;

    styleEl.textContent = `
      ytd-rich-grid-renderer {
        --ytd-rich-grid-items-per-row: ${cols} !important;
        --ytd-rich-grid-posts-per-row: ${cols} !important;
        --ytd-rich-grid-slim-items-per-row: ${cols} !important;
      }
      ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer {
        display: flex !important;
        flex-wrap: wrap !important;
        margin: 0 !important;
      }
      ytd-rich-item-renderer {
        width: ${itemWidthFull} !important;
        max-width: ${itemWidthFull} !important;
        flex: 0 0 ${itemWidthFull} !important;
        box-sizing: border-box !important;
        padding: 0 8px 16px 8px !important;
        margin: 0 !important;
      }
      ytd-rich-grid-row { display: contents !important; }
      ytd-rich-grid-row #contents { display: contents !important; }
      ytd-rich-item-renderer #video-title {
        font-size: ${cols >= 7 ? '12px' : cols >= 5 ? '13px' : '14px'} !important;
      }
      ytd-page-manager, #page-manager, ytd-browse { min-width: 0 !important; }
      #app-container, ytd-app { max-width: 100% !important; }
      /* Hide Shorts shelf (section renderer) – cả cũ lẫn mới */
      ytd-rich-section-renderer { display: none !important; }
      ytd-reel-shelf-renderer { display: none !important; }
      /* Hide Shorts items xuất hiện inline trong grid thường */
      ytd-rich-item-renderer:has(ytd-reel-item-renderer) { display: none !important; }
      /* Ẩn Shorts label / header nếu shelf còn sót */
      ytd-rich-section-renderer[mini-guide-refresh] { display: none !important; }
    `;

    document.head.appendChild(styleEl);

    // Patch YouTube's internal grid object để nó biết số cột mới
    patchYTGridRenderer(cols);
  }

  // =============================================
  // CORE FIX: Patch YouTube's rich grid renderer
  // để nó tự tính lại số video cần render mỗi row
  // =============================================
  function patchYTGridRenderer(cols) {
    const grid = document.querySelector('ytd-rich-grid-renderer');
    if (!grid) {
      // Grid chưa mount, đợi rồi thử lại
      setTimeout(() => patchYTGridRenderer(cols), 300);
      return;
    }

    // YouTube Polymer/Lit elements lưu state trong .__data hoặc .data
    // Các property quan trọng: itemsPerRow, visibleItemCount, etc.
    const data = grid.__data || grid.data || grid.properties_;

    if (data) {
      // Override số items per row trong internal state
      if ('itemsPerRow' in data) data.itemsPerRow = cols;
      if ('visibleItemsPerRow' in data) data.visibleItemsPerRow = cols;
    }

    // Override getter/setter trên element nếu có
    try {
      Object.defineProperty(grid, 'itemsPerRow', {
        get: () => cols,
        set: () => { },
        configurable: true,
      });
    } catch (e) { }

    // Không gọi notifyResize/requestUpdate vì sẽ trigger YT re-render gây nháy

    // Quan trọng nhất: set CSS variable trực tiếp trên element (inline)
    // vì YT đọc computed style từ chính element đó khi tính toán số row
    grid.style.setProperty('--ytd-rich-grid-items-per-row', String(cols));
    grid.style.setProperty('--ytd-rich-grid-posts-per-row', String(cols));

    // Fire resize để YT recalculate số cột, dùng cờ để tránh vòng lặp
    grid._ytPatching = true;
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => { grid._ytPatching = false; });
  }

  // =============================================
  // INTERCEPT YOUTUBE'S RESIZE HANDLER
  // YT tính itemsPerRow dựa trên window width
  // Ta patch hàm đó để luôn trả về số cột mình muốn
  // =============================================
  function interceptYTResizeCalc() {
    // YT có hàm tính số cột kiểu:
    // itemsPerRow = Math.floor(containerWidth / minItemWidth)
    // Ta không thể patch trực tiếp nhưng có thể fake container width

    const grid = document.querySelector('ytd-rich-grid-renderer');
    if (!grid) return;

    // Nếu YT đọc offsetWidth của grid để tính cột,
    // ta override offsetWidth descriptor
    // (chỉ làm nếu cần, có thể gây side effect)
  }

  // =============================================
  // WATCH & RE-APPLY khi YT navigation / re-render
  // =============================================
  let lastGridEl = null;
  let observerTimer = null;

  const navObserver = new MutationObserver(() => {
    // Throttle: chỉ xử lý sau 200ms yên tĩnh, tránh fire liên tục khi hover
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      // Re-inject style nếu bị remove
      if (!document.getElementById('ytwidegrid-style')) {
        applyLayout(currentCols);
        return;
      }

      // Detect grid mới được mount (sau navigation)
      const grid = document.querySelector('ytd-rich-grid-renderer');
      if (grid && grid !== lastGridEl) {
        lastGridEl = grid;
        patchYTGridRenderer(currentCols);
      }
    }, 200);
  });

  navObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Re-patch sau mỗi resize thật của user (bỏ qua resize do chính ta dispatch)
  window.addEventListener('resize', () => {
    const grid = document.querySelector('ytd-rich-grid-renderer');
    if (grid && grid._ytPatching) return;
    setTimeout(() => patchYTGridRenderer(currentCols), 150);
  });

})();
