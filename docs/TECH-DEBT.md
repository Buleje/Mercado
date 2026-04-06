# Deuda Técnica — Bodega San Martín

> **Regla:** Dedicar ~20% de cada sesión a reducir deuda técnica.
> Actualizar este archivo cuando se identifique o resuelva deuda.

## 🔴 Alta prioridad (afecta estabilidad o seguridad)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| TD-001 | CheckoutModal | Archivo de 119 KB / 2018 líneas — difícil de mantener y testear | Riesgo de regresión en cada cambio | 🔓 Abierto |
| TD-002 | Prisma migration | Modelos AIConversation/AIMessage en schema sin migrar | Memoria IA no persiste datos | 🔓 Abierto |
| TD-003 | A/B testing + Quality eval | Métricas en memoria — se pierden al reiniciar servidor | Pérdida de datos de experimentos | 🔓 Abierto |

## 🟠 Media prioridad (afecta desarrollo o rendimiento)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| TD-004 | API endpoints | Varios endpoints usan OFFSET en vez de cursor pagination | Degradación con tablas grandes | 🔓 Abierto |
| TD-005 | N+1 queries | No hay detección sistemática de queries N+1 | Posible lentitud oculta | 🔓 Abierto |
| TD-006 | Cache | lib/cache.ts soporta Redis pero usa memoria por default | No escala con múltiples instancias | 🔓 Abierto |
| TD-007 | Descuentos | Lógica de descuentos fragmentada (currency.ts, pricing.agent, checkout) | Strategy Pattern creado pero no integrado al checkout | 🔓 Abierto |

## 🟡 Baja prioridad (mejora calidad a largo plazo)

| ID | Área | Descripción | Impacto | Estado |
|----|------|-------------|---------|--------|
| TD-008 | Documentación | No hay OpenAPI/Swagger spec para los 90+ endpoints | Onboarding más lento, no hay contrato formal | 🔓 Abierto |
| TD-009 | Tracing | instrumentation.ts solo valida env vars, no tracing real | Difícil debuggear en producción | 🔓 Abierto |
| TD-010 | DB classes | Sin interfaces formales (IProductsDB, IOrdersDB) | Dificulta mocking en tests | 🔓 Abierto |

## ✅ Resueltas

| ID | Área | Descripción | Resuelto en |
|----|------|-------------|-------------|
| — | — | (se llenará conforme se resuelvan items) | — |

---

**Cómo agregar deuda técnica:**
1. Asignar ID consecutivo (TD-XXX)
2. Describir claramente el problema
3. Clasificar prioridad: 🔴 Alta / 🟠 Media / 🟡 Baja
4. Mover a "Resueltas" cuando se arregle
