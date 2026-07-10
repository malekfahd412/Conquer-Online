import { promises as fs } from 'fs';
import path from 'path';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { getWarnings, getNotes } from './moderation-store';

export class ExportMemberDataTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'export_member_data',
    description: 'Exports member data (username, ID, roles, join date, warnings, notes) to a JSON file in the data/ directory.',
    parameters: {
      type: 'object',
      properties: {
        include_bots: { type: 'string', description: 'Include bots in export (true/false, default false)' },
        role: { type: 'string', description: 'Filter by role name (optional — exports only members with this role)' },
      },
      required: [],
    },
    dangerous: false,
    examples: ['Export all member data', 'Export members with the VIP role'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const includeBots = String(params['include_bots'] ?? 'false') === 'true';
    const roleName = String(params['role'] ?? '').toLowerCase().trim();

    const members = await guild.members.fetch();
    let targets = includeBots ? members : members.filter(m => !m.user.bot);
    if (roleName) {
      const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
      if (!role) return { success: false, message: `Role "${params['role']}" not found` };
      targets = targets.filter(m => m.roles.cache.has(role.id));
    }

    const warnings = await getWarnings(guild.id);
    const notes = await getNotes(guild.id);

    const data = targets.map(m => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      nickname: m.nickname ?? null,
      bot: m.user.bot,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      accountCreatedAt: m.user.createdAt.toISOString(),
      roles: m.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name),
      warnings: warnings.filter(w => w.userId === m.id).map(w => ({ id: w.id, reason: w.reason, timestamp: new Date(w.timestamp).toISOString() })),
      notes: notes.filter(n => n.userId === m.id).map(n => ({ id: n.id, content: n.content, timestamp: new Date(n.timestamp).toISOString() })),
    }));

    const filename = `member-export-${guild.id}-${Date.now()}.json`;
    const filepath = path.join(process.cwd(), 'data', filename);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

    return {
      success: true,
      message: `✅ Exported **${data.length}** members to \`data/${filename}\`\n• Includes: username, ID, roles, join date, warnings, notes`,
    };
  }
}
