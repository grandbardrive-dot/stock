const SUPA_URL = process.env.SUPABASE_URL || 'https://owpsfpifeonwkvwxqovk.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function supa(path, opts = {}) {
  const res = await fetch(SUPA_URL + path, {
    ...opts,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  const qs = event.queryStringParameters || {};
  const action = qs.action || '';

  // ── GET ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    if (action === 'registro') {
      const { data } = await supa(
        '/rest/v1/agenda_registro?select=fecha,sector,proveedor&order=fecha.desc&limit=2000'
      );
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data || []) };
    }

    if (action === 'exclusiones') {
      const { data } = await supa(
        '/rest/v1/proveedores_excluidos?select=sector,proveedor&order=proveedor.asc&limit=2000'
      );
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data || []) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'action desconocida' }) };
  }

  // ── POST ───────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const { action: act, fecha, sector, proveedor } = body;

    if (act === 'add-registro') {
      // Si ya existe en otro día, lo movemos (delete + insert)
      await supa(
        `/rest/v1/agenda_registro?sector=eq.${encodeURIComponent(sector)}&proveedor=eq.${encodeURIComponent(proveedor)}`,
        { method: 'DELETE' }
      );
      const { ok } = await supa('/rest/v1/agenda_registro', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ fecha, sector, proveedor }),
      });
      return { statusCode: ok ? 200 : 500, headers: CORS, body: JSON.stringify({ ok }) };
    }

    if (act === 'del-registro') {
      const { ok } = await supa(
        `/rest/v1/agenda_registro?sector=eq.${encodeURIComponent(sector)}&proveedor=eq.${encodeURIComponent(proveedor)}`,
        { method: 'DELETE' }
      );
      return { statusCode: ok ? 200 : 500, headers: CORS, body: JSON.stringify({ ok }) };
    }

    if (act === 'add-exclusion') {
      const { ok } = await supa('/rest/v1/proveedores_excluidos', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ sector, proveedor }),
      });
      return { statusCode: ok ? 200 : 500, headers: CORS, body: JSON.stringify({ ok }) };
    }

    if (act === 'del-exclusion') {
      const { ok } = await supa(
        `/rest/v1/proveedores_excluidos?sector=eq.${encodeURIComponent(sector)}&proveedor=eq.${encodeURIComponent(proveedor)}`,
        { method: 'DELETE' }
      );
      return { statusCode: ok ? 200 : 500, headers: CORS, body: JSON.stringify({ ok }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'action desconocida' }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'método no permitido' }) };
};
