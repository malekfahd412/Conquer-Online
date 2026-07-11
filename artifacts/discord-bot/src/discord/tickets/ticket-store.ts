import { promises as fs } from 'fs';
import path from 'path';

export interface TicketPanelButton {
  label: string;
  emoji?: string;
  style: 'Primary' | 'Secondary' | 'Success' | 'Danger';
  ticketType: string;
}

export interface TicketPanelConfig {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  title: string;
  description: string;
  color: number;
  footer?: string;
  thumbnail?: string;
  banner?: string;
  buttons: TicketPanelButton[];
  categoryId?: string;
  supportRoleIds: string[];
  allowedRoleIds: string[];
  blockedRoleIds: string[];
  maxTicketsPerUser: number;
  namingFormat: string;
  transcriptChannelId?: string;
  logChannelId?: string;
  archiveCategoryId?: string;
  autoClose: boolean;
  autoDelete: boolean;
  inactiveTimeoutMinutes: number;
  createdAt: number;
}

export interface TicketRecord {
  id: string;
  guildId: string;
  panelId: string;
  ticketType: string;
  channelId: string;
  openerId: string;
  claimedBy?: string;
  status: 'open' | 'closed' | 'locked';
  number: number;
  createdAt: number;
  closedAt?: number;
  closedBy?: string;
  firstStaffReplyAt?: number;
  participantIds: string[];
}

interface TicketData {
  panels: TicketPanelConfig[];
  tickets: TicketRecord[];
  counters: Record<string, number>;
}

const DATA_PATH = path.join(process.cwd(), 'data', 'tickets.json');

async function load(): Promise<TicketData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as TicketData;
  } catch {
    return { panels: [], tickets: [], counters: {} };
  }
}

async function save(data: TicketData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Panels ───────────────────────────────────────────────────────────────────

export async function createPanel(cfg: Omit<TicketPanelConfig, 'id' | 'createdAt'>): Promise<TicketPanelConfig> {
  const data = await load();
  const panel: TicketPanelConfig = { ...cfg, id: genId('panel'), createdAt: Date.now() };
  data.panels.push(panel);
  await save(data);
  return panel;
}

export async function updatePanelMessage(panelId: string, messageId: string): Promise<void> {
  const data = await load();
  const panel = data.panels.find(p => p.id === panelId);
  if (panel) {
    panel.messageId = messageId;
    await save(data);
  }
}

export async function getPanels(guildId: string): Promise<TicketPanelConfig[]> {
  const data = await load();
  return data.panels.filter(p => p.guildId === guildId);
}

export async function getPanel(panelId: string): Promise<TicketPanelConfig | undefined> {
  const data = await load();
  return data.panels.find(p => p.id === panelId);
}

export async function deletePanel(panelId: string): Promise<boolean> {
  const data = await load();
  const before = data.panels.length;
  data.panels = data.panels.filter(p => p.id !== panelId);
  await save(data);
  return data.panels.length < before;
}

export async function updatePanelConfig(panelId: string, patch: Partial<TicketPanelConfig>): Promise<TicketPanelConfig | undefined> {
  const data = await load();
  const panel = data.panels.find(p => p.id === panelId);
  if (!panel) return undefined;
  Object.assign(panel, patch);
  await save(data);
  return panel;
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export async function nextTicketNumber(guildId: string): Promise<number> {
  const data = await load();
  data.counters[guildId] = (data.counters[guildId] ?? 0) + 1;
  await save(data);
  return data.counters[guildId];
}

export async function createTicket(rec: Omit<TicketRecord, 'id' | 'createdAt' | 'status' | 'participantIds'>): Promise<TicketRecord> {
  const data = await load();
  const ticket: TicketRecord = {
    ...rec,
    id: genId('ticket'),
    status: 'open',
    createdAt: Date.now(),
    participantIds: [rec.openerId],
  };
  data.tickets.push(ticket);
  await save(data);
  return ticket;
}

export async function getTicketByChannel(channelId: string): Promise<TicketRecord | undefined> {
  const data = await load();
  return data.tickets.find(t => t.channelId === channelId);
}

export async function getTicket(ticketId: string): Promise<TicketRecord | undefined> {
  const data = await load();
  return data.tickets.find(t => t.id === ticketId);
}

export async function getOpenTicketsForUser(guildId: string, userId: string): Promise<TicketRecord[]> {
  const data = await load();
  return data.tickets.filter(t => t.guildId === guildId && t.openerId === userId && t.status === 'open');
}

export async function getTickets(guildId: string): Promise<TicketRecord[]> {
  const data = await load();
  return data.tickets.filter(t => t.guildId === guildId);
}

export async function updateTicket(ticketId: string, patch: Partial<TicketRecord>): Promise<TicketRecord | undefined> {
  const data = await load();
  const ticket = data.tickets.find(t => t.id === ticketId);
  if (!ticket) return undefined;
  Object.assign(ticket, patch);
  await save(data);
  return ticket;
}
