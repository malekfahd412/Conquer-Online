import { promises as fs } from 'fs';
import path from 'path';
import { PermissionsBitField } from 'discord.js';
import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';

interface ExportedRole {
  id: string;
  name: string;
  permissions: string[];
}

interface PermExport {
  guild: { id: string };
  roles: ExportedRole[];
}

export class PermissionImportTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'permission_import',
    description: 'Imports role permissions from a previously exported permission file (permission_export). Matches roles by name.',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Export filename from data/ directory (e.g. perm-export-guild-1234.json)' },
      },
      required: ['filename'],
    },
    dangerous: true,
    dangerDescription: 'Overwrites current role permissions with values from an exported file.',
    examples: ['Import permissions from perm-export-guild-123456-1700000000.json'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const filename = String(params['filename'] ?? '').trim().replace(/[^a-z0-9._-]/gi, '');
    if (!filename) return { success: false, message: 'Filename is required' };

    const filepath = path.join(process.cwd(), 'data', filename);
    let exportData: PermExport;
    try {
      const raw = await fs.readFile(filepath, 'utf-8');
      exportData = JSON.parse(raw) as PermExport;
    } catch {
      return { success: false, message: `File "${filename}" not found in data/ directory` };
    }

    if (!exportData.roles || !Array.isArray(exportData.roles)) {
      return { success: false, message: 'Invalid export file format — missing roles array' };
    }

    let imported = 0; let skipped = 0;

    for (const exportedRole of exportData.roles) {
      const role = guild.roles.cache.find(r => r.name === exportedRole.name);
      if (!role || role.managed) { skipped++; continue; }

      try {
        const flags = exportedRole.permissions
          .filter(p => p in PermissionsBitField.Flags)
          .map(p => PermissionsBitField.Flags[p as keyof typeof PermissionsBitField.Flags]);
        await role.setPermissions(new PermissionsBitField(flags), `Permission import from ${filename}`);
        imported++;
      } catch { skipped++; }
    }

    return {
      success: true,
      message: `✅ **Permission import complete from \`${filename}\`:**\n• Roles updated: ${imported}\n• Skipped (not found/managed): ${skipped}`,
    };
  }
}
