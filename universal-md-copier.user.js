// ==UserScript==
// @name         Universal Page → Markdown Copier
// @namespace    https://github.com/Tushar49/universal-md-copier
// @version      3.5
// @description  Draggable floating button that copies ANY webpage as clean Markdown. Handles articles, code blocks, tables, images, videos (HLS/MP4/blob), iframes, Jupyter notebooks (API fetch + .ipynb download + all-files export), transcripts, math (KaTeX/MathJax), forms, Next.js __NEXT_DATA__, auto-expand dropdowns, and more.
// @author       Tushar49
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // CLIPBOARD
  // ═══════════════════════════════════════════════════════════════════════
  async function copyToClipboard(text) {
    if (typeof GM_setClipboard === 'function') {
      try { GM_setClipboard(text, 'text'); return true; } catch (_) {}
    }
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    if (!ok) throw new Error('All clipboard methods failed');
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CROSS-ORIGIN FETCH (bypasses CORS via GM_xmlhttpRequest)
  // ═══════════════════════════════════════════════════════════════════════
  async function gmFetch(url, opts = {}) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: opts.method || 'GET',
          url,
          headers: opts.headers || {},
          onload(resp) {
            resolve({
              ok: resp.status >= 200 && resp.status < 300,
              status: resp.status,
              text: () => Promise.resolve(resp.responseText),
              json: () => Promise.resolve(JSON.parse(resp.responseText)),
            });
          },
          onerror: () => reject(new Error('Request failed')),
          ontimeout: () => reject(new Error('Request timed out')),
        });
      });
    }
    return fetch(url, { headers: opts.headers || {} });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI: STYLES
  // ═══════════════════════════════════════════════════════════════════════
  const css = document.createElement('style');
  css.textContent = `
    #umd-btn {
      position:fixed; bottom:28px; right:28px; z-index:2147483647;
      width:46px; height:46px; border-radius:50%;
      background:#1a1a2e; color:#e0e0e0; border:2px solid #333;
      cursor:grab; box-shadow:0 4px 16px rgba(0,0,0,.45);
      display:flex; align-items:center; justify-content:center;
      transition:transform .12s,opacity .15s,background .2s,border-color .2s;
      user-select:none; font-size:20px; line-height:1;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    }
    #umd-btn:hover { background:#16213e; border-color:#0f3460; transform:scale(1.08); }
    #umd-btn.dragging { cursor:grabbing; opacity:.75; }
    #umd-btn.minimized { width:14px; height:14px; font-size:0; opacity:.18; border-width:1px; }
    #umd-btn.minimized:hover { opacity:.55; }
    #umd-btn.ok { background:#064e3b !important; border-color:#059669 !important; }
    #umd-btn.err { background:#7f1d1d !important; border-color:#dc2626 !important; }

    #umd-toast {
      position:fixed; z-index:2147483646;
      background:#1e1e2e; color:#cdd6f4;
      font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;
      padding:5px 11px; border-radius:6px;
      pointer-events:none; opacity:0;
      transition:opacity .18s; white-space:nowrap;
      box-shadow:0 2px 10px rgba(0,0,0,.35);
    }
    #umd-toast.show { opacity:1; }

    #umd-menu {
      position:fixed; z-index:2147483646;
      background:#1e1e2e; color:#cdd6f4; border:1px solid #333;
      border-radius:8px; padding:4px 0; min-width:180px;
      box-shadow:0 6px 24px rgba(0,0,0,.45);
      font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;
      display:none;
    }
    #umd-menu.show { display:block; }
    .umd-mi {
      padding:6px 14px; cursor:pointer; display:flex; align-items:center; gap:8px;
    }
    .umd-mi:hover { background:#313244; }
    .umd-mi .ico { width:16px; text-align:center; flex-shrink:0; }
    .umd-sep { height:1px; background:#333; margin:3px 0; }
  `;
  document.head.appendChild(css);

  // ═══════════════════════════════════════════════════════════════════════
  // UI: ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════
  const btn = document.createElement('button');
  btn.id = 'umd-btn';
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
  btn.title = 'Click: Copy as Markdown\nHover: Show menu\nRight-click: Menu\nDblClick: Minimize\nDrag: Move';
  document.body.appendChild(btn);

  const toast = document.createElement('div');
  toast.id = 'umd-toast';
  document.body.appendChild(toast);

  const menu = document.createElement('div');
  menu.id = 'umd-menu';
  menu.innerHTML = `
    <div class="umd-mi" data-action="copy-md"><span class="ico">📋</span>Copy as Markdown</div>
    <div class="umd-mi" data-action="copy-text"><span class="ico">📝</span>Copy as Plain Text</div>
    <div class="umd-mi" data-action="copy-html"><span class="ico">🌐</span>Copy Clean HTML</div>
    <div class="umd-sep"></div>
    <div class="umd-mi" data-action="copy-selection"><span class="ico">✂️</span>Copy Selection as MD</div>
    <div class="umd-sep"></div>
    <div class="umd-mi" data-action="expand-copy"><span class="ico">🔓</span>Expand All + Copy MD</div>
    <div class="umd-sep"></div>
    <div class="umd-mi" data-action="download-md"><span class="ico">💾</span>Download .md File</div>
    <div class="umd-mi" data-action="download-ipynb"><span class="ico">📓</span>Download .ipynb</div>
    <div class="umd-mi" data-action="download-nb-all"><span class="ico">📦</span>Download All (NB + files)</div>
    <div class="umd-mi" data-action="minimize"><span class="ico">🔽</span>Minimize</div>
  `;
  document.body.appendChild(menu);

  function showToast(msg, ms = 2200) {
    const r = btn.getBoundingClientRect();
    toast.textContent = msg;
    toast.style.left = Math.max(4, Math.min(r.left - 10, window.innerWidth - 200)) + 'px';
    toast.style.top = Math.max(4, r.top - 32) + 'px';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI: DRAG
  // ═══════════════════════════════════════════════════════════════════════
  let dragged = false, minimized = false, ox, oy;

  btn.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragged = false;
    ox = e.clientX - btn.getBoundingClientRect().left;
    oy = e.clientY - btn.getBoundingClientRect().top;
    const move = ev => {
      dragged = true; btn.classList.add('dragging');
      btn.style.left = (ev.clientX - ox) + 'px';
      btn.style.top = (ev.clientY - oy) + 'px';
      btn.style.right = 'auto'; btn.style.bottom = 'auto';
    };
    const up = () => {
      btn.classList.remove('dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // Touch support for mobile drag
  btn.addEventListener('touchstart', e => {
    if (minimized) return;
    const touch = e.touches[0];
    dragged = false;
    ox = touch.clientX - btn.getBoundingClientRect().left;
    oy = touch.clientY - btn.getBoundingClientRect().top;
    const touchMove = ev => {
      ev.preventDefault();
      dragged = true; btn.classList.add('dragging');
      const t = ev.touches[0];
      btn.style.left = (t.clientX - ox) + 'px';
      btn.style.top = (t.clientY - oy) + 'px';
      btn.style.right = 'auto'; btn.style.bottom = 'auto';
    };
    const touchEnd = () => {
      btn.classList.remove('dragging');
      document.removeEventListener('touchmove', touchMove);
      document.removeEventListener('touchend', touchEnd);
    };
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd);
  }, { passive: true });

  btn.addEventListener('dblclick', e => { e.preventDefault(); toggleMinimize(); });

  btn.addEventListener('click', async e => {
    if (dragged) { dragged = false; return; }
    if (minimized) return;
    menu.classList.remove('show');
    await doCopy('copy-md');
  });

  btn.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (minimized) { toggleMinimize(); return; }
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.max(4, r.left - 160) + 'px';
    menu.style.top = Math.max(4, r.top - menu.offsetHeight - 8) + 'px';
    menu.classList.toggle('show');
  });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('show');
  });

  menu.addEventListener('click', async e => {
    const mi = e.target.closest('.umd-mi');
    if (!mi) return;
    menu.classList.remove('show');
    const action = mi.dataset.action;
    if (action === 'minimize') { toggleMinimize(); return; }
    await doCopy(action);
  });

  function toggleMinimize() {
    minimized = !minimized;
    btn.classList.toggle('minimized', minimized);
    showToast(minimized ? 'Minimized – dblclick to restore' : 'Restored');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UI: HOVER MENU
  // ═══════════════════════════════════════════════════════════════════════
  let hoverTimeout = null;
  btn.addEventListener('mouseenter', () => {
    if (minimized) return;
    hoverTimeout = setTimeout(() => {
      if (!dragged) {
        const r = btn.getBoundingClientRect();
        menu.style.left = Math.max(4, r.left - 160) + 'px';
        menu.style.top = Math.max(4, r.top - menu.offsetHeight - 8) + 'px';
        menu.classList.add('show');
      }
    }, 500);
  });
  btn.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimeout);
    // Don't close immediately — let user move to menu
    setTimeout(() => {
      if (!menu.matches(':hover') && !btn.matches(':hover')) menu.classList.remove('show');
    }, 300);
  });
  menu.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (!menu.matches(':hover') && !btn.matches(':hover')) menu.classList.remove('show');
    }, 300);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EXPAND ALL COLLAPSIBLE ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════
  function expandAll() {
    let expanded = 0;
    // 1. <details> elements
    document.querySelectorAll('details:not([open])').forEach(d => { d.open = true; expanded++; });

    // 2. aria-expanded="false" buttons/toggles
    document.querySelectorAll('[aria-expanded="false"]').forEach(el => {
      try { el.click(); expanded++; } catch (_) {}
    });

    // 3. "Show transcript" / "Show more" / "Expand" buttons
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const t = btn.textContent.trim().toLowerCase();
      if (/^(show|open|expand|view|more|read more|see more|show transcript|show all|load more)/.test(t) &&
          !/^(show less|hide|close|collapse)/.test(t)) {
        try { btn.click(); expanded++; } catch (_) {}
      }
    });

    // 4. Collapsed elements (by class)
    document.querySelectorAll('[class*="collapsed"]:not([class*="expand"])').forEach(el => {
      el.classList.remove('collapsed');
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      expanded++;
    });

    // 5. Hidden overflow / truncated containers
    document.querySelectorAll('[style*="max-height"], [style*="overflow: hidden"], [style*="overflow:hidden"]').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 10) {
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
        expanded++;
      }
    });

    return expanded;
  }

  async function doCopy(action) {
    try {
      let text;
      switch (action) {
        case 'copy-md':        text = await extractFullPage(); break;
        case 'copy-text':      text = document.body.innerText; break;
        case 'copy-html':      text = getCleanHTML(); break;
        case 'copy-selection': text = extractSelection(); break;
        case 'expand-copy': {
          const n = expandAll();
          showToast(`Expanded ${n} elements, waiting 500ms...`);
          await new Promise(r => setTimeout(r, 500));
          text = await extractFullPage();
          break;
        }
        case 'download-md': {
          downloadFile(await extractFullPage());
          btn.classList.add('ok');
          setTimeout(() => btn.classList.remove('ok'), 1400);
          return;
        }
        case 'download-ipynb': {
          const fname = await downloadNotebook();
          showToast('✓ Downloaded ' + fname);
          btn.classList.add('ok');
          setTimeout(() => btn.classList.remove('ok'), 1400);
          return;
        }
        case 'download-nb-all': {
          const count = await downloadAllNotebookFiles();
          showToast(`✓ Downloaded ${count} files`);
          btn.classList.add('ok');
          setTimeout(() => btn.classList.remove('ok'), 1400);
          return;
        }
        default:               text = await extractFullPage();
      }
      await copyToClipboard(text);
      btn.classList.add('ok');
      showToast('✓ Copied!');
      setTimeout(() => btn.classList.remove('ok'), 1400);
    } catch (err) {
      console.error('[UMD]', err);
      btn.classList.add('err');
      showToast('✗ ' + err.message);
      setTimeout(() => btn.classList.remove('err'), 2000);
    }
  }

  function downloadFile(content) {
    const slug = location.hostname + location.pathname;
    const name = slug.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').substring(0, 80) + '.md';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('✓ Downloaded ' + name);
  }

  function triggerDownload(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NOTEBOOK: DETECTION & DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════
  function detectNotebookUrl() {
    // 1. Current page IS a Jupyter notebook
    if (/\/notebooks\/.*\.ipynb/i.test(location.pathname)) {
      const path = decodeURIComponent(location.pathname.replace(/^\/notebooks\//, ''));
      return { baseUrl: location.origin, token: new URLSearchParams(location.search).get('token') || '', path };
    }
    // 2. Iframe containing a notebook
    for (const iframe of document.querySelectorAll('iframe[src]')) {
      const src = iframe.src || iframe.getAttribute('src') || '';
      if (/\/notebooks\/.*\.ipynb/i.test(src)) {
        try {
          const url = new URL(src);
          return {
            baseUrl: url.origin,
            token: url.searchParams.get('token') || '',
            path: decodeURIComponent(url.pathname.replace(/^\/notebooks\//, '')),
          };
        } catch (_) {}
      }
    }
    // 3. __NEXT_DATA__ or inline scripts containing notebook URLs
    try {
      const scripts = [document.getElementById('__NEXT_DATA__'), ...document.querySelectorAll('script:not([src])')];
      for (const s of scripts) {
        if (!s?.textContent) continue;
        const m = s.textContent.match(/(https?:\/\/[^"'\s]+\/notebooks\/[^"'\s]+\.ipynb[^"'\s]*)/);
        if (m) {
          const url = new URL(m[1]);
          return {
            baseUrl: url.origin,
            token: url.searchParams.get('token') || '',
            path: decodeURIComponent(url.pathname.replace(/^\/notebooks\//, '')),
          };
        }
      }
    } catch (_) {}
    return null;
  }

  function nbApiUrl(nb, filePath) {
    const encoded = filePath ? filePath.split('/').map(encodeURIComponent).join('/') : '';
    return `${nb.baseUrl}/api/contents/${encoded}${nb.token ? '?token=' + nb.token : ''}`;
  }

  async function downloadNotebook() {
    const nb = detectNotebookUrl();
    if (!nb) throw new Error('No Jupyter notebook found on this page');
    const resp = await gmFetch(nbApiUrl(nb, nb.path), { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`Notebook fetch failed (${resp.status})`);
    const data = await resp.json();
    const filename = nb.path.split('/').pop() || 'notebook.ipynb';
    const blob = new Blob([JSON.stringify(data.content, null, 1)], { type: 'application/x-ipynb+json' });
    triggerDownload(blob, filename);
    return filename;
  }

  async function downloadAllNotebookFiles() {
    const nb = detectNotebookUrl();
    if (!nb) throw new Error('No Jupyter notebook found on this page');
    // List files in the notebook's directory
    const lastSlash = nb.path.lastIndexOf('/');
    const dir = lastSlash >= 0 ? nb.path.substring(0, lastSlash) : '';
    const resp = await gmFetch(nbApiUrl(nb, dir), { headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`Directory listing failed (${resp.status})`);
    const dirData = await resp.json();
    if (!Array.isArray(dirData.content)) throw new Error('Not a directory listing');
    // Filter: skip hidden/system files
    const skip = /^(\.|__pycache__|node_modules|\.ipynb_checkpoints)/;
    const files = dirData.content.filter(f => f.type !== 'directory' && !skip.test(f.name));
    if (!files.length) throw new Error('No downloadable files found');
    showToast(`Downloading ${files.length} files…`, 4000);
    let ok = 0;
    for (const file of files) {
      try {
        const fr = await gmFetch(nbApiUrl(nb, file.path), { headers: { Accept: 'application/json' } });
        if (!fr.ok) continue;
        const fd = await fr.json();
        let blob;
        if (fd.type === 'notebook' && file.name.endsWith('.ipynb')) {
          // Real .ipynb notebook — save as JSON
          blob = new Blob([JSON.stringify(fd.content, null, 1)], { type: 'application/x-ipynb+json' });
        } else if (fd.type === 'notebook') {
          // Jupytext script (.py etc.) returned as notebook — extract cell sources
          const src = (fd.content.cells || []).map(c => {
            const s = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
            return c.cell_type === 'code' ? s : `# ${s.replace(/\n/g, '\n# ')}`;
          }).join('\n\n');
          blob = new Blob([src], { type: 'text/plain;charset=utf-8' });
        } else if (fd.format === 'base64') {
          const bin = atob(fd.content);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          blob = new Blob([u8]);
        } else {
          blob = new Blob([fd.content || ''], { type: 'text/plain;charset=utf-8' });
        }
        triggerDownload(blob, file.name);
        ok++;
        await new Promise(r => setTimeout(r, 350));
      } catch (e) { console.warn('[UMD] skip', file.name, e); }
    }
    return ok;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXTRACTION: FULL PAGE
  // ═══════════════════════════════════════════════════════════════════════
  async function extractFullPage() {
    const url = location.href;
    const parts = [];

    // ── Metadata ──
    const title = getTitle();
    parts.push(`# ${title}\n`);
    parts.push(`> **Source:** ${url}  `);
    parts.push(`> **Captured:** ${new Date().toLocaleString()}  `);

    // Meta description
    const desc = document.querySelector('meta[name="description"],meta[property="og:description"]');
    if (desc?.content) parts.push(`> **Description:** ${desc.content}  `);

    // Author
    const author = document.querySelector('meta[name="author"],meta[property="article:author"],[rel="author"]');
    if (author) parts.push(`> **Author:** ${author.content || author.textContent?.trim() || ''}  `);

    parts.push('\n---\n');

    // ── Breadcrumb ──
    const bc = getBreadcrumb();
    if (bc) parts.push(`**Path:** ${bc}\n`);

    // ── Navigation / TOC ──
    const nav = getNavLinks();
    if (nav.length > 0) {
      parts.push('## Navigation\n');
      nav.forEach(n => parts.push(`- [${n.text}](${n.href})${n.active ? ' ◀' : ''}`));
      parts.push('');
    }

    // ── Main content ──
    parts.push('## Content\n');
    const mainEl = findMainContent();
    if (mainEl) {
      parts.push(nodeToMd(mainEl));
    } else {
      parts.push(nodeToMd(document.body));
    }
    parts.push('');

    // ── Video / media ──
    const media = getMediaInfo();
    if (media.length > 0) {
      parts.push('## Media\n');
      media.forEach(m => parts.push(`- **${m.type}:** ${m.src}${m.poster ? ` (poster: ${m.poster})` : ''}`));
      parts.push('');
    }

    // ── Embedded iframes ──
    const iframes = await getIframeInfo();
    if (iframes.length > 0) {
      parts.push('## Embedded Content\n');
      iframes.forEach(f => {
        parts.push(`- **iframe:** [${f.title || f.src}](${f.src})`);
        // If Jupyter notebook iframe, try to extract cell content
        if (f.notebook) {
          parts.push('');
          parts.push('### Notebook Cells\n');
          f.notebook.forEach((cell, i) => {
            if (cell.cell_type === 'markdown') {
              parts.push(cell.source);
              parts.push('');
            } else if (cell.cell_type === 'code') {
              parts.push(`\`\`\`python`);
              parts.push(cell.source);
              parts.push('```');
              if (cell.outputs && cell.outputs.length > 0) {
                const outText = cell.outputs.map(o => {
                  if (o.text) return o.text;
                  if (o.data?.['text/plain']) return (typeof o.data['text/plain'] === 'string' ? o.data['text/plain'] : '');
                  return '';
                }).filter(Boolean).join('\n');
                if (outText) {
                  parts.push('<details><summary>Output</summary>\n');
                  parts.push('```');
                  parts.push(outText);
                  parts.push('```\n');
                  parts.push('</details>');
                }
              }
              parts.push('');
            }
          });
        }
      });
      parts.push('');
    }

    // ── Code blocks (notebooks, CodeMirror, Monaco) ──
    const code = getCodeBlocks();
    if (code.length > 0) {
      parts.push('## Code\n');
      code.forEach((c, i) => {
        parts.push(`### Cell ${i + 1}${c.lang ? ' (' + c.lang + ')' : ''}\n`);
        parts.push('```' + (c.lang || ''));
        parts.push(c.code);
        parts.push('```\n');
        if (c.output) {
          parts.push('<details><summary>Output</summary>\n');
          parts.push('```');
          parts.push(c.output);
          parts.push('```\n');
          parts.push('</details>\n');
        }
      });
    }

    // ── Transcript (dedicated extraction for video lesson platforms) ──
    const transcript = getTranscript();
    if (transcript) {
      parts.push('## Transcript\n');
      parts.push(transcript);
      parts.push('');
    }

    // ── Forms / quizzes ──
    const forms = getFormData();
    if (forms.length > 0) {
      parts.push('## Forms / Quizzes\n');
      forms.forEach(f => parts.push(f));
      parts.push('');
    }

    return parts.join('\n').replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXTRACTION: SELECTION
  // ═══════════════════════════════════════════════════════════════════════
  function extractSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) throw new Error('No text selected');
    const range = sel.getRangeAt(0);
    const frag = range.cloneContents();
    const div = document.createElement('div');
    div.appendChild(frag);
    const md = nodeToMd(div);
    return `# Selection from ${location.href}\n\n${md}\n`;
  }

  function getCleanHTML() {
    const main = findMainContent() || document.body;
    const clone = main.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,link[rel="stylesheet"]').forEach(e => e.remove());
    return clone.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: METADATA
  // ═══════════════════════════════════════════════════════════════════════
  function getTitle() {
    // Most-specific selectors first to avoid picking sidebar/nav h1
    for (const sel of ['article h1', 'main h1', '[role="main"] h1', '[class*="title"] h1', '.content h1', 'h1']) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()?.length > 1) return el.textContent.trim();
    }
    const og = document.querySelector('meta[property="og:title"]');
    if (og?.content) return og.content;
    return document.title || 'Untitled';
  }

  function getBreadcrumb() {
    // Only match elements explicitly marked as breadcrumbs
    const selectors = [
      'nav[aria-label*="readcrumb"]', 'nav[aria-label*="Breadcrumb"]',
      'ol[class*="breadcrumb"]', 'ul[class*="breadcrumb"]',
      'nav[class*="breadcrumb"]', 'div[class*="breadcrumb"]',
    ];
    for (const sel of selectors) {
      const nav = document.querySelector(sel);
      if (!nav) continue;
      const links = nav.querySelectorAll('a, span, li');
      const items = Array.from(links)
        .map(el => ({ text: el.textContent.trim(), href: el.tagName === 'A' ? el.href : '' }))
        .filter(item => item.text.length > 0 && item.text.length < 80);
      if (items.length >= 2 && items.length <= 8) {
        return items.map(item => item.href ? `[${item.text}](${item.href})` : item.text).join(' > ');
      }
    }
    return '';
  }

  function getNavLinks() {
    const links = [];
    const seen = new Set();
    // Sidebar / nav links
    const navEls = document.querySelectorAll('nav a, aside a, [class*="sidebar"] a, [class*="menu"] a, [class*="toc"] a, [role="navigation"] a, a[href*="/lesson/"]');
    const curPath = location.pathname;
    navEls.forEach(a => {
      const text = a.textContent.trim().substring(0, 120);
      const href = a.href;
      if (!text || text.length < 2 || seen.has(href)) return;
      seen.add(href);
      const active = a.href.includes(curPath) || a.classList.contains('active') || a.getAttribute('aria-current') === 'page';
      links.push({ text, href, active });
    });
    return links.length > 0 && links.length <= 30 ? links : []; // skip if too many (full site nav)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: FIND MAIN CONTENT
  // ═══════════════════════════════════════════════════════════════════════
  function findMainContent() {
    // Priority selectors for the "real" content
    const selectors = [
      '[data-automation-id="applyFlowPage"]', '[data-automation-id="jobPostingPage"]',
      'article[class*="content"]', 'article[class*="post"]', 'article[class*="article"]',
      'main article', 'article', '[role="article"]',
      'main', '[role="main"]',
      '#content', '#main-content', '#article', '#post-content',
      '.post-content', '.article-content', '.entry-content', '.content-area',
      '.markdown-body', '.prose', '.rich-text',
      '[class*="lesson-content"]', '[class*="page-content"]',
      '[itemprop="articleBody"]',
    ];
    let candidate = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 80) { candidate = el; break; }
    }

    // Sanity check: if <main> exists and has significantly more text than candidate,
    // prefer <main>. Prevents picking a small overlay <article> over the real content.
    const mainEl = document.querySelector('main');
    if (mainEl && candidate && candidate !== mainEl && !candidate.contains(mainEl)) {
      const mainLen = mainEl.textContent.trim().length;
      const candLen = candidate.textContent.trim().length;
      if (mainLen > candLen * 1.5 && mainLen > 500) {
        return mainEl;
      }
    }
    return candidate;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: MEDIA
  // ═══════════════════════════════════════════════════════════════════════
  function getMediaInfo() {
    const media = [];
    // Videos
    document.querySelectorAll('video').forEach(v => {
      const src = v.src || v.querySelector('source')?.src || '';
      if (src && !src.startsWith('blob:')) media.push({ type: 'Video', src, poster: v.poster || '' });
    });
    // Video sources from various players
    document.querySelectorAll('source[src]').forEach(s => {
      const src = s.src;
      if (src && !src.startsWith('blob:') && /\.(mp4|webm|m3u8|mpd)/i.test(src)) {
        media.push({ type: 'Video Source', src, poster: '' });
      }
    });
    // Audio
    document.querySelectorAll('audio, audio source').forEach(a => {
      const src = a.src || '';
      if (src && !src.startsWith('blob:')) media.push({ type: 'Audio', src, poster: '' });
    });
    // YouTube / Vimeo / other embeds
    document.querySelectorAll('iframe').forEach(f => {
      const src = f.src || '';
      if (/youtube|youtu\.be|vimeo|wistia|dailymotion|player/i.test(src)) {
        media.push({ type: 'Embedded Video', src, poster: '' });
      }
    });
    // Look for video player data attributes
    document.querySelectorAll('[data-video-url],[data-src],[data-video-id]').forEach(el => {
      const src = el.dataset.videoUrl || el.dataset.src || '';
      if (src) media.push({ type: 'Video (data-attr)', src, poster: '' });
    });
    // Look for HLS/DASH manifest URLs in script tags
    document.querySelectorAll('script:not([src])').forEach(s => {
      const text = s.textContent || '';
      const m3u8 = text.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)/);
      if (m3u8) media.push({ type: 'HLS Manifest', src: m3u8[1], poster: '' });
      const mpd = text.match(/["'](https?:\/\/[^"']+\.mpd[^"']*)/);
      if (mpd) media.push({ type: 'DASH Manifest', src: mpd[1], poster: '' });
      const mp4 = text.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)/);
      if (mp4) media.push({ type: 'MP4', src: mp4[1], poster: '' });
    });
    // OG video meta
    const ogVideo = document.querySelector('meta[property="og:video"],meta[property="og:video:url"]');
    if (ogVideo?.content) media.push({ type: 'OG Video', src: ogVideo.content, poster: '' });

    // Deduplicate
    const seen = new Set();
    return media.filter(m => {
      if (seen.has(m.src)) return false;
      seen.add(m.src);
      return true;
    });
  }

  async function getIframeInfo() {
    const frames = [];
    for (const f of document.querySelectorAll('iframe[src]')) {
      const src = f.src;
      if (src && src !== 'about:blank' && !src.startsWith('javascript:')) {
        const entry = { src, title: f.title || '', notebook: null };
        // Detect Jupyter notebook iframes and try to fetch content via API
        if (/\.ipynb/i.test(src) || /notebook/i.test(f.title || '')) {
          try {
            const apiUrl = src.replace('/notebooks/', '/api/contents/');
            const resp = await gmFetch(apiUrl, { headers: { Accept: 'application/json' } });
            if (resp.ok) {
              const nbData = await resp.json();
              if (nbData.content && nbData.content.cells) {
                entry.notebook = nbData.content.cells.map(c => ({
                  cell_type: c.cell_type,
                  source: typeof c.source === 'string' ? c.source : (Array.isArray(c.source) ? c.source.join('') : String(c.source || '')),
                  outputs: (c.outputs || []).map(o => ({
                    text: o.text ? (Array.isArray(o.text) ? o.text.join('') : o.text) : '',
                    data: o.data || {}
                  }))
                }));
                entry.title = entry.title || nbData.name || 'Jupyter Notebook';
              }
            }
          } catch (_) {
            // Cross-origin or API not available — just link it
          }
        }
        frames.push(entry);
      }
    }
    return frames;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: TRANSCRIPT EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════
  function getTranscript() {
    // Method 1: Find a heading/label named "Transcript" and extract sibling text
    const h3s = document.querySelectorAll('h3, h4, [class*="transcript"]');
    for (const h of h3s) {
      if (h.textContent.trim().toLowerCase() === 'transcript') {
        // Walk up to find the container that holds transcript + text segments
        let container = h.parentElement;
        // Go up until we find a container with substantial text
        for (let i = 0; i < 4 && container; i++) {
          if (container.textContent.length > 500) break;
          container = container.parentElement;
        }
        if (container) {
          // Extract text, skipping buttons and selects
          const lines = [];
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
              if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
              if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                if (tag === 'button' || tag === 'select' || tag === 'option') return NodeFilter.FILTER_REJECT;
                if (tag === 'h3' && node.textContent.trim().toLowerCase() === 'transcript') return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_SKIP;
            }
          });
          let node;
          while ((node = walker.nextNode())) {
            if (node.nodeType === Node.TEXT_NODE) {
              const t = node.textContent.trim();
              if (t && !/^(Jump to |Select transcript|Close transcript|English|Português|Español)/.test(t)) {
                lines.push(t);
              }
            }
          }
          const text = lines.join(' ').replace(/\s+/g, ' ').trim();
          if (text.length > 100) return text;
        }
      }
    }

    // Method 2: Look for DLAI-style transcript with timestamp buttons
    const jumpBtns = document.querySelectorAll('button[class*="timestamp"], button[aria-label*="Jump"]');
    if (jumpBtns.length > 5) {
      const segments = [];
      jumpBtns.forEach(btn => {
        const time = btn.textContent.trim();
        const textNode = btn.nextSibling;
        const text = textNode?.textContent?.trim() || '';
        if (text) segments.push(`**[${time}]** ${text}`);
      });
      if (segments.length > 0) return segments.join('\n');
    }

    // Method 3: check for __NEXT_DATA__ transcript data
    try {
      const ndEl = document.getElementById('__NEXT_DATA__');
      if (ndEl) {
        const nd = JSON.parse(ndEl.textContent);
        const queries = nd?.props?.pageProps?.trpcState?.json?.queries || [];
        for (const q of queries) {
          const data = q?.state?.data?.json;
          if (data?.transcript || data?.subtitles) {
            return data.transcript || data.subtitles;
          }
        }
      }
    } catch (_) {}

    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: CODE BLOCKS (Jupyter, CodeMirror, Monaco, etc.)
  // ═══════════════════════════════════════════════════════════════════════
  function getCodeBlocks() {
    const blocks = [];
    const seen = new Set();

    // Jupyter notebook cells (classic + lab)
    document.querySelectorAll('.jp-Cell, .cell, .jupyter-cell, [class*="code_cell"], [class*="code-cell"]').forEach(cell => {
      const inputEl = cell.querySelector('.jp-InputArea, .input_area, .jp-Editor, .CodeMirror, .cm-content, [class*="code-input"], pre code');
      const outputEl = cell.querySelector('.jp-OutputArea, .output_area, .jp-OutputArea-output, [class*="output"]');
      if (!inputEl) return;
      const code = inputEl.textContent.trim();
      if (code.length < 3 || seen.has(code)) return;
      seen.add(code);
      const output = outputEl?.textContent?.trim() || '';
      // Detect language
      let lang = 'python';
      const langClass = cell.className + ' ' + (inputEl.className || '');
      if (/\b(javascript|js)\b/i.test(langClass)) lang = 'javascript';
      else if (/\b(r|rlang)\b/i.test(langClass)) lang = 'r';
      else if (/\b(julia)\b/i.test(langClass)) lang = 'julia';
      blocks.push({ code, output, lang });
    });

    // CodeMirror editors (standalone)
    document.querySelectorAll('.CodeMirror, .cm-editor').forEach(cm => {
      // Skip if already captured in a Jupyter cell
      if (cm.closest('.jp-Cell, .cell, .jupyter-cell, [class*="code_cell"]')) return;
      const code = (cm.querySelector('.cm-content') || cm.querySelector('.CodeMirror-code') || cm).textContent.trim();
      if (code.length < 3 || seen.has(code)) return;
      seen.add(code);
      blocks.push({ code, output: '', lang: '' });
    });

    // Monaco editor
    document.querySelectorAll('.monaco-editor').forEach(ed => {
      const lines = ed.querySelectorAll('.view-line');
      const code = Array.from(lines).map(l => l.textContent).join('\n').trim();
      if (code.length < 3 || seen.has(code)) return;
      seen.add(code);
      blocks.push({ code, output: '', lang: '' });
    });

    // Regular <pre><code> blocks (not already inside notebook cells)
    document.querySelectorAll('pre code, pre.highlight, .highlight pre').forEach(el => {
      if (el.closest('.jp-Cell, .cell, .jupyter-cell, .CodeMirror, .cm-editor')) return;
      const code = el.textContent.trim();
      if (code.length < 3 || seen.has(code)) return;
      seen.add(code);
      // Detect language from class
      let lang = '';
      const cls = el.className || el.parentElement?.className || '';
      const m = cls.match(/\blang(?:uage)?-(\w+)/);
      if (m) lang = m[1];
      blocks.push({ code, output: '', lang });
    });

    return blocks;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS: FORMS / QUIZZES
  // ═══════════════════════════════════════════════════════════════════════

  /** Extract a single Workday formField value */
  function _wdFieldValue(field) {
    // 1. Date fields (Month/Year spinbuttons)
    const monthSpin = field.querySelector('[data-automation-id="dateSectionMonth-input"]');
    const yearSpin = field.querySelector('[data-automation-id="dateSectionYear-input"]');
    if (monthSpin && yearSpin) {
      const m = monthSpin.getAttribute('aria-valuetext') || monthSpin.textContent.trim();
      const y = yearSpin.getAttribute('aria-valuetext') || yearSpin.textContent.trim();
      return (m && y) ? `${m}/${y}` : '';
    }

    // 2. Multi-select / selected items (School, Skills, Field of Study)
    const selectedItems = field.querySelectorAll('[data-automation-id="selectedItem"]');
    if (selectedItems.length > 0) {
      const vals = Array.from(selectedItems).map(item => {
        const p = item.querySelector('p');
        return p?.textContent?.trim() || item.textContent?.trim().replace(/, press delete.*$/, '') || '';
      }).filter(Boolean);
      if (vals.length > 0) return vals.join(', ');
    }

    // 3. Dropdown button (Degree, Language, proficiency levels, questionnaire answers)
    const dropBtn = field.querySelector('button[aria-haspopup="listbox"]');
    if (dropBtn) {
      const btnText = dropBtn.textContent?.trim() || '';
      if (btnText && btnText !== 'Select One') return btnText;
      // If dropdown shows 'Select One', still return it rather than falling through to GUID text
      if (btnText === 'Select One') return '(not selected)';
    }

    // 4. Checkbox
    const chk = field.querySelector('input[type="checkbox"], [role="checkbox"]');
    if (chk) {
      const checked = chk.checked ?? chk.getAttribute('aria-checked') === 'true';
      return checked ? '☑ Yes' : '☐ No';
    }

    // 5. Radio buttons
    const radios = field.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      for (const r of radios) {
        if (r.checked) {
          const rLabel = document.querySelector(`label[for="${r.id}"]`)?.textContent?.trim() || r.value;
          return rLabel === 'true' ? 'Yes' : rLabel === 'false' ? 'No' : rLabel;
        }
      }
      return '(not selected)';
    }

    // 6. File upload
    const fileNameEl = field.querySelector('[data-automation-id="file-upload-item-name"]');
    if (fileNameEl) {
      const name = fileNameEl.textContent.trim();
      const sizeEl = fileNameEl.closest('[data-automation-id="file-upload-item"]')
                     ?.querySelector('[data-automation-id="file-upload-item-name"] ~ div');
      // Try next sibling for size
      let size = '';
      let sib = fileNameEl.parentElement?.nextElementSibling;
      if (sib) size = sib.textContent.trim();
      return name + (size ? ` (${size})` : '');
    }
    const dropZone = field.querySelector('[data-automation-id="file-upload-drop-zone"]');
    if (dropZone) return '(no file uploaded)';

    // 7. Text inputs / textarea (skip if dropdown already handled above, skip GUIDs)
    if (!dropBtn) {
      const textInput = field.querySelector('input[type="text"], input[type="email"], input[type="tel"], input[type="number"], textarea');
      if (textInput) {
        const raw = textInput.value || '';
        if (raw && !/^[a-f0-9]{20,}$/.test(raw) && raw !== 'Search') return raw;
      }
    }

    // 8. Static text fallback
    const staticTexts = field.querySelectorAll('div, span, p');
    const labelText = field.querySelector('label')?.textContent?.trim() || '';
    for (const st of staticTexts) {
      if (st.children.length === 0 && st.textContent.trim().length > 0) {
        const t = st.textContent.trim();
        if (t !== labelText && !t.includes('Indicates a required') && t !== '*'
            && !/press delete/.test(t) && !/items? selected/.test(t)) {
          return t;
        }
      }
    }
    return '';
  }

  function getFormData() {
    const results = [];

    // ── Workday-specific form extraction (data-automation-id based) ──
    const wdPage = document.querySelector('[data-automation-id="applyFlowPage"]');
    if (wdPage) {
      // Walk top-level sections (Work Experience, Education, Languages, etc.)
      const sections = wdPage.querySelectorAll('[role="group"]');
      const processedFields = new Set();
      const lines = [];

      // Process each section group — skip inner sub-groups (Work Experience 1/2) to avoid duplication
      const topSections = Array.from(sections).filter(s => {
        // A top section's parent group is the page itself or the main form, not another group
        const parentGroup = s.parentElement?.closest('[role="group"]');
        return !parentGroup || !parentGroup.closest('[data-automation-id="applyFlowPage"] [role="group"]');
      });

      // If no clear top sections, just process all formFields flat
      const allFields = wdPage.querySelectorAll('[data-automation-id^="formField-"]');
      if (topSections.length === 0 && allFields.length > 0) {
        allFields.forEach(field => {
          const label = _wdFieldLabel(field);
          const value = _wdFieldValue(field);
          if (label) lines.push(`**${label}:** ${value || '(empty)'}`);
        });
      } else {
        // Walk sections, outputting sub-section headings
        sections.forEach(section => {
          const heading = section.querySelector(':scope > div > h3, :scope > div > h4, :scope > h3, :scope > h4');
          const hText = heading?.textContent?.trim() || '';
          const fields = section.querySelectorAll(':scope > div > [data-automation-id^="formField-"], :scope [data-automation-id^="formField-"]');
          // Only process leaf sections (those with direct fields not in a sub-group)
          const directFields = Array.from(fields).filter(f => {
            if (processedFields.has(f)) return false;
            // Check this field isn't inside a deeper sub-group within this section
            const closestGroup = f.closest('[role="group"]');
            return closestGroup === section;
          });

          if (directFields.length === 0 && !hText) return;

          if (hText && directFields.length > 0) {
            lines.push(`\n**${hText}**`);
          }

          directFields.forEach(field => {
            processedFields.add(field);
            const label = _wdFieldLabel(field);
            const value = _wdFieldValue(field);
            if (label) lines.push(`**${label}:** ${value || '(empty)'}`);
          });
        });

        // Catch any fields not inside a group
        allFields.forEach(field => {
          if (processedFields.has(field)) return;
          processedFields.add(field);
          const label = _wdFieldLabel(field);
          const value = _wdFieldValue(field);
          if (label) lines.push(`**${label}:** ${value || '(empty)'}`);
        });
      }

      // Also capture email if shown as static text outside formField
      if (!lines.some(l => /\bEmail\b/i.test(l))) {
        const emailEl = document.querySelector('label[for="emailAddress"]');
        if (emailEl) {
          const emailContainer = emailEl.closest('div');
          const emailText = emailContainer?.textContent?.replace(emailEl.textContent, '').trim() || '';
          if (emailText) lines.push(`**Email Address:** ${emailText}`);
        }
      }

      if (lines.length > 0) results.push(lines.join('\n'));
      return results; // Skip generic form extraction for Workday pages
    }

    // ── Standard HTML form extraction (existing logic) ──
    document.querySelectorAll('form, [class*="quiz"], [class*="question"], [class*="assessment"]').forEach(form => {
      const lines = [];
      // Questions
      form.querySelectorAll('[class*="question"], fieldset, .quiz-question, [role="group"]').forEach((q, i) => {
        const qText = q.querySelector('legend, label, [class*="question-text"], h3, h4, p')?.textContent?.trim();
        if (qText) lines.push(`**Q${i + 1}:** ${qText}`);
        // Options
        q.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
          const label = inp.closest('label')?.textContent?.trim() || inp.nextElementSibling?.textContent?.trim() || '';
          const checked = inp.checked ? ' ✅' : '';
          lines.push(`  - ${label}${checked}`);
        });
      });
      // Text inputs
      form.querySelectorAll('input[type="text"], textarea').forEach(inp => {
        const label = form.querySelector(`label[for="${inp.id}"]`)?.textContent?.trim() || inp.placeholder || inp.name || '';
        lines.push(`**${label}:** ${inp.value || '(empty)'}`);
      });
      // Select dropdowns
      form.querySelectorAll('select').forEach(sel => {
        const label = form.querySelector(`label[for="${sel.id}"]`)?.textContent?.trim() || sel.name || '';
        const val = sel.options[sel.selectedIndex]?.text || '';
        lines.push(`**${label}:** ${val}`);
      });
      if (lines.length > 0) results.push(lines.join('\n'));
    });
    return results;
  }

  /** Get clean label text for a Workday formField */
  function _wdFieldLabel(field) {
    const automId = field.getAttribute('data-automation-id') || '';
    let label = '';

    // 1. Standard <label> element
    const labelEl = field.querySelector('label');
    if (labelEl) label = labelEl.textContent.trim();

    // 2. Fieldset > legend (questionnaire fields use richText inside legend)
    if (!label) {
      const legend = field.querySelector('fieldset > legend, legend');
      if (legend) {
        // Prefer richText paragraph inside legend
        const richP = legend.querySelector('[data-automation-id="richText"] p');
        label = richP?.textContent?.trim() || legend.textContent?.trim() || '';
      }
    }

    // 3. Rich text label outside fieldset (some question sections)
    if (!label) {
      const richLabel = field.querySelector('[data-automation-id="richText"] p');
      if (richLabel) label = richLabel.textContent.trim();
    }

    // 4. aria-label on the input/button itself
    if (!label) {
      const btn = field.querySelector('button[aria-label], input[aria-label]');
      if (btn) {
        // aria-label is like "Label Value Required" — extract the label part
        label = (btn.getAttribute('aria-label') || '').replace(/\s+(Required|Optional)\s*$/i, '').trim();
        // Remove the value portion if it's appended (e.g. "Language English Required" → "Language")
        const btnText = btn.textContent?.trim();
        if (btnText && label.endsWith(btnText)) {
          label = label.slice(0, -btnText.length).trim();
        }
      }
    }

    // 5. Fallback: derive from automation-id (skip pure GUIDs)
    if (!label) {
      const idPart = automId.replace('formField-', '');
      if (!/^[a-f0-9]{20,}$/.test(idPart)) {
        label = idPart.replace(/--/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
      }
    }

    // Clean up: remove trailing asterisks, "Required" suffix, normalize whitespace
    label = label.replace(/\*+$/, '').replace(/\s*Required\s*$/i, '').replace(/\s+/g, ' ').trim();
    return label;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HTML → MARKDOWN CONVERTER (robust, recursive)
  // ═══════════════════════════════════════════════════════════════════════

  // Tags to completely skip
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'canvas', 'template', 'head']);
  // Tags whose content is inline
  const INLINE_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
    'small', 'sub', 'sup', 'abbr', 'cite', 'q', 'dfn', 'time', 'var', 'samp', 'kbd', 'data', 'wbr', 'bdi', 'bdo', 'ruby', 'rt', 'rp']);

  function nodeToMd(root) {
    if (!root) return '';
    const ctx = { listDepth: 0, inPre: false, inTable: false };
    return _walk(root, ctx).replace(/\n{4,}/g, '\n\n\n').trim();
  }

  function _walk(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent;
      if (ctx.inPre) return t;
      return t.replace(/\s+/g, ' ');
    }
    if (node.nodeType === Node.COMMENT_NODE) return '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();

    // Skip completely
    if (SKIP_TAGS.has(tag)) return '';
    // Skip hidden elements (check inline style + hidden attribute; avoid getComputedStyle for perf)
    if (node.style?.display === 'none' || node.style?.visibility === 'hidden' || node.hidden) return '';

    // Skip Workday form field containers — handled by getFormData() extractor
    const automId = node.getAttribute?.('data-automation-id') || '';
    if (automId.startsWith('formField-')) return '';
    // Skip noisy Workday UI elements (progress bar, file upload internals, cookie banner)
    if (/^(progressBar|file-upload-drop-zone|legalNotice|footerContainer|utilityButtonBar)/.test(automId)) return '';

    // Skip button noise in transcripts and UI
    if (tag === 'button') {
      const t = node.textContent.trim();
      if (/^(Jump to |Show |Hide |Close |Toggle |Skip|×|✕|Save|Enter |Exit |Restore)/.test(t)) return '';
      if (/^\d+:\d{2}$/.test(t)) return `**[${t}]** `;
      // Skip generic icon-only or single-char buttons
      if (t.length <= 2) return '';
    }
    // Skip select/combobox for transcript language picker etc.
    if (tag === 'select' || tag === 'option') return '';

    // ── Form inputs: show label + value ──
    if (tag === 'input') {
      const type = node.type || 'text';
      if (type === 'hidden') return '';
      if (type === 'radio') {
        const lbl = node.closest('label')?.textContent?.trim()
                 || document.querySelector(`label[for="${node.id}"]`)?.textContent?.trim()
                 || '';
        return node.checked ? ` (${lbl || 'selected'}) ` : '';
      }
      if (type === 'checkbox') {
        const lbl = node.closest('label')?.textContent?.trim()
                 || document.querySelector(`label[for="${node.id}"]`)?.textContent?.trim()
                 || '';
        return node.checked ? `☑ ${lbl}` : `☐ ${lbl}`;
      }
      // text / email / tel / number etc.
      if (node.value && node.value.length < 200 && !/^[a-f0-9]{20,}$/.test(node.value)) {
        return node.value;
      }
      return '';
    }
    if (tag === 'label') {
      // If label wraps an input, skip — the input handler shows value
      if (node.querySelector('input')) return childrenText(node, ctx);
      return childrenText(node, ctx);
    }

    switch (tag) {
      // ── Headings ──
      case 'h1': return `\n\n# ${childrenText(node, ctx)}\n\n`;
      case 'h2': return `\n\n## ${childrenText(node, ctx)}\n\n`;
      case 'h3': return `\n\n### ${childrenText(node, ctx)}\n\n`;
      case 'h4': return `\n\n#### ${childrenText(node, ctx)}\n\n`;
      case 'h5': return `\n\n##### ${childrenText(node, ctx)}\n\n`;
      case 'h6': return `\n\n###### ${childrenText(node, ctx)}\n\n`;

      // ── Paragraphs & blocks ──
      case 'p':          return `\n\n${childrenText(node, ctx)}\n\n`;
      case 'blockquote': return `\n\n${childrenText(node, ctx).split('\n').map(l => '> ' + l).join('\n')}\n\n`;
      case 'br':         return '\n';
      case 'hr':         return '\n\n---\n\n';

      // ── Inline formatting ──
      case 'strong': case 'b':   return `**${childrenText(node, ctx)}**`;
      case 'em':     case 'i':   return `*${childrenText(node, ctx)}*`;
      case 'u':                  return `<u>${childrenText(node, ctx)}</u>`;
      case 's': case 'del':      return `~~${childrenText(node, ctx)}~~`;
      case 'mark':               return `==${childrenText(node, ctx)}==`;
      case 'sup':                return `<sup>${childrenText(node, ctx)}</sup>`;
      case 'sub':                return `<sub>${childrenText(node, ctx)}</sub>`;
      case 'kbd':                return `<kbd>${childrenText(node, ctx)}</kbd>`;
      case 'abbr':               return `<abbr title="${node.title || ''}">${childrenText(node, ctx)}</abbr>`;

      // ── Code ──
      case 'code':
        if (node.parentElement?.tagName?.toLowerCase() === 'pre') return node.textContent;
        return '`' + node.textContent.trim().replace(/`/g, '\\`') + '`';
      case 'pre': {
        const code = node.querySelector('code');
        const text = code ? code.textContent : node.textContent;
        let lang = '';
        const cls = (code?.className || node.className || '');
        const m = cls.match(/\blang(?:uage)?-(\w+)/);
        if (m) lang = m[1];
        return `\n\n\`\`\`${lang}\n${text.trimEnd()}\n\`\`\`\n\n`;
      }

      // ── Links ──
      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = childrenText(node, ctx).trim();
        if (!text) return '';
        if (!href || href === '#' || href.startsWith('javascript:')) return text;
        let fullHref = href;
        if (!href.startsWith('http')) {
          try { fullHref = new URL(href, location.href).href; } catch (_) { fullHref = href; }
        }
        return `[${text}](${fullHref})`;
      }

      // ── Images ──
      case 'img': {
        const alt = node.alt || node.title || 'image';
        const src = node.src || node.dataset.src || '';
        if (!src) return '';
        return `![${alt}](${src})`;
      }
      case 'picture': {
        const img = node.querySelector('img');
        if (img) return `![${img.alt || 'image'}](${img.src || ''})`;
        return '';
      }
      case 'figure': {
        const img = node.querySelector('img, picture img');
        const cap = node.querySelector('figcaption');
        let md = '';
        if (img) md += `![${img.alt || ''}](${img.src || ''})`;
        if (cap) md += `\n*${cap.textContent.trim()}*`;
        return `\n\n${md}\n\n`;
      }

      // ── Lists ──
      case 'ul': case 'ol': {
        const newCtx = { ...ctx, listDepth: ctx.listDepth + 1 };
        let items = '';
        let idx = 1;
        for (const child of node.children) {
          if (child.tagName?.toLowerCase() === 'li') {
            const indent = '  '.repeat(ctx.listDepth);
            const bullet = tag === 'ol' ? `${idx++}. ` : '- ';
            const content = childrenText(child, newCtx).trim().replace(/\n{2,}/g, '\n');
            items += `${indent}${bullet}${content}\n`;
          }
        }
        return `\n${items}\n`;
      }
      case 'li': return childrenText(node, ctx);

      // ── Definition lists ──
      case 'dl': return '\n' + childrenText(node, ctx) + '\n';
      case 'dt': return `\n**${childrenText(node, ctx).trim()}**\n`;
      case 'dd': return `: ${childrenText(node, ctx).trim()}\n`;

      // ── Tables ──
      case 'table': return '\n\n' + tableToMd(node) + '\n\n';

      // ── Details / Summary ──
      case 'details': {
        const summary = node.querySelector('summary');
        const rest = Array.from(node.childNodes).filter(n =>
          n.nodeType !== Node.ELEMENT_NODE || n.tagName.toLowerCase() !== 'summary'
        ).map(n => _walk(n, ctx)).join('');
        return `\n\n<details><summary>${summary?.textContent?.trim() || 'Details'}</summary>\n\n${rest.trim()}\n\n</details>\n\n`;
      }
      case 'summary': return '';

      // ── Media ──
      case 'video': {
        const src = node.src || node.querySelector('source')?.src || '';
        const poster = node.poster || '';
        if (src && !src.startsWith('blob:')) return `\n\n🎥 Video: ${src}${poster ? ` (poster: ${poster})` : ''}\n\n`;
        return '';
      }
      case 'audio': {
        const src = node.src || node.querySelector('source')?.src || '';
        if (src && !src.startsWith('blob:')) return `\n\n🔊 Audio: ${src}\n\n`;
        return '';
      }
      case 'iframe': {
        const src = node.src || '';
        if (src && src !== 'about:blank' && !src.startsWith('javascript:'))
          return `\n\n📎 Embedded: [${node.title || src}](${src})\n\n`;
        return '';
      }

      // ── Math (MathJax / KaTeX) ──
      case 'math': {
        const ann = node.querySelector('annotation[encoding="application/x-tex"]');
        if (ann) return `$${ann.textContent}$`;
        return `$${node.textContent}$`;
      }

      // ── Divs, spans, sections — recurse ──
      default: {
        // Check for KaTeX / MathJax containers — extract TeX from annotation
        if (node.classList.contains('katex') || node.classList.contains('katex-display') ||
            node.classList.contains('MathJax') || node.classList.contains('MathJax_Display') ||
            node.classList.contains('math') || node.classList.contains('math-inline') ||
            node.classList.contains('math-display')) {
          const ann = node.querySelector('annotation[encoding="application/x-tex"]');
          const tex = ann?.textContent
                   || node.getAttribute('data-latex')
                   || '';
          if (tex) {
            const isDisplay = node.classList.contains('katex-display') ||
                              node.classList.contains('MathJax_Display') ||
                              node.classList.contains('math-display') ||
                              node.classList.contains('display');
            return isDisplay ? `$$${tex}$$` : `$${tex}$`;
          }
        }

        // Skip KaTeX/MathJax internal duplicate elements (already handled by parent)
        if (node.classList.contains('katex-html') ||
            node.classList.contains('katex-mathml') ||
            node.classList.contains('MathJax_Preview') ||
            node.classList.contains('MJXp-display') ||
            node.getAttribute('aria-hidden') === 'true' && node.closest('.katex,.MathJax')) {
          return '';
        }

        const result = childrenText(node, ctx);
        // Block-level divs get line breaks
        if (['div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'details', 'dialog', 'fieldset', 'form'].includes(tag)) {
          return '\n' + result + '\n';
        }
        return result;
      }
    }
  }

  function childrenText(node, ctx) {
    return Array.from(node.childNodes).map(n => _walk(n, ctx)).join('');
  }

  // ── Table → Markdown ──
  function tableToMd(table) {
    const rows = table.querySelectorAll('tr');
    if (!rows.length) return '';
    const result = [];
    let headerDone = false;

    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('th, td')).map(c => {
        // Use _walk for proper Math/KaTeX handling instead of raw textContent
        const ctx = { listDepth: 0, inPre: false, inTable: true };
        return _walk(c, ctx)
          .replace(/\n{2,}/g, ' ')    // flatten paragraph breaks for table cell
          .replace(/\|/g, '\\|')      // escape pipes
          .replace(/\n/g, ' ')         // no newlines in cells
          .trim();
      });
      if (cells.length === 0) return;
      result.push('| ' + cells.join(' | ') + ' |');
      if (!headerDone) {
        result.push('| ' + cells.map(() => '---').join(' | ') + ' |');
        headerDone = true;
      }
    });
    return result.join('\n');
  }

  console.log('[UMD] ✓ Universal Markdown Copier ready');
})();
