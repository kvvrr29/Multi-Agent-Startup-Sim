import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { BLUEPRINT_SECTION_KEYS } from './blueprintKeys.js';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymxxxfvxjheaiacddcfa.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_LRNsxU4hCSXDNnxSRlii4A_QuqIlY9w';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest'];


const PORT = process.env.PORT || 8787;

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

/**
 * Auth middleware: validates the Supabase access token from the browser and
 * builds a user-scoped Supabase client, so Row Level Security still applies
 * to every query the server makes on the user's behalf.
 */
const withUser = async (req, res, next) => {
  if (process.env.DEV_AUTH_BYPASS === 'true') {
    // Development bypass: allow access without a valid Supabase JWT
    req.user = { id: 'dev-user', email: req.headers['x-user-email'] || 'dev@local.host' };
    return next();
  }

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

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true });
});

// ---------- Projects (Supabase Postgres behind RLS) ----------

const PROJECT_LIST_COLUMNS = 'id, name, created_at, updated_at, last_opened_at';

// camelCase client field → projects column, for create/patch whitelisting.
const PROJECT_FIELD_MAP = {
  name: 'name',
  idea: 'idea',
  targetAudience: 'target_audience',
  budget: 'budget',
  timeline: 'timeline',
  platform: 'platform',
  teamSize: 'team_size',
  priorities: 'priorities',
  memoryDomain: 'memory_domain',
  currentVersionLabel: 'current_version_label'
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

app.get('/api/projects', withUser, async (req, res) => {
  const { data, error } = await req.supabase
    .from('projects')
    .select(PROJECT_LIST_COLUMNS)
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });
  if (error) return dbError(res, error);
  res.json(data);
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
  // Seed one row per blueprint section so section writes are pure upserts.
  const { error: seedError } = await req.supabase
    .from('blueprint_sections')
    .insert(BLUEPRINT_SECTION_KEYS.map(key => ({ project_id: data.id, section_key: key })));
  if (seedError) return dbError(res, seedError);
  res.status(201).json(data);
});

// Composed hydration payload: everything needed to open a project in one trip.
app.get('/api/projects/:id', withUser, async (req, res) => {
  const id = req.params.id;
  const { data: project, error } = await req.supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!project) return res.status(404).json({ error: 'not_found' });

  const [sections, versions, events, memory, decisions] = await Promise.all([
    req.supabase.from('blueprint_sections').select('*').eq('project_id', id),
    req.supabase.from('versions').select('*').eq('project_id', id).order('version_number'),
    req.supabase.from('workflow_events').select('*').eq('project_id', id).order('occurred_at'),
    req.supabase.from('memory_entries').select('*').eq('project_id', id),
    req.supabase.from('decision_entries').select('*').eq('project_id', id).order('decided_at')
  ]);
  const failed = [sections, versions, events, memory, decisions].find(r => r.error);
  if (failed) return dbError(res, failed.error);

  // Fire-and-forget: opening a project marks it most-recently-used.
  req.supabase.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', id)
    .then(() => {}, () => {});

  res.json({
    project,
    sections: sections.data,
    versions: versions.data,
    events: events.data,
    memory: memory.data,
    decisions: decisions.data
  });
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
    .filter(s => typeof s?.key === 'string')
    .map(s => ({
      project_id: req.params.id,
      section_key: s.key,
      content: typeof s.content === 'string' ? s.content : '',
      status: s.status === 'approved' ? 'approved' : 'pending',
      last_modified_version: typeof s.lastModifiedVersion === 'string' ? s.lastModifiedVersion : 'v1',
      generation_source: s.generationSource ?? null,
      generated_by: s.generatedBy ?? null,
      validation_scores: s.validationScores ?? null,
      generated_at: s.generatedAt ?? null,
      failure_reason: s.failureReason ?? null
    }));
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

app.post('/api/projects/:id/versions', withUser, async (req, res) => {
  const v = req.body || {};
  const versionNumber = Number(String(v.id || '').replace(/^v/, ''));
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    return res.status(400).json({ error: 'bad_request', message: 'version id (vN) is required.' });
  }
  const { error } = await req.supabase
    .from('versions')
    .upsert({
      project_id: req.params.id,
      version_number: versionNumber,
      summary: typeof v.summary === 'string' ? v.summary : '',
      change_type: v.changeType || 'revision',
      completion_status: v.completionStatus || 'success',
      affected_agents: Array.isArray(v.affectedAgents) ? v.affectedAgents : [],
      affected_sections: Array.isArray(v.affectedSections) ? v.affectedSections : [],
      approval_state: v.approvalState || {},
      blueprint_snapshot: v.blueprintSnapshot || {},
      memory_snapshot: v.memorySnapshot ?? null,
      provenance_snapshot: v.provenanceSnapshot ?? null,
      restored_from: v.restoredFrom ?? null,
      created_at: v.timestamp || new Date().toISOString()
    }, { onConflict: 'project_id,version_number', ignoreDuplicates: true });
  if (error) return dbError(res, error);
  const { data, error: metaError } = await req.supabase
    .from('projects')
    .update({ current_version_label: `v${versionNumber}` })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();
  if (metaError) return dbError(res, metaError);
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.status(201).json({ versionNumber });
});

app.put('/api/projects/:id/memory', withUser, async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
  const domain = typeof req.body?.domain === 'string' ? req.body.domain : undefined;
  if (entries.length === 0 && domain === undefined) {
    return res.status(400).json({ error: 'bad_request', message: 'Nothing to update.' });
  }
  if (entries.length > 0) {
    const rows = entries
      .filter(e => typeof e?.category === 'string' && typeof e?.key === 'string')
      .map(e => ({ project_id: req.params.id, category: e.category, key: e.key, value: e.value ?? null }));
    const { error } = await req.supabase
      .from('memory_entries')
      .upsert(rows, { onConflict: 'project_id,category,key' });
    if (error) return dbError(res, error);
  }
  if (domain !== undefined) {
    const { data, error } = await req.supabase
      .from('projects')
      .update({ memory_domain: domain })
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'not_found' });
  }
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
      version_label: d.version ?? null,
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
