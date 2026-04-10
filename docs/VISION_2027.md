# VISION 2027 — Bodega San Martín

> De bodega familiar en Pucallpa a plataforma SaaS para 100 bodegas en Perú.

**Última actualización:** 2026-04-10
**Autor:** Brandon (Buleje) + Claude Code
**Estado:** Documento vivo — actualizar cada sprint

---

## 1. Visión SaaS Multi-Tenant

### De dónde venimos
Una bodega familiar en Pucallpa que vendía con cuaderno y calculadora. Hoy: un ERP digital con 131 modelos de datos, 485+ endpoints, sistema de pagos (Stripe + MercadoPago + Yape), y gestión de inventario FEFO.

### A dónde vamos
**Bodega San Martín no es un software para UNA bodega. Es una PLATAFORMA para TODAS las bodegas.**

| Fase | Período | Meta | Tenants | MRR objetivo |
|---|---|---|---|---|
| **Alpha** | 2026 Q1-Q2 | Bodega propia funcionando al 100% | 1 | $0 (uso interno) |
| **Beta cerrada** | 2026 Q3-Q4 | 5 bodegas piloto en Pucallpa | 5 | $250 |
| **Beta abierta** | 2027 Q1 | 20 bodegas en Ucayali | 20 | $1,000 |
| **Lanzamiento** | 2027 Q2 | 50 bodegas en Perú | 50 | $2,500 |
| **Escala** | 2027 Q3-Q4 | 100 bodegas + marketplace | 100 | $5,000+ |

### Propuesta de valor por tipo de bodega

| Tipo | Dolor actual | Solución BSM | Precio sugerido |
|---|---|---|---|
| **Bodega familiar** (1-2 personas) | Cuaderno, no sabe cuánto vende | POS digital + inventario + WhatsApp | $30/mes |
| **Bodega mediana** (3-5 personas) | Excel, pierde dinero en fiados | Todo lo anterior + fiado digital + reportes | $50/mes |
| **Mini-market** (5+ personas) | Software caro, no adaptado | Todo + multi-cajero + delivery + SUNAT | $100/mes |

---

## 2. Ruta Económica

### Hitos de ingresos

| Hito | Tenants | MRR | Señal |
|---|---|---|---|
| **$0 → $1k MRR** | ~20 bodegas | $1,000 | Validación de mercado. El producto resuelve un dolor REAL. |
| **$1k → $10k MRR** | ~100-200 bodegas | $10,000 | Product-market fit confirmado. Momento de buscar inversión si se quiere. |
| **$10k → $100k MRR** | ~1,000-2,000 bodegas | $100,000 | Escala nacional. Necesita equipo de soporte + ventas. |

### Modelo de costos actual (ultra-lean)

| Recurso | Costo mensual | Notas |
|---|---|---|
| Supabase (Pro) | $25 | DB + Auth + Storage |
| Vercel (Pro) | $20 | Hosting + Functions |
| Claude Code (Max) | $200 | "Equipo de desarrollo" virtual |
| Dominio + DNS | $15/año | buleje.pe |
| **Total** | **~$250/mes** | Breakeven = 5 bodegas a $50 |

### Unit economics

```
Precio promedio por bodega: $50/mes
Costo marginal por bodega: ~$3/mes (DB rows + compute)
Margen bruto: 94%
CAC estimado: $20-50 (WhatsApp + visitas en persona)
LTV estimado (12 meses): $600
LTV/CAC ratio: 12-30x (excepcional)
```

---

## 3. Tecnologías 2027 a Vigilar

| Tecnología | Por qué importa para BSM | Cuándo evaluar |
|---|---|---|
| **Claude 5 / Opus next-gen** | Agentes más baratos y capaces. Más autonomía nocturna. | Cuando salga |
| **Edge AI (on-device)** | POS offline en zonas sin internet (selva). | 2027 Q1 |
| **Voice-first commerce** | "Alexa, ¿cuánto debo en la bodega?" para clientes iletrados. | 2027 Q2 |
| **Vercel Queues GA** | Reemplazar BullMQ + Redis con infra managed. | Cuando salga de beta |
| **React Server Components maturo** | Reducir bundle JS a casi 0. | Ya disponible, adoptar progresivamente |
| **WhatsApp Business Platform** | Pagos dentro de WhatsApp + chatbot con IA. | 2026 Q4 |
| **SUNAT API v2** | Facturación electrónica simplificada. | Cuando SUNAT la lance |
| **Yape Business API** | Cobros directos sin QR manual. | 2026 Q3 si disponible |

### Apuestas tecnológicas (dónde invertir tiempo)

1. **WhatsApp como canal principal** — El 80% de los clientes de bodegas usan WhatsApp, no apps. Invertir fuerte en integración.
2. **IA para predicción de demanda** — Saber qué producto se va a acabar ANTES de que se acabe. Diferenciador gigante vs competencia.
3. **Offline-first** — La selva tiene internet intermitente. El POS debe funcionar sin conexión y sincronizar después.

---

## 4. Decisiones que NO Tomar (Anti-patterns que Matan Startups)

### ❌ Lo que NO hacer

| Anti-pattern | Por qué mata | Qué hacer en su lugar |
|---|---|---|
| **Multi-país antes de $10k MRR** | Cada país = regulaciones, moneda, impuestos, idioma. Multiplica complejidad 5x. | Dominar Perú primero. Multi-país recién con $50k+ MRR. |
| **App nativa antes de validar** | 6 meses + $50k mínimo. Si el producto no funciona, se perdió todo. | PWA + Capacitor (ya lo tenemos). App nativa solo si hay demanda comprobada. |
| **Hardware propio (POS físico)** | Inventario, logística, soporte, garantías. Nightmare operativo. | Usar tablets/celulares del cliente + reader Bluetooth si necesario. |
| **Scope creep ("agreguemos delivery")** | Cada feature nueva = 3 meses de desarrollo + soporte infinito. | Fiado digital + inventario FEFO + SUNAT son los 3 diferenciadores. NADA MÁS hasta $5k MRR. |
| **Pricing por features** | Complejidad de billing, confusión para el cliente. | 1 plan por tamaño de bodega ($30/$50/$100). Simple. |
| **Contratar antes de tiempo** | Cash burn sin product-market fit. | Claude Code ES el equipo de desarrollo. Contratar solo para ventas/soporte después de $5k MRR. |
| **Competir con grandes (SAP, Odoo)** | Nunca vas a ganar en features. | Ganar en SIMPLICIDAD + LOCALIZACIÓN. Una señora de 55 años en Pucallpa debe poder usarlo. |

### ✅ Los 3 diferenciadores que sí importan

1. **Fiado Digital** — Ningún software en Perú gestiona el fiado (crédito informal) bien. BSM tiene score crediticio + planes de pago + recordatorios WhatsApp. Esto SOLO existe aquí.
2. **Inventario FEFO** — Para bodegas que venden productos perecibles. Alerta de vencimiento + rotación automática. Casi ningún POS barato tiene esto.
3. **Integración SUNAT nativa** — Boletas y facturas electrónicas sin terceros. El bodeguero no necesita un contador para cumplir con SUNAT.

---

## 5. Métricas North Star

| Métrica | Por qué importa | Meta 2027 |
|---|---|---|
| **Tenants activos** | Cuántas bodegas usan BSM diariamente | 100 |
| **GMV mensual** | Volumen total de ventas procesadas | $500k+ |
| **Retención 30 días** | % de bodegas que siguen usando después de 1 mes | > 80% |
| **NPS** | ¿Lo recomendarían? | > 50 |
| **Tiempo promedio de onboarding** | De "no conozco" a "vendiendo" | < 30 min |
| **Fiados cobrados / Fiados emitidos** | Efectividad del sistema de fiado digital | > 70% |

---

## 6. Timeline de Ejecución

```
2026 Q2 (AHORA):
├─ ✅ ERP funcionando (131 modelos, 485 endpoints)
├─ ✅ Multi-tenant activo
├─ ✅ Autonomía Level 5 (24 agentes, 22 skills)
├─ 🔄 Fiado Digital Phase 1 (ADR-021)
├─ 🔄 SUNAT integration (boleta electrónica)
└─ 🔄 Onboarding wizard para nuevos tenants

2026 Q3:
├─ Beta cerrada con 5 bodegas piloto
├─ WhatsApp Bot para pedidos
├─ Reportes de venta para bodegueros
└─ Mobile app básica (Capacitor)

2026 Q4:
├─ Beta abierta 20 bodegas
├─ Yape integración directa
├─ IA predicción de demanda v1
└─ Offline-first POS

2027 Q1-Q2:
├─ Lanzamiento 50 bodegas
├─ Marketplace entre bodegas
├─ Edge AI para zonas sin internet
└─ Voice commerce pilot
```

---

> Este documento es la brújula. Cada feature, ADR, y sprint debe acercarnos a esta visión.
> Si una tarea no contribuye a los 3 diferenciadores o a las métricas North Star, cuestionar si vale la pena.
