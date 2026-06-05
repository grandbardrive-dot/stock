/* ── GRANDBAR STOCK — shared logic ── */

// ── EmailJS ───────────────────────────────────────────────────
const EMAILJS_SERVICE  = 'service_1ga5mth';
const EMAILJS_TEMPLATE = 'template_kemu27e';
const EMAILJS_KEY      = 'hdX7XzU49ot6eU0ca';

function initEmailJS() {
  if (typeof emailjs !== 'undefined') emailjs.init({ publicKey: EMAILJS_KEY });
}

// ── renderDate ────────────────────────────────────────────────
// Usado por index.html para mostrar la fecha actual
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
  t.textContent  = msg;
  t.style.background = ok ? 'var(--success)' : 'var(--danger)';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ── initConteoForm ────────────────────────────────────────────
// Orquesta toda la lógica de vinos.html y spirits.html.
// config: { sector, usuario, productos }
function initConteoForm({ sector, usuario, productos }) {
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

  // Estado: { sku → { qty: string, obs: string } }
  let values = {};
  let query  = '';

  // ── Inicializar fecha ──
  const hoy = new Date();
  fechaEl.value = hoy.toISOString().slice(0, 10);
  document.getElementById('fecha-display').textContent =
    hoy.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });

  fechaEl.addEventListener('change', () => {
    const d = new Date(fechaEl.value + 'T12:00:00');
    document.getElementById('fecha-display').textContent =
      isNaN(d) ? '' : d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  });

  // ── Cargar borrador ──
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) values = JSON.parse(raw);
  } catch { values = {}; }

  function autosave() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(values)); } catch {}
  }

  function filledCount() { return Object.keys(values).length; }

  // ── Barra de progreso ──
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

  // ── Construcción de fila ──
  function makeRow(p) {
    const saved = values[p.sku];
    const qty   = saved?.qty ?? '';
    const obs   = saved?.obs ?? '';

    const row = document.createElement('div');
    row.className = 'prod-row' + (qty !== '' ? ' has-value' : '');
    row.dataset.sku = p.sku;

    // — Línea principal —
    const main = document.createElement('div');
    main.className = 'prod-main';

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

    const controls = document.createElement('div');
    controls.className = 'prod-controls';

    const input = document.createElement('input');
    input.className = 'qty-input';
    input.type = 'number';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.placeholder = '0';
    input.min = '0';
    input.value = qty;
    input.setAttribute('aria-label', 'Cantidad de ' + p.articulo);

    const obsBtn = document.createElement('button');
    obsBtn.className = 'obs-btn' + (obs ? ' has-obs' : '');
    obsBtn.setAttribute('aria-label', 'Observaciones');
    obsBtn.setAttribute('aria-expanded', obs ? 'true' : 'false');
    obsBtn.type = 'button';
    obsBtn.textContent = obs ? '✎' : '+';

    controls.appendChild(input);
    controls.appendChild(obsBtn);
    main.appendChild(info);
    main.appendChild(controls);
    row.appendChild(main);

    // — Panel de observaciones —
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

    // ── Eventos ──
    input.addEventListener('change', () => onQtyChange(p.sku, input.value.trim(), row));
    input.addEventListener('focus', () => input.select());

    obsBtn.addEventListener('click', () => {
      const nowHidden = obsPane.classList.toggle('hidden');
      obsBtn.setAttribute('aria-expanded', String(!nowHidden));
      if (!nowHidden) ta.focus();
    });

    ta.addEventListener('input', () => onObsChange(p.sku, ta.value, obsBtn, row));

    return row;
  }

  function onQtyChange(sku, val, rowEl) {
    if (!values[sku]) values[sku] = { qty: '', obs: '' };
    values[sku].qty = val;
    if (val === '' && !values[sku].obs) {
      delete values[sku];
      rowEl?.classList.remove('has-value');
    } else {
      rowEl?.classList.add('has-value');
    }
    autosave();
    updateProgress();
  }

  function onObsChange(sku, val, obsBtn, rowEl) {
    if (!values[sku]) values[sku] = { qty: '', obs: '' };
    values[sku].obs = val;
    if (!val && !values[sku].qty) delete values[sku];
    obsBtn.textContent = val ? '✎' : '+';
    obsBtn.classList.toggle('has-obs', Boolean(val));
    autosave();
  }

  // ── Render de lista ──
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

  // ── Búsqueda con debounce ──
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

    // Construir resumen de texto para el template
    const conStock = productos
      .map(p => {
        const v = values[p.sku];
        const qty = v?.qty ? parseInt(v.qty, 10) : 0;
        return { sku: p.sku, proveedor: p.proveedor, articulo: p.articulo, qty, obs: v?.obs || '' };
      })
      .filter(p => p.qty > 0 || p.obs);

    const lineas = conStock.map(p => {
      const obsLine = p.obs ? ` [${p.obs}]` : '';
      return `• [${p.sku}] ${p.articulo}: ${p.qty}${obsLine}`;
    });

    const totUnidades = conStock.reduce((s, p) => s + p.qty, 0);
    const sectorLabel = sector === 'vinos' ? 'Vinos' : 'Spirits y Gaseosas';

    const message = [
      `Sector: ${sectorLabel}`,
      `Responsable: ${usuario}`,
      `Fecha: ${fecha}`,
      `Productos con stock: ${conStock.length} de ${productos.length}`,
      `Total unidades: ${totUnidades}`,
      '',
      ...lineas,
    ].join('\n');

    // Guardar en localStorage
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

    // Generar y descargar Excel
    try {
      const sectorSlug = sector === 'vinos' ? 'vinos' : 'spirits';
      const wb = XLSX.utils.book_new();
      const filas = [
        ['SKU', 'Proveedor', 'Artículo', 'Cantidad', 'Observaciones'],
        ...conStock.map(p => [p.sku, p.proveedor, p.articulo, p.qty, p.obs]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(filas);
      ws['!cols'] = [{ wch: 12 }, { wch: 36 }, { wch: 52 }, { wch: 10 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      XLSX.writeFile(wb, `stock_${sectorSlug}_${fecha}.xlsx`);
    } catch (e) {
      console.error('Excel error:', e);
    }

    // Enviar email
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
  // Diferimos el render inicial para que el primer paint ocurra antes
  countTotalEl.textContent = productos.length;
  updateProgress();
  setTimeout(() => renderList(), 30);
}
