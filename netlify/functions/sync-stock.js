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
async function aikon(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 500) }; }
}

// ── Obtener lista de artículos con stock desde AIKON ─────────
async function fetchArticulosStock(urlCuenta, cuenta, token) {
  // Córdoba Software expone el stock de artículos via DtTabla.
  // Intentamos dos nombres de tabla comunes en Sinergis:
  const tablasCandidatas = ['ARTICULOS', 'STOCK_ARTICULOS', 'STOCK'];

  for (const tabla of tablasCandidatas) {
    let raw, status;
    try {
      const r = await fetch(urlCuenta + '/IS3/DtTabla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta, token, tabla }),
      });
      status = r.status;
      raw = await r.text();
    } catch (e) {
      console.log(`DtTabla(${tabla}) FETCH ERROR:`, e.message);
      continue;
    }

    let j = {};
    try { j = JSON.parse(raw); } catch { /* no era JSON */ }

    // DtTabla puede devolver la lista bajo distintos nombres
    const lista = Array.isArray(j)
      ? j
      : (j.lista || j.tabla || j.Tabla || j.datos || j.Datos || j.registros || j.Registros || j.data || []);
    const arr = Array.isArray(lista) ? lista : [];

    if (arr.length === 0) {
      console.log(`DtTabla(${tabla}) → http ${status}, 0 registros — probando siguiente tabla`);
      continue;
    }

    // Loguear estructura real para debugging (primer registro)
    const cols = Object.keys(arr[0] || {});
    console.log(`DtTabla(${tabla}) → http ${status}, ${arr.length} registros`);
    console.log('Columnas disponibles:', JSON.stringify(cols));
    console.log('Ejemplo (primer registro):', JSON.stringify(arr[0]).slice(0, 600));

    return { arr, tabla };
  }

  return { arr: [], tabla: null };
}

// ── Extraer SKU y stock de un registro AIKON ─────────────────
// Sinergis usa columnas con prefijo 'ar_' (ar_codigo, ar_stockact).
// Manejamos múltiples variantes por si cambia la versión.
function extraerCampos(item) {
  const val = (...keys) => {
    for (const k of keys) {
      if (item[k] != null && String(item[k]).trim() !== '') return item[k];
    }
    return null;
  };

  // Código del artículo
  const codigoRaw = val(
    'ar_codigo', 'Codigo', 'codigo', 'ArticuloCodigo',
    'CODIGO', 'CodArt', 'cod_articulo',
  );

  // Stock actual (campo más probable según versiones de Sinergis)
  const stockRaw = val(
    'ar_stockact', 'ar_stock', 'StockActual', 'stock_actual',
    'Stock', 'stock', 'Unidades', 'unidades',
    'ar_saldo', 'Saldo',
  );

  if (codigoRaw == null) return null;

  // Normalizar código: sacar no-dígitos, padding/truncar a 8
  const digits = String(codigoRaw).trim().replace(/\D/g, '');
  if (!digits || digits.length < 6) return null;
  const sku = digits.length === 6
    ? digits + '00'
    : digits.padStart(8, '0').slice(0, 8);

  const stock = parseFloat(String(stockRaw ?? '0').replace(',', '.')) || 0;

  return { sku, stock };
}

// ── Prefijos de SKU por sector (mismos que import-cordoba.js) ─
const PREFIJOS_VINOS   = new Set(['01','11','12','13','14','15','16','17','18','19']);
const PREFIJOS_SPIRITS = new Set(['02','03','04','05','07','08']);

function esSectorConocido(sku) {
  const pre = sku.slice(0, 2);
  return PREFIJOS_VINOS.has(pre) || PREFIJOS_SPIRITS.has(pre);
}

// ── Sincronización principal ──────────────────────────────────
async function sincronizar() {
  const cuenta   = process.env.AIKON_CUENTA;
  const cuentaPwd = process.env.AIKON_CUENTA_PWD;
  const empresa  = process.env.AIKON_EMPRESA;

  if (!cuenta || !empresa) {
    throw new Error('Faltan variables AIKON_CUENTA / AIKON_EMPRESA en Netlify.');
  }
  if (!SUPA_URL || !SUPA_KEY) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Netlify.');
  }

  // 1) Obtener URL de la cuenta
  const managerUrl = process.env.AIKON_MANAGER_URL || 'http://aikonmanager.com/Manager/api/CuentaURL';
  console.log('Paso 1 — CuentaURL desde:', managerUrl);
  const j1 = await aikon(managerUrl, { Cuenta: cuenta, CuentaPwd: cuentaPwd });
  const urlCuenta = String(j1.retorno || '').replace(/\/+$/, '');
  if (!urlCuenta) {
    throw new Error('CuentaUrl no devolvió URL. Respuesta: ' + JSON.stringify(j1));
  }
  console.log('URL cuenta:', urlCuenta);

  // 2) Obtener token
  console.log('Paso 2 — ObtenerToken');
  const j2 = await aikon(urlCuenta + '/IS3/ObtenerToken', {
    cuenta,
    usuario:    process.env.AIKON_USUARIO || 'CS',
    'contraseña': process.env.AIKON_PASS || '',
    empresa,
  });
  const token = j2.token && j2.token.Codigo;
  if (!token) {
    throw new Error('ObtenerToken falló. Respuesta: ' + JSON.stringify(j2).slice(0, 300));
  }
  console.log('Token OK');

  // 3) Traer artículos con stock
  console.log('Paso 3 — DtTabla ARTICULOS');
  const { arr, tabla } = await fetchArticulosStock(urlCuenta, cuenta, token);

  if (!arr.length) {
    throw new Error(
      'No se obtuvieron artículos de AIKON. ' +
      'Verificá que la tabla de artículos exista y tenga datos. ' +
      'Revisá los logs de la función para ver las columnas disponibles.',
    );
  }

  // 4) Procesar registros
  const stockMap = {};
  let omitidos = 0;

  for (const item of arr) {
    const campos = extraerCampos(item);
    if (!campos) { omitidos++; continue; }
    if (!esSectorConocido(campos.sku)) { omitidos++; continue; }
    stockMap[campos.sku] = campos.stock;
  }

  const total     = Object.keys(stockMap).length;
  const vinosN    = Object.keys(stockMap).filter(s => PREFIJOS_VINOS.has(s.slice(0,2))).length;
  const spiritsN  = Object.keys(stockMap).filter(s => PREFIJOS_SPIRITS.has(s.slice(0,2))).length;

  console.log(`Artículos procesados: ${arr.length} | válidos: ${total} | omitidos: ${omitidos}`);
  console.log(`Vinos: ${vinosN} | Spirits: ${spiritsN}`);

  if (total === 0) {
    throw new Error(
      `AIKON devolvió ${arr.length} registros pero ninguno matcheó los prefijos de SKU conocidos. ` +
      `Revisá los logs — mostramos las columnas y un ejemplo del primer registro.`,
    );
  }

  // 5) Actualizar Supabase: primero BORRAR todo, luego INSERT limpio
  // Así los artículos con stock=0 que AIKON no devuelve quedan en 0 (no con dato viejo)
  console.log('Paso 4 — Limpiando stock_sistema en Supabase');
  const delRes = await sb('stock_sistema?sku=not.is.null', {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!delRes.ok) {
    const err = await delRes.text();
    throw new Error(`Error al limpiar stock_sistema: ${err.slice(0, 200)}`);
  }

  console.log('Paso 5 — Insertando datos frescos en Supabase');
  const rows   = Object.entries(stockMap).map(([sku, stock]) => ({ sku, stock: Math.round(stock) }));
  const BATCH  = 500;
  let batchesOk = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const r = await sb('stock_sistema', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Supabase batch ${Math.floor(i/BATCH)+1} falló: ${err.slice(0, 300)}`);
    }
    batchesOk++;
  }

  console.log(`Supabase: ${batchesOk} batches OK — ${rows.length} filas`);

  return {
    ok: true,
    tabla,
    totalArticulos: arr.length,
    actualizados: total,
    vinos: vinosN,
    spirits: spiritsN,
    omitidos,
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

  // Protección opcional por secret
  const secret = process.env.SYNC_STOCK_SECRET;
  if (secret) {
    const key = (event.queryStringParameters && event.queryStringParameters.key) || '';
    if (key !== secret) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado.' }) };
    }
  }

  try {
    const resultado = await sincronizar();
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
