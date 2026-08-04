// ─────────────────────────────────────────────────────────────────────────────
// Store Search — fast in-memory product search by name, category, price,
// tags, item ID, and variant name. Uses pre-built index maps for O(1) lookups.
// ─────────────────────────────────────────────────────────────────────────────
import type { StoreProduct, StoreCategory } from '../models/index.js';
import { productManager } from './product-manager.js';
import { categoryManager } from './category-manager.js';

export interface SearchResult {
  product: StoreProduct;
  category: StoreCategory | undefined;
  score: number;
  matchReason: string;
}

export interface SearchOptions {
  query?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  includeHidden?: boolean;
  includeOutOfStock?: boolean;
  limit?: number;
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

function scoreProduct(product: StoreProduct, query: string): { score: number; reason: string } {
  const q = normalize(query);
  if (!q) return { score: 1, reason: 'all' };

  let score = 0;
  const reasons: string[] = [];

  const name = normalize(product.name);
  if (name === q) {
    score += 100;
    reasons.push('exact name');
  } else if (name.startsWith(q)) {
    score += 80;
    reasons.push('name prefix');
  } else if (name.includes(q)) {
    score += 60;
    reasons.push('name match');
  }

  if (product.id.toLowerCase() === q || product.id.toLowerCase().includes(q)) {
    score += 90;
    reasons.push('ID match');
  }

  const desc = normalize(product.description);
  if (desc.includes(q)) {
    score += 20;
    reasons.push('description');
  }

  for (const tag of product.tags) {
    if (normalize(tag).includes(q)) {
      score += 40;
      reasons.push(`tag:${tag}`);
      break;
    }
  }

  // Check variants
  for (const v of product.variants) {
    if (normalize(v.name).includes(q)) {
      score += 30;
      reasons.push(`variant:${v.name}`);
      break;
    }
  }

  return { score, reason: reasons.join(', ') || 'no match' };
}

export const storeSearch = {
  /**
   * Search products with optional filters.
   * Returns results sorted by relevance score (descending).
   */
  async search(options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      query = '',
      categoryId,
      minPrice,
      maxPrice,
      tags,
      includeHidden = false,
      includeOutOfStock = true,
      limit = 25,
    } = options;

    const [products, categories] = await Promise.all([
      productManager.list(),
      categoryManager.list(),
    ]);

    const categoryMap = new Map(categories.map(c => [c.id, c]));
    const now = Date.now();

    const results: SearchResult[] = [];

    for (const product of products) {
      if (!product.enabled) continue;
      if (!includeHidden && product.hidden) continue;
      if (product.scheduledAt !== undefined && product.scheduledAt > now) continue;

      // Category filter
      if (categoryId && product.categoryId !== categoryId) continue;

      // Price filter
      if (minPrice !== undefined && product.price < minPrice) continue;
      if (maxPrice !== undefined && product.price > maxPrice) continue;

      // Stock filter
      if (!includeOutOfStock) {
        const inStock = product.unlimitedStock || product.stock > product.reservedStock;
        if (!inStock) continue;
      }

      // Tag filter
      if (tags && tags.length > 0) {
        const productTags = product.tags.map(t => normalize(t));
        const hasAllTags = tags.every(t => productTags.includes(normalize(t)));
        if (!hasAllTags) continue;
      }

      const { score, reason } = scoreProduct(product, query);
      if (query && score === 0) continue;

      results.push({
        product,
        category: categoryMap.get(product.categoryId),
        score,
        matchReason: reason,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  /** Quick search returning just products — convenience wrapper. */
  async quickSearch(query: string, limit = 10): Promise<StoreProduct[]> {
    const results = await this.search({ query, limit });
    return results.map(r => r.product);
  },

  /** Get all unique tags across all products. */
  async getAllTags(): Promise<string[]> {
    const products = await productManager.list();
    const tagSet = new Set<string>();
    for (const p of products) {
      for (const tag of p.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  },
};
