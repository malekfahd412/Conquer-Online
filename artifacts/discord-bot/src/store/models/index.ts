// ─────────────────────────────────────────────────────────────────────────────
// Store Management System — model definitions
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'Pending'
  | 'WaitingPayment'
  | 'Paid'
  | 'Delivering'
  | 'Completed'
  | 'Cancelled'
  | 'Refunded';

export const ORDER_STATUSES: OrderStatus[] = [
  'Pending',
  'WaitingPayment',
  'Paid',
  'Delivering',
  'Completed',
  'Cancelled',
  'Refunded',
];

export interface StoreCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  image?: string;
  order: number;
  enabled: boolean;
}

export interface StoreProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  image?: string;
  price: number;
  currency: string;
  stock: number;
  unlimitedStock: boolean;
  enabled: boolean;
  featured: boolean;
  hidden: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoreOrder {
  orderId: string;       // Human-readable: STORE-000001
  userId: string;
  guildId: string;
  ticketId: string;      // Discord channel ID for this order
  productId: string;
  quantity: number;
  price: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  staffId?: string;
  notes?: string;
}

export interface StoreStatistics {
  totalOrders: number;
  completed: number;
  cancelled: number;
  revenue: number;
  pending: number;
}

export interface StoreSettings {
  supportRoles: string[];
  adminRoles: string[];
  panelChannelId?: string | null;
  panelMessageId?: string | null;
  orderCategoryId?: string | null;
}

// ── Persisted data shapes ──────────────────────────────────────────────────

export interface CategoriesData {
  categories: StoreCategory[];
}

export interface ProductsData {
  products: StoreProduct[];
}

export interface OrdersData {
  orders: StoreOrder[];
  counter: number;
}
