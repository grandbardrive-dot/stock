/* ── GRANDBAR STOCK — shared logic ── */

// ── EmailJS ───────────────────────────────────────────────────
const EMAILJS_SERVICE  = 'service_1ga5mth';
const EMAILJS_TEMPLATE = 'template_kemu27e';
const EMAILJS_KEY      = 'hdX7XzU49ot6eU0ca';

function initEmailJS() {
  if (typeof emailjs !== 'undefined') emailjs.init({ publicKey: EMAILJS_KEY });
}

// ── renderDate ────────────────────────────────────────────────
function renderDate(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── showToast ─────────────────────────────────────────────────
function showToast(msg, ok = true) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.background = ok ? 'var(--success)' : 'var(--danger)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── initConteoForm ────────────────────────────────────────────
function initConteoForm({ sector, usuario, productos, proveedores }) {
  const listEl        = document.getElementById('product-list');
  const searchEl      = document.getElementById('buscador');
  const clearBtn      = document.getElementById('search-clear');
  const metaEl        = document.getElementById('search-meta');
  const countFilledEl = document.getElementById('count-filled');
  const countTotalEl  = document.getElementById('count-total');
  const progressFill  = document.getElementById('progress-fill');
  const progressPct   = document.getElementById('progress-pct');
  const btnEnviar     = document.getElementById('btn-enviar');
  const fechaEl       = document.getElementById('fecha-conteo');

  const DRAFT_KEY = 'grandbar_draft_' + sector;

  // Estado: { sku → { depo1, local, depo2, obs } }
  let values = {};
  let query  = '';

  // ── Fecha de última actualización del stock sistema ──
  const stockFechaEl = document.getElementById('stock-update-date');
  if (stockFechaEl) {
    const stockFecha = localStorage.getItem('grandbar_stock_sistema_fecha');
    if (stockFecha) {
      const d = new Date(stockFecha);
      const str = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      stockFechaEl.textContent = `Stock sistema: ${str}`;
      stockFechaEl.style.display = 'block';
    } else {
      stockFechaEl.textContent = 'Stock sistema: original';
      stockFechaEl.style.display = 'block';
    }
  }

  // ── Proveedores seleccionados: mostrar en header ──
  const provEl = document.getElementById('header-proveedores');
  if (provEl && proveedores && proveedores.length) {
    provEl.textContent = proveedores.length <= 3
      ? proveedores.join(' · ')
      : `${proveedores.length} proveedores seleccionados`;
    provEl.style.display = 'block';
  } else if (provEl) {
    provEl.style.display = 'none';
  }

  // ── Fecha ──
  const hoy = new Date();
  fechaEl.value = hoy.toISOString().slice(0, 10);
  document.getElementById('fecha-display').textContent =
    hoy.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

  fechaEl.addEventListener('change', () => {
    const d = new Date(fechaEl.value + 'T12:00:00');
    document.getElementById('fecha-display').textContent =
      isNaN(d) ? '' : d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  });

  // ── Borrador ──
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) values = JSON.parse(raw);
  } catch { values = {}; }

  function autosave() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)); } catch {}
  }

  function filledCount() { return Object.keys(values).length; }

  // ── Progreso ──
  function updateProgress() {
    const filled = filledCount();
    const total  = productos.length;
    const pct    = total > 0 ? filled / total : 0;
    const pctInt = Math.round(pct * 100);
    countFilledEl.textContent = filled;
    countTotalEl.textContent  = total;
    progressFill.style.width  = Math.min(pctInt, 100) + '%';
    progressFill.classList.toggle('ready', pct >= 0.8);
    if (progressPct) progressPct.textContent = pctInt + '%';
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Enviar conteo';
  }

  // ── Filtro ──
  function getFiltered() {
    if (!query) return productos;
    const q = query.toLowerCase();
    return productos.filter(p =>
      p.articulo.toLowerCase().includes(q) ||
      p.proveedor.toLowerCase().includes(q) ||
      p.sku.includes(q)
    );
  }

  // ── Fila de producto ──
  function makeRow(p) {
    const saved = values[p.sku] || {};
    const d1    = saved.depo1 ?? '';
    const loc   = saved.local ?? '';
    const d2    = saved.depo2 ?? '';
    const obs   = saved.obs   ?? '';
    const total = (parseInt(d1) || 0) + (parseInt(loc) || 0) + (parseInt(d2) || 0);
    const hasAny = d1 !== '' || loc !== '' || d2 !== '';

    const row = document.createElement('div');
    row.className = 'prod-row' + (hasAny ? ' has-value' : '');
    row.dataset.sku = p.sku;

    // — Info (nombre + proveedor) —
    const info = document.createElement('div');
    info.className = 'prod-info';

    const nombre = document.createElement('div');
    nombre.className = 'prod-nombre';
    nombre.textContent = p.articulo;

    const prov = document.createElement('div');
    prov.className = 'prod-proveedor';
    prov.textContent = p.proveedor;

    info.appendChild(nombre);
    info.appendChild(prov);

    // — Controles: 3 inputs + total + obs —
    const controls = document.createElement('div');
    controls.className = 'prod-controls';

    function makeField(labelText, fieldKey, val) {
      const wrap = document.createElement('div');
      wrap.className = 'qty-field';

      const lbl = document.createElement('span');
      lbl.className = 'qty-label';
      lbl.textContent = labelText;

      const inp = document.createElement('input');
      inp.className = 'qty-input';
      inp.type = 'number';
      inp.setAttribute('inputmode', 'numeric');
      inp.setAttribute('pattern', '[0-9]*');
      inp.placeholder = '0';
      inp.min = '0';
      inp.value = val;
      inp.setAttribute('aria-label', `${labelText} de ${p.articulo}`);

      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      return { wrap, inp };
    }

    const { wrap: wD1,  inp: inpD1  } = makeField('Depo 1', 'depo1', d1);
    const { wrap: wLoc, inp: inpLoc } = makeField('Local',  'local', loc);
    const { wrap: wD2,  inp: inpD2  } = makeField('Depo 2', 'depo2', d2);

    // Total (solo lectura)
    const totalWrap = document.createElement('div');
    totalWrap.className = 'qty-field qty-total-field';

    const totalLbl = document.createElement('span');
    totalLbl.className = 'qty-label qty-total-label';
    totalLbl.textContent = 'Total';

    const totalVal = document.createElement('div');
    totalVal.className = 'qty-total-value';
    totalVal.textContent = total > 0 ? total : '—';

    totalWrap.appendChild(totalLbl);
    totalWrap.appendChild(totalVal);

    // Botón observaciones
    const obsBtn = document.createElement('button');
    obsBtn.className = 'obs-btn' + (obs ? ' has-obs' : '');
    obsBtn.setAttribute('aria-label', 'Observaciones');
    obsBtn.setAttribute('aria-expanded', obs ? 'true' : 'false');
    obsBtn.type = 'button';
    obsBtn.textContent = obs ? '✎' : '+';

    controls.appendChild(wD1);
    controls.appendChild(wLoc);
    controls.appendChild(wD2);
    controls.appendChild(totalWrap);
    controls.appendChild(obsBtn);

    // — Contenedor principal —
    const main = document.createElement('div');
    main.className = 'prod-main';
    main.appendChild(info);
    main.appendChild(controls);
    row.appendChild(main);

    // — Panel observaciones —
    const obsPane = document.createElement('div');
    obsPane.className = 'prod-obs' + (obs ? '' : ' hidden');

    const ta = document.createElement('textarea');
    ta.className = 'obs-textarea';
    ta.placeholder = 'Observaciones...';
    ta.rows = 2;
    ta.value = obs;
    ta.setAttribute('aria-label', 'Observaciones de ' + p.articulo);
    obsPane.appendChild(ta);
    row.appendChild(obsPane);

    // ── Actualizar total en pantalla ──
    function recalcTotal() {
      const t = (parseInt(inpD1.value) || 0) + (parseInt(inpLoc.value) || 0) + (parseInt(inpD2.value) || 0);
      totalVal.textContent = t > 0 ? t : '—';
      return t;
    }

    // ── Eventos inputs ──
    function bindInput(inp, fieldKey) {
      inp.addEventListener('change', () => {
        onFieldChange(p.sku, fieldKey, inp.value.trim(), row);
        recalcTotal();
      });
      inp.addEventListener('focus', () => inp.select());
    }

    bindInput(inpD1,  'depo1');
    bindInput(inpLoc, 'local');
    bindInput(inpD2,  'depo2');

    obsBtn.addEventListener('click', () => {
      const nowHidden = obsPane.classList.toggle('hidden');
      obsBtn.setAttribute('aria-expanded', String(!nowHidden));
      if (!nowHidden) ta.focus();
    });

    ta.addEventListener('input', () => onObsChange(p.sku, ta.value, obsBtn, row));

    return row;
  }

  // ── Mutadores de estado ──
  function onFieldChange(sku, field, val, rowEl) {
    if (!values[sku]) values[sku] = { depo1: '', local: '', depo2: '', obs: '' };
    values[sku][field] = val;
    const v = values[sku];
    const hasAny = v.depo1 !== '' || v.local !== '' || v.depo2 !== '';
    if (!hasAny && !v.obs) {
      delete values[sku];
      rowEl?.classList.remove('has-value');
    } else {
      rowEl?.classList.add('has-value');
    }
    autosave();
    updateProgress();
  }

  function onObsChange(sku, val, obsBtn, rowEl) {
    if (!values[sku]) values[sku] = { depo1: '', local: '', depo2: '', obs: '' };
    values[sku].obs = val;
    const v = values[sku];
    if (!val && v.depo1 === '' && v.local === '' && v.depo2 === '') delete values[sku];
    obsBtn.textContent = val ? '✎' : '+';
    obsBtn.classList.toggle('has-obs', Boolean(val));
    autosave();
  }

  // ── Render ──
  function renderList() {
    const filtered = getFiltered();
    if (metaEl) {
      metaEl.textContent = query
        ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} de ${productos.length}`
        : '';
    }
    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Sin resultados para "<strong></strong>"</div>';
      listEl.querySelector('strong').textContent = query;
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach(p => frag.appendChild(makeRow(p)));
    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  // ── Búsqueda ──
  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'block';
    searchTimer = setTimeout(() => {
      query = searchEl.value.trim();
      renderList();
      if (spinner) spinner.style.display = 'none';
    }, 200);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchEl.value = '';
      query = '';
      renderList();
      searchEl.focus();
    });
  }

  // ── Enviar conteo ──
  btnEnviar.addEventListener('click', async () => {
    const fecha = fechaEl.value || new Date().toISOString().slice(0, 10);
    const sectorLabel = sector === 'vinos' ? 'Vinos' : 'Spirits y Gaseosas';
    const sectorSlug  = sector === 'vinos' ? 'vinos' : 'spirits';

    // Overrides de stock sistema cargados desde Córdoba Software
    const stockOverrides = JSON.parse(localStorage.getItem('grandbar_stock_sistema') || '{}');

    // Construir lista completa (productos tocados, con totales)
    const conStock = productos
      .map(p => {
        const v    = values[p.sku] || {};
        const depo1 = parseInt(v.depo1) || 0;
        const local = parseInt(v.local) || 0;
        const depo2 = parseInt(v.depo2) || 0;
        const total = depo1 + local + depo2;
        return {
          sku:           p.sku,
          proveedor:     p.proveedor,
          articulo:      p.articulo,
          stock_sistema: (stockOverrides[p.sku] !== undefined ? stockOverrides[p.sku] : p.stock_sistema) || 0,
          depo1, local, depo2, total,
          obs: v.obs || '',
        };
      })
      .filter(p => p.total > 0 || p.obs);

    // ── Mensaje de email ──
    const lineas = conStock.map(p => {
      const obsLine = p.obs ? ` [${p.obs}]` : '';
      return `• [${p.sku}] ${p.articulo} — D1:${p.depo1} Loc:${p.local} D2:${p.depo2} = ${p.total}${obsLine}`;
    });

    const totUnidades = conStock.reduce((s, p) => s + p.total, 0);

    const provLine = proveedores && proveedores.length
      ? `Proveedores: ${proveedores.join(', ')}`
      : `Proveedores: Todos`;

    const message = [
      `Sector: ${sectorLabel}`,
      `Responsable: ${usuario}`,
      `Fecha: ${fecha}`,
      provLine,
      `Productos con stock: ${conStock.length} de ${productos.length}`,
      `Total unidades: ${totUnidades}`,
      '',
      ...lineas,
    ].join('\n');

    // ── Guardar en localStorage ──
    const registro = {
      sector, usuario, fecha,
      timestamp: new Date().toISOString(),
      items: { ...values },
      totalProductos: productos.length,
      completados: filledCount(),
    };
    try {
      const histKey = 'grandbar_historial_' + sector;
      const hist = JSON.parse(localStorage.getItem(histKey) || '[]');
      hist.push(registro);
      localStorage.setItem(histKey, JSON.stringify(hist));
      localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
      showToast('Error al guardar — ' + e.message, false);
      return;
    }

    // ── Generar Excel ──
    try {
      const wb = XLSX.utils.book_new();

      // Cabecera + datos
      const dataRows = conStock.map(p => [
        p.sku,
        p.articulo,
        p.proveedor,
        p.stock_sistema,
        p.depo1,
        p.local,
        p.depo2,
        p.total,
        p.total - p.stock_sistema,
      ]);

      const provResumen = proveedores && proveedores.length
        ? proveedores.join(', ')
        : 'Todos';

      const wsData = [
        [`${sectorLabel} — ${usuario} — ${fecha}`],
        [`Proveedores: ${provResumen}`],
        [],   // fila vacía separadora
        ['SKU', 'Descripción', 'Proveedor', 'Stock Sistema', 'Depo 1', 'Local', 'Depo 2', 'Total', 'Diferencia'],
        ...dataRows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Anchos de columna (9 columnas: +Proveedor)
      ws['!cols'] = [
        { wch: 13 }, // SKU
        { wch: 50 }, // Descripción
        { wch: 30 }, // Proveedor
        { wch: 14 }, // Stock Sistema
        { wch: 10 }, // Depo 1
        { wch: 10 }, // Local
        { wch: 10 }, // Depo 2
        { wch: 10 }, // Total
        { wch: 12 }, // Diferencia
      ];

      // Estilos: título (fila 1), subtítulo (fila 2), header datos (fila 4)
      const styleTitulo = {
        font: { bold: true, sz: 13, color: { rgb: 'CBA86A' } },
      };
      const styleSubtitulo = {
        font: { italic: true, color: { rgb: '8a8f9a' } },
      };
      const styleHeader = {
        font:      { bold: true, color: { rgb: 'F1EBD6' } },
        fill:      { fgColor: { rgb: '1F447F' } },
        alignment: { horizontal: 'center' },
      };
      const styleDiffNeg = { font: { bold: true, color: { rgb: 'C0392B' } } };
      const styleDiffPos = { font: { bold: true, color: { rgb: '2E8B57' } } };

      if (ws['A1']) ws['A1'].s = styleTitulo;
      if (ws['A2']) ws['A2'].s = styleSubtitulo;

      // Header de datos en fila 4 (A4:I4)
      ['A4','B4','C4','D4','E4','F4','G4','H4','I4'].forEach(ref => {
        if (ws[ref]) ws[ref].s = styleHeader;
      });

      // Columna I (Diferencia) = índice 8, filas desde 5
      conStock.forEach((p, i) => {
        const diff    = p.total - p.stock_sistema;
        const rowNum  = i + 5; // 3 filas meta + 1 header = fila 5 en adelante
        const cellRef = `I${rowNum}`;
        if (ws[cellRef]) {
          ws[cellRef].s = diff < 0 ? styleDiffNeg : diff > 0 ? styleDiffPos : {};
        }
      });

      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      XLSX.writeFile(wb, `stock_${sectorSlug}_${fecha}.xlsx`);
    } catch (e) {
      console.error('Excel error:', e);
    }

    // ── Enviar email ──
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando…';

    try {
      await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
        sector:  sectorLabel,
        fecha,
        name:    usuario,
        message,
      });
      values = {};
      renderList();
      updateProgress();
      showToast('Conteo enviado por email ✓');
    } catch (err) {
      console.error('EmailJS error:', err);
      showToast('No se pudo enviar el email — conteo guardado localmente', false);
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar conteo';
    }
  });

  // ── Arranque ──
  countTotalEl.textContent = productos.length;
  updateProgress();
  setTimeout(() => renderList(), 30);
}
