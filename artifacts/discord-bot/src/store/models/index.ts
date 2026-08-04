// ─────────────────────────────────────────────────────────────────────────────
// Store Management System — model definitions (Phase 1 + Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

// ── Order status ──────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'Pending'
  | 'WaitingPayment'
  | 'ProofSubmitted'
  | 'Paid'
  | 'Preparing'
  | 'Delivering'
  | 'Completed'
  | 'Cancelled'
  | 'Refunded';

export const ORDER_STATUSES: OrderStatus[] = [
  'Pending',
  'WaitingPayment',
  'ProofSubmitted',
  'Paid',
  'Preparing',
  'Delivering',
  'Completed',
  'Cancelled',
  'Refunded',
];

// ── Product badges / special flags ────────────────────────────────────────────

export type ProductBadge = 'new' | 'popular' | 'best_seller' | 'sale' | 'limited';

// ── Product variant ───────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock: number;
  unlimitedStock: boolean;
  description?: string;
  image?: string;
  enabled: boolean;
}

// ── Store category ─────────────────────────────────────────────────────────────

export interface StoreCategory {
  id: string;
  name: string;
  description: string;
  emoji: string;
  image?: string;
  order: number;
  enabled: boolean;
}

// ── Store product (extended) ──────────────────────────────────────────────────

export interface StoreProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  image?: string;            // main image
  price: number;
  currency: string;
  stock: number;
  unlimitedStock: boolean;
  enabled: boolean;
  featured: boolean;
  hidden: boolean;
  createdAt: number;
  updatedAt: number;

  // Phase 2 additions — all optional for backward compatibility
  variants: ProductVariant[];
  galleryImages: string[];      // additional image URLs
  thumbnail?: string;
  tags: string[];
  badges: ProductBadge[];
  reservedStock: number;        // reserved for in-progress orders
  lowStockThreshold: number;    // warn when stock drops to or below this
  scheduledAt?: number;         // unix ms — hide product before this time
  viewCount: number;
  salesCount: number;
}

// ── Payment proof ─────────────────────────────────────────────────────────────

export type ProofReviewDecision = 'approved' | 'rejected' | 'more_info';

export interface PaymentProof {
  submittedAt: number;
  submittedBy: string;        // userId
  transactionId?: string;
  amount?: number;
  paymentTime?: string;
  notes?: string;
  attachmentUrls: string[];
  reviewedAt?: number;
  reviewedBy?: string;
  reviewDecision?: ProofReviewDecision;
  reviewNotes?: string;
}

// ── Order timeline entry ──────────────────────────────────────────────────────

export interface OrderTimelineEntry {
  status: OrderStatus;
  timestamp: number;
  staffId?: string;
  reason?: string;
  note?: string;
}

// ── Delivery note ─────────────────────────────────────────────────────────────

export interface DeliveryNote {
  id: string;
  staffId: string;
  content: string;
  attachmentUrls: string[];
  characterName?: string;
  serverNotes?: string;
  isPrivate: boolean;
  timestamp: number;
}

// ── Store order (extended) ────────────────────────────────────────────────────

export interface StoreOrder {
  orderId: string;        // Human-readable: STORE-000001
  userId: string;
  guildId: string;
  ticketId: string;       // Discord channel ID for this order
  productId: string;
  quantity: number;
  price: number;
  totalPrice: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  staffId?: string;
  notes?: string;

  // Phase 2 additions
  variantId?: string;
  paymentMethodId?: string;
  couponId?: string;
  discountAmount: number;
  originalPrice: number;
  proof?: PaymentProof;
  timeline: OrderTimelineEntry[];
  deliveryNotes: DeliveryNote[];
  pinnedMessageId?: string;
}

// ── Store statistics (extended) ───────────────────────────────────────────────

export interface StoreStatistics {
  totalOrders: number;
  completed: number;
  cancelled: number;
  revenue: number;
  pending: number;

  // Phase 2 additions
  refunded: number;
  delivering: number;
  proofSubmitted: number;
  preparing: number;
  dailyRevenue: Record<string, number>;    // "YYYY-MM-DD" -> amount
  weeklyRevenue: Record<string, number>;   // "YYYY-WW" -> amount
  monthlyRevenue: Record<string, number>;  // "YYYY-MM" -> amount
  topProducts: Record<string, number>;     // productId -> salesCount
  topCustomers: Record<string, number>;    // userId -> orderCount
  topStaff: Record<string, number>;        // staffId -> ordersHandled
}

// ── Store settings (extended) ─────────────────────────────────────────────────

export interface StoreSettings {
  supportRoles: string[];
  adminRoles: string[];
  panelChannelId?: string | null;
  panelMessageId?: string | null;
  orderCategoryId?: string | null;

  // Phase 2 additions
  auditLogChannelId?: string | null;
  lowStockAlertChannelId?: string | null;
  settingsPanelChannelId?: string | null;
  settingsPanelMessageId?: string | null;
  defaultCurrency: string;
  maxOrdersPerUser: number;               // 0 = unlimited
}

// ── Payment method ────────────────────────────────────────────────────────────

export type PaymentFieldType =
  | 'screenshot'
  | 'transaction_id'
  | 'phone'
  | 'wallet'
  | 'character'
  | 'notes';

export interface PaymentMethodField {
  type: PaymentFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  instructions: string;
  status: 'active' | 'inactive';
  order: number;
  color: number;
  qrImageUrl?: string;
  roleRestrictions: string[];
  requiresScreenshot: boolean;
  requiresTransactionId: boolean;
  requiresPhone: boolean;
  requiresWallet: boolean;
  requiresCharacter: boolean;
  requiresNotes: boolean;
  createdAt: number;
}

// ── Coupon ────────────────────────────────────────────────────────────────────

export type CouponType = 'percentage' | 'fixed' | 'free_item';

export interface StoreCoupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  freeItemId?: string;
  description?: string;
  firstPurchaseOnly: boolean;
  roleBased: boolean;
  allowedRoles: string[];
  maxUses?: number;
  usedCount: number;
  expiresAt?: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  enabled: boolean;
  createdAt: number;
}

// ── Special offer ─────────────────────────────────────────────────────────────

export type OfferType = 'flash_sale' | 'bundle' | 'featured';

export interface StoreOffer {
  id: string;
  type: OfferType;
  name: string;
  description?: string;
  productIds: string[];
  discountPercent?: number;
  startAt?: number;
  endAt?: number;
  enabled: boolean;
  badge?: ProductBadge;
  featuredImageUrl?: string;
  createdAt: number;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'order_created'
  | 'order_status_changed'
  | 'order_cancelled'
  | 'order_refunded'
  | 'product_created'
  | 'product_updated'
  | 'product_deleted'
  | 'product_stock_changed'
  | 'category_created'
  | 'category_updated'
  | 'category_deleted'
  | 'coupon_created'
  | 'coupon_used'
  | 'coupon_deleted'
  | 'payment_method_created'
  | 'payment_method_updated'
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_proof_submitted'
  | 'delivery_note_added'
  | 'settings_updated'
  | 'offer_created'
  | 'offer_deleted';

export interface StoreAuditEntry {
  id: string;
  action: AuditAction;
  staffId?: string;
  userId?: string;
  orderId?: string;
  productId?: string;
  categoryId?: string;
  couponId?: string;
  reason?: string;
  before?: string;
  after?: string;
  timestamp: number;
}

// ── Store staff permission level ──────────────────────────────────────────────

export type StaffPermissionLevel =
  | 'viewer'
  | 'support'
  | 'payment_reviewer'
  | 'delivery'
  | 'manager'
  | 'owner';

export interface StoreStaffRole {
  roleId: string;
  level: StaffPermissionLevel;
  guildId: string;
}

// ── Persisted data shapes ──────────────────────────────────────────────────────

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

export interface PaymentMethodsData {
  methods: PaymentMethod[];
}

export interface CouponsData {
  coupons: StoreCoupon[];
}

export interface OffersData {
  offers: StoreOffer[];
}

export interface AuditData {
  entries: StoreAuditEntry[];
}

export interface StaffRolesData {
  roles: StoreStaffRole[];
}

// ── Migration helpers ──────────────────────────────────────────────────────────

/** Normalize a persisted StoreProduct, adding Phase 2 defaults if missing. */
export function normalizeProduct(p: Partial<StoreProduct> & Pick<StoreProduct, 'id' | 'name' | 'price' | 'currency'>): StoreProduct {
  return {
    categoryId: '',
    description: '',
    stock: 0,
    unlimitedStock: false,
    enabled: true,
    featured: false,
    hidden: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    variants: [],
    galleryImages: [],
    tags: [],
    badges: [],
    reservedStock: 0,
    lowStockThreshold: 0,
    viewCount: 0,
    salesCount: 0,
    ...p,
  };
}

/** Normalize a persisted StoreOrder, adding Phase 2 defaults if missing. */
export function normalizeOrder(o: Partial<StoreOrder> & Pick<StoreOrder, 'orderId' | 'userId' | 'productId'>): StoreOrder {
  return {
    guildId: '',
    ticketId: '',
    quantity: 1,
    price: 0,
    totalPrice: 0,
    status: 'WaitingPayment',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    discountAmount: 0,
    originalPrice: (o as StoreOrder).totalPrice ?? 0,
    timeline: [],
    deliveryNotes: [],
    ...o,
  };
}

/** Normalize StoreSettings, adding Phase 2 defaults. */
export function normalizeSettings(s: Partial<StoreSettings>): StoreSettings {
  return {
    supportRoles: [],
    adminRoles: [],
    panelChannelId: null,
    panelMessageId: null,
    orderCategoryId: null,
    auditLogChannelId: null,
    lowStockAlertChannelId: null,
    settingsPanelChannelId: null,
    settingsPanelMessageId: null,
    defaultCurrency: 'coins',
    maxOrdersPerUser: 0,
    ...s,
  };
}

/** Normalize StoreStatistics, adding Phase 2 defaults. */
export function normalizeStatistics(s: Partial<StoreStatistics>): StoreStatistics {
  return {
    totalOrders: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    pending: 0,
    refunded: 0,
    delivering: 0,
    proofSubmitted: 0,
    preparing: 0,
    dailyRevenue: {},
    weeklyRevenue: {},
    monthlyRevenue: {},
    topProducts: {},
    topCustomers: {},
    topStaff: {},
    ...s,
  };
}
