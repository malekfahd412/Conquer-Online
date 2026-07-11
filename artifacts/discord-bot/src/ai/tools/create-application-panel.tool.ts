import type { Guild } from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from './tool.interface';
import { createApplicationPanel } from '../../discord/applications/application-store';
import { applicationService } from '../../discord/applications/application.service';

export class CreateApplicationPanelTool implements ITool {
  readonly definition: ToolDefinition = {
    name: 'create_application_panel',
    description: 'Creates an application panel (e.g. staff applications) with up to 5 custom questions, posted with an "Apply" button.',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID to post the panel in' },
        title: { type: 'string', description: 'Panel title, e.g. "Staff Applications"' },
        description: { type: 'string', description: 'Panel description' },
        buttonLabel: { type: 'string', description: 'Apply button label (optional, default "Apply Now")' },
        roleName: { type: 'string', description: 'Name of the role being applied for, shown in the panel and review embed' },
        questions: { type: 'string', description: 'Up to 5 questions separated by "||". Append "?long" for a paragraph answer and "?optional" for a non-required question, e.g. "Why do you want to join?||Describe your experience?long"' },
        reviewChannel: { type: 'string', description: 'Channel where submissions are posted for staff review with Accept/Reject buttons' },
        grantRole: { type: 'string', description: 'Role to automatically grant when an application is accepted (optional)' },
        cooldownHours: { type: 'number', description: 'Hours a rejected/accepted applicant must wait before reapplying (optional, default 24)' },
      },
      required: ['channel', 'title', 'description', 'roleName', 'questions', 'reviewChannel'],
    },
    dangerous: false,
    examples: ['Create a staff application panel in #applications reviewed in #staff-review'],
  };

  async execute(params: Record<string, unknown>, guild: Guild): Promise<ToolExecuteResult> {
    const channels = await guild.channels.fetch();
    const findChannel = (q: unknown) => {
      const query = String(q ?? '').toLowerCase();
      return channels.find(c => c && (c.id === query || c.name.toLowerCase() === query));
    };

    const channel = findChannel(params['channel']);
    if (!channel) return { success: false, message: `Channel "${params['channel']}" not found` };

    let reviewChannelId: string | undefined;
    if (params['reviewChannel']) {
      const rc = findChannel(params['reviewChannel']);
      if (!rc) return { success: false, message: `Review channel "${params['reviewChannel']}" not found` };
      reviewChannelId = rc.id;
    }

    let grantRoleId: string | undefined;
    if (params['grantRole']) {
      const roles = await guild.roles.fetch();
      const q = String(params['grantRole']).toLowerCase();
      grantRoleId = roles.find(r => r.id === q || r.name.toLowerCase() === q)?.id;
    }

    const questions = String(params['questions'] ?? '').split('||').map(raw => {
      let label = raw.trim();
      let paragraph = false;
      let required = true;
      if (label.toLowerCase().endsWith('?optional')) { required = false; label = label.slice(0, -'?optional'.length).trim(); }
      if (label.toLowerCase().endsWith('?long')) { paragraph = true; label = label.slice(0, -'?long'.length).trim(); }
      return { id: `q${Math.random().toString(36).slice(2, 8)}`, label, required, paragraph };
    }).filter(q => q.label.length > 0).slice(0, 5);

    if (questions.length === 0) return { success: false, message: 'At least one question is required.' };

    const panel = await createApplicationPanel({
      guildId: guild.id,
      channelId: channel.id,
      title: String(params['title']),
      description: String(params['description']),
      buttonLabel: String(params['buttonLabel'] ?? 'Apply Now'),
      roleName: String(params['roleName']),
      questions,
      reviewChannelId,
      grantRoleId,
      cooldownHours: Number(params['cooldownHours'] ?? 24),
    });

    await applicationService.postPanel(guild, panel);

    return {
      success: true,
      message: `✅ **Application panel created** in <#${channel.id}>\n• Panel ID: \`${panel.id}\`\n• Role: ${panel.roleName}\n• Questions: ${questions.length}\n• Reviews posted to: ${reviewChannelId ? `<#${reviewChannelId}>` : '_none configured_'}`,
    };
  }
}
