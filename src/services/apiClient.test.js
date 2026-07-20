import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } }
      })
    }
  }
}));

import { api } from './apiClient';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({})
  });
});

describe('bounded read requests', () => {
  it('requests a finite project page', async () => {
    await api.listProjects({ limit: 25, offset: 50 });

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects?limit=25&offset=50',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('uses bounded defaults for event and decision history', async () => {
    await api.getProjectEvents('project-1');
    await api.getProjectDecisions('project-1');

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/events?limit=100&offset=0',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/decisions?limit=12&offset=0',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
