/**
 * LocalStorageProvider implements the StorageProvider interface using localStorage.
 * It stores all data for a user under a single key: startup_simulator_<email>.
 */
export class LocalStorageProvider {
  _getUserEmail() {
    const saved = localStorage.getItem('dev_session');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user && user.email) return user.email;
      } catch (e) {}
    }
    throw Object.assign(new Error('Not signed in.'), { status: 401 });
  }

  _getKey() {
    return `startup_simulator_${this._getUserEmail()}`;
  }

  _load() {
    const key = this._getKey();
    const data = localStorage.getItem(key);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('Failed to parse local storage', e);
      }
    }
    return {
      profile: { email: this._getUserEmail() },
      projects: [],
      sections: [],
      versions: [],
      events: [],
      memory: [],
      decisions: []
    };
  }

  _save(data) {
    const key = this._getKey();
    localStorage.setItem(key, JSON.stringify(data));
  }

  // --- Utility methods ---
  
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // --- StorageProvider Interface ---

  async listProjects() {
    const db = this._load();
    // Return sorted by last_opened_at or updated_at
    return db.projects.sort((a, b) => {
      const timeA = new Date(a.last_opened_at || a.updated_at || 0).getTime();
      const timeB = new Date(b.last_opened_at || b.updated_at || 0).getTime();
      return timeB - timeA;
    });
  }

  async createProject(form) {
    const db = this._load();
    const id = this._generateId();
    const now = new Date().toISOString();
    
    const project = {
      id,
      name: form.name?.trim() || 'Untitled Project',
      idea: form.idea,
      target_audience: form.targetAudience,
      budget: form.budget,
      timeline: form.timeline,
      platform: form.platform,
      team_size: form.teamSize,
      priorities: form.priorities,
      aiProvider: form.aiProvider, // Keep aiProvider stored
      created_at: now,
      updated_at: now,
      last_opened_at: now
    };
    
    db.projects.push(project);

    // Create seed blueprint sections
    const BLUEPRINT_SECTION_KEYS = [
      'executive_summary', 'market_analysis', 'product_strategy', 
      'technical_architecture', 'financial_plan', 'risk_analysis'
    ];
    for (const key of BLUEPRINT_SECTION_KEYS) {
      db.sections.push({ project_id: id, section_key: key });
    }

    this._save(db);
    return project;
  }

  async getProject(id) {
    const db = this._load();
    const project = db.projects.find(p => p.id === id);
    if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });

    // Update last opened
    project.last_opened_at = new Date().toISOString();
    this._save(db);

    return {
      project,
      sections: db.sections.filter(s => s.project_id === id),
      versions: db.versions.filter(v => v.project_id === id).sort((a, b) => a.version_number - b.version_number),
      events: db.events.filter(e => e.project_id === id).sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()),
      memory: db.memory.filter(m => m.project_id === id),
      decisions: db.decisions.filter(d => d.project_id === id).sort((a, b) => new Date(a.decided_at).getTime() - new Date(b.decided_at).getTime())
    };
  }

  async updateProjectMeta(id, patch) {
    const db = this._load();
    const idx = db.projects.findIndex(p => p.id === id);
    if (idx === -1) throw Object.assign(new Error('Project not found'), { status: 404 });

    const updated = {
      ...db.projects[idx],
      name: patch.name !== undefined ? patch.name : db.projects[idx].name,
      current_version_label: patch.currentVersionLabel !== undefined ? patch.currentVersionLabel : db.projects[idx].current_version_label,
      memory_domain: patch.memoryDomain !== undefined ? patch.memoryDomain : db.projects[idx].memory_domain,
      updated_at: new Date().toISOString()
    };
    
    db.projects[idx] = updated;
    this._save(db);
    return updated;
  }

  async upsertSections(id, sections) {
    const db = this._load();
    let updatedCount = 0;
    
    for (const section of sections) {
      const idx = db.sections.findIndex(s => s.project_id === id && s.section_key === section.key);
      const row = {
        project_id: id,
        section_key: section.key,
        content: section.content || '',
        status: section.status === 'approved' ? 'approved' : 'pending',
        last_modified_version: section.lastModifiedVersion || 'v1',
        generation_source: section.generationSource || null,
        generated_by: section.generatedBy || null,
        validation_scores: section.validationScores || null,
        generated_at: section.generatedAt || null,
        failure_reason: section.failureReason || null
      };

      if (idx >= 0) {
        db.sections[idx] = { ...db.sections[idx], ...row };
      } else {
        db.sections.push(row);
      }
      updatedCount++;
    }
    
    this._save(db);
    return { updated: updatedCount };
  }

  async appendEvents(id, events) {
    const db = this._load();
    let appendedCount = 0;
    
    for (const e of events) {
      const client_id = String(e.id);
      const exists = db.events.some(ev => ev.project_id === id && ev.client_id === client_id);
      if (!exists) {
        db.events.push({
          project_id: id,
          client_id,
          event_type: e.type || null,
          agent_id: e.agentId || e.agent || null,
          occurred_at: e.timestamp || new Date().toISOString(),
          payload: e
        });
        appendedCount++;
      }
    }
    
    this._save(db);
    return { appended: appendedCount };
  }

  async createVersion(id, version) {
    const db = this._load();
    const versionNumber = Number(String(version.id || '').replace(/^v/, ''));
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw Object.assign(new Error('version id (vN) is required.'), { status: 400 });
    }

    const idx = db.versions.findIndex(v => v.project_id === id && v.version_number === versionNumber);
    const row = {
      project_id: id,
      version_number: versionNumber,
      summary: version.summary || '',
      change_type: version.changeType || 'revision',
      completion_status: version.completionStatus || 'success',
      affected_agents: version.affectedAgents || [],
      affected_sections: version.affectedSections || [],
      approval_state: version.approvalState || {},
      blueprint_snapshot: version.blueprintSnapshot || {},
      memory_snapshot: version.memorySnapshot || null,
      provenance_snapshot: version.provenanceSnapshot || null,
      restored_from: version.restoredFrom || null,
      created_at: version.timestamp || new Date().toISOString()
    };

    if (idx >= 0) db.versions[idx] = row;
    else db.versions.push(row);

    const projectIdx = db.projects.findIndex(p => p.id === id);
    if (projectIdx >= 0) {
      db.projects[projectIdx].current_version_label = `v${versionNumber}`;
    }

    this._save(db);
    return { versionNumber };
  }

  async upsertMemory(id, body) {
    const db = this._load();
    
    if (body.entries && body.entries.length > 0) {
      for (const e of body.entries) {
        if (!e.category || !e.key) continue;
        const idx = db.memory.findIndex(m => m.project_id === id && m.category === e.category && m.key === e.key);
        const row = { project_id: id, category: e.category, key: e.key, value: e.value || null };
        if (idx >= 0) db.memory[idx] = row;
        else db.memory.push(row);
      }
    }

    if (body.domain !== undefined) {
      const projectIdx = db.projects.findIndex(p => p.id === id);
      if (projectIdx >= 0) db.projects[projectIdx].memory_domain = body.domain;
    }

    this._save(db);
    return { ok: true };
  }

  async appendDecisions(id, decisions) {
    const db = this._load();
    let appendedCount = 0;
    
    for (const d of decisions) {
      if (!d.id) continue;
      const client_id = String(d.id);
      const exists = db.decisions.some(dec => dec.project_id === id && dec.client_id === client_id);
      if (!exists) {
        db.decisions.push({
          project_id: id,
          client_id,
          category: d.category || null,
          key: d.key || null,
          value: d.value || null,
          agent: d.agent || null,
          instruction: d.instruction || null,
          version_label: d.version || null,
          decided_at: d.timestamp || new Date().toISOString(),
          payload: d
        });
        appendedCount++;
      }
    }
    
    this._save(db);
    return { appended: appendedCount };
  }

  async deleteProject(id) {
    const db = this._load();
    db.projects = db.projects.filter(p => p.id !== id);
    db.sections = db.sections.filter(s => s.project_id !== id);
    db.versions = db.versions.filter(v => v.project_id !== id);
    db.events = db.events.filter(e => e.project_id !== id);
    db.memory = db.memory.filter(m => m.project_id !== id);
    db.decisions = db.decisions.filter(d => d.project_id !== id);
    this._save(db);
  }
}
