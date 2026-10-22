// ============================================================
//  GrandBar Stock · Netlify Function · sync-stock
//  Conecta a Córdoba Software (AIKON/Sinergis WebApi) y
//  actualiza la tabla stock_sistema en Supabase.
//
//  Env vars (Netlify — mismas que grandbar-ecommerce):
//    AIKON_CUENTA, AIKON_CUENTA_PWD
//    AIKON_USUARIO, AIKON_PASS, AIKON_EMPRESA
//    AIKON_MANAGER_URL  (opcional)
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//    SYNC_STOCK_SECRET  (opcional — exige ?key=<secret> para disparar manualmente)
//
//  ?dry=1  → solo lee AIKON y devuelve un resumen (columnas, cantidades, muestra).
//            No escribe nada en Supabase.
//
//  22/10/2026: el stock quedaba en 0 para todos los artículos. En esta cuenta del
//  ERP la tabla que trae el stock se llama ARTICULO (singular), la lista viene
//  anidada en resultado.retorno / data, y el campo es st_stock (igual que la
//  sync de productos del Hub, que funciona). ARTICULOS no trae el stock.
//  Además: si no se encuentra el campo de stock o todo da 0, NO se toca la tabla.
// ============================================================

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Supabase helper ──────────────────────────────────────────
const sb = (path, opts = {}) =>
  fetch(SUPA_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });

// ── AIKON helper ─────────────────────────────────────────────
async function aikon(url, body, ms = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500) }; }
  } finally {
    clearTimeout(t);
  }
}

// DtTabla devuelve la lista con distintos nombres y a veces anidada en "resultado".
function listaDe(o) {
  if (!o) return null;
  if (Array.isArray(o)) return o;
  const l = o.lista || o.tabla || o.Tabla || o.datos || o.Datos || o.registros || o.Registros || o.retorno || o.data;
  return Array.isArray(l) ? l : null;
}

// ── Obtener lista de artículos con stock desde AIKON ─────────
async function fetchArticulosStock(urlCuenta, cuenta, token) {
  // ARTICULO (singular) es la que trae st_stock en esta cuenta. ARTICULOS queda
  // como respaldo, pero solo se acepta si alguna fila trae un campo de stock.
  const tablasCandidatas = ['ARTICULO', 'ARTICULOS'];
  const probadas = [];

  for (const tabla of tablasCandidatas) {
    let j;
    try {
      j = await aikon(urlCuenta + '/IS3/DtTabla', { cuenta, token, tabla }, 90000);
    } catch (e) {
      console.log(`DtTabla(${tabla}) FETCH ERROR:`, e.message);
      probadas.push(`${tabla}: error de red`);
      continue;
    }

    const arr = listaDe(j) || listaDe(j && j.resultado) || [];
    if (!arr.length) {
      // Ojo: resultado.log trae el token de sesión; no se loguea.
      const estado = j && j.resultado && j.resultado.estado;
      console.log(`DtTabla(${tabla}) → 0 registros (estado: ${estado || '?'})`);
      probadas.push(`${tabla}: 0 registros`);
      continue;
    }

    const cols = Object.keys(arr[0] || {});
    const tieneStock = arr.some(it => campoStock(it) !== null);
    console.log(`DtTabla(${tabla}) → ${arr.length} registros · stock: ${tieneStock ? 'sí' : 'NO'}`);
    console.log('Columnas:', JSON.stringify(cols));
    if (!tieneStock) {
      probadas.push(`${tabla}: ${arr.length} registros sin campo de stock (${cols.join(', ').slice(0, 300)})`);
      continue;
    }
    return { arr, tabla, cols, probadas };
  }

  return { arr: [], tabla: null, cols: [], probadas };
}

// ── Campos de un registro AIKON ──────────────────────────────
const CAMPOS_STOCK = [
  'st_stock', 'ar_stockact', 'ar_stock', 'StockActual', 'stock_actual',
  'Stock', 'stock', 'Unidades', 'unidades', 'ar_saldo', 'Saldo',
];

function campoStock(item) {
  for (const k of CAMPOS_STOCK) {
    if (item[k] != null && String(item[k]).trim() !== '') return k;
  }
  return null;
}

function extraerCampos(item) {
  const val = (...keys) => {
    for (const k of keys) {
      if (item[k] != null && String(item[k]).trim() !== '') return item[k];
    }
    return null;
  };

  const codigoRaw = val('ar_codigo', 'Codigo', 'codigo', 'ArticuloCodigo', 'CODIGO', 'CodArt', 'cod_articulo');
  if (codigoRaw == null) return null;

  // Normalizar código: sacar no-dígitos, 6 dígitos → +00, si no padding/truncar a 8
  const digits = String(codigoRaw).trim().replace(/\D/g, '');
  if (!digits || digits.length < 6) return null;
  const sku = digits.length === 6
    ? digits + '00'
    : digits.padStart(8, '0').slice(0, 8);

  const k = campoStock(item);
  const stock = k ? (parseFloat(String(item[k]).replace(',', '.')) || 0) : null;

  const descRaw = val('ar_descri', 'ar_descripcion', 'ar_descrip', 'ar_nombre', 'Descripcion', 'descripcion');
  const articulo = descRaw != null ? String(descRaw).trim().replace(/`/g, "'") : null;

  return { sku, stock, articulo };
}

// ── Prefijos de SKU por sector (mismos que import-cordoba.js) ─
const PREFIJOS_VINOS   = new Set(['01','11','12','13','14','15','16','17','18','19']);
const PREFIJOS_SPIRITS = new Set(['02','03','04','05','07','08']);

function sectorDe(sku) {
  const pre = sku.slice(0, 2);
  if (PREFIJOS_VINOS.has(pre))   return 'vinos';
  if (PREFIJOS_SPIRITS.has(pre)) return 'spirits';
  return null;
}

// ── Login AIKON ──────────────────────────────────────────────
async function login() {
  const cuenta    = process.env.AIKON_CUENTA;
  const cuentaPwd = process.env.AIKON_CUENTA_PWD;
  const empresa   = process.env.AIKON_EMPRESA;

  if (!cuenta || !empresa) {
    throw new Error('Faltan variables AIKON_CUENTA / AIKON_EMPRESA en Netlify.');
  }

  const managerUrl = process.env.AIKON_MANAGER_URL || 'http://aikonmanager.com/Manager/api/CuentaURL';
  const j1 = await aikon(managerUrl, { Cuenta: cuenta, CuentaPwd: cuentaPwd });
  const urlCuenta = String(j1.retorno || '').replace(/\/+$/, '');
  if (!urlCuenta) {
    throw new Error('CuentaUrl no devolvió URL. Respuesta: ' + JSON.stringify(j1).slice(0, 200));
  }

  const j2 = await aikon(urlCuenta + '/IS3/ObtenerToken', {
    cuenta,
    usuario:    process.env.AIKON_USUARIO || 'CS',
    'contraseña': process.env.AIKON_PASS || '',
    empresa,
  });
  const token = j2.token && j2.token.Codigo;
  if (!token) {
    throw new Error('ObtenerToken falló. Revisá AIKON_USUARIO / AIKON_PASS / AIKON_EMPRESA en Netlify.');
  }
  return { urlCuenta, cuenta, token };
}

// ── Leer y validar ───────────────────────────────────────────
async function leerStock() {
  const { urlCuenta, cuenta, token } = await login();
  const { arr, tabla, cols, probadas } = await fetchArticulosStock(urlCuenta, cuenta, token);

  if (!arr.length) {
    throw new Error('AIKON no devolvió artículos con campo de stock. Probadas: ' + probadas.join(' | '));
  }

  // Procesar registros. Si un código viene repetido (p. ej. una fila por depósito), se suma.
  const porSku = new Map();
  let omitidos = 0, repetidos = 0;
  for (const item of arr) {
    const c = extraerCampos(item);
    if (!c || c.stock === null) { omitidos++; continue; }
    const sector = sectorDe(c.sku);
    if (!sector) { omitidos++; continue; }
    const prev = porSku.get(c.sku);
    if (prev) {
      repetidos++;
      prev.stock += c.stock;
      if (!prev.articulo && c.articulo) prev.articulo = c.articulo;
    } else {
      porSku.set(c.sku, { sku: c.sku, stock: c.stock, articulo: c.articulo, sector });
    }
  }

  const rows = [...porSku.values()].map(r => ({ ...r, stock: Math.round(r.stock) }));
  const conStock  = rows.filter(r => r.stock > 0).length;
  const negativos = rows.filter(r => r.stock < 0).length;
  const vinosN    = rows.filter(r => r.sector === 'vinos').length;
  const spiritsN  = rows.filter(r => r.sector === 'spirits').length;

  console.log(`Tabla ${tabla}: ${arr.length} registros · válidos ${rows.length} · con stock ${conStock} · repetidos ${repetidos} · omitidos ${omitidos}`);

  return { tabla, cols, rows, totalArticulos: arr.length, conStock, negativos, vinosN, spiritsN, repetidos, omitidos };
}

// ── Sincronización principal ──────────────────────────────────
async function sincronizar({ dry = false } = {}) {
  if (!dry && (!SUPA_URL || !SUPA_KEY)) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Netlify.');
  }

  const l = await leerStock();

  const resumen = {
    tabla: l.tabla,
    totalArticulos: l.totalArticulos,
    actualizados: l.rows.length,
    conStock: l.conStock,
    negativos: l.negativos,
    vinos: l.vinosN,
    spirits: l.spiritsN,
    repetidos: l.repetidos,
    omitidos: l.omitidos,
  };

  if (dry) {
    const ejemplos = ['02060101', '01290611', '01720101'];
    return {
      ok: true,
      dry: true,
      ...resumen,
      columnas: l.cols,
      muestra: l.rows.filter(r => ejemplos.includes(r.sku))
        .concat(l.rows.filter(r => r.stock > 0).slice(0, 3)),
      timestamp: new Date().toISOString(),
    };
  }

  // Freno: si todo vino en 0, algo anda mal en la lectura → no pisar la tabla.
  if (l.rows.length === 0 || l.conStock === 0) {
    throw new Error(
      `AIKON devolvió ${l.totalArticulos} artículos pero ninguno con stock mayor a 0. ` +
      'No se actualizó la tabla para no dejar todo en cero.',
    );
  }

  // 1) Upsert por SKU (sin borrar antes: si algo falla, la tabla no queda vacía)
  const BATCH = 500;
  let batchesOk = 0;
  for (let i = 0; i < l.rows.length; i += BATCH) {
    const chunk = l.rows.slice(i, i + BATCH);
    const r = await sb('stock_sistema?on_conflict=sku', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Supabase batch ${Math.floor(i / BATCH) + 1} falló: ${err.slice(0, 300)}`);
    }
    batchesOk++;
  }

  // 2) SKUs que están en la tabla pero AIKON ya no devuelve → stock 0 (no dato viejo)
  const nuevos = new Set(l.rows.map(r => r.sku));
  let existentes = [];
  for (let from = 0; ; from += 1000) {
    const r = await sb(`stock_sistema?select=sku&order=sku&limit=1000&offset=${from}`);
    if (!r.ok) break;
    const page = await r.json();
    existentes = existentes.concat(page.map(x => x.sku));
    if (page.length < 1000) break;
  }
  const ausentes = existentes.filter(s => !nuevos.has(s));
  for (let i = 0; i < ausentes.length; i += 150) {
    const lista = ausentes.slice(i, i + 150).join(',');
    await sb(`stock_sistema?sku=in.(${lista})`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ stock: 0 }),
    });
  }

  console.log(`Supabase: ${batchesOk} batches OK — ${l.rows.length} filas · ${ausentes.length} ausentes en 0`);

  return {
    ok: true,
    ...resumen,
    ausentesEnCero: ausentes.length,
    timestamp: new Date().toISOString(),
  };
}

// ── Handler ───────────────────────────────────────────────────
exports.handler = async (event) => {
  // Cabeceras CORS para que admin.html pueda llamar a la función
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const qs = event.queryStringParameters || {};

  // Protección opcional por secret
  const secret = process.env.SYNC_STOCK_SECRET;
  if (secret && qs.key !== secret) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado.' }) };
  }

  try {
    const resultado = await sincronizar({ dry: qs.dry === '1' });
    return { statusCode: 200, headers, body: JSON.stringify(resultado) };
  } catch (e) {
    console.error('sync-stock ERROR:', e.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message || String(e) }),
    };
  }
};

exports.sincronizar = sincronizar;
