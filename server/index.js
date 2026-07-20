import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { BLUEPRINT_SECTION_KEYS } from './blueprintKeys.js';
import {
  DECISION_HISTORY_LIMIT,
  EVENT_HISTORY_LIMIT,
  MAX_DECISION_HISTORY_LIMIT,
  MAX_EVENT_HISTORY_LIMIT,
  MAX_PAGE_OFFSET,
  MAX_PROJECT_PAGE_LIMIT,
  PROJECT_PAGE_LIMIT
} from '../shared/readLimits.js';

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

const PROJECT_LIST_COLUMNS = 'id, name, updated_at, last_opened_at';
const BLUEPRINT_SECTION_KEY_SET = new Set(BLUEPRINT_SECTION_KEYS);

// camelCase client field → projects column, for create/patch whitelisting.
const PROJECT_FIELD_MAP = {
  name: 'name',
  idea: 'idea',
  targetAudience: 'target_audience',
  budget: 'budget',
  timeline: 'timeline',
  platform: 'platform',
  teamSize: 'team_size',
  priorities: 'priorities'
};

const pickProjectFields = (body = {}) => {
  const row = {};
  for (const [field, column] of Object.entries(PROJECT_FIELD_MAP)) {
    if (typeof body[field] === 'string') row[column] = body[field];
  }
  if (typeof row.name === 'string') row.name = row.name.trim() || 'Untitled Project';
  return row;
};

const dbError = (res, error) => res.status(500).json({ error: 'db_error', message: error.message });

const boundedInteger = (value, fallback, maximum, minimum = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
};

const readPage = (query, req, defaultLimit, maxLimit) => {
  const limit = boundedInteger(req.query.limit, defaultLimit, maxLimit, 1);
  const offset = boundedInteger(req.query.offset, 0, MAX_PAGE_OFFSET);
  // Supabase ranges are inclusive, so this requests one extra row to compute
  // hasMore without an additional count query.
  return { query: query.range(offset, offset + limit), limit, offset };
};

const pageMetadata = (rowCount, limit, offset) => ({
  limit,
  offset,
  hasMore: rowCount > limit && offset < MAX_PAGE_OFFSET,
  nextOffset: rowCount > limit && offset < MAX_PAGE_OFFSET ? offset + limit : null
});

app.get('/api/projects', withUser, async (req, res) => {
  const baseQuery = req.supabase
    .from('projects')
    .select(PROJECT_LIST_COLUMNS)
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });
  const { query, limit, offset } = readPage(baseQuery, req, PROJECT_PAGE_LIMIT, MAX_PROJECT_PAGE_LIMIT);
  const { data, error } = await query;
  if (error) return dbError(res, error);
  const rows = data || [];
  res.json({ projects: rows.slice(0, limit), pagination: pageMetadata(rows.length, limit, offset) });
});

app.post('/api/projects', withUser, async (req, res) => {
  const row = pickProjectFields(req.body);
  if (!row.name) row.name = 'Untitled Project';
  const { data, error } = await req.supabase
    .from('projects')
    .insert(row)
    .select(PROJECT_LIST_COLUMNS)
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// Blueprint selection is intentionally a single, narrow read. The project name
// already came from the registry; all other domains are loaded by their panels.
app.get('/api/projects/:id/blueprint', withUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('blueprint_sections')
    .select('section_key, content, status, generation_source, generated_by, validation_scores, generated_at, failure_reason, updated_at')
    .eq('project_id', req.params.id);
  if (error) return dbError(res, error);
  res.json({ sections: data || [] });
});

app.get('/api/projects/:id/meta', withUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('projects')
    .select('name, idea, target_audience, budget, timeline, platform, team_size, priorities')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({
    name: data.name,
    idea: data.idea,
    targetAudience: data.target_audience,
    budget: data.budget,
    timeline: data.timeline,
    platform: data.platform,
    teamSize: data.team_size,
    priorities: data.priorities
  });
});

app.get('/api/projects/:id/events', withUser, async (req, res) => {
  const baseQuery = req.supabase
    .from('workflow_events')
    .select('client_id, occurred_at, payload')
    .eq('project_id', req.params.id)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false });
  const { query, limit, offset } = readPage(baseQuery, req, EVENT_HISTORY_LIMIT, MAX_EVENT_HISTORY_LIMIT);
  const { data, error } = await query;
  if (error) return dbError(res, error);
  const rows = data || [];
  const events = rows.slice(0, limit).reverse().map(row => ({
    ...(row.payload || {}),
    id: row.payload?.id ?? row.client_id,
    timestamp: row.payload?.timestamp ?? row.occurred_at
  }));
  res.json({ events, pagination: pageMetadata(rows.length, limit, offset) });
});

app.get('/api/projects/:id/memory', withUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('memory_entries')
    .select('category, key, value')
    .eq('project_id', req.params.id)
    .order('category', { ascending: true })
    .order('key', { ascending: true });
  if (error) return dbError(res, error);
  res.json({ entries: data || [] });
});

app.get('/api/projects/:id/decisions', withUser, async (req, res) => {
  const baseQuery = req.supabase
    .from('decision_entries')
    .select('client_id, category, key, value, agent, instruction, decided_at, payload')
    .eq('project_id', req.params.id)
    .order('decided_at', { ascending: false })
    .order('id', { ascending: false });
  const { query, limit, offset } = readPage(baseQuery, req, DECISION_HISTORY_LIMIT, MAX_DECISION_HISTORY_LIMIT);
  const { data, error } = await query;
  if (error) return dbError(res, error);
  const rows = data || [];
  const decisions = rows.slice(0, limit).reverse().map(row => ({
    ...(row.payload || {}),
    id: row.payload?.id ?? row.client_id,
    category: row.payload?.category ?? row.category,
    key: row.payload?.key ?? row.key,
    value: row.payload?.value ?? row.value,
    agent: row.payload?.agent ?? row.agent,
    instruction: row.payload?.instruction ?? row.instruction,
    timestamp: row.payload?.timestamp ?? row.decided_at
  }));
  res.json({ decisions, pagination: pageMetadata(rows.length, limit, offset) });
});

app.patch('/api/projects/:id', withUser, async (req, res) => {
  const patch = pickProjectFields(req.body);
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'bad_request', message: 'Nothing to update.' });
  const { data, error } = await req.supabase
    .from('projects')
    .update(patch)
    .eq('id', req.params.id)
    .select('id, updated_at')
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json(data);
});

app.put('/api/projects/:id/sections', withUser, async (req, res) => {
  const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
  if (sections.length === 0) return res.status(400).json({ error: 'bad_request', message: 'sections array is required.' });
  const rows = sections
    .filter(s => typeof s?.key === 'string' && BLUEPRINT_SECTION_KEY_SET.has(s.key))
    .map(s => ({
      project_id: req.params.id,
      section_key: s.key,
      content: typeof s.content === 'string' ? s.content : '',
      status: s.status === 'approved' ? 'approved' : 'pending',
      generation_source: s.generationSource ?? null,
      generated_by: s.generatedBy ?? null,
      validation_scores: s.validationScores ?? null,
      generated_at: s.generatedAt ?? null,
      failure_reason: s.failureReason ?? null
    }));
  if (rows.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'No valid blueprint sections were provided.' });
  }
  const { data, error } = await req.supabase
    .from('blueprint_sections')
    .upsert(rows, { onConflict: 'project_id,section_key' })
    .select('id');
  if (error) return dbError(res, error);
  // RLS makes writes against someone else's project affect zero rows.
  if (!data || data.length === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ updated: data.length });
});

app.post('/api/projects/:id/events', withUser, async (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (events.length === 0) return res.status(400).json({ error: 'bad_request', message: 'events array is required.' });
  const rows = events
    .filter(e => e && (typeof e.id === 'string' || typeof e.id === 'number'))
    .map(e => ({
      project_id: req.params.id,
      client_id: String(e.id),
      event_type: e.type ?? null,
      agent_id: e.agentId ?? e.agent ?? null,
      occurred_at: e.timestamp || new Date().toISOString(),
      payload: e
    }));
  const { error } = await req.supabase
    .from('workflow_events')
    .upsert(rows, { onConflict: 'project_id,client_id', ignoreDuplicates: true });
  if (error) return dbError(res, error);
  res.status(201).json({ appended: rows.length });
});

app.put('/api/projects/:id/memory', withUser, async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (entries.length === 0) return res.status(400).json({ error: 'bad_request', message: 'entries array is required.' });
  const rows = entries
    .filter(e => typeof e?.category === 'string' && typeof e?.key === 'string')
    .map(e => ({ project_id: req.params.id, category: e.category, key: e.key, value: e.value ?? null }));
  if (rows.length === 0) return res.status(400).json({ error: 'bad_request', message: 'No valid memory entries were provided.' });
  const { error } = await req.supabase
    .from('memory_entries')
    .upsert(rows, { onConflict: 'project_id,category,key' });
  if (error) return dbError(res, error);
  res.json({ ok: true });
});

app.post('/api/projects/:id/decisions', withUser, async (req, res) => {
  const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  if (decisions.length === 0) return res.status(400).json({ error: 'bad_request', message: 'decisions array is required.' });
  const rows = decisions
    .filter(d => d && typeof d.id === 'string')
    .map(d => ({
      project_id: req.params.id,
      client_id: d.id,
      category: d.category ?? null,
      key: d.key ?? null,
      value: d.value ?? null,
      agent: d.agent ?? null,
      instruction: d.instruction ?? null,
      decided_at: d.timestamp || new Date().toISOString(),
      payload: d
    }));
  const { error } = await req.supabase
    .from('decision_entries')
    .upsert(rows, { onConflict: 'project_id,client_id', ignoreDuplicates: true });
  if (error) return dbError(res, error);
  res.status(201).json({ appended: rows.length });
});

app.delete('/api/projects/:id', withUser, async (req, res) => {
  const { error } = await req.supabase.from('projects').delete().eq('id', req.params.id);
  if (error) return dbError(res, error);
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
