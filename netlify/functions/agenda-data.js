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
      const result = await supa(
        '/rest/v1/agenda_registro?select=fecha,sector,proveedor,done&order=fecha.desc&limit=2000'
      );
      if (!result.ok) {
        // Columna done no existe todavía — intentar sin ella
        const fallback = await supa(
          '/rest/v1/agenda_registro?select=fecha,sector,proveedor&order=fecha.desc&limit=2000'
        );
        const rows = (fallback.data || []).map(r => ({ ...r, done: false }));
        return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify(result.data || []) };
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
      // Asignación de Laura: done=false, mueve si ya existe
      await supa(
        `/rest/v1/agenda_registro?sector=eq.${encodeURIComponent(sector)}&proveedor=eq.${encodeURIComponent(proveedor)}`,
        { method: 'DELETE' }
      );
      // Intentar con done=false; si falla (columna no existe aún), intentar sin done
      let result = await supa('/rest/v1/agenda_registro', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ fecha, sector, proveedor, done: false }),
      });
      if (!result.ok) {
        result = await supa('/rest/v1/agenda_registro', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify({ fecha, sector, proveedor }),
        });
      }
      return { statusCode: result.ok ? 200 : 500, headers: CORS, body: JSON.stringify({ ok: result.ok, error: result.data }) };
    }

    if (act === 'mark-done') {
      // Chico marca hecho: done=true
      await supa(
        `/rest/v1/agenda_registro?sector=eq.${encodeURIComponent(sector)}&proveedor=eq.${encodeURIComponent(proveedor)}`,
        { method: 'DELETE' }
      );
      // Intentar con done=true; fallback sin done (columna puede no existir aún)
      let result = await supa('/rest/v1/agenda_registro', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ fecha, sector, proveedor, done: true }),
      });
      if (!result.ok) {
        result = await supa('/rest/v1/agenda_registro', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify({ fecha, sector, proveedor }),
        });
      }
      return { statusCode: result.ok ? 200 : 500, headers: CORS, body: JSON.stringify({ ok: result.ok }) };
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
