import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class CloneAllRolesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'clone_all_roles',
    description: 'Clones all non-managed roles in the server with a suffix, preserving colors and permissions.',
    parameters: {
      type: 'object',
      properties: {
        suffix: { type: 'string', description: 'Suffix to append to cloned role names (default: "-clone")' },
        skip_admin: { type: 'string', description: 'Set to "true" to skip roles with Administrator permission (default: false)' },
        confirm: { type: 'string', description: 'Type "CONFIRM" to proceed' },
      },
      required: ['confirm'],
    },
    dangerous: true,
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    if (String(params['confirm'] ?? '') !== 'CONFIRM') {
      const roleCount = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).size;
      return { success: false, message: `This will clone ${roleCount} roles. Set \`confirm: "CONFIRM"\` to proceed.` };
    }
    const suffix = String(params['suffix'] ?? '-clone');
    const skipAdmin = String(params['skip_admin'] ?? '').toLowerCase() === 'true';
    const created: string[] = [];
    const skipped: string[] = [];

    const roles = guild.roles.cache
      .filter(r => !r.managed && r.id !== guild.id)
      .sort((a, b) => a.position - b.position);

    for (const [, role] of roles) {
      if (skipAdmin && role.permissions.has('Administrator')) { skipped.push(role.name); continue; }
      try {
        await guild.roles.create({
          name: `${role.name}${suffix}`.slice(0, 100),
          color: role.color, hoist: role.hoist, mentionable: role.mentionable,
          permissions: role.permissions, reason: 'Clone all roles',
        });
        created.push(role.name);
      } catch { skipped.push(role.name); }
    }

    return {
      success: true,
      message: `✅ Cloned **${created.length}** role(s)${skipped.length ? `, ${skipped.length} skipped` : ''}.\nCreated: ${created.slice(0, 10).map(n => `\`${n}${suffix}\``).join(', ')}`,
    };
  }
}
