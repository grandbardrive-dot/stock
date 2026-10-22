// ============================================================
//  GrandBar Stock · Scheduled Function · sync-stock-cron
//  Cada hora en horario de trabajo dispara sync-stock-background, que trae
//  el stock de Córdoba a stock_sistema. El horario está en netlify.toml:
//    "0 11-23 * * 1-6"  (UTC)  =  8 a 20 hs de Argentina, lunes a sábado.
//
//  No sincroniza acá adentro: las tareas programadas cortan a los 30 s y la
//  sincronización tarda más o menos eso. La de segundo plano tiene 15 min.
// ============================================================

exports.handler = async () => {
  const base = process.env.URL || 'https://stockgrandbar.netlify.app';
  const params = new URLSearchParams({ origen: 'cron' });
  if (process.env.SYNC_STOCK_SECRET) params.set('key', process.env.SYNC_STOCK_SECRET);

  try {
    const r = await fetch(`${base}/.netlify/functions/sync-stock-background?${params}`, { method: 'POST' });
    console.log('sync-stock-cron → sync-stock-background:', r.status);
  } catch (e) {
    console.error('sync-stock-cron: no se pudo disparar la sincronización:', e.message);
  }
  return { statusCode: 200 };
};
