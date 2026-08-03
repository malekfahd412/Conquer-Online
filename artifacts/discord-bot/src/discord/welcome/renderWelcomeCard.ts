import { createCanvas } from '@napi-rs/canvas';
import { RenderWelcomeCardParams, registerFonts, loadBackground, FALLBACK_WIDTH, FALLBACK_HEIGHT, loadAvatar } from './welcome-card-renderer';

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
