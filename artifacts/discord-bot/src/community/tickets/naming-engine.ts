// ─────────────────────────────────────────────────────────────────────────────
// NamingEngine — renders a ticket channel name from a naming scheme string.
//
// Supported variables (per spec): {user} {username} {userid} {displayname}
// {ticket} {counter} {date} {time} {year} {month} {day} {random}
//
// Back-compat aliases (so panels migrated from the legacy system render
// byte-identical names without any string rewriting): {number} -> {counter},
// {type} -> the ticket type of the button/select option that was clicked.
// ─────────────────────────────────────────────────────────────────────────────

export interface NamingContext {
  userId: string;
  username: string;
  displayName: string;
  ticketId: string;
  counter: number;
  ticketType: string;
  now: Date;
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 7);
}

export class NamingEngine {
  render(scheme: string, ctx: NamingContext): string {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    // {displayname} falls back to {username} when the display name contains only
    // non-ASCII characters (e.g. Arabic, CJK) that would be stripped by sanitize().
    const safeDisplayName = this.asciify(ctx.displayName) || this.asciify(ctx.username) || ctx.userId;
    const replacements: Record<string, string> = {
      '{user}': ctx.username,
      '{username}': ctx.username,
      '{userid}': ctx.userId,
      '{displayname}': safeDisplayName,
      '{ticket}': ctx.ticketId,
      '{counter}': pad4(ctx.counter),
      '{number}': pad4(ctx.counter),
      '{date}': `${ctx.now.getFullYear()}-${pad2(ctx.now.getMonth() + 1)}-${pad2(ctx.now.getDate())}`,
      '{time}': `${pad2(ctx.now.getHours())}-${pad2(ctx.now.getMinutes())}`,
      '{year}': String(ctx.now.getFullYear()),
      '{month}': pad2(ctx.now.getMonth() + 1),
      '{day}': pad2(ctx.now.getDate()),
      '{random}': randomToken(),
      '{type}': ctx.ticketType,
    };

    let name = scheme;
    for (const [token, value] of Object.entries(replacements)) {
      name = name.split(token).join(value);
    }

    return this.sanitize(name);
  }

  /**
   * Strips a string down to ASCII-safe channel-name characters.
   * Returns an empty string if nothing ASCII survives (e.g. an all-Arabic name).
   */
  private asciify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Discord channel names must be lowercase, dash-separated, <= 100 chars. Public: also used to sanitize manual renames (e.g. `/ticket rename`). */
  sanitize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .replace(/-+/g, '-')
      .slice(0, 90) || 'ticket';
  }

  validate(scheme: string): { valid: boolean; error?: string } {
    if (!scheme || !scheme.trim()) return { valid: false, error: 'Naming scheme cannot be empty.' };
    return { valid: true };
  }
}

export const namingEngine = new NamingEngine();
