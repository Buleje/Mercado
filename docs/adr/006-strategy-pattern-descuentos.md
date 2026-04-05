# ADR-006: Strategy Pattern para cálculo de descuentos

## Estado
✅ Aceptada

## Fecha
2026-04-03

## Contexto
El sistema tenía la lógica de descuentos repartida en múltiples archivos:
- `lib/currency.ts` con `calculateDiscount()` básico
- `lib/agents/domains/pricing.agent.ts` con descuentos por volumen
- `CheckoutModal.tsx` con aplicación de cupones

Añadir un nuevo tipo de descuento (ej: primera compra, bundle) requería
modificar código existente → riesgo de romper algo.

## Opciones consideradas

### Opción A: Seguir con if/else en cada archivo
- ✅ Simple, ya existe
- ❌ Cada nuevo descuento toca 3+ archivos
- ❌ Difícil de testear cada tipo de descuento por separado

### Opción B: Strategy Pattern con DiscountEngine
- ✅ Cada descuento es una clase independiente
- ✅ Añadir nuevo descuento = nueva clase, cero cambios en código existente
- ✅ Cada estrategia se testea de forma aislada
- ❌ Un poco más de código inicial

## Decisión
Elegimos **Strategy Pattern** (`lib/pricing/discount-strategies.ts`):
- `IDiscountStrategy` define el contrato
- 4 estrategias: Volumen, Fidelidad, Cupón, Primera Compra
- `DiscountEngine` aplica todas y selecciona la mejor (no se acumulan)

## Consecuencias

### Positivas
- Nuevo descuento = nueva clase que implementa `IDiscountStrategy`
- Tests unitarios simples por estrategia
- El engine previene "double-dipping" (aplicar todos los descuentos a la vez)

### Negativas
- La integración con CheckoutModal requiere refactorizar gradualmente

### Riesgos
- Si se permite acumular descuentos en el futuro, cambiar el engine
