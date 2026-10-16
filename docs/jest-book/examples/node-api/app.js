const express = require('express');
function createApp({ userRepo, weatherUrl = 'https://weather.example.com' }) {
  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.post('/users', async (req, res, next) => {
    try {
      const { email } = req.body || {};
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
      if (await userRepo.findByEmail(email)) return res.status(409).json({ error: 'Email taken' });
      const user = await userRepo.create({ email });
      res.status(201).json(user);
    } catch (err) { next(err); }
  });
  app.get('/weather/:city', async (req, res, next) => {
    try {
      const r = await fetch(`${weatherUrl}/v1/${encodeURIComponent(req.params.city)}`);
      if (!r.ok) return res.status(502).json({ error: 'Upstream failed' });
      const data = await r.json();
      res.json({ city: req.params.city, tempC: data.temp });
    } catch (err) { next(err); }
  });
  app.use((err, req, res, next) => res.status(500).json({ error: 'Internal error' }));
  return app;
}
module.exports = { createApp };
