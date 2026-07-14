import { describe, it, expect, beforeEach } from 'vitest';
import { generateDynamicBlueprint } from './blueprintFactory';
import { useProjectMemoryStore } from '../store/projectMemoryStore';
import { BLUEPRINT_SECTIONS } from '../config/blueprintSections';

// Every section except agentContributions (composed by the engine, not the factory)
const FACTORY_SECTIONS = BLUEPRINT_SECTIONS.map(s => s.id).filter(id => id !== 'agentContributions');

const PROJECTS = {
  food: { name: 'QuickBite', idea: 'A food delivery app connecting restaurants and drivers', budget: '$20k', targetAudience: 'Students' },
  chess: { name: 'MateMaster', idea: 'A chess coaching marketplace with lessons from grandmasters', budget: '$10k', targetAudience: 'Chess players' },
  hospital: { name: 'MediCore', idea: 'A hospital management system for patient records at clinics', budget: '$100k', targetAudience: 'Hospitals' },
  general: { name: 'Flowly', idea: 'A workflow automation tool for modern teams', budget: '$15k', targetAudience: 'Small businesses' }
};

beforeEach(() => {
  useProjectMemoryStore.getState().clearMemory();
});

describe('generateDynamicBlueprint', () => {
  it.each(Object.entries(PROJECTS))('produces every factory section for the %s domain', (_domain, project) => {
    const bp = generateDynamicBlueprint(project);
    FACTORY_SECTIONS.forEach(section => {
      expect(bp[section], `missing ${section}`).toBeTruthy();
      expect(bp[section].trim().length).toBeGreaterThan(30);
    });
  });

  it('produces substantially different output per domain (doc §15)', () => {
    const food = generateDynamicBlueprint(PROJECTS.food);
    const hospital = generateDynamicBlueprint(PROJECTS.hospital);
    const chess = generateDynamicBlueprint(PROJECTS.chess);

    expect(food.erDiagram).toContain('RESTAURANT');
    expect(hospital.erDiagram).toContain('PATIENT');
    expect(chess.erDiagram).toContain('COACH');

    expect(food.businessModel).not.toBe(hospital.businessModel);
    expect(food.keyFeatures).not.toBe(chess.keyFeatures);
    expect(hospital.risksMitigation).toMatch(/HIPAA/i);
  });

  it('renders diagrams as mermaid code fences', () => {
    const bp = generateDynamicBlueprint(PROJECTS.food);
    ['architecture', 'umlDiagram', 'erDiagram'].forEach(d => {
      expect(bp[d]).toContain('```mermaid');
    });
  });

  it('applies remembered technical decisions to the technology stack', () => {
    useProjectMemoryStore.getState().updateMemory('technical', 'backend', 'FastAPI');
    const bp = generateDynamicBlueprint(PROJECTS.food);
    expect(bp.technologyStack).toContain('FastAPI');
    expect(bp.technologyStack).not.toContain('Node.js');
  });

  it('interpolates the declared budget and timeline', () => {
    const bp = generateDynamicBlueprint({ ...PROJECTS.general, timeline: '9 months' });
    expect(bp.budgetCostEstimate).toContain('$15k');
    expect(bp.timeline).toContain('9 months');
  });
});
