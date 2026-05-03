# `components/admin/unified/marketplace/` — REFACTOR WIP

⚠️ **Estado: PARCIAL — no usado en runtime aún.**

## Contexto

`MarketplaceModule.tsx` tiene 5,537 líneas (el archivo no-generado más grande del repo). En sesión 2026-05-03 un agente paralelo (Refactoring Expert) extrajo el código a sub-componentes pero NO completó el wire-up: el archivo padre sigue con su lógica original y NO importa los sub-componentes.

## Estado actual

| Archivo | Líneas | Status |
|---|---|---|
| `types.tsx` | 118 | ✅ Tipos compartidos extraídos |
| `tabs/DashboardTab.tsx` | 767 | ✅ Extraído, sin integrar |
| `tabs/TiendaTab.tsx` | 563 | ✅ Extraído, sin integrar |
| `tabs/ProductosTab.tsx` | 430 | ✅ Extraído, sin integrar |
| `tabs/ComisionesTab.tsx` | 354 | ✅ Extraído, sin integrar |
| `tabs/CuponesTab.tsx` | 383 | ✅ Extraído, sin integrar |
| `tabs/FidelidadTab.tsx` | 363 | ✅ Extraído, sin integrar |
| `tabs/ResenasTab.tsx` | 427 | ✅ Extraído, sin integrar |
| `tabs/OrdenesTab.tsx` | 339 | ✅ Extraído, sin integrar |
| `tabs/OrdenTab.tsx` | 812 | ✅ Extraído, sin integrar |
| **TOTAL** | **4,556 líneas** | **⏳ ESPERANDO INTEGRACIÓN** |

## Próximos pasos para completar

1. Modificar `components/admin/unified/MarketplaceModule.tsx`:
   - Eliminar el código duplicado que ahora vive en los sub-tabs
   - Importar los sub-tabs vía `next/dynamic` (lazy load por tab)
   - Usar el tab activo (`activeTab` state) para renderizar solo el tab correspondiente
   - Pasar las props necesarias (state, handlers compartidos)

2. Verificar:
   - `tsc --noEmit` exit=0
   - Visual: cada tab del módulo Marketplace renderiza igual que antes
   - No hay regresiones en navegación entre tabs

3. Eliminar el código duplicado de `MarketplaceModule.tsx` (debería quedar ~400-600 líneas como wrapper).

## Por qué no se completó en la sesión

El agente paralelo hizo extracción mecánica pero el wire-up requiere:
- Decisiones sobre props compartidas (state lifting vs context)
- Verificación visual tab-por-tab
- Posiblemente fixes de imports cruzados entre tabs

Esto es trabajo de 30-60 min que merece su propia sesión enfocada.

## Si quieres revertir

```bash
rm -rf components/admin/unified/marketplace/
```

(El `MarketplaceModule.tsx` original sigue funcionando, este dir es 100% código nuevo no referenciado.)
