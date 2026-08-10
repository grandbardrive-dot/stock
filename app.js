/* ── GRANDBAR STOCK — shared logic ── */

// ── Email — el envío pasa por la Netlify Function ─────────────
// La API key y los destinatarios viven en netlify/functions/send-email.js
// (API key como variable de entorno en Netlify, nunca en este archivo)

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
function initConteoForm({ sector, usuario, productos, proveedores, supaUrl, supaKey }) {
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

  // Guardar array completo (incluye Promos) para cruzar stock en el Excel
  const todosLosProductos = productos;

  // Excluir productos "Promo ..." del formulario
  productos = productos.filter(p => !p.articulo.startsWith('Promo '));

  // Estado: { sku → { depo1, local, depo2, obs } }
  let values  = {};
  let provObs = {}; // proveedor → texto observación general
  let query   = '';

  // ── DEBUG stock sistema ──
  const _dbgOverrides = JSON.parse(localStorage.getItem('grandbar_stock_sistema') || '{}');
  const _dbgSku = '02060101';
  console.log('[DEBUG stock] grandbar_stock_sistema keys:', Object.keys(_dbgOverrides).length);
  console.log('[DEBUG stock] SKU ' + _dbgSku + ' en localStorage:', _dbgOverrides[_dbgSku] ?? 'AUSENTE');
  const _dbgProd = productos.find(p => p.sku === _dbgSku);
  console.log('[DEBUG stock] SKU ' + _dbgSku + ' en productos.js stock_sistema:', _dbgProd ? _dbgProd.stock_sistema : 'NO ENCONTRADO EN ARRAY');
  const _dbgKeys0206 = Object.keys(_dbgOverrides).filter(k => k.startsWith('0206')).slice(0, 10);
  console.log('[DEBUG stock] Keys 0206*:', _dbgKeys0206.length > 0 ? _dbgKeys0206.join(', ') : 'NINGUNA');
  console.log('[DEBUG stock] Primeros 5 keys:', Object.keys(_dbgOverrides).slice(0, 5).join(', '));

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
    if (raw) {
      const draft = JSON.parse(raw);
      // Compatibilidad: versiones viejas guardaban solo values (objeto plano)
      values  = draft.values  ?? draft;
      provObs = draft.provObs ?? {};
    }
  } catch { values = {}; provObs = {}; }

  function autosave() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, provObs })); } catch {}
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

    if (query) {
      // Con búsqueda activa: render plano sin agrupar
      filtered.forEach(p => frag.appendChild(makeRow(p)));
    } else {
      // Sin búsqueda: agrupar por proveedor con obs al pie de cada grupo
      const grupos = [];
      const idx    = {};
      filtered.forEach(p => {
        const key = p.proveedor || '(Sin proveedor)';
        if (idx[key] === undefined) { idx[key] = grupos.length; grupos.push({ key, items: [] }); }
        grupos[idx[key]].items.push(p);
      });

      grupos.forEach(({ key, items }) => {
        // Header del proveedor
        const header = document.createElement('div');
        header.className = 'prov-group-header';
        header.textContent = key;
        frag.appendChild(header);

        // Filas de productos
        items.forEach(p => frag.appendChild(makeRow(p)));

        // Obs general del proveedor
        frag.appendChild(makeProvObsRow(key));
      });
    }

    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  // ── Fila de observación general de proveedor ──
  function makeProvObsRow(provKey) {
    const wrap = document.createElement('div');
    wrap.className = 'prov-obs-wrap';

    const ta = document.createElement('textarea');
    ta.className     = 'prov-obs-ta';
    ta.placeholder   = '📝 Obs. general de ' + provKey + '…';
    ta.rows          = 2;
    ta.value         = provObs[provKey] || '';
    ta.setAttribute('aria-label', 'Observación general de ' + provKey);

    ta.addEventListener('input', () => {
      const v = ta.value.trim();
      if (v) provObs[provKey] = v;
      else   delete provObs[provKey];
      ta.classList.toggle('has-content', Boolean(v));
      autosave();
    });

    if (ta.value) ta.classList.add('has-content');
    wrap.appendChild(ta);
    return wrap;
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

    // Fetch fresco via función Netlify al momento de enviar (service role bypasea RLS)
    let stockOverrides = JSON.parse(localStorage.getItem('grandbar_stock_sistema') || '{}');
    try {
      const sr = await fetch('/.netlify/functions/get-stock');
      if (sr.ok) {
        const sdata = await sr.json();
        if (sdata.rows && sdata.rows.length > 0) {
          const fresh = {};
          sdata.rows.forEach(r => { fresh[r.sku] = r.stock; });
          localStorage.setItem('grandbar_stock_sistema', JSON.stringify(fresh));
          localStorage.setItem('grandbar_stock_sistema_fecha', new Date().toISOString());
          stockOverrides = fresh;
        }
      }
    } catch (e) {
      console.warn('Sin conexión al enviar — usando stock local:', e);
    }

    // Si stockOverrides tiene datos (de Supabase o localStorage), los SKUs ausentes son 0.
    // Solo usamos p.stock_sistema de productos.js si nunca hubo ningún sync.
    const hasSync = Object.keys(stockOverrides).length > 0;

    // Mapa de stock promo: { "Alfa Crux Corte Uco x 750ml" → stock del "Promo Alfa Crux Corte Uco x 750ml" }
    // Usa todosLosProductos (incluye Promos, antes del filtro del formulario)
    const promoMap = {};
    todosLosProductos.forEach(p => {
      if (p.articulo.startsWith('Promo ')) {
        const baseName = p.articulo.slice(6); // quitar "Promo "
        promoMap[baseName] = hasSync ? (stockOverrides[p.sku] ?? 0) : (p.stock_sistema || 0);
      }
    });

    // ── DEBUG: verificar promoMap ──────────────────────────────
    console.group('[DEBUG Promo]');

    // 1. Array completo antes de filtrar
    console.log('1. todosLosProductos.length:', todosLosProductos.length);
    const promosEnTodos = todosLosProductos.filter(p => p.articulo.startsWith('Promo '));
    console.log('   De esos, con "Promo ": ', promosEnTodos.length);
    console.log('   Primeros 3 Promos:', promosEnTodos.slice(0, 3).map(p =>
      `${p.sku} | ${p.articulo} | stock_sistema=${p.stock_sistema}`
    ));

    // 2. Caso específico: Alfa Crux Corte Uco
    const alfaPromo = todosLosProductos.find(p => p.articulo === 'Promo Alfa Crux Corte Uco x 750ml');
    const alfaBase  = todosLosProductos.find(p => p.articulo === 'Alfa Crux Corte Uco x 750ml');
    console.log('2. "Alfa Crux Corte Uco x 750ml":',
      alfaBase  ? `SKU=${alfaBase.sku}, stock_sistema=${alfaBase.stock_sistema}` : 'NO ENCONTRADO'
    );
    console.log('   "Promo Alfa Crux Corte Uco x 750ml":',
      alfaPromo ? `SKU=${alfaPromo.sku}, stock_sistema=${alfaPromo.stock_sistema}` : 'NO ENCONTRADO'
    );

    // 3. promoMap resultante
    const dbgPromoEntries = Object.entries(promoMap);
    const dbgConStock     = dbgPromoEntries.filter(([, v]) => v > 0);
    console.log('3. promoMap — total entradas:', dbgPromoEntries.length, '| con stock > 0:', dbgConStock.length);
    console.log('   "Alfa Crux Corte Uco x 750ml" en promoMap:',
      promoMap['Alfa Crux Corte Uco x 750ml'] ?? 'AUSENTE'
    );
    if (dbgConStock.length > 0) {
      console.log('   Primeros 5 con stock > 0:', dbgConStock.slice(0, 5));
    }

    console.groupEnd();

    // Construir lista completa — excluir productos "Promo ..."
    const conStock = productos
      .filter(p => !p.articulo.startsWith('Promo '))
      .map(p => {
        const v     = values[p.sku] || {};
        const depo1 = parseInt(v.depo1) || 0;
        const local = parseInt(v.local) || 0;
        const depo2 = parseInt(v.depo2) || 0;
        const total = depo1 + local + depo2;
        const stock_sistema = hasSync ? (stockOverrides[p.sku] ?? 0) : (p.stock_sistema || 0);
        const promo = promoMap[p.articulo] || 0;
        return {
          sku: p.sku,
          proveedor: p.proveedor,
          articulo: p.articulo,
          stock_sistema,
          promo,
          depo1, local, depo2, total,
          obs: v.obs || '',
        };
      })
      .filter(p => p.total > 0 || p.obs);

    // ── Mensaje de email — agrupado por proveedor ──
    const gruposEmail = {};
    conStock.forEach(p => {
      const k = p.proveedor || '(Sin proveedor)';
      if (!gruposEmail[k]) gruposEmail[k] = [];
      gruposEmail[k].push(p);
    });

    const lineas = [];
    Object.entries(gruposEmail).forEach(([prov, items]) => {
      lineas.push(`\n▸ ${prov}`);
      items.forEach(p => {
        const obsLine = p.obs ? ` [${p.obs}]` : '';
        lineas.push(`  • [${p.sku}] ${p.articulo} — D1:${p.depo1} Loc:${p.local} D2:${p.depo2} = ${p.total}${obsLine}`);
      });
      if (provObs[prov]) lineas.push(`  📝 ${provObs[prov]}`);
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
    let base64Excel   = null;
    let nombreArchivo = null;
    try {
      const wb = XLSX.utils.book_new();

      // Cabecera + datos
      // Columnas: SKU | Descripción | Stock Sistema | Promo | Depo 1 | Local | Depo 2 | Total | Diferencia
      // Diferencia = Total - (Stock Sistema + Promo)
      const dataRows = conStock.map(p => [
        p.sku,
        p.articulo,
        p.stock_sistema + p.promo,
        p.promo,
        p.depo1,
        p.local,
        p.depo2,
        p.total,
        p.total - (p.stock_sistema + p.promo),
        provObs[p.proveedor] || '',   // Obs. general del proveedor
      ]);

      const provResumen = proveedores && proveedores.length
        ? proveedores.join(', ')
        : 'Todos';

      const wsData = [
        [`${sectorLabel} — ${usuario} — ${fecha}`],
        [`Proveedores: ${provResumen}`],
        [],   // fila vacía separadora
        ['SKU', 'Descripción', 'Stock Sistema', 'Promo', 'Depo 1', 'Local', 'Depo 2', 'Total', 'Diferencia', 'Obs. Proveedor'],
        ...dataRows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Anchos de columna (9 columnas — sin Proveedor, con Promo)
      ws['!cols'] = [
        { wch: 13 }, // SKU
        { wch: 54 }, // Descripción
        { wch: 14 }, // Stock Sistema
        { wch: 10 }, // Promo
        { wch: 10 }, // Depo 1
        { wch: 10 }, // Local
        { wch: 10 }, // Depo 2
        { wch: 10 }, // Total
        { wch: 12 }, // Diferencia
        { wch: 40 }, // Obs. Proveedor
      ];

      const styleTitulo    = { font: { bold: true, sz: 13, color: { rgb: 'CBA86A' } } };
      const styleSubtitulo = { font: { italic: true, color: { rgb: '8a8f9a' } } };
      const styleHeader    = {
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

      // Columna I (Diferencia) = fila 5 en adelante
      conStock.forEach((p, i) => {
        const diff    = p.total - (p.stock_sistema + p.promo);
        const rowNum  = i + 5;
        const cellRef = `I${rowNum}`;
        if (ws[cellRef]) {
          ws[cellRef].s = diff < 0 ? styleDiffNeg : diff > 0 ? styleDiffPos : {};
        }
      });

      XLSX.utils.book_append_sheet(wb, ws, 'Stock');

      // Convertir a base64 para adjuntar (no descarga)
      base64Excel   = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      nombreArchivo = `stock_${sectorSlug}_${fecha}.xlsx`;

    } catch (e) {
      console.error('Excel error:', e);
    }

    // ── Construir HTML del email ──
    const filasTbody = conStock.map(p => {
      const diff     = p.total - (p.stock_sistema + p.promo);
      const diffColor = diff < 0 ? '#C0392B' : diff > 0 ? '#2E8B57' : '#8a8f9a';
      const obsCell  = p.obs ? `<em style="color:#8a8f9a">${p.obs}</em>` : '';
      return `<tr>
        <td style="font-family:monospace;font-size:12px;color:#8a8f9a">${p.sku}</td>
        <td>${p.articulo}${obsCell ? '<br>' + obsCell : ''}</td>
        <td style="text-align:center">${p.stock_sistema + p.promo}</td>
        <td style="text-align:center;color:#8a8f9a">${p.promo || ''}</td>
        <td style="text-align:center">${p.depo1 || ''}</td>
        <td style="text-align:center">${p.local || ''}</td>
        <td style="text-align:center">${p.depo2 || ''}</td>
        <td style="text-align:center;font-weight:700">${p.total}</td>
        <td style="text-align:center;font-weight:700;color:${diffColor}">${diff > 0 ? '+' : ''}${diff}</td>
      </tr>`;
    }).join('');

    const cuerpoHtml = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body
  style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:900px;margin:24px auto;background:#fff;border-radius:8px;
            overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">

  <div style="background:#1F447F;padding:20px 28px">
    <div style="color:#CBA86A;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                margin-bottom:4px">Control de Stock</div>
    <div style="color:#F1EBD6;font-size:22px;font-weight:700">
      ${sectorLabel} — ${fecha}
    </div>
    <div style="color:#a0b8d8;font-size:13px;margin-top:6px">
      ${usuario} &nbsp;·&nbsp; ${provLine}
    </div>
  </div>

  <div style="padding:20px 28px;background:#f9f7f2;border-bottom:1px solid #e8e0cc;
              display:flex;gap:32px;flex-wrap:wrap">
    <div>
      <div style="font-size:11px;color:#8a8f9a;text-transform:uppercase;
                  letter-spacing:1px">Productos con stock</div>
      <div style="font-size:28px;font-weight:800;color:#1F447F">${conStock.length}</div>
      <div style="font-size:11px;color:#aaa">de ${productos.length} totales</div>
    </div>
    <div>
      <div style="font-size:11px;color:#8a8f9a;text-transform:uppercase;
                  letter-spacing:1px">Total unidades</div>
      <div style="font-size:28px;font-weight:800;color:#CBA86A">${totUnidades}</div>
    </div>
  </div>

  <div style="padding:20px 28px;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#1F447F;color:#F1EBD6">
          <th style="padding:8px 10px;text-align:left">SKU</th>
          <th style="padding:8px 10px;text-align:left">Descripción</th>
          <th style="padding:8px 10px;text-align:center">Stock<br>Sistema</th>
          <th style="padding:8px 10px;text-align:center">Promo</th>
          <th style="padding:8px 10px;text-align:center">Depo 1</th>
          <th style="padding:8px 10px;text-align:center">Local</th>
          <th style="padding:8px 10px;text-align:center">Depo 2</th>
          <th style="padding:8px 10px;text-align:center">Total</th>
          <th style="padding:8px 10px;text-align:center">Dif.</th>
        </tr>
      </thead>
      <tbody>
        ${filasTbody}
      </tbody>
    </table>
  </div>

  <div style="padding:16px 28px;background:#f9f7f2;font-size:11px;color:#aaa;
              border-top:1px solid #eee;text-align:center">
    Generado por GrandBar Stock · ${new Date().toLocaleString('es-AR')}
  </div>
</div>
</body></html>`;

    // ── Enviar con Resend ──
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando…';

    try {
      const res = await fetch('/.netlify/functions/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject:     `[Stock Grand Bar] ${sectorLabel} — ${fecha}`,
          html:        cuerpoHtml,
          filename:    nombreArchivo  || null,
          base64Excel: base64Excel    || null,
        }),
      });

      if (!res.ok) {
        const rawBody = await res.text().catch(() => '');
        let msg;
        try { msg = JSON.parse(rawBody).message; } catch {}
        const e = new Error(msg || `HTTP ${res.status}`);
        e._rawBody = rawBody;
        throw e;
      }

      values = {};
      renderList();
      updateProgress();
      showToast('Conteo enviado por email ✓');

    } catch (err) {
      console.error('Resend error:', err);

      // DEBUG — mostrar error completo para diagnóstico
      let debugMsg = `ERROR AL ENVIAR MAIL\n\n${err.message || err}`;
      try {
        // Si el fetch llegó al server, intentar leer el body crudo
        if (typeof err._rawBody === 'string') debugMsg += `\n\nRespuesta servidor:\n${err._rawBody}`;
      } catch {}
      alert(debugMsg);

      showToast('No se pudo enviar el email — conteo guardado localmente', false);

      // Descarga de respaldo si el email falló
      if (base64Excel && nombreArchivo) {
        try {
          const bytes  = atob(base64Excel);
          const arr    = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          const blob   = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url    = URL.createObjectURL(blob);
          const a      = document.createElement('a');
          a.href = url; a.download = nombreArchivo; a.click();
          URL.revokeObjectURL(url);
        } catch {}
      }
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
