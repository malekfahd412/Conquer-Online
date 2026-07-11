import { promises as fs } from 'fs';
import path from 'path';
import { createCanvas, loadImage, GlobalFonts, type Image } from '@napi-rs/canvas';
import type { WelcomeCardConfig } from './welcome-store';
import { logger } from '../../utils/logger';

const FILE = 'welcome-card-renderer.ts';

// ── Font registration ───────────────────────────────────────────────────────
//
// Bundled so the "Font Family" choice is reliable regardless of what fonts a
// host happens to have registered with fontconfig. Registered once, lazily,
// on first render.

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

/** Families available in the Font Family picker — bundled fonts plus the always-present system fallback. */
export const FONT_FAMILIES = ['Poppins', 'Montserrat', 'Inter', 'DejaVu Sans'] as const;
export type FontFamily = typeof FONT_FAMILIES[number];

let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const files: Array<[string, string]> = [
    ['Poppins-Regular.ttf', 'Poppins'],
    ['Poppins-Bold.ttf', 'Poppins'],
    ['Montserrat-Variable.ttf', 'Montserrat'],
    ['Inter-Variable.ttf', 'Inter'],
  ];
  for (const [file, family] of files) {
    try {
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, file), family);
    } catch (err) {
      logger.error(`[${FILE}] Failed to register font ${file}`, err);
    }
  }
  // DejaVu Sans ships with the OS fontconfig setup — no bundled file needed.
}

// ── Fallback background (used until an admin uploads one) ─────────────────

const FALLBACK_WIDTH = 900;
const FALLBACK_HEIGHT = 300;

async function loadBackground(source: string | undefined): Promise<Image | null> {
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

async function loadAvatar(avatarUrl: string): Promise<Image> {
  const res = await fetch(avatarUrl);
  if (!res.ok) throw new Error(`Failed to fetch avatar: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return await loadImage(buf);
}

export interface RenderWelcomeCardParams {
  card: WelcomeCardConfig;
  avatarUrl: string;
  displayName: string;
  serverName: string;
  memberCount: number;
}

/**
 * Renders a ProBot-style welcome card as a PNG buffer. Every position/size/
 * color/font comes from `card` — nothing is hardcoded here except the
 * fallback canvas size used when no background has been uploaded yet.
 */
export async function renderWelcomeCard(params: RenderWelcomeCardParams): Promise<Buffer> {
  registerFonts();
  const { card, avatarUrl, displayName, serverName, memberCount } = params;

  const bg = await loadBackground(card.backgroundImage);
  const width = bg?.width ?? FALLBACK_WIDTH;
  const height = bg?.height ?? FALLBACK_HEIGHT;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (bg) {
    ctx.drawImage(bg, 0, 0, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#23272a');
    gradient.addColorStop(1, '#2c2f33');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // ── Avatar (circular, anti-aliased, optional border) ──────────────────────
  const avatar = await loadAvatar(avatarUrl);
  const cx = card.avatarX + card.avatarSize / 2;
  const cy = card.avatarY + card.avatarSize / 2;
  const radius = card.avatarSize / 2;

  if (card.avatarBorderEnabled && card.avatarBorderWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + card.avatarBorderWidth / 2, 0, Math.PI * 2);
    ctx.strokeStyle = card.avatarBorderColor;
    ctx.lineWidth = card.avatarBorderWidth;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, card.avatarX, card.avatarY, card.avatarSize, card.avatarSize);
  ctx.restore();

  // ── Text ─────────────────────────────────────────────────────────────────
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = card.textColor;

  ctx.font = `bold ${card.fontSize}px "${card.fontFamily}"`;
  ctx.fillText(displayName, card.usernameX, card.usernameY);

  ctx.font = `${Math.round(card.fontSize * 0.6)}px "${card.fontFamily}"`;
  ctx.fillText(serverName, card.serverNameX, card.serverNameY);
  ctx.fillText(`Member #${memberCount}`, card.memberCountX, card.memberCountY);

  return await canvas.encode('png');
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
