import "server-only";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";

// ── Pagination options ─────────────────────────────────────────────────────────

export interface ListOptions {
  page?: number;
  pageSize?: number;
  orderBy?: Record<string, "asc" | "desc">;
}

export interface ListResult<TEntity> {
  items: TEntity[];
  total: number;
}

// ── Minimal structural contract for a Prisma model delegate ──────────────────
//
// We avoid importing the heavy generated delegate types directly. Instead, we
// describe only the operations BaseRepository needs. Concrete subclasses assign
// a real `prisma.<model>` delegate which satisfies this shape at call sites.

export interface PrismaDelegate<TEntity, TCreateInput, TUpdateInput, TWhereInput, TOrderByInput> {
  findFirst(args: {
    where: TWhereInput;
  }): Promise<TEntity | null>;

  findMany(args: {
    where: TWhereInput;
    orderBy?: TOrderByInput | TOrderByInput[];
    skip?: number;
    take?: number;
  }): Promise<TEntity[]>;

  count(args: { where: TWhereInput }): Promise<number>;

  create(args: { data: TCreateInput }): Promise<TEntity>;

  update(args: {
    where: { id: string };
    data: TUpdateInput;
  }): Promise<TEntity>;

  updateMany(args: {
    where: TWhereInput;
    data: TUpdateInput;
  }): Promise<{ count: number }>;
}

// ── Abstract base ──────────────────────────────────────────────────────────────

/**
 * BaseRepository<TEntity, TCreateInput, TUpdateInput, TWhereInput, TOrderByInput>
 *
 * Centralizes the recurring patterns across all lib/db/*.db.ts files:
 *   - tenantId as FIRST param on every public method (tenant isolation)
 *   - getOrSet cache with model-scoped keys
 *   - invalidateByPrefix after every write
 *   - logActivity on create / update / softDelete
 *
 * Usage:
 *   1. Extend this class, fill the three abstract members.
 *   2. Optionally override mapRow() to shape TEntity from the Prisma row.
 *   3. Wrap extra business methods that need cache/audit in protected helpers.
 *
 * @typeParam TEntity      — Shape returned to callers (the Db* type)
 * @typeParam TPrismaRow   — Raw row returned by Prisma (may == TEntity)
 * @typeParam TCreateInput — Prisma create data shape
 * @typeParam TUpdateInput — Prisma update data shape
 * @typeParam TWhereInput  — Prisma where filter shape (must include tenantId)
 * @typeParam TOrderByInput — Prisma orderBy shape
 */
export abstract class BaseRepository<
  TEntity,
  TPrismaRow,
  TCreateInput extends { tenantId: string },
  TUpdateInput,
  TWhereInput extends { tenantId?: string },
  TOrderByInput = Record<string, "asc" | "desc">,
> {
  // ── Abstract members — filled in by each subclass ─────────────────────────

  /** Logical name used as cache prefix and audit resource (e.g. "store-banners") */
  protected abstract readonly modelName: string;

  /** Default cache TTL in seconds */
  protected readonly cacheTtl: number = 300;

  /** Prisma model delegate (e.g. prisma.storeBanner) */
  protected abstract readonly delegate: PrismaDelegate<
    TPrismaRow,
    TCreateInput,
    TUpdateInput,
    TWhereInput,
    TOrderByInput
  >;

  // ── Row mapper — override when TEntity !== TPrismaRow ────────────────────

  /**
   * Transform a raw Prisma row into the public TEntity shape.
   * Default: identity cast (suitable when TEntity === TPrismaRow).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional: override in subclass
  protected mapRow(row: TPrismaRow): TEntity {
    return row as unknown as TEntity;
  }

  // ── Cache helpers ─────────────────────────────────────────────────────────

  /** Build a scoped cache key: `<modelName>:<tenantId>:<suffix>` */
  protected cacheKey(tenantId: string, suffix: string): string {
    return `${this.modelName}:${tenantId}:${suffix}`;
  }

  /** Evict all cache entries belonging to a tenant */
  protected bust(tenantId: string): void {
    invalidateByPrefix(`${this.modelName}:${tenantId}:`);
  }

  // ── Public CRUD methods ───────────────────────────────────────────────────

  /**
   * Find a single record by id, scoped to tenantId.
   * Cached for `cacheTtl` seconds.
   */
  async findById(tenantId: string, id: string): Promise<TEntity | null> {
    const key = this.cacheKey(tenantId, `id:${id}`);
    return getOrSet(key, this.cacheTtl, async () => {
      const row = await this.delegate.findFirst({
        where: { id, tenantId } as unknown as TWhereInput,
      });
      return row ? this.mapRow(row) : null;
    });
  }

  /**
   * List records with pagination, scoped to tenantId.
   * Cache key includes serialized options so different pages cache independently.
   */
  async list(
    tenantId: string,
    opts: ListOptions = {},
  ): Promise<ListResult<TEntity>> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 200);
    const skip = (page - 1) * pageSize;

    // Stable serialization for cache key
    const optsHash = `p${page}s${pageSize}${opts.orderBy ? JSON.stringify(opts.orderBy) : ""}`;
    const key = this.cacheKey(tenantId, `list:${optsHash}`);

    return getOrSet(key, this.cacheTtl, async () => {
      const where = { tenantId } as unknown as TWhereInput;
      const orderByArg = opts.orderBy as unknown as TOrderByInput | undefined;

      const [rows, total] = await Promise.all([
        this.delegate.findMany({
          where,
          ...(orderByArg !== undefined ? { orderBy: orderByArg } : {}),
          skip,
          take: pageSize,
        }),
        this.delegate.count({ where }),
      ]);

      return { items: rows.map((r) => this.mapRow(r)), total };
    });
  }

  /**
   * Create a record. Invalidates all tenant cache. Logs activity.
   */
  async create(
    tenantId: string,
    data: Omit<TCreateInput, "tenantId">,
    actor: { userId: string },
  ): Promise<TEntity> {
    const row = await this.delegate.create({
      data: { ...data, tenantId } as TCreateInput,
    });
    const entity = this.mapRow(row);
    const resourceId = this.extractId(row);

    this.bust(tenantId);
    logActivity(
      "create",
      this.modelName,
      `Created ${this.modelName} ${resourceId}`,
      resourceId,
      actor.userId,
      undefined,
      tenantId,
    ).catch((err) => console.error(`[${this.modelName}] logActivity failed`, String(err)));

    return entity;
  }

  /**
   * Update a record by id, scoped to tenantId.
   * Validates ownership before update. Invalidates cache. Logs activity.
   * Returns null if record not found or does not belong to tenant.
   */
  async update(
    tenantId: string,
    id: string,
    data: TUpdateInput,
    actor: { userId: string },
  ): Promise<TEntity | null> {
    // Scope check: updateMany automatically filters by tenantId + id
    const result = await this.delegate.updateMany({
      where: { id, tenantId } as unknown as TWhereInput,
      data,
    });

    if (result.count === 0) return null;

    this.bust(tenantId);
    logActivity(
      "update",
      this.modelName,
      `Updated ${this.modelName} ${id}`,
      id,
      actor.userId,
      undefined,
      tenantId,
    ).catch((err) => console.error(`[${this.modelName}] logActivity failed`, String(err)));

    // Re-fetch the updated record (needed because updateMany returns no data)
    return this.findById(tenantId, id);
  }

  /**
   * Soft-delete: sets `deletedAt = now()` scoped to tenantId.
   * Skips if record not found. Invalidates cache. Logs activity.
   */
  async softDelete(
    tenantId: string,
    id: string,
    actor: { userId: string },
  ): Promise<void> {
    const result = await this.delegate.updateMany({
      where: { id, tenantId } as unknown as TWhereInput,
      data: { deletedAt: new Date() } as unknown as TUpdateInput,
    });

    if (result.count === 0) return;

    this.bust(tenantId);
    logActivity(
      "soft_delete",
      this.modelName,
      `Soft-deleted ${this.modelName} ${id}`,
      id,
      actor.userId,
      undefined,
      tenantId,
    ).catch((err) => console.error(`[${this.modelName}] logActivity failed`, String(err)));
  }

  // ── Protected utility ─────────────────────────────────────────────────────

  /** Extract the `id` field from a raw row. Override if your PK is named differently. */
  protected extractId(row: TPrismaRow): string {
    return (row as unknown as { id: string }).id;
  }
}
