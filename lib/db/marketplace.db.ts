import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DbStore = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  isPublished: boolean;
  commission: number;
  createdAt: string;
};

export type DbStoreProduct = {
  id: string;
  storeId: string;
  productId: number;
  retailPrice: number;
  wholesalePrice: number | null;
  minOrderQty: number;
  isActive: boolean;
  volumePricingTiers: unknown | null;
  productName: string;
  productImage: string | null;
  productCategory: string;
  productUnit: string;
};

export type DbVendorDashboard = {
  totalOrders: number;
  totalRevenue: number;
  totalProducts: number;
  pendingOrders: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentOrders: {
    id: string;
    customerName: string;
    total: number;
    status: string;
    createdAt: string;
  }[];
};

// ─── Slugify ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ─── MarketplaceStoresDB ──────────────────────────────────────────────────────

export const MarketplaceStoresDB = {
  /**
   * Registrar una nueva tienda en el marketplace.
   * El tenantId de la sesión del admin se usa como dueño de la tienda.
   */
  async register(params: {
    tenantId: string;
    name: string;
    description?: string;
    logo?: string;
    banner?: string;
    category?: string;
    zone?: string;
    commission?: number;
  }): Promise<DbStore> {
    const baseSlug = slugify(params.name);

    // Si ya existe el slug, agregar sufijo del tenantId
    const existing = await prisma.store.findUnique({ where: { slug: baseSlug } });
    const slug = existing ? `${baseSlug}-${params.tenantId.slice(-6)}` : baseSlug;

    const store = await prisma.store.create({
      data: {
        id:          crypto.randomUUID(),
        tenantId:    params.tenantId,
        slug,
        name:        params.name,
        description: params.description ?? null,
        logo:        params.logo ?? null,
        banner:      params.banner ?? null,
        category:    params.category ?? "bodega",
        zone:        params.zone ?? null,
        commission:  params.commission ?? 5.0,
        isPublished: false, // requiere aprobación manual
        updatedAt:   new Date(),
      },
    });

    invalidateByPrefix("marketplace:stores");

    return {
      id:          store.id,
      tenantId:    store.tenantId,
      slug:        store.slug,
      name:        store.name,
      description: store.description,
      logo:        store.logo,
      banner:      store.banner,
      category:    store.category,
      zone:        store.zone,
      rating:      store.rating,
      reviewCount: store.reviewCount,
      isPublished: store.isPublished,
      commission:  store.commission,
      createdAt:   store.createdAt.toISOString(),
    };
  },

  /**
   * Listar tiendas publicadas — usando cache de 5 minutos.
   */
  async list(params: {
    tenantId?: string;
    zone?: string;
    category?: string;
    search?: string;
    limit?: number;
  } = {}): Promise<DbStore[]> {
    const cacheKey = `marketplace:stores:list:${JSON.stringify(params)}`;

    return getOrSet(cacheKey, 300, async () => {
      const rows = await prisma.store.findMany({
        where: {
          isPublished: true,
          ...(params.tenantId && { tenantId: params.tenantId }),
          ...(params.zone     && { zone: params.zone }),
          ...(params.category && { category: params.category }),
          ...(params.search   && { name: { contains: params.search, mode: "insensitive" } }),
        },
        orderBy: { rating: "desc" },
        take:    params.limit ?? 20,
      });

      return rows.map((s) => ({
        id:          s.id,
        tenantId:    s.tenantId,
        slug:        s.slug,
        name:        s.name,
        description: s.description,
        logo:        s.logo,
        banner:      s.banner,
        category:    s.category,
        zone:        s.zone,
        rating:      s.rating,
        reviewCount: s.reviewCount,
        isPublished: s.isPublished,
        commission:  s.commission,
        createdAt:   s.createdAt.toISOString(),
      }));
    });
  },

  /**
   * Obtener tienda por slug (pública).
   */
  async getBySlug(slug: string): Promise<DbStore | null> {
    const cacheKey = `marketplace:stores:slug:${slug}`;

    return getOrSet(cacheKey, 300, async () => {
      const s = await prisma.store.findUnique({ where: { slug } });
      if (!s || !s.isPublished) return null;

      return {
        id:          s.id,
        tenantId:    s.tenantId,
        slug:        s.slug,
        name:        s.name,
        description: s.description,
        logo:        s.logo,
        banner:      s.banner,
        category:    s.category,
        zone:        s.zone,
        rating:      s.rating,
        reviewCount: s.reviewCount,
        isPublished: s.isPublished,
        commission:  s.commission,
        createdAt:   s.createdAt.toISOString(),
      };
    });
  },

  /**
   * Buscar la tienda de un tenant específico (para auth de vendedor).
   */
  async getByTenantId(tenantId: string): Promise<DbStore | null> {
    const s = await prisma.store.findFirst({ where: { tenantId } });
    if (!s) return null;

    return {
      id:          s.id,
      tenantId:    s.tenantId,
      slug:        s.slug,
      name:        s.name,
      description: s.description,
      logo:        s.logo,
      banner:      s.banner,
      category:    s.category,
      zone:        s.zone,
      rating:      s.rating,
      reviewCount: s.reviewCount,
      isPublished: s.isPublished,
      commission:  s.commission,
      createdAt:   s.createdAt.toISOString(),
    };
  },
};

// ─── MarketplaceStoreProductsDB ───────────────────────────────────────────────

export const MarketplaceStoreProductsDB = {
  /**
   * Listar productos de una tienda (con datos del catálogo).
   */
  async list(params: {
    storeId: string;
    category?: string;
    search?: string;
    sort?: "price_asc" | "price_desc";
    limit?: number;
  }): Promise<DbStoreProduct[]> {
    const cacheKey = `marketplace:store-products:${JSON.stringify(params)}`;

    return getOrSet(cacheKey, 120, async () => {
      const orderBy = params.sort === "price_desc"
        ? { retailPrice: "desc" as const }
        : { retailPrice: "asc" as const };

      const rows = await prisma.storeProduct.findMany({
        where: {
          storeId:  params.storeId,
          isActive: true,
          ...(params.category && { Product: { category: params.category } }),
          ...(params.search   && { Product: { name: { contains: params.search, mode: "insensitive" } } }),
        },
        include: {
          Product: {
            select: { id: true, name: true, image: true, category: true, unit: true },
          },
        },
        orderBy,
        take: params.limit ?? 50,
      });

      return rows.map((r) => ({
        id:                 r.id,
        storeId:            r.storeId,
        productId:          r.productId,
        retailPrice:        r.retailPrice,
        wholesalePrice:     r.wholesalePrice,
        minOrderQty:        r.minOrderQty,
        isActive:           r.isActive,
        volumePricingTiers: r.volumePricingTiers,
        productName:        r.Product.name,
        productImage:       r.Product.image,
        productCategory:    r.Product.category,
        productUnit:        r.Product.unit,
      }));
    });
  },

  /**
   * Agregar o actualizar un producto en una tienda.
   * Si ya existe la combinación storeId+productId, lo actualiza (upsert).
   */
  async upsert(params: {
    storeId: string;
    productId: number;
    retailPrice: number;
    wholesalePrice?: number;
    minOrderQty?: number;
    volumePricingTiers?: unknown;
  }): Promise<DbStoreProduct> {
    // Verificar que el producto existe en el catálogo
    const product = await prisma.product.findUnique({
      where:  { id: params.productId },
      select: { id: true, name: true, image: true, category: true, unit: true },
    });
    if (!product) throw new Error(`Producto #${params.productId} no encontrado en el catálogo`);

    const row = await prisma.storeProduct.upsert({
      where: {
        storeId_productId: { storeId: params.storeId, productId: params.productId },
      },
      create: {
        id:                 crypto.randomUUID(),
        storeId:            params.storeId,
        productId:          params.productId,
        retailPrice:        params.retailPrice,
        wholesalePrice:     params.wholesalePrice ?? null,
        minOrderQty:        params.minOrderQty ?? 1,
        isActive:           true,
        volumePricingTiers: params.volumePricingTiers ?? undefined,
      },
      update: {
        retailPrice:        params.retailPrice,
        wholesalePrice:     params.wholesalePrice ?? null,
        minOrderQty:        params.minOrderQty ?? 1,
        isActive:           true,
        volumePricingTiers: params.volumePricingTiers ?? undefined,
      },
    });

    invalidateByPrefix(`marketplace:store-products:{"storeId":"${params.storeId}`);

    return {
      id:                 row.id,
      storeId:            row.storeId,
      productId:          row.productId,
      retailPrice:        row.retailPrice,
      wholesalePrice:     row.wholesalePrice,
      minOrderQty:        row.minOrderQty,
      isActive:           row.isActive,
      volumePricingTiers: row.volumePricingTiers,
      productName:        product.name,
      productImage:       product.image,
      productCategory:    product.category,
      productUnit:        product.unit,
    };
  },

  /**
   * Desactivar (soft-delete) un producto de la tienda.
   */
  async deactivate(storeId: string, productId: number): Promise<void> {
    await prisma.storeProduct.updateMany({
      where:  { storeId, productId },
      data:   { isActive: false },
    });
    invalidateByPrefix(`marketplace:store-products:{"storeId":"${storeId}`);
  },

  /**
   * Sincronizar TODOS los productos activos del inventario de un tenant
   * como StoreProducts en su tienda del marketplace.
   * - Productos nuevos → se crean con retailPrice = product.price
   * - Productos existentes → se reactivan si estaban desactivados
   * - Productos inactivos en catálogo → se desactivan en StoreProduct
   * Retorna { created, updated, deactivated }
   */
  async syncInventory(tenantId: string, possibleTenantIds?: string[]): Promise<{ created: number; updated: number; deactivated: number }> {
    const searchIds = possibleTenantIds ?? [tenantId];

    // 1. Find the store for this tenant — search by all possible IDs
    let store = await prisma.store.findFirst({ where: { tenantId: { in: searchIds } } });
    if (!store) {
      // Auto-create store from tenant settings
      const settings = await prisma.settings.findFirst({ where: { tenantId: { in: searchIds } } });
      const storeName = settings?.businessName || "Mi Tienda";
      const slug = storeName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        || `tienda-${tenantId.slice(0, 8)}`;

      // Ensure slug is unique
      const existingSlug = await prisma.store.findUnique({ where: { slug } });
      const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

      store = await prisma.store.create({
        data: {
          id:          crypto.randomUUID(),
          tenantId,
          slug:        finalSlug,
          name:        storeName,
          description: settings?.description || null,
          logo:        settings?.logoUrl || null,
          category:    settings?.businessType || "bodega",
          zone:        settings?.deliveryZone || null,
          commission:  5.0,
          isPublished: false,
          updatedAt:   new Date(),
        },
      });
      invalidateByPrefix("marketplace:stores");
    }

    // 2. Get all catalog products for this tenant (search all possible IDs)
    const catalogProducts = await prisma.product.findMany({
      where: { tenantId: { in: searchIds }, deletedAt: null },
      select: { id: true, price: true, active: true },
    });

    // 3. Get all existing StoreProducts for this store
    const existingStoreProducts = await prisma.storeProduct.findMany({
      where: { storeId: store.id },
      select: { id: true, productId: true, isActive: true },
    });
    const existingMap = new Map(existingStoreProducts.map((sp) => [sp.productId, sp]));

    let created = 0;
    let updated = 0;
    let deactivated = 0;

    // 4. For each catalog product, upsert into StoreProduct
    for (const product of catalogProducts) {
      const existing = existingMap.get(product.id);

      if (product.active) {
        if (!existing) {
          // New product → create
          await prisma.storeProduct.create({
            data: {
              id:          crypto.randomUUID(),
              storeId:     store.id,
              productId:   product.id,
              retailPrice: product.price,
              minOrderQty: 1,
              isActive:    true,
            },
          });
          created++;
        } else if (!existing.isActive) {
          // Was deactivated → reactivate + update price
          await prisma.storeProduct.update({
            where: { id: existing.id },
            data:  { isActive: true, retailPrice: product.price },
          });
          updated++;
        }
        // If already active, skip (don't override manual price changes)
      } else {
        // Product is inactive in catalog → deactivate in store if exists and active
        if (existing && existing.isActive) {
          await prisma.storeProduct.update({
            where: { id: existing.id },
            data:  { isActive: false },
          });
          deactivated++;
        }
      }
    }

    invalidateByPrefix(`marketplace:store-products`);

    return { created, updated, deactivated };
  },
};

// ─── MarketplaceOrdersDB ──────────────────────────────────────────────────────

type CartItem = {
  storeProductId: string;
  productId: number;
  name: string;
  quantity: number;
  retailPrice: number;
  unit: string;
};

export type DbMarketplaceOrder = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  sellerTenantId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  total: number;
  commission: number;
  status: string;
  createdAt: string;
};

export const MarketplaceOrdersDB = {
  /**
   * Crear un pedido en el sistema del vendedor con source="marketplace".
   * Un pedido por tienda (cada tienda es un tenant distinto).
   */
  async createFromCart(params: {
    storeSlug: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    notes?: string;
    items: CartItem[];
  }): Promise<DbMarketplaceOrder> {
    // 1. Cargar tienda y verificar que esté publicada
    const store = await prisma.store.findUnique({
      where:  { slug: params.storeSlug },
      select: { id: true, tenantId: true, name: true, slug: true, isPublished: true, commission: true },
    });
    if (!store || !store.isPublished) {
      throw new Error("Tienda no disponible");
    }

    // 2. Verificar que todos los items pertenecen a esta tienda y calcular totales
    const storeProductIds = params.items.map((i) => i.storeProductId);
    const storeProducts = await prisma.storeProduct.findMany({
      where: { id: { in: storeProductIds }, storeId: store.id, isActive: true },
      select: { id: true, productId: true, retailPrice: true, minOrderQty: true },
    });

    if (storeProducts.length !== storeProductIds.length) {
      throw new Error("Uno o más productos no están disponibles en esta tienda");
    }

    // Mapa de precio real (server-side — nunca confiar en el precio del cliente)
    const priceMap = new Map(storeProducts.map((sp) => [sp.id, sp.retailPrice]));

    const orderItems = params.items.map((item) => {
      const unitPrice = priceMap.get(item.storeProductId) ?? item.retailPrice;
      return {
        productId: item.productId,
        name:      item.name,
        price:     unitPrice,
        quantity:  item.quantity,
        unit:      item.unit,
        image:     "",
      };
    });

    const total      = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const commission = parseFloat(((total * store.commission) / 100).toFixed(2));

    // 3. Crear el Order en el tenant del vendedor
    const orderId = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();

    await prisma.order.create({
      data: {
        id:               `MKT-${orderId}`,
        tenantId:         store.tenantId,
        source:           "marketplace",
        customerName:     params.customerName,
        customerPhone:    params.customerPhone,
        customerLocation: params.customerAddress,
        total,
        notes:            params.notes ?? null,
        paymentMethod:    "marketplace",
        updatedAt:        new Date(),
        OrderItem: {
          create: orderItems,
        },
      },
    });

    // 4. Registrar comisión
    await prisma.commissionLedger.create({
      data: {
        id:      crypto.randomUUID(),
        orderId: `MKT-${orderId}`,
        storeId: store.id,
        type:    "sale",
        amount:  commission,
        rate:    store.commission,
        status:  "pending",
      },
    });

    return {
      id:             `MKT-${orderId}`,
      storeId:        store.id,
      storeName:      store.name,
      storeSlug:      store.slug,
      sellerTenantId: store.tenantId,
      customerName:   params.customerName,
      customerPhone:  params.customerPhone,
      customerAddress: params.customerAddress,
      notes:           params.notes ?? null,
      total,
      commission,
      status:         "pendiente",
      createdAt:      new Date().toISOString(),
    };
  },

  /**
   * Dashboard del vendedor: estadísticas de ventas, productos y pedidos recientes.
   * El tenantId del vendedor filtra únicamente sus datos.
   */
  async getVendorDashboard(tenantId: string): Promise<DbVendorDashboard> {
    const cacheKey = `marketplace:vendor:dashboard:${tenantId}`;

    return getOrSet(cacheKey, 60, async () => {
      const [allOrders, store] = await Promise.all([
        prisma.order.findMany({
          where: {
            tenantId,
            source:    "marketplace",
            deletedAt: null,
          },
          select: {
            id:           true,
            customerName: true,
            total:        true,
            status:       true,
            createdAt:    true,
            OrderItem: {
              select: { name: true, quantity: true, price: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take:    100,
        }),
        prisma.store.findFirst({
          where:  { tenantId },
          select: { id: true },
        }),
      ]);

      const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0);
      const pendingOrders = allOrders.filter(
        (o) => o.status === "pendiente" || o.status === "confirmado",
      ).length;

      // Agregar ventas por producto
      const productSales = new Map<string, { quantity: number; revenue: number }>();
      for (const order of allOrders) {
        for (const item of order.OrderItem) {
          const existing = productSales.get(item.name) ?? { quantity: 0, revenue: 0 };
          productSales.set(item.name, {
            quantity: existing.quantity + item.quantity,
            revenue:  existing.revenue + item.price * item.quantity,
          });
        }
      }

      const topProducts = Array.from(productSales.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      const totalProducts = store
        ? await prisma.storeProduct.count({ where: { storeId: store.id, isActive: true } })
        : 0;

      return {
        totalOrders:  allOrders.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProducts,
        pendingOrders,
        topProducts,
        recentOrders: allOrders.slice(0, 10).map((o) => ({
          id:           o.id,
          customerName: o.customerName,
          total:        o.total,
          status:       o.status,
          createdAt:    o.createdAt.toISOString(),
        })),
      };
    });
  },

  /**
   * Get today's marketplace orders for a specific tenant (for daily summary).
   */
  async getTodayOrders(tenantId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return prisma.order.findMany({
      where: {
        tenantId,
        source: "marketplace",
        createdAt: { gte: startOfDay },
        deletedAt: null,
      },
      select: {
        id: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
        OrderItem: { select: { name: true, quantity: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
};

// ─── MarketplaceReviewsDB ─────────────────────────────────────────────────────

export const MarketplaceReviewsDB = {
  /**
   * Get approved reviews for a store (public).
   */
  async getByStore(storeId: string) {
    return prisma.review.findMany({
      where: { storeId, status: "approved", deletedAt: null },
      select: {
        id: true, name: true, text: true, rating: true,
        date: true, adminReply: true, adminReplyDate: true,
      },
      orderBy: { date: "desc" },
      take: 50,
    });
  },

  /**
   * Get aggregate rating for a store.
   */
  async getStoreRating(storeId: string): Promise<{ rating: number; count: number }> {
    const result = await prisma.review.aggregate({
      where: { storeId, status: "approved", deletedAt: null },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      rating: Math.round((result._avg.rating ?? 0) * 10) / 10,
      count: result._count.rating,
    };
  },

  /**
   * Add a review for a marketplace store (public, status=pending).
   */
  async add(params: {
    storeId: string;
    name: string;
    text: string;
    rating: number;
    phone?: string;
  }) {
    // Verify store exists
    const store = await prisma.store.findUnique({
      where: { id: params.storeId },
      select: { id: true, tenantId: true },
    });
    if (!store) throw new Error("Tienda no encontrada");

    const review = await prisma.review.create({
      data: {
        id: crypto.randomUUID(),
        name: params.name,
        text: params.text,
        rating: params.rating,
        phone: params.phone ?? null,
        storeId: params.storeId,
        tenantId: store.tenantId,
        status: "pending",
        date: new Date(),
      },
      select: {
        id: true, name: true, text: true, rating: true,
        date: true, status: true,
      },
    });

    return review;
  },
};

// ─── MarketplaceAbandonedCartsDB ──────────────────────────────────────────────

type AbandonedCartItem = {
  storeProductId: string;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export const MarketplaceAbandonedCartsDB = {
  /**
   * Save/update a marketplace cart for recovery tracking.
   * Called when user enters customer info in checkout.
   */
  async save(params: {
    storeSlug: string;
    customerName: string;
    customerPhone: string;
    items: AbandonedCartItem[];
    total: number;
  }) {
    // Upsert: if same phone + storeSlug exists and not recovered, update it
    const existing = await prisma.marketplaceAbandonedCart.findFirst({
      where: {
        storeSlug: params.storeSlug,
        customerPhone: params.customerPhone,
        recovered: false,
        convertedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      return prisma.marketplaceAbandonedCart.update({
        where: { id: existing.id },
        data: {
          customerName: params.customerName,
          itemsJson: JSON.stringify(params.items),
          total: params.total,
        },
      });
    }

    return prisma.marketplaceAbandonedCart.create({
      data: {
        id:           crypto.randomUUID(),
        storeSlug:    params.storeSlug,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        itemsJson:    JSON.stringify(params.items),
        total:        params.total,
        updatedAt:    new Date(),
      },
    });
  },

  /**
   * Mark a cart as converted (order was placed).
   */
  async markConverted(storeSlug: string, customerPhone: string) {
    await prisma.marketplaceAbandonedCart.updateMany({
      where: {
        storeSlug,
        customerPhone,
        recovered: false,
        convertedAt: null,
      },
      data: { convertedAt: new Date(), recovered: true },
    });
  },

  /**
   * Get abandoned carts that haven't been converted and haven't received a reminder.
   * Only carts older than `hoursOld` hours.
   */
  async getAbandoned(hoursOld = 2) {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);

    return prisma.marketplaceAbandonedCart.findMany({
      where: {
        recovered: false,
        convertedAt: null,
        reminderSentAt: null,
        createdAt: { lte: cutoff },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
  },

  /**
   * Mark reminder as sent for a cart.
   */
  async markReminderSent(id: string) {
    await prisma.marketplaceAbandonedCart.update({
      where: { id },
      data: { reminderSentAt: new Date() },
    });
  },
};
