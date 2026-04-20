// Read-model DTO — shape que devuelve la API marketplace.
//
// Separación CQRS-light: el Order de dominio (domain/order/order.ts) modela
// invariantes y reglas de transición. El DTO de aquí es la vista de lectura
// rica, incluyendo campos que NO son del dominio (totalCogs, couponDiscount,
// source, etc.) y que las UI/frontend consumen directamente.
//
// Regla: endpoints de LECTURA usan findByIdDto → OrderDto.
// Endpoints de ESCRITURA usan findById → Order de dominio → save().

export interface OrderItemDto {
  readonly id: number;
  readonly productId: number;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
  readonly unit: string;
  readonly image: string | null;
  readonly costPrice: number | null;
}

export interface OrderDto {
  readonly id: string;
  readonly tenantId: string;
  readonly source: string;
  readonly status: string;
  readonly customerPhone: string | null;
  readonly customerName: string;
  readonly customerLocation: string;
  readonly customerReference: string;
  readonly total: number;
  readonly couponDiscount: number | null;
  readonly discountAmount: number | null;
  readonly totalCogs: number | null;
  readonly cancelReason: string | null;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly items: readonly OrderItemDto[];
}
