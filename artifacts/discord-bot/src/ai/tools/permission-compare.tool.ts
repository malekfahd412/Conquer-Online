import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class PermissionCompareTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_compare',
    description: 'Compares permissions between two roles or two members, highlighting what one has that the other does not.',
    parameters: {
      type: 'object',
      properties: {
        entity_a: { type: 'string', description: 'First role name or member username/ID' },
        entity_b: { type: 'string', description: 'Second role name or member username/ID' },
        type: { type: 'string', description: '"role" or "member" (default: role)', enum: ['role', 'member'] },
      },
      required: ['entity_a', 'entity_b'],
    },
    dangerous: false,
    examples: ['Compare permissions between Moderator and Admin roles', 'Compare permissions of JohnDoe vs JaneDoe'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const aQuery = String(params['entity_a'] ?? '').toLowerCase().trim();
    const bQuery = String(params['entity_b'] ?? '').toLowerCase().trim();
    const type = String(params['type'] ?? 'role').toLowerCase();

    let permsA: Readonly<PermissionsBitField>;
    let permsB: Readonly<PermissionsBitField>;
    let labelA: string;
    let labelB: string;

    if (type === 'member') {
      const members = await guild.members.fetch();
      const memberA = members.find(m => m.id === aQuery || m.user.username.toLowerCase() === aQuery || m.displayName.toLowerCase() === aQuery);
      const memberB = members.find(m => m.id === bQuery || m.user.username.toLowerCase() === bQuery || m.displayName.toLowerCase() === bQuery);
      if (!memberA) return { success: false, message: `Member "${params['entity_a']}" not found` };
      if (!memberB) return { success: false, message: `Member "${params['entity_b']}" not found` };
      permsA = memberA.permissions;
      permsB = memberB.permissions;
      labelA = memberA.displayName;
      labelB = memberB.displayName;
    } else {
      const roleA = guild.roles.cache.find(r => r.name.toLowerCase() === aQuery);
      const roleB = guild.roles.cache.find(r => r.name.toLowerCase() === bQuery);
      if (!roleA) return { success: false, message: `Role "${params['entity_a']}" not found` };
      if (!roleB) return { success: false, message: `Role "${params['entity_b']}" not found` };
      permsA = roleA.permissions;
      permsB = roleB.permissions;
      labelA = roleA.name;
      labelB = roleB.name;
    }

    const allFlags = Object.entries(PermissionsBitField.Flags) as [string, bigint][];
    const onlyA: string[] = [];
    const onlyB: string[] = [];
    const both: string[] = [];

    for (const [name, flag] of allFlags) {
      const hasA = permsA.has(flag);
      const hasB = permsB.has(flag);
      if (hasA && hasB) both.push(name);
      else if (hasA) onlyA.push(`🔵 ${name}`);
      else if (hasB) onlyB.push(`🟠 ${name}`);
    }

    const lines = [
      `**⚖️ Permission Comparison: ${labelA} vs ${labelB}**`,
      ``,
      `**🔵 Only ${labelA} has (${onlyA.length}):** ${onlyA.join(', ') || 'nothing unique'}`,
      ``,
      `**🟠 Only ${labelB} has (${onlyB.length}):** ${onlyB.join(', ') || 'nothing unique'}`,
      ``,
      `**Both share:** ${both.length} permissions`,
    ];

    return { success: true, message: lines.join('\n') };
  }
}
