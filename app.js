/* =========================================================================
   PrivaPDF — logica applicativa (Vanilla JS)
   Elaborazione 100% client-side con pdf-lib (scrittura) e pdf.js (rendering).
   Nessun dato lascia mai il browser.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Setup librerie
   * ------------------------------------------------------------------ */
  var PDFLib = window.PDFLib;
  var pdfjsLib = window.pdfjsLib;

  if (pdfjsLib) {
    // Il worker di pdf.js viene servito dallo stesso CDN (cache-ato dal SW).
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  var libStatus = document.getElementById('libStatus');
  if (!PDFLib || !pdfjsLib) {
    if (libStatus) {
      libStatus.hidden = false;
      libStatus.textContent =
        '⚠️ Impossibile caricare le librerie PDF. Se sei offline, apri prima l\'app una volta online per metterla in cache.';
    }
  }

  var DEGREE = PDFLib ? PDFLib.degrees : function (n) { return { angle: n }; };

  /* ------------------------------------------------------------------ *
   *  Utility
   * ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  var toastEl = $('toast');
  var toastTimer;
  function toast(msg, type) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (type ? ' ' + type : '');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 3200);
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(file);
    });
  }

  // Avvia il download di un Blob e mostra la modale donazione.
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    // Micro-interazione post-download
    setTimeout(showDonateModal, 500);
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    var spinner = btn.querySelector('.btn-spinner');
    if (spinner) spinner.hidden = !busy;
    btn.classList.toggle('is-busy', busy);
    btn.disabled = busy;
  }

  // Parsing intervalli tipo "1-3, 5, 8-10" -> Set di indici 1-based, filtrati per max.
  function parseRanges(str, max) {
    var out = new Set();
    (str || '').split(',').forEach(function (part) {
      part = part.trim();
      if (!part) return;
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
        if (a > b) { var t = a; a = b; b = t; }
        for (var i = a; i <= b; i++) if (i >= 1 && i <= max) out.add(i);
      } else if (/^\d+$/.test(part)) {
        var n = parseInt(part, 10);
        if (n >= 1 && n <= max) out.add(n);
      }
    });
    return out;
  }

  // Compatta un Set di pagine in una stringa "1-3, 5".
  function pagesToRangeString(set) {
    var arr = Array.from(set).sort(function (a, b) { return a - b; });
    var parts = [], i = 0;
    while (i < arr.length) {
      var start = arr[i], end = arr[i];
      while (i + 1 < arr.length && arr[i + 1] === end + 1) { end = arr[++i]; }
      parts.push(start === end ? '' + start : start + '-' + end);
      i++;
    }
    return parts.join(', ');
  }

  /* ------------------------------------------------------------------ *
   *  Rendering pagine con pdf.js (thumbnail e canvas grande)
   * ------------------------------------------------------------------ */
  // Rende una pagina in un canvas fornito, adattandola a maxW.
  function renderPageToCanvas(pdfDoc, pageNum, canvas, maxW) {
    return pdfDoc.getPage(pageNum).then(function (page) {
      var base = page.getViewport({ scale: 1 });
      var scale = maxW / base.width;
      var vp = page.getViewport({ scale: scale });
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.aspectRatio = vp.width + ' / ' + vp.height;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return page.render({ canvasContext: ctx, viewport: vp }).promise;
    });
  }

  /* ================================================================== *
   *  MODALI e interazioni globali
   * ================================================================== */
  function openModal(el) { if (el) el.hidden = false; }
  function closeModal(el) { if (el) el.hidden = true; }
  function showDonateModal() { openModal($('donateModal')); }

  document.addEventListener('click', function (e) {
    if (e.target.matches('[data-close-modal]')) {
      var back = e.target.closest('.modal-backdrop');
      closeModal(back);
    }
    // Chiudi cliccando sullo sfondo
    if (e.target.classList.contains('modal-backdrop')) {
      closeModal(e.target);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeModal($('howModal'));
      closeModal($('donateModal'));
    }
  });
  var howBtn = $('howBtn');
  if (howBtn) howBtn.addEventListener('click', function () { openModal($('howModal')); });

  // Tema
  var themeToggle = $('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('privapdf-theme', next); } catch (e) {}
    });
  }

  // Anno footer
  var yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ================================================================== *
   *  Tab strumenti
   * ================================================================== */
  var tabs = document.querySelectorAll('.tool-tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var tool = tab.getAttribute('data-tool');
      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.tool-view').forEach(function (v) {
        var on = v.id === 'view-' + tool;
        v.classList.toggle('is-active', on);
        v.hidden = !on;
      });
    });
  });

  /* ------------------------------------------------------------------ *
   *  Helper dropzone generico
   * ------------------------------------------------------------------ */
  function wireDropzone(zone, input, onFiles, multiple) {
    if (!zone || !input) return;
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) onFiles(Array.from(input.files));
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'dragleave' && zone.contains(e.relatedTarget)) return;
        zone.classList.remove('is-drag');
      });
    });
    zone.addEventListener('drop', function (e) {
      var files = Array.from(e.dataTransfer.files).filter(function (f) {
        return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      });
      if (!files.length) { toast('Trascina solo file PDF.', 'error'); return; }
      onFiles(multiple ? files : [files[0]]);
    });
  }

  /* ================================================================== *
   *  STRUMENTO 1 — UNISCI (MERGE)
   * ================================================================== */
  (function mergeTool() {
    var files = []; // { file, name, size, id }
    var uid = 0;
    var list = $('mergeList');
    var actions = $('mergeActions');
    var resetBtn = document.querySelector('[data-reset="merge"]');

    function addFiles(newOnes) {
      newOnes.forEach(function (f) {
        files.push({ file: f, name: f.name, size: f.size, id: ++uid });
      });
      render();
    }
    function removeFile(id) {
      files = files.filter(function (f) { return f.id !== id; });
      render();
    }
    function render() {
      list.innerHTML = '';
      files.forEach(function (f, i) {
        var li = document.createElement('li');
        li.className = 'file-item';
        li.draggable = true;
        li.dataset.id = f.id;
        li.innerHTML =
          '<span class="file-grip" aria-hidden="true">⋮⋮</span>' +
          '<span class="file-idx">' + (i + 1) + '</span>' +
          '<span class="file-meta"><span class="file-name"></span>' +
          '<span class="file-sub">' + fmtBytes(f.size) + '</span></span>' +
          '<button class="file-remove" type="button" aria-label="Rimuovi">' +
          '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
        li.querySelector('.file-name').textContent = f.name;
        li.querySelector('.file-remove').addEventListener('click', function () { removeFile(f.id); });
        wireItemDrag(li);
        list.appendChild(li);
      });
      var has = files.length > 0;
      actions.hidden = !has;
      resetBtn.hidden = !has;
    }

    // Riordino via drag-and-drop
    var dragId = null;
    function wireItemDrag(li) {
      li.addEventListener('dragstart', function () {
        dragId = li.dataset.id; li.classList.add('dragging');
      });
      li.addEventListener('dragend', function () {
        dragId = null; li.classList.remove('dragging');
        document.querySelectorAll('.file-item.drag-over').forEach(function (x) { x.classList.remove('drag-over'); });
      });
      li.addEventListener('dragover', function (e) { e.preventDefault(); li.classList.add('drag-over'); });
      li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (dragId == null || dragId === li.dataset.id) return;
        var from = files.findIndex(function (f) { return '' + f.id === dragId; });
        var to = files.findIndex(function (f) { return '' + f.id === li.dataset.id; });
        if (from < 0 || to < 0) return;
        var moved = files.splice(from, 1)[0];
        files.splice(to, 0, moved);
        render();
      });
    }

    wireDropzone($('mergeDrop'), $('mergeInput'), addFiles, true);
    $('mergeAddMore').addEventListener('click', function () { $('mergeInput').click(); });
    resetBtn.addEventListener('click', function () { files = []; render(); });

    $('mergeRun').addEventListener('click', function () {
      if (files.length < 1) return;
      if (files.length < 2) { toast('Aggiungi almeno due PDF per unirli.', 'error'); return; }
      var btn = this;
      setBusy(btn, true);
      (async function () {
        try {
          var out = await PDFLib.PDFDocument.create();
          for (var i = 0; i < files.length; i++) {
            var buf = await readAsArrayBuffer(files[i].file);
            var src = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
            var pages = await out.copyPages(src, src.getPageIndices());
            pages.forEach(function (p) { out.addPage(p); });
          }
          var bytes = await out.save();
          downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'PrivaPDF-unito.pdf');
          toast('PDF uniti con successo.', 'success');
        } catch (err) {
          console.error(err);
          toast('Errore durante l\'unione. Un file potrebbe essere protetto o danneggiato.', 'error');
        } finally {
          setBusy(btn, false);
        }
      })();
    });
  })();

  /* ================================================================== *
   *  STRUMENTO 2 — DIVIDI (SPLIT)
   * ================================================================== */
  (function splitTool() {
    var buffer = null;      // ArrayBuffer originale (per pdf-lib)
    var pdfDoc = null;      // documento pdf.js
    var pageCount = 0;
    var selected = new Set();
    var origName = 'documento';

    var workspace = $('splitWorkspace');
    var drop = $('splitDrop');
    var grid = $('splitGrid');
    var rangeInput = $('splitRange');
    var countEl = $('splitCount');
    var resetBtn = document.querySelector('[data-reset="split"]');

    function loadFile(f) {
      origName = f.name.replace(/\.pdf$/i, '');
      readAsArrayBuffer(f).then(function (buf) {
        buffer = buf.slice(0);
        return pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      }).then(function (doc) {
        pdfDoc = doc;
        pageCount = doc.numPages;
        selected = new Set();
        drop.hidden = true;
        workspace.hidden = false;
        resetBtn.hidden = false;
        buildGrid();
        updateCount();
      }).catch(function (err) {
        console.error(err);
        toast('Impossibile aprire il PDF.', 'error');
      });
    }

    function buildGrid() {
      grid.innerHTML = '';
      for (var i = 1; i <= pageCount; i++) {
        (function (num) {
          var card = document.createElement('div');
          card.className = 'page-card';
          card.dataset.page = num;
          card.innerHTML =
            '<span class="page-badge">' + num + '</span>' +
            '<span class="page-check">✓</span>' +
            '<div class="page-thumb-wrap"><div class="page-thumb-skeleton"></div></div>';
          card.addEventListener('click', function () { toggle(num, card); });
          grid.appendChild(card);
          // Render thumbnail (lazy-ish: sequenziale)
          var canvas = document.createElement('canvas');
          renderPageToCanvas(pdfDoc, num, canvas, 200).then(function () {
            var wrap = card.querySelector('.page-thumb-wrap');
            wrap.innerHTML = '';
            wrap.appendChild(canvas);
          }).catch(function () {});
        })(i);
      }
    }

    function toggle(num, card) {
      if (selected.has(num)) selected.delete(num); else selected.add(num);
      card.classList.toggle('selected', selected.has(num));
      syncInputFromSelection();
      updateCount();
    }
    function syncSelectionToCards() {
      grid.querySelectorAll('.page-card').forEach(function (c) {
        var n = parseInt(c.dataset.page, 10);
        c.classList.toggle('selected', selected.has(n));
      });
    }
    function syncInputFromSelection() {
      rangeInput.value = pagesToRangeString(selected);
    }
    function updateCount() {
      countEl.textContent = selected.size + (selected.size === 1 ? ' pagina selezionata' : ' pagine selezionate');
    }

    rangeInput.addEventListener('input', function () {
      selected = parseRanges(rangeInput.value, pageCount);
      syncSelectionToCards();
      updateCount();
    });

    $('splitAll').addEventListener('click', function () {
      selected = new Set(); for (var i = 1; i <= pageCount; i++) selected.add(i);
      syncSelectionToCards(); syncInputFromSelection(); updateCount();
    });
    $('splitNone').addEventListener('click', function () {
      selected = new Set(); syncSelectionToCards(); syncInputFromSelection(); updateCount();
    });
    $('splitOdd').addEventListener('click', function () {
      selected = new Set(); for (var i = 1; i <= pageCount; i += 2) selected.add(i);
      syncSelectionToCards(); syncInputFromSelection(); updateCount();
    });
    $('splitEven').addEventListener('click', function () {
      selected = new Set(); for (var i = 2; i <= pageCount; i += 2) selected.add(i);
      syncSelectionToCards(); syncInputFromSelection(); updateCount();
    });

    wireDropzone(drop, $('splitInput'), function (fs) { loadFile(fs[0]); }, false);
    resetBtn.addEventListener('click', function () {
      buffer = null; pdfDoc = null; workspace.hidden = true; drop.hidden = false; resetBtn.hidden = true;
      grid.innerHTML = ''; rangeInput.value = '';
    });

    $('splitRun').addEventListener('click', function () {
      if (!selected.size) { toast('Seleziona almeno una pagina.', 'error'); return; }
      var btn = this; setBusy(btn, true);
      (async function () {
        try {
          var src = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
          var out = await PDFLib.PDFDocument.create();
          var idx = Array.from(selected).sort(function (a, b) { return a - b; })
            .map(function (n) { return n - 1; });
          var pages = await out.copyPages(src, idx);
          pages.forEach(function (p) { out.addPage(p); });
          var bytes = await out.save();
          downloadBlob(new Blob([bytes], { type: 'application/pdf' }), origName + '-estratto.pdf');
          toast('Pagine estratte con successo.', 'success');
        } catch (err) {
          console.error(err); toast('Errore durante l\'estrazione.', 'error');
        } finally { setBusy(btn, false); }
      })();
    });
  })();

  /* ================================================================== *
   *  STRUMENTO 3 — OSCURA / REDIGI (REDACT)
   *  Le pagine con box neri vengono rasterizzate: il testo sottostante
   *  viene rimosso in modo permanente dal file di output.
   * ================================================================== */
  (function redactTool() {
    var buffer = null, pdfDoc = null, pageCount = 0, cur = 1;
    var origName = 'documento';
    var rects = {};          // { pageNum: [ {x,y,w,h} in coordinate normalizzate 0..1 ] }
    var RENDER_W = 760;

    var drop = $('redactDrop');
    var workspace = $('redactWorkspace');
    var canvas = $('redactCanvas');
    var overlay = $('redactOverlay');
    var holder = $('redactCanvasHolder');
    var resetBtn = document.querySelector('[data-reset="redact"]');

    function loadFile(f) {
      origName = f.name.replace(/\.pdf$/i, '');
      readAsArrayBuffer(f).then(function (buf) {
        buffer = buf.slice(0);
        return pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      }).then(function (doc) {
        pdfDoc = doc; pageCount = doc.numPages; cur = 1; rects = {};
        drop.hidden = true; workspace.hidden = false; resetBtn.hidden = false;
        $('redactPageTot').textContent = pageCount;
        showPage(1);
      }).catch(function (err) {
        console.error(err); toast('Impossibile aprire il PDF.', 'error');
      });
    }

    function showPage(n) {
      cur = n;
      $('redactPageNum').textContent = n;
      renderPageToCanvas(pdfDoc, n, canvas, RENDER_W).then(drawOverlay);
    }

    function drawOverlay() {
      overlay.innerHTML = '';
      var list = rects[cur] || [];
      list.forEach(function (r, i) {
        var d = document.createElement('div');
        d.className = 'redact-rect';
        d.style.left = (r.x * 100) + '%';
        d.style.top = (r.y * 100) + '%';
        d.style.width = (r.w * 100) + '%';
        d.style.height = (r.h * 100) + '%';
        var del = document.createElement('button');
        del.className = 'rect-del'; del.type = 'button'; del.textContent = '✕';
        del.title = 'Rimuovi';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          rects[cur].splice(i, 1); drawOverlay(); updateCount();
        });
        d.appendChild(del);
        overlay.appendChild(d);
      });
      updateCount();
    }

    function updateCount() {
      var total = 0;
      Object.keys(rects).forEach(function (k) { total += rects[k].length; });
      $('redactCount').textContent = total + (total === 1 ? ' area oscurata' : ' aree oscurate');
    }

    // Disegno rettangoli (mouse + touch tramite Pointer Events)
    var drawing = false, startX = 0, startY = 0, ghost = null;
    function relPos(e) {
      var rect = overlay.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width;
      var y = (e.clientY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
    overlay.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;            // solo tasto primario
      if (e.target.classList.contains('rect-del')) return; // clic sul pulsante elimina
      e.preventDefault();
      drawing = true;
      try { overlay.setPointerCapture(e.pointerId); } catch (err) {}
      var p = relPos(e); startX = p.x; startY = p.y;
      ghost = document.createElement('div');
      ghost.className = 'redact-rect';
      ghost.style.left = (startX * 100) + '%';
      ghost.style.top = (startY * 100) + '%';
      ghost.style.width = '0'; ghost.style.height = '0';
      overlay.appendChild(ghost);
    });
    overlay.addEventListener('pointermove', function (e) {
      if (!drawing || !ghost) return;
      var p = relPos(e);
      var x = Math.min(startX, p.x), y = Math.min(startY, p.y);
      var w = Math.abs(p.x - startX), h = Math.abs(p.y - startY);
      ghost.style.left = (x * 100) + '%';
      ghost.style.top = (y * 100) + '%';
      ghost.style.width = (w * 100) + '%';
      ghost.style.height = (h * 100) + '%';
    });
    function endDraw(e) {
      if (!drawing || !ghost) return;
      drawing = false;
      var p = relPos(e);
      var x = Math.min(startX, p.x), y = Math.min(startY, p.y);
      var w = Math.abs(p.x - startX), h = Math.abs(p.y - startY);
      overlay.removeChild(ghost); ghost = null;
      if (w > 0.008 && h > 0.008) {
        if (!rects[cur]) rects[cur] = [];
        rects[cur].push({ x: x, y: y, w: w, h: h });
      }
      drawOverlay();
    }
    overlay.addEventListener('pointerup', endDraw);
    overlay.addEventListener('pointercancel', endDraw);

    $('redactPrev').addEventListener('click', function () { if (cur > 1) showPage(cur - 1); });
    $('redactNext').addEventListener('click', function () { if (cur < pageCount) showPage(cur + 1); });
    $('redactUndo').addEventListener('click', function () {
      if (rects[cur] && rects[cur].length) { rects[cur].pop(); drawOverlay(); }
    });
    $('redactClearPage').addEventListener('click', function () {
      rects[cur] = []; drawOverlay();
    });

    wireDropzone(drop, $('redactInput'), function (fs) { loadFile(fs[0]); }, false);
    resetBtn.addEventListener('click', function () {
      buffer = null; pdfDoc = null; rects = {}; overlay.innerHTML = '';
      workspace.hidden = true; drop.hidden = false; resetBtn.hidden = true;
    });

    // Rasterizza una pagina a scala alta con i box neri "fusi" nell'immagine.
    function rasterizePage(num, boxes) {
      return pdfDoc.getPage(num).then(function (page) {
        var vp = page.getViewport({ scale: 2.0 });
        var c = document.createElement('canvas');
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        var ctx = c.getContext('2d');
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
          ctx.fillStyle = '#000';
          boxes.forEach(function (r) {
            ctx.fillRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height);
          });
          return { dataUrl: c.toDataURL('image/png'), w: vp.width / 2, h: vp.height / 2 };
        });
      });
    }

    $('redactRun').addEventListener('click', function () {
      var total = 0; Object.keys(rects).forEach(function (k) { total += rects[k].length; });
      if (!total) { toast('Traccia almeno un\'area da oscurare.', 'error'); return; }
      var btn = this; setBusy(btn, true);
      (async function () {
        try {
          var src = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
          var out = await PDFLib.PDFDocument.create();
          for (var n = 1; n <= pageCount; n++) {
            var boxes = rects[n] || [];
            if (boxes.length) {
              // Pagina con redazioni -> rasterizzata (testo rimosso in modo permanente)
              var img = await rasterizePage(n, boxes);
              var png = await out.embedPng(img.dataUrl);
              var page = out.addPage([img.w, img.h]);
              page.drawImage(png, { x: 0, y: 0, width: img.w, height: img.h });
            } else {
              // Pagina invariata -> copia vettoriale
              var copied = await out.copyPages(src, [n - 1]);
              out.addPage(copied[0]);
            }
          }
          var bytes = await out.save();
          downloadBlob(new Blob([bytes], { type: 'application/pdf' }), origName + '-oscurato.pdf');
          toast('Documento oscurato in modo permanente.', 'success');
        } catch (err) {
          console.error(err); toast('Errore durante l\'oscuramento.', 'error');
        } finally { setBusy(btn, false); }
      })();
    });
  })();

  /* ================================================================== *
   *  STRUMENTO 4 — RUOTA & PAGINE
   * ================================================================== */
  (function pagesTool() {
    var buffer = null, pdfDoc = null, pageCount = 0, origName = 'documento';
    var state = {}; // { pageNum: { rot: 0/90/180/270, removed: bool } }

    var drop = $('pagesDrop');
    var workspace = $('pagesWorkspace');
    var grid = $('pagesGrid');
    var countEl = $('pagesCount');
    var resetBtn = document.querySelector('[data-reset="pages"]');

    function loadFile(f) {
      origName = f.name.replace(/\.pdf$/i, '');
      readAsArrayBuffer(f).then(function (buf) {
        buffer = buf.slice(0);
        return pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      }).then(function (doc) {
        pdfDoc = doc; pageCount = doc.numPages; state = {};
        for (var i = 1; i <= pageCount; i++) state[i] = { rot: 0, removed: false };
        drop.hidden = true; workspace.hidden = false; resetBtn.hidden = false;
        buildGrid(); updateCount();
      }).catch(function (err) {
        console.error(err); toast('Impossibile aprire il PDF.', 'error');
      });
    }

    function buildGrid() {
      grid.innerHTML = '';
      for (var i = 1; i <= pageCount; i++) {
        (function (num) {
          var card = document.createElement('div');
          card.className = 'page-card';
          card.dataset.page = num;
          card.innerHTML =
            '<span class="page-badge">' + num + '</span>' +
            '<span class="page-rot-badge" hidden>0°</span>' +
            '<div class="page-thumb-wrap"><div class="page-thumb-skeleton"></div></div>' +
            '<div class="page-tools">' +
              '<button class="page-btn" data-act="rl" type="button" title="Ruota a sinistra">↺</button>' +
              '<button class="page-btn" data-act="rr" type="button" title="Ruota a destra">↻</button>' +
              '<button class="page-btn danger" data-act="del" type="button" title="Elimina/Ripristina">🗑</button>' +
            '</div>';
          card.querySelector('[data-act="rl"]').addEventListener('click', function () { rotate(num, -90, card); });
          card.querySelector('[data-act="rr"]').addEventListener('click', function () { rotate(num, 90, card); });
          card.querySelector('[data-act="del"]').addEventListener('click', function () { toggleRemove(num, card); });
          grid.appendChild(card);
          var canvas = document.createElement('canvas');
          renderPageToCanvas(pdfDoc, num, canvas, 200).then(function () {
            var wrap = card.querySelector('.page-thumb-wrap');
            wrap.innerHTML = ''; wrap.appendChild(canvas);
          }).catch(function () {});
        })(i);
      }
    }

    function applyVisual(num, card) {
      var st = state[num];
      var wrap = card.querySelector('.page-thumb-wrap');
      wrap.style.transform = 'rotate(' + st.rot + 'deg)';
      var badge = card.querySelector('.page-rot-badge');
      if (st.rot % 360 !== 0) { badge.hidden = false; badge.textContent = ((st.rot % 360) + 360) % 360 + '°'; }
      else badge.hidden = true;
      card.classList.toggle('removed', st.removed);
    }
    function rotate(num, delta, card) {
      state[num].rot = (state[num].rot + delta) % 360;
      applyVisual(num, card); updateCount();
    }
    function toggleRemove(num, card) {
      state[num].removed = !state[num].removed;
      applyVisual(num, card); updateCount();
    }
    function updateCount() {
      var kept = 0, rotated = 0, removed = 0;
      Object.keys(state).forEach(function (k) {
        if (state[k].removed) removed++; else kept++;
        if (state[k].rot % 360 !== 0) rotated++;
      });
      countEl.textContent = kept + ' pagine finali · ' + rotated + ' ruotate · ' + removed + ' eliminate';
    }

    $('pagesRotateAllL').addEventListener('click', function () {
      grid.querySelectorAll('.page-card').forEach(function (card) {
        rotate(parseInt(card.dataset.page, 10), -90, card);
      });
    });
    $('pagesRotateAllR').addEventListener('click', function () {
      grid.querySelectorAll('.page-card').forEach(function (card) {
        rotate(parseInt(card.dataset.page, 10), 90, card);
      });
    });

    wireDropzone(drop, $('pagesInput'), function (fs) { loadFile(fs[0]); }, false);
    resetBtn.addEventListener('click', function () {
      buffer = null; pdfDoc = null; state = {}; grid.innerHTML = '';
      workspace.hidden = true; drop.hidden = false; resetBtn.hidden = true;
    });

    $('pagesRun').addEventListener('click', function () {
      var kept = Object.keys(state).filter(function (k) { return !state[k].removed; });
      if (!kept.length) { toast('Non puoi eliminare tutte le pagine.', 'error'); return; }
      var btn = this; setBusy(btn, true);
      (async function () {
        try {
          var src = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
          var pages = src.getPages();
          for (var n = 1; n <= pageCount; n++) {
            var st = state[n];
            if (st.rot % 360 !== 0) {
              var base = pages[n - 1].getRotation().angle || 0;
              pages[n - 1].setRotation(DEGREE((base + st.rot) % 360));
            }
          }
          // Rimuovi dalla fine per non alterare gli indici
          for (var i = pageCount; i >= 1; i--) {
            if (state[i].removed) src.removePage(i - 1);
          }
          var bytes = await src.save();
          downloadBlob(new Blob([bytes], { type: 'application/pdf' }), origName + '-modificato.pdf');
          toast('Modifiche applicate con successo.', 'success');
        } catch (err) {
          console.error(err); toast('Errore durante l\'elaborazione.', 'error');
        } finally { setBusy(btn, false); }
      })();
    });
  })();

  /* ================================================================== *
   *  PWA — Service Worker + prompt di installazione
   * ================================================================== */
  if ('serviceWorker' in navigator) {
    // Ricarica UNA volta quando un SW aggiornato prende il controllo, così la
    // versione installata (PWA) non resta mai "congelata" su una copia vecchia.
    // Non ricarica al primissimo install (quando non c'era ancora un controller).
    var hadController = !!navigator.serviceWorker.controller;
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      if (hadController) window.location.reload();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        reg.update();
        var promote = function (sw) { if (sw) sw.postMessage('SKIP_WAITING'); };
        if (reg.waiting) promote(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (nw) nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) promote(nw);
          });
        });
      }).catch(function (err) {
        console.warn('SW registration failed:', err);
      });
    });
  }

  var deferredPrompt = null;
  var installBtn = $('installBtn');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) {
        toast('L\'app è già installata o non installabile su questo browser.', '');
        return;
      }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') {
          toast('PrivaPDF installata! Ora funziona anche offline.', 'success');
          installBtn.hidden = true;
        }
        deferredPrompt = null;
      });
    });
  }
  window.addEventListener('appinstalled', function () {
    if (installBtn) installBtn.hidden = true;
    deferredPrompt = null;
  });
})();
