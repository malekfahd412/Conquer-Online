import { promises as fs } from 'fs';
import path from 'path';

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedAuthor {
  name: string;
  url?: string;
  iconURL?: string;
}

export interface EmbedFooter {
  text: string;
  iconURL?: string;
}

export interface EmbedTemplate {
  id: string;
  name: string;
  description?: string;
  theme?: string;
  data: {
    title?: string;
    description?: string;
    color?: number;
    url?: string;
    author?: EmbedAuthor;
    footer?: EmbedFooter;
    image?: string;
    thumbnail?: string;
    timestamp?: boolean;
    fields?: EmbedField[];
  };
  createdAt: number;
  updatedAt: number;
}

interface EmbedStore {
  templates: EmbedTemplate[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'embed-templates.json');

async function load(): Promise<EmbedStore> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as EmbedStore;
  } catch {
    return { templates: [] };
  }
}

async function save(store: EmbedStore): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function makeId(): string {
  return `et_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveTemplate(name: string, data: EmbedTemplate['data'], description?: string, theme?: string): Promise<EmbedTemplate> {
  const store = await load();
  const existing = store.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.data = data;
    existing.description = description ?? existing.description;
    existing.theme = theme ?? existing.theme;
    existing.updatedAt = Date.now();
    await save(store);
    return existing;
  }
  const template: EmbedTemplate = { id: makeId(), name, description, theme, data, createdAt: Date.now(), updatedAt: Date.now() };
  store.templates.push(template);
  await save(store);
  return template;
}

export async function getTemplate(name: string): Promise<EmbedTemplate | undefined> {
  const store = await load();
  return store.templates.find(t => t.name.toLowerCase() === name.toLowerCase());
}

export async function getTemplateById(id: string): Promise<EmbedTemplate | undefined> {
  const store = await load();
  return store.templates.find(t => t.id === id);
}

export async function deleteTemplate(name: string): Promise<boolean> {
  const store = await load();
  const before = store.templates.length;
  store.templates = store.templates.filter(t => t.name.toLowerCase() !== name.toLowerCase());
  if (store.templates.length < before) { await save(store); return true; }
  return false;
}

export async function renameTemplate(oldName: string, newName: string): Promise<boolean> {
  const store = await load();
  const t = store.templates.find(t => t.name.toLowerCase() === oldName.toLowerCase());
  if (!t) return false;
  t.name = newName;
  t.updatedAt = Date.now();
  await save(store);
  return true;
}

export async function duplicateTemplate(sourceName: string, newName: string): Promise<EmbedTemplate | undefined> {
  const store = await load();
  const src = store.templates.find(t => t.name.toLowerCase() === sourceName.toLowerCase());
  if (!src) return undefined;
  const copy: EmbedTemplate = { ...src, id: makeId(), name: newName, createdAt: Date.now(), updatedAt: Date.now(), data: JSON.parse(JSON.stringify(src.data)) };
  store.templates.push(copy);
  await save(store);
  return copy;
}

export async function listTemplates(): Promise<EmbedTemplate[]> {
  const store = await load();
  return store.templates.sort((a, b) => b.updatedAt - a.updatedAt);
}
