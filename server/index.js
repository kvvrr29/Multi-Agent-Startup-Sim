import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymxxxfvxjheaiacddcfa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_LRNsxU4hCSXDNnxSRlii4A_QuqIlY9w';
// The Gemini key lives ONLY here, server-side. Never sent to or read by the browser.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PORT = process.env.PORT || 8787;

// Rolling aliases first — they track Google's current models, so retired ids
// (like gemini-2.5-flash for keys created after mid-2026) can't break us.
const ALLOWED_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest', 'gemini-2.5-flash', 'gemini-2.5-pro'];

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

/**
 * Auth middleware: validates the Supabase access token from the browser and
 * builds a user-scoped Supabase client, so Row Level Security still applies
 * to every query the server makes on the user's behalf.
 */
const withUser = async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'unauthenticated', message: 'Missing bearer token.' });
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'invalid_token', message: 'Session is invalid or expired.' });
  req.supabase = client;
  req.user = data.user;
  next();
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: !!GEMINI_API_KEY });
});

// ---------- Projects (Supabase Postgres behind RLS) ----------

app.get('/api/projects', withUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('projects')
    .select('id, name, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'db_error', message: error.message });
  res.json(data);
});

app.post('/api/projects', withUser, async (req, res) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Untitled Project';
  const { data, error } = await req.supabase
    .from('projects')
    .insert({ name })
    .select('id, name, created_at, updated_at')
    .single();
  if (error) return res.status(500).json({ error: 'db_error', message: error.message });
  res.status(201).json(data);
});

app.get('/api/projects/:id', withUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('projects')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'db_error', message: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json(data);
});

app.put('/api/projects/:id', withUser, async (req, res) => {
  const patch = {};
  if (typeof req.body?.name === 'string' && req.body.name.trim()) patch.name = req.body.name.trim();
  for (const key of ['project_state', 'memory_state', 'version_state']) {
    if (req.body?.[key] !== undefined) patch[key] = req.body[key];
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'bad_request', message: 'Nothing to update.' });
  const { data, error } = await req.supabase
    .from('projects')
    .update(patch)
    .eq('id', req.params.id)
    .select('id, updated_at')
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'db_error', message: error.message });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json(data);
});

app.delete('/api/projects/:id', withUser, async (req, res) => {
  const { error } = await req.supabase.from('projects').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'db_error', message: error.message });
  res.status(204).end();
});

// ---------- AI proxy (Gemini) ----------

app.post('/api/ai/generate', withUser, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(501).json({ error: 'not_configured', message: 'Server AI is not configured (GEMINI_API_KEY is not set).' });
  }

  const { systemPrompt, userPrompt, jsonSchema, model } = req.body || {};
  if (!userPrompt || typeof userPrompt !== 'string') {
    return res.status(400).json({ error: 'bad_request', message: 'userPrompt (string) is required.' });
  }
  const chosenModel = ALLOWED_MODELS.includes(model) ? model : 'gemini-flash-latest';

  const payload = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      ...(jsonSchema ? { responseMimeType: 'application/json', responseSchema: jsonSchema } : {})
    }
  };
  if (systemPrompt && typeof systemPrompt === 'string') {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  let upstream;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify(payload)
      }
    );
  } catch (err) {
    return res.status(502).json({ error: 'upstream_unreachable', message: String(err) });
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = data?.error?.message || `Gemini returned ${upstream.status}`;
    if (upstream.status === 429) return res.status(429).json({ error: 'rate_limited', message });
    return res.status(502).json({ error: 'gemini_error', message, status: upstream.status });
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || '').join('');
  if (!text) return res.status(502).json({ error: 'empty_response', message: 'Gemini returned no text.' });

  res.json({ text });
});

app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT} (AI ${GEMINI_API_KEY ? 'configured' : 'NOT configured'})`);
});
