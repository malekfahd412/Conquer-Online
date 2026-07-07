import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export interface SocialLinks {
  website: string | undefined;
  facebook: string | undefined;
  whatsapp: string | undefined;
  discordInvite: string | undefined;
  instagram: string | undefined;
  youtube: string | undefined;
  tiktok: string | undefined;
}

const BUTTON_DEFINITIONS: ReadonlyArray<{
  key: keyof SocialLinks;
  label: string;
}> = [
  { key: 'website',      label: '🌍 Website'   },
  { key: 'facebook',     label: '📘 Facebook'  },
  { key: 'whatsapp',     label: '💬 WhatsApp'  },
  { key: 'discordInvite',label: '🎮 Discord'   },
  { key: 'instagram',    label: '📸 Instagram' },
  { key: 'youtube',      label: '▶️ YouTube'   },
  { key: 'tiktok',       label: '🎵 TikTok'    },
];

const MAX_BUTTONS_PER_ROW = 5;

export function buildSocialButtons(
  social: SocialLinks,
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons: ButtonBuilder[] = [];

  for (const def of BUTTON_DEFINITIONS) {
    const url = social[def.key];
    if (!url) continue;

    buttons.push(
      new ButtonBuilder()
        .setLabel(def.label)
        .setStyle(ButtonStyle.Link)
        .setURL(url),
    );
  }

  if (buttons.length === 0) return [];

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
    const chunk = buttons.slice(i, i + MAX_BUTTONS_PER_ROW);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(chunk));
  }

  return rows;
}
