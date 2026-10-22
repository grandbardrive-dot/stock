// ============================================================
//  GrandBar Stock · BACKGROUND Function · sync-stock-background
//  Misma sincronización que sync-stock (Córdoba → stock_sistema), pero en
//  segundo plano: Netlify responde 202 al toque y le da hasta 15 minutos.
//  La sincronización tarda ~30 s, más que lo que permite una tarea programada.
//
//  La dispara sync-stock-cron cada hora en horario de trabajo.
//  Manual: POST /.netlify/functions/sync-stock-background?origen=manual
//          (+ &key=<SYNC_STOCK_SECRET> si esa variable está configurada)
//
//  Cada corrida queda anotada en la tabla sync_corridas.
// ============================================================

const { sincronizarRegistrando } = require('./sync-stock');

exports.handler = async (event) => {
  const qs = (event && event.queryStringParameters) || {};

  const secret = process.env.SYNC_STOCK_SECRET;
  if (secret && qs.key !== secret) {
    console.log('sync-stock-background: no autorizado');
    return { statusCode: 401 };
  }

  const origen = String(qs.origen || 'manual').slice(0, 30);
  try {
    const r = await sincronizarRegistrando(origen);
    console.log(`sync-stock-background (${origen}) OK: ${r.actualizados} SKUs, ${r.conStock} con stock`);
  } catch (e) {
    console.error(`sync-stock-background (${origen}) ERROR:`, e.message);
  }
  return { statusCode: 200 };
};
