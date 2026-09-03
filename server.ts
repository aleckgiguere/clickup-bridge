import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// Proxy helper for ClickUp API with rate limit handling
app.all('/api/clickup/*', async (req: Request, res: Response) => {
  const apiKey = (req.headers['x-clickup-token'] as string) || (req.headers['authorization'] as string) || process.env.CLICKUP_API_KEY;
  const clickUpPath = req.url.replace('/api/clickup', '');
  const targetUrl = `https://api.clickup.com/api/v2${clickUpPath}`;

  if (!apiKey) {
    return res.status(401).json({ error: 'Clé API ClickUp non fournie. Veuillez entrer votre clé API ClickUp.' });
  }

  const cleanToken = apiKey.startsWith('Bearer ') ? apiKey.slice(7) : apiKey;
  const headers: Record<string, string> = {
    'Authorization': cleanToken,
    'Content-Type': 'application/json'
  };

  const fetchOptions: RequestInit = {
    method: req.method,
    headers: headers,
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  // Attempt request with retry on 429
  let maxRetries = 2;
  let attempt = 0;
  let lastStatus = 500;
  let lastData: any = {};

  while (attempt <= maxRetries) {
    try {
      const clickupResponse = await fetch(targetUrl, fetchOptions);
      lastStatus = clickupResponse.status;
      lastData = await clickupResponse.json().catch(() => ({}));

      if (clickupResponse.status === 429) {
        attempt++;
        if (attempt <= maxRetries) {
          // Wait 1.2s before retry
          await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
          continue;
        }
      }

      return res.status(clickupResponse.status).json(lastData);
    } catch (error: any) {
      console.error('ClickUp API proxy error:', error);
      return res.status(500).json({ error: error.message || 'Erreur de connexion avec les serveurs de ClickUp' });
    }
  }

  return res.status(lastStatus).json(lastData);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
