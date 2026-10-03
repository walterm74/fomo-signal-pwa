export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const FOMO_KEY = process.env.FOMO_API_KEY;

  if (!FOMO_KEY) {
    return res.status(500).json({
      error: 'API key no configurada',
      hint:  'Agrega FOMO_API_KEY en Vercel → Settings → Environment Variables'
    });
  }

  const { type = 'trending', limit = '30' } = req.query;

  const ENDPOINTS = {
    trending:   `https://api.fomoapi.io/v2/leaderboard/tokens/trending?limit=${limit}`,
    mostheld:   `https://api.fomoapi.io/v2/leaderboard/tokens/most-held?limit=${limit}`,
    graduated:  `https://api.fomoapi.io/v2/leaderboard/tokens/graduated?limit=${limit}`,
    leaders24h: `https://api.fomoapi.io/v2/leaderboard/24h?limit=${limit}`,
    leaders7d:  `https://api.fomoapi.io/v2/leaderboard/7d?limit=${limit}`,
    leaders30d: `https://api.fomoapi.io/v2/leaderboard/30d?limit=${limit}`,
  };

  const url = ENDPOINTS[type];
  if (!url) {
    return res.status(400).json({ error: `Tipo desconocido: ${type}` });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${FOMO_KEY}`,
        'Accept':        'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error:  `fomoapi.io respondió ${response.status}`,
        detail: body,
      });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(502).json({
      error:  'No se pudo conectar a fomoapi.io',
      detail: err.message,
    });
  }
}
