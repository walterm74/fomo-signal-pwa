export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Leer TODAS las variables de entorno disponibles
  // para ver cuáles llegan realmente al servidor
  const FOMO_KEY = process.env.FOMO_API_KEY;

  // Diagnóstico completo
  const diagnostico = {
    paso1_key_existe:     FOMO_KEY ? 'SI ✅' : 'NO ❌',
    paso2_key_longitud:   FOMO_KEY ? FOMO_KEY.length + ' caracteres' : 'sin key',
    paso3_key_preview:    FOMO_KEY
      ? FOMO_KEY.slice(0,6) + '...' + FOMO_KEY.slice(-3)
      : 'vacia',
    paso4_tiene_espacios: FOMO_KEY
      ? (FOMO_KEY !== FOMO_KEY.trim() ? 'SI — ESE ES EL PROBLEMA ❌' : 'NO ✅')
      : 'sin key',
    node_env:             process.env.NODE_ENV || 'no definido',
    vercel_env:           process.env.VERCEL_ENV || 'no definido',
  };

  // Si la key existe, intentar llamar a fomoapi.io
  if (FOMO_KEY) {
    try {
      const url      = 'https://api.fomoapi.io/v2/leaderboard/tokens/trending?limit=3';
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${FOMO_KEY.trim()}`,
          'Accept':        'application/json',
        },
      });

      const texto = await response.text();
      let   datos = null;
      try { datos = JSON.parse(texto); } catch(e) { datos = texto.slice(0, 300); }

      return res.status(200).json({
        ...diagnostico,
        paso5_api_status:   response.status,
        paso5_api_responde: response.ok ? 'SI ✅' : 'NO ❌',
        paso5_respuesta:    datos,
      });

    } catch(err) {
      return res.status(200).json({
        ...diagnostico,
        paso5_api_status:   'ERROR DE RED',
        paso5_error:        err.message,
      });
    }
  }

  // Si no hay key, mostrar solo el diagnóstico
  return res.status(200).json(diagnostico);
}
