import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getBackup } from './backup-store';

export class CompareSnapshotsTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'compare_snapshots',
    description: 'Compares two server snapshots/backups and shows what changed: added/removed channels, roles, and emojis.',
    parameters: {
      type: 'object',
      properties: {
        snapshot_a: { type: 'string', description: 'First snapshot ID or label (older)' },
        snapshot_b: { type: 'string', description: 'Second snapshot ID or label (newer, default: current server state)' },
      },
      required: ['snapshot_a'],
    },
    dangerous: false,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const snapA = await getBackup(String(params['snapshot_a'] ?? ''));
    if (!snapA) return { success: false, message: `Snapshot "${params['snapshot_a']}" not found` };

    const diff = (namesA: string[], namesB: string[], label: string): string[] => {
      const setA = new Set(namesA);
      const setB = new Set(namesB);
      const added = namesB.filter(n => !setA.has(n));
      const removed = namesA.filter(n => !setB.has(n));
      const lines = [];
      if (added.length) lines.push(`  ✅ Added: ${added.map(n => `\`${n}\``).join(', ')}`);
      if (removed.length) lines.push(`  ❌ Removed: ${removed.map(n => `\`${n}\``).join(', ')}`);
      if (!added.length && !removed.length) lines.push(`  ─ No changes`);
      return [`**${label}:**`, ...lines];
    };

    let lines: string[];

    if (params['snapshot_b']) {
      const snapB = await getBackup(String(params['snapshot_b']));
      if (!snapB) return { success: false, message: `Snapshot "${params['snapshot_b']}" not found` };
      lines = [
        `🔍 **Snapshot Comparison**`,
        `A: \`${snapA.label}\` (${new Date(snapA.createdAt).toLocaleDateString()})`,
        `B: \`${snapB.label}\` (${new Date(snapB.createdAt).toLocaleDateString()})`,
        '',
        ...diff(snapA.data.channels.map(c => c.name), snapB.data.channels.map(c => c.name), '📺 Channels'),
        '',
        ...diff(snapA.data.roles.map(r => r.name), snapB.data.roles.map(r => r.name), '🎭 Roles'),
        '',
        ...diff(snapA.data.emojis.map(e => e.name ?? ''), snapB.data.emojis.map(e => e.name ?? ''), '😀 Emojis'),
      ];
    } else {
      // Compare against current guild state
      const currentChannels = [...guild.channels.cache.values()].map(c => c.name);
      const currentRoles = [...guild.roles.cache.values()].filter(r => r.id !== guild.id).map(r => r.name);
      const currentEmojis = [...guild.emojis.cache.values()].map(e => e.name ?? '');
      lines = [
        `🔍 **Snapshot vs Current State**`,
        `A: \`${snapA.label}\` (${new Date(snapA.createdAt).toLocaleDateString()})`,
        `B: Current server state`,
        '',
        ...diff(snapA.data.channels.map(c => c.name), currentChannels, '📺 Channels'),
        '',
        ...diff(snapA.data.roles.map(r => r.name), currentRoles, '🎭 Roles'),
        '',
        ...diff(snapA.data.emojis.map(e => e.name ?? ''), currentEmojis, '😀 Emojis'),
      ];
    }

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
