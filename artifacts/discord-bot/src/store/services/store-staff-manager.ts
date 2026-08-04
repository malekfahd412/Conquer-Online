// ─────────────────────────────────────────────────────────────────────────────
// Store Staff Manager — granular per-role permission levels for the store.
//
// Levels (ascending power):
//   viewer           → read-only: see orders and products
//   support          → viewer + respond to customers, add delivery notes
//   payment_reviewer → support + approve/reject payment proofs
//   delivery         → payment_reviewer + mark Preparing/Delivering/Completed
//   manager          → delivery + manage products, coupons, offers, settings
//   owner            → full access (same as Discord Administrator for the store)
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreStaffRole, StaffPermissionLevel, StaffRolesData } from '../models/index.js';
import { StoreJson } from './store-data.js';

const store = new StoreJson<StaffRolesData>('staff-roles.json', () => ({ roles: [] }));

const LEVEL_ORDER: StaffPermissionLevel[] = [
  'viewer',
  'support',
  'payment_reviewer',
  'delivery',
  'manager',
  'owner',
];

function levelIndex(level: StaffPermissionLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/** Returns true if `level` meets or exceeds `required`. */
export function hasPermission(level: StaffPermissionLevel, required: StaffPermissionLevel): boolean {
  return levelIndex(level) >= levelIndex(required);
}

export const storeStaffManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(guildId: string): Promise<StoreStaffRole[]> {
    const data = await store.read();
    return data.roles.filter(r => r.guildId === guildId);
  },

  async getForRole(roleId: string, guildId: string): Promise<StoreStaffRole | undefined> {
    const data = await store.read();
    return data.roles.find(r => r.roleId === roleId && r.guildId === guildId);
  },

  async set(roleId: string, guildId: string, level: StaffPermissionLevel): Promise<StoreStaffRole> {
    return store.mutate(data => {
      let role = data.roles.find(r => r.roleId === roleId && r.guildId === guildId);
      if (role) {
        role.level = level;
      } else {
        role = { roleId, guildId, level };
        data.roles.push(role);
      }
      return JSON.parse(JSON.stringify(role)) as StoreStaffRole;
    });
  },

  async remove(roleId: string, guildId: string): Promise<boolean> {
    return store.mutate(data => {
      const idx = data.roles.findIndex(r => r.roleId === roleId && r.guildId === guildId);
      if (idx === -1) return false;
      data.roles.splice(idx, 1);
      return true;
    });
  },

  /**
   * Resolve the effective permission level for a member given their role IDs.
   * Returns undefined if the member has no store staff roles.
   * Falls back to generalRoles (supportRoles/adminRoles from settings) if provided.
   */
  async resolveLevel(
    memberRoleIds: string[],
    guildId: string,
    generalStaffRoleIds?: string[],
  ): Promise<StaffPermissionLevel | undefined> {
    const data = await store.read();
    const guildRoles = data.roles.filter(r => r.guildId === guildId);

    // Find the highest level among the member's roles
    let highestIndex = -1;
    for (const r of guildRoles) {
      if (memberRoleIds.includes(r.roleId)) {
        const idx = levelIndex(r.level);
        if (idx > highestIndex) highestIndex = idx;
      }
    }

    if (highestIndex >= 0) {
      return LEVEL_ORDER[highestIndex];
    }

    // Fall back: if member has any general staff role, treat as 'support'
    if (generalStaffRoleIds?.some(id => memberRoleIds.includes(id))) {
      return 'support';
    }

    return undefined;
  },

  /** Convenience: check if member has at least the required level. */
  async memberHasPermission(
    memberRoleIds: string[],
    guildId: string,
    required: StaffPermissionLevel,
    generalStaffRoleIds?: string[],
  ): Promise<boolean> {
    const level = await this.resolveLevel(memberRoleIds, guildId, generalStaffRoleIds);
    if (!level) return false;
    return hasPermission(level, required);
  },
};
