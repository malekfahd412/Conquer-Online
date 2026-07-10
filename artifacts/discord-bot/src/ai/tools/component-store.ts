import { promises as fs } from 'fs';
import path from 'path';

export type ComponentType = 'button' | 'string_select' | 'role_select' | 'user_select' | 'channel_select' | 'mentionable_select' | 'modal';

export interface ButtonConfig {
  kind: 'button';
  label: string;
  style: 'Primary' | 'Secondary' | 'Success' | 'Danger' | 'Link';
  emoji?: string;
  url?: string;       // Link buttons only
  customId?: string;
  disabled?: boolean;
}

export interface SelectOptionConfig {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}

export interface SelectConfig {
  kind: 'string_select' | 'role_select' | 'user_select' | 'channel_select' | 'mentionable_select';
  placeholder?: string;
  customId?: string;
  minValues?: number;
  maxValues?: number;
  options?: SelectOptionConfig[];  // string_select only
  disabled?: boolean;
}

export interface ModalFieldConfig {
  label: string;
  customId: string;
  style: 'short' | 'paragraph';
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}

export interface ModalConfig {
  kind: 'modal';
  title: string;
  customId: string;
  fields: ModalFieldConfig[];
}

export type ComponentConfig = ButtonConfig | SelectConfig | ModalConfig;

export interface ComponentTemplate {
  id: string;
  name: string;
  description?: string;
  type: ComponentType;
  /** For messages: array of action rows; each row is an array of component configs */
  rows?: ComponentConfig[][];
  /** For a single component */
  component?: ComponentConfig;
  content?: string;  // optional message text to send with the component
  createdAt: number;
  updatedAt: number;
}

interface ComponentStore {
  templates: ComponentTemplate[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'component-templates.json');

async function load(): Promise<ComponentStore> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as ComponentStore;
  } catch {
    return { templates: [] };
  }
}

async function save(store: ComponentStore): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function makeId(): string {
  return `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveComponentTemplate(template: Omit<ComponentTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComponentTemplate> {
  const store = await load();
  const existing = store.templates.find(t => t.name.toLowerCase() === template.name.toLowerCase());
  if (existing) {
    Object.assign(existing, template, { updatedAt: Date.now() });
    await save(store);
    return existing;
  }
  const entry: ComponentTemplate = { ...template, id: makeId(), createdAt: Date.now(), updatedAt: Date.now() };
  store.templates.push(entry);
  await save(store);
  return entry;
}

export async function getComponentTemplate(name: string): Promise<ComponentTemplate | undefined> {
  const store = await load();
  return store.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
}

export async function deleteComponentTemplate(name: string): Promise<boolean> {
  const store = await load();
  const before = store.templates.length;
  store.templates = store.templates.filter(t => t.name.toLowerCase() !== name.toLowerCase());
  if (store.templates.length < before) { await save(store); return true; }
  return false;
}

export async function listComponentTemplates(type?: ComponentType): Promise<ComponentTemplate[]> {
  const store = await load();
  const list = type ? store.templates.filter(t => t.type === type) : store.templates;
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}
