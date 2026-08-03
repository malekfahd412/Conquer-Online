import { promises as fs } from 'fs';
import path from 'path';
import { loadImage, type Image } from '@napi-rs/canvas';
import type { WelcomeCardConfig } from './welcome-store';
import { logger } from '../../utils/logger';

const FILE = 'welcome-card-renderer.ts';

// ── Fallback background (used until an admin uploads one) ─────────────────

export const FALLBACK_WIDTH = 900;
export const FALLBACK_HEIGHT = 300;

export async function loadBackground(source: string | undefined): Promise<Image | null> {
  if (!source) return null;
  try {
    if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return await loadImage(buf);
    }
    const abs = path.isAbsolute(source) ? source : path.join(process.cwd(), source);
    const buf = await fs.readFile(abs);
    return await loadImage(buf);
  } catch (err) {
    logger.error(`[${FILE}] Failed to load background image "${source}"`, err);
    return null;
  }
}

export async function loadAvatar(avatarUrl: string): Promise<Image> {
  const res = await fetch(avatarUrl);
  if (!res.ok) throw new Error(`Failed to fetch avatar: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return await loadImage(buf);
}

/**
 * Params for rendering the welcome card. Text overlays (username, server
 * name, member count, join date, etc.) were intentionally removed — the
 * card shows only the background and avatar. See `renderWelcomeCard.ts` for
 * the actual renderer.
 */
export interface RenderWelcomeCardParams {
  card: WelcomeCardConfig;
  avatarUrl: string;
}

/** Persists an uploaded background image to disk and returns the config-relative path to store. */
export async function saveBackgroundImage(guildId: string, buffer: Buffer, ext: string): Promise<string> {
  const dir = path.join(process.cwd(), 'data', 'welcome-backgrounds');
  await fs.mkdir(dir, { recursive: true });
  const cleanExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const relPath = path.join('data', 'welcome-backgrounds', `${guildId}.${cleanExt}`);
  await fs.writeFile(path.join(process.cwd(), relPath), buffer);
  return relPath;
}
