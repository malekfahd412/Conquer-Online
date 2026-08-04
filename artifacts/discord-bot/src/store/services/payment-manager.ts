// ─────────────────────────────────────────────────────────────────────────────
// Payment Manager — manages payment methods for the store.
// Supports unlimited payment methods with custom fields, QR images,
// role restrictions, and configurable required proof types.
// ─────────────────────────────────────────────────────────────────────────────
import type { PaymentMethod, PaymentMethodsData } from '../models/index.js';
import { StoreJson, genStoreId } from './store-data.js';

const store = new StoreJson<PaymentMethodsData>('payment-methods.json', () => ({
  methods: getBuiltinDefaults(),
}));

/** Built-in payment method seeds for first-run. */
function getBuiltinDefaults(): PaymentMethod[] {
  const now = Date.now();
  return [
    {
      id: genStoreId('pm'),
      name: 'Vodafone Cash',
      icon: '📱',
      instructions: 'Send payment to the Vodafone Cash number provided by staff. Include your Order ID in the notes.',
      status: 'active',
      order: 0,
      color: 0xe2021e,
      requiresScreenshot: true,
      requiresTransactionId: false,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: false,
      requiresNotes: false,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'Instapay',
      icon: '🏦',
      instructions: 'Transfer via Instapay. Mention your Order ID in the transfer description.',
      status: 'active',
      order: 1,
      color: 0x1a73e8,
      requiresScreenshot: true,
      requiresTransactionId: true,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: false,
      requiresNotes: false,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'PayPal',
      icon: '💳',
      instructions: 'Send payment via PayPal Friends & Family to the address provided by staff.',
      status: 'active',
      order: 2,
      color: 0x003087,
      requiresScreenshot: true,
      requiresTransactionId: true,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: false,
      requiresNotes: false,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'USDT',
      icon: '🪙',
      instructions: 'Send USDT (TRC-20 or ERC-20) to the wallet address provided. Screenshot the transaction after confirmation.',
      status: 'active',
      order: 3,
      color: 0x26a17b,
      requiresScreenshot: true,
      requiresTransactionId: true,
      requiresPhone: false,
      requiresWallet: true,
      requiresCharacter: false,
      requiresNotes: false,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'Binance Pay',
      icon: '🔶',
      instructions: 'Pay via Binance Pay using the provided Pay ID. Screenshot the completed transaction.',
      status: 'active',
      order: 4,
      color: 0xf0b90b,
      requiresScreenshot: true,
      requiresTransactionId: true,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: false,
      requiresNotes: false,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'Crypto Wallet',
      icon: '₿',
      instructions: 'Send cryptocurrency to the wallet address shown. Provide the transaction hash as proof.',
      status: 'active',
      order: 5,
      color: 0xf7931a,
      requiresScreenshot: false,
      requiresTransactionId: true,
      requiresPhone: false,
      requiresWallet: true,
      requiresCharacter: false,
      requiresNotes: true,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'Cash',
      icon: '💵',
      instructions: 'Arrange cash payment with a staff member in-game or in-person. Provide the character name for confirmation.',
      status: 'active',
      order: 6,
      color: 0x57f287,
      requiresScreenshot: false,
      requiresTransactionId: false,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: true,
      requiresNotes: true,
      roleRestrictions: [],
      createdAt: now,
    },
    {
      id: genStoreId('pm'),
      name: 'In Game',
      icon: '🎮',
      instructions: 'Pay using in-game gold or items. Contact staff in-game to arrange the transfer.',
      status: 'active',
      order: 7,
      color: 0x5865f2,
      requiresScreenshot: false,
      requiresTransactionId: false,
      requiresPhone: false,
      requiresWallet: false,
      requiresCharacter: true,
      requiresNotes: true,
      roleRestrictions: [],
      createdAt: now,
    },
  ];
}

export const paymentManager = {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  },

  async list(): Promise<PaymentMethod[]> {
    const data = await store.read();
    return data.methods.slice().sort((a, b) => a.order - b.order);
  },

  async listActive(): Promise<PaymentMethod[]> {
    const data = await store.read();
    return data.methods
      .filter(m => m.status === 'active')
      .sort((a, b) => a.order - b.order);
  },

  /**
   * List active methods available to a member with given role IDs.
   * A method with no roleRestrictions is available to everyone.
   */
  async listForRoles(memberRoleIds: string[]): Promise<PaymentMethod[]> {
    const active = await this.listActive();
    return active.filter(
      m => m.roleRestrictions.length === 0 || m.roleRestrictions.some(r => memberRoleIds.includes(r)),
    );
  },

  async get(id: string): Promise<PaymentMethod | undefined> {
    const data = await store.read();
    return data.methods.find(m => m.id === id);
  },

  async create(input: Omit<PaymentMethod, 'id' | 'createdAt'>): Promise<PaymentMethod> {
    return store.mutate(data => {
      const method: PaymentMethod = {
        ...input,
        id: genStoreId('pm'),
        createdAt: Date.now(),
      };
      data.methods.push(method);
      return JSON.parse(JSON.stringify(method)) as PaymentMethod;
    });
  },

  async update(id: string, patch: Partial<Omit<PaymentMethod, 'id' | 'createdAt'>>): Promise<PaymentMethod | undefined> {
    return store.mutate(data => {
      const m = data.methods.find(x => x.id === id);
      if (!m) return undefined;
      Object.assign(m, patch);
      return JSON.parse(JSON.stringify(m)) as PaymentMethod;
    });
  },

  async delete(id: string): Promise<boolean> {
    return store.mutate(data => {
      const idx = data.methods.findIndex(m => m.id === id);
      if (idx === -1) return false;
      data.methods.splice(idx, 1);
      return true;
    });
  },

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<PaymentMethod | undefined> {
    return this.update(id, { status });
  },

  async reorder(orderedIds: string[]): Promise<void> {
    await store.mutate(data => {
      for (const [index, id] of orderedIds.entries()) {
        const m = data.methods.find(x => x.id === id);
        if (m) m.order = index;
      }
    });
  },
};
