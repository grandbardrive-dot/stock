// get-stock.js — Devuelve el contenido de stock_sistema usando service role key.
// La clave pública de Supabase puede estar bloqueada por RLS; el service role la bypasea.
// No escribe nada — solo lee.

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (!SUPA_URL || !SUPA_KEY) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas.' }),
    };
  }

  try {
    // Paginar de a 1000: Supabase devuelve como máximo 1000 filas por pedido aunque
    // se pida más, y sin avisar. Con PAGE = 5000 el bucle cortaba en la primera
    // página (1000 < 5000) y la app veía solo 1000 de ~6800 SKUs (22/10/2026).
    // order=sku para que las páginas no se pisen ni salteen filas.
    const PAGE = 1000;
    let all = [];
    let from = 0;

    while (true) {
      const res = await fetch(
        `${SUPA_URL}/rest/v1/stock_sistema?select=sku,stock&order=sku&limit=${PAGE}&offset=${from}`,
        {
          headers: {
            apikey: SUPA_KEY,
            Authorization: `Bearer ${SUPA_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase error ${res.status}: ${err.slice(0, 200)}`);
      }

      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;

      all = all.concat(rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ rows: all, total: all.length }),
    };
  } catch (e) {
    console.error('get-stock ERROR:', e.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: e.message || String(e) }),
    };
  }
};
