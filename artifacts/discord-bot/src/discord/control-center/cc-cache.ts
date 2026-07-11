import type { ITool } from '../../ai/tools/tool.interface';
import type { ToolRegistry } from '../../ai/tool-registry';
import { inferCategory, CATEGORY_ORDER } from './cc-categories';
import type { CategoryKey } from './cc-categories';
import { logger } from '../../utils/logger';

interface SearchEntry {
  tool: ITool;
  nameLower: string;
  descLower: string;
}

/**
 * Built ONCE at startup from the (already-singleton) ToolRegistry.
 * Every /panel invocation and every category/search interaction reads
 * from these precomputed structures instead of re-scanning all tools.
 */
export class ControlCenterCache {
  readonly toolCount: number;
  readonly categoryCounts: Partial<Record<CategoryKey, number>> = {};
  readonly buildTimeMs: number;

  private readonly toolsByCategory = new Map<CategoryKey, ITool[]>();
  private readonly searchIndex: SearchEntry[] = [];
  private readonly toolMeta = new Map<string, CategoryKey>();

  constructor(registry: ToolRegistry) {
    const t0 = Date.now();

    for (const key of CATEGORY_ORDER) this.toolsByCategory.set(key, []);

    const all = registry.getAll();
    this.toolCount = all.length;

    for (const tool of all) {
      const category = inferCategory(tool.definition.name);
      this.toolMeta.set(tool.definition.name, category);
      this.categoryCounts[category] = (this.categoryCounts[category] ?? 0) + 1;
      this.toolsByCategory.get(category)!.push(tool);
      this.searchIndex.push({
        tool,
        nameLower: tool.definition.name.toLowerCase(),
        descLower: tool.definition.description.toLowerCase(),
      });
    }

    for (const list of this.toolsByCategory.values()) {
      list.sort((a, b) => a.definition.name.localeCompare(b.definition.name));
    }

    this.buildTimeMs = Date.now() - t0;
    logger.info(
      `[CC][cache] built once at startup in ${this.buildTimeMs}ms — ${this.toolCount} tools, ` +
      `${CATEGORY_ORDER.length} categories, search index of ${this.searchIndex.length} entries`,
    );
  }

  getCategory(toolName: string): CategoryKey {
    return this.toolMeta.get(toolName) ?? inferCategory(toolName);
  }

  getToolsByCategory(category: CategoryKey): ITool[] {
    return this.toolsByCategory.get(category) ?? [];
  }

  search(query: string): ITool[] {
    const q = query.toLowerCase();
    const out: ITool[] = [];
    for (const entry of this.searchIndex) {
      if (entry.nameLower.includes(q) || entry.descLower.includes(q)) out.push(entry.tool);
    }
    return out;
  }
}
