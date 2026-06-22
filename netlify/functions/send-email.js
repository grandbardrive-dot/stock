// netlify/functions/send-email.js
// Intermediario entre el browser y la API de Resend.
// La API key vive en variables de entorno de Netlify, nunca en el código.

const RESEND_FROM = 'Stock GrandBar <onboarding@resend.dev>';
const RESEND_TO   = ['grandbardrive@gmail.com', 'lgonzalez@grandbar.com.ar', 'facturacion@grandbar.com.ar']; // PRUEBA — reemplazar con destinatarios reales al verificar dominio

exports.handler = async function (event) {
  // Solo aceptar POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método no permitido' }),
    };
  }

  // Verificar que la API key está configurada en Netlify
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY no está configurada como variable de entorno');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Configuración incompleta en el servidor' }),
    };
  }

  // Parsear el body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Body inválido — se esperaba JSON' }),
    };
  }

  const { subject, html, filename, base64Excel } = body;

  if (!subject || !html) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Faltan campos requeridos: subject, html' }),
    };
  }

  // Construir payload para Resend
  const payload = {
    from:    RESEND_FROM,
    to:      RESEND_TO,
    subject,
    html,
  };

  if (filename && base64Excel) {
    payload.attachments = [{ filename, content: base64Excel }];
  }

  // Llamar a Resend (fetch nativo disponible en Node 18+)
  let resendRes;
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Error de red al llamar Resend:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'No se pudo conectar con Resend' }),
    };
  }

  const data = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error('Resend devolvió error:', resendRes.status, data);
    return {
      statusCode: resendRes.status,
      body: JSON.stringify({ error: data.message || `Error Resend HTTP ${resendRes.status}` }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, id: data.id }),
  };
};
