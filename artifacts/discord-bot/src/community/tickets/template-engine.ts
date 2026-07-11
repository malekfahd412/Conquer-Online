// ─────────────────────────────────────────────────────────────────────────────
// TemplateEngine — reusable panel templates. Owns data/tickets/templates.json
// exclusively. Ships with built-in presets so PanelManager.createFromTemplate
// is immediately useful without any hand-authored setup.
// ─────────────────────────────────────────────────────────────────────────────
import { JsonStore, genId } from './store';
import type { TicketTemplate } from './types';
import { defaultPanelFields } from './panel-defaults';

interface TemplateData {
  templates: TicketTemplate[];
}

const store = new JsonStore<TemplateData>('templates.json', () => ({ templates: builtInTemplates() }));

type TemplatePanelShape = TicketTemplate['panel'];

function basePanelDefaults(overrides: Partial<TemplatePanelShape> & Pick<TemplatePanelShape, 'name' | 'description' | 'embed' | 'button'>): TemplatePanelShape {
  return {
    ...defaultPanelFields(),
    transcript: { enabled: true, channelId: undefined, formats: ['html'], dmUser: false },
    ...overrides,
  };
}

function builtInTemplates(): TicketTemplate[] {
  const now = Date.now();
  const presets: { name: string; description: string; color: number; ticketType: string; scheme: string; questions?: TemplatePanelShape['modal']['questions'] }[] = [
    { name: 'Support', description: 'General player support requests.', color: 0x5865f2, ticketType: 'Support', scheme: 'support-{counter}' },
    { name: 'Purchase', description: 'Handle in-game purchase requests.', color: 0x57f287, ticketType: 'Purchase', scheme: 'purchase-{counter}' },
    { name: 'Report Player', description: 'Reports against other players.', color: 0xed4245, ticketType: 'Report Player', scheme: 'report-{username}' },
    { name: 'Appeal', description: 'Ban / mute appeals.', color: 0xfee75c, ticketType: 'Appeal', scheme: 'appeal-{counter}' },
    { name: 'Bug Report', description: 'In-game or bot bug reports.', color: 0xeb459e, ticketType: 'Bug Report', scheme: 'bug-{counter}' },
    { name: 'Staff Contact', description: 'Direct line to the staff team.', color: 0x5865f2, ticketType: 'Staff Contact', scheme: 'staff-{counter}' },
    { name: 'Developer', description: 'Technical / developer-only requests.', color: 0x2c2f33, ticketType: 'Developer', scheme: 'dev-{counter}' },
  ];

  return presets.map(p => ({
    id: genId('tpl'),
    name: p.name,
    description: p.description,
    builtIn: true,
    createdAt: now,
    updatedAt: now,
    panel: basePanelDefaults({
      name: p.name,
      description: p.description,
      embed: { title: `🎫 ${p.name}`, description: `Click below to open a ${p.name.toLowerCase()} ticket.`, color: p.color },
      button: { label: `Open ${p.name}`, style: 'Primary', ticketType: p.ticketType },
      namingScheme: p.scheme,
    }),
  }));
}

export class TemplateEngine {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  async list(): Promise<TicketTemplate[]> {
    const data = await store.read();
    return data.templates;
  }

  async get(id: string): Promise<TicketTemplate | undefined> {
    const data = await store.read();
    return data.templates.find(t => t.id === id);
  }

  async findByName(name: string): Promise<TicketTemplate | undefined> {
    const data = await store.read();
    const q = name.toLowerCase().trim();
    return data.templates.find(t => t.name.toLowerCase() === q);
  }

  async create(name: string, description: string, panel: TemplatePanelShape): Promise<TicketTemplate> {
    return store.mutate(data => {
      const template: TicketTemplate = { id: genId('tpl'), name, description, builtIn: false, panel, createdAt: Date.now(), updatedAt: Date.now() };
      data.templates.push(template);
      return template;
    });
  }

  async delete(id: string): Promise<boolean> {
    return store.mutate(data => {
      const before = data.templates.length;
      data.templates = data.templates.filter(t => t.id !== id || t.builtIn);
      return data.templates.length < before;
    });
  }

  /** Produces the partial panel config a caller can feed straight into PanelManager.create. */
  toPanelInput(template: TicketTemplate): TemplatePanelShape {
    return JSON.parse(JSON.stringify(template.panel)) as TemplatePanelShape;
  }
}

export const templateEngine = new TemplateEngine();
export type { TemplatePanelShape };
