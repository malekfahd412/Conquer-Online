import { promises as fs } from 'fs';
import path from 'path';

export interface ApplicationQuestion {
  id: string;
  label: string;
  required: boolean;
  paragraph: boolean;
}

export interface ApplicationPanelConfig {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  title: string;
  description: string;
  buttonLabel: string;
  roleName: string;
  questions: ApplicationQuestion[];
  reviewChannelId?: string;
  grantRoleId?: string;
  cooldownHours: number;
  createdAt: number;
}

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface ApplicationSubmission {
  id: string;
  guildId: string;
  panelId: string;
  applicantId: string;
  answers: Record<string, string>;
  status: ApplicationStatus;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
}

interface ApplicationData {
  panels: ApplicationPanelConfig[];
  submissions: ApplicationSubmission[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'applications.json');

async function load(): Promise<ApplicationData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as ApplicationData;
  } catch {
    return { panels: [], submissions: [] };
  }
}

async function save(data: ApplicationData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function createApplicationPanel(cfg: Omit<ApplicationPanelConfig, 'id' | 'createdAt'>): Promise<ApplicationPanelConfig> {
  const data = await load();
  const panel: ApplicationPanelConfig = { ...cfg, id: genId('apanel'), createdAt: Date.now() };
  data.panels.push(panel);
  await save(data);
  return panel;
}

export async function updateApplicationPanelMessage(panelId: string, messageId: string): Promise<void> {
  const data = await load();
  const panel = data.panels.find(p => p.id === panelId);
  if (panel) { panel.messageId = messageId; await save(data); }
}

export async function getApplicationPanels(guildId: string): Promise<ApplicationPanelConfig[]> {
  const data = await load();
  return data.panels.filter(p => p.guildId === guildId);
}

export async function getApplicationPanel(panelId: string): Promise<ApplicationPanelConfig | undefined> {
  const data = await load();
  return data.panels.find(p => p.id === panelId);
}

export async function deleteApplicationPanel(panelId: string): Promise<boolean> {
  const data = await load();
  const before = data.panels.length;
  data.panels = data.panels.filter(p => p.id !== panelId);
  await save(data);
  return data.panels.length < before;
}

export async function createSubmission(sub: Omit<ApplicationSubmission, 'id' | 'createdAt' | 'status'>): Promise<ApplicationSubmission> {
  const data = await load();
  const submission: ApplicationSubmission = { ...sub, id: genId('app'), createdAt: Date.now(), status: 'pending' };
  data.submissions.push(submission);
  await save(data);
  return submission;
}

export async function getSubmission(id: string): Promise<ApplicationSubmission | undefined> {
  const data = await load();
  return data.submissions.find(s => s.id === id);
}

export async function getLastSubmission(guildId: string, panelId: string, applicantId: string): Promise<ApplicationSubmission | undefined> {
  const data = await load();
  return data.submissions
    .filter(s => s.guildId === guildId && s.panelId === panelId && s.applicantId === applicantId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

export async function updateSubmission(id: string, patch: Partial<ApplicationSubmission>): Promise<ApplicationSubmission | undefined> {
  const data = await load();
  const submission = data.submissions.find(s => s.id === id);
  if (!submission) return undefined;
  Object.assign(submission, patch);
  await save(data);
  return submission;
}

export async function getSubmissions(guildId: string, status?: ApplicationStatus): Promise<ApplicationSubmission[]> {
  const data = await load();
  return data.submissions.filter(s => s.guildId === guildId && (!status || s.status === status));
}
