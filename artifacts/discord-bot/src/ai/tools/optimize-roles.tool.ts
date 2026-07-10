import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

export class OptimizeRolesTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'optimize_roles',
    description: 'Analyzes role structure and suggests optimizations: unused roles to delete, identical permissions to merge, hierarchy gaps, and naming consistency.',
    parameters: { type: 'object', properties: {}, required: [] },
    dangerous: false,
  };

  async execute(_params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const suggestions: string[] = [];
    const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.id !== guild.id);

    // Unused roles
    const unused = roles.filter(r => guild.members.cache.filter(m => m.roles.cache.has(r.id)).size === 0);
    if (unused.length > 0) suggestions.push(`🗑️ **${unused.length}** role(s) have 0 members — use \`cleanup_unused_roles\` to remove: ${unused.slice(0, 3).map(r => r.name).join(', ')}${unused.length > 3 ? '...' : ''}`);

    // Duplicate permissions
    const permGroups: Record<string, string[]> = {};
    for (const r of roles) {
      const key = r.permissions.bitfield.toString();
      permGroups[key] = [...(permGroups[key] ?? []), r.name];
    }
    for (const [, group] of Object.entries(permGroups).filter(([, g]) => g.length > 1)) {
      suggestions.push(`🔄 **${group.join(' + ')}** have identical permissions — consider merging into one role`);
    }

    // Too many hoisted roles
    const hoisted = roles.filter(r => r.hoist);
    if (hoisted.length > 10) suggestions.push(`📌 **${hoisted.length}** hoisted (displayed) roles — many hoisted roles clutter the member list`);

    // Mentionable admin roles
    const mentionableAdmin = roles.filter(r => r.permissions.has('Administrator') && r.mentionable);
    if (mentionableAdmin.length > 0) suggestions.push(`⚠️ Admin roles that are @mentionable: ${mentionableAdmin.map(r => r.name).join(', ')} — security risk`);

    // Naming consistency (mix of title case / lowercase)
    const titleCase = roles.filter(r => r.name[0] === r.name[0].toUpperCase()).length;
    const lowerCase = roles.filter(r => r.name[0] === r.name[0].toLowerCase() && r.name[0] !== '@').length;
    if (titleCase > 0 && lowerCase > 0) suggestions.push(`🔤 Inconsistent role naming: ${titleCase} Title Case + ${lowerCase} lowercase — standardize for clarity`);

    const lines = [
      `🎭 **Role Optimization Report** — **${guild.name}**`,
      `Total roles: ${guild.roles.cache.size} | Managed: ${guild.roles.cache.filter(r => r.managed).size}`,
      '',
      suggestions.length > 0 ? `**${suggestions.length} Suggestion(s):**\n${suggestions.slice(0, 10).join('\n')}` : '✅ Role structure looks well-optimized!',
    ];

    return { success: true, message: lines.join('\n').slice(0, 4000) };
  }
}
