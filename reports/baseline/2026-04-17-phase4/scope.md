# Phase 4 — Admin estructural fixes (2026-04-17)

## Cambios

| Bucket | Área | Archivos | Resultado |
|---|---|---|---|
| A | Routing | tab-migration, tabs.types | Cotizaciones/Contratos/NotasCredito/GuiasRemision ya NO caen en Compras |
| B | Onboarding | OnboardingWizard | 5 blues → teal brand |
| C | Préstamos | PrestamosModule, PrestamosDashboard | Tab-bar blue→teal; 60+ instancias bg-blue→var(--accent); chart hex→tokens |
| D | Fiados | FiadosModule, FiadoStats | Elimina search+chips duplicados; rojo "Nuevos" → neutro |
| E | Facturación | EInvoiceTab | Header interno eliminado; KPIs bg-soft → surface uniforme con top-stripe semántico |
| F | Notas Crédito | NotasCreditoModule | Placeholder "n\u000famero" → "número"; emoji + motivoColors → tokens |
| G | Sidebar + purge | tab-categories + 36 archivos | 77 reemplazos purple/violet; 8 finales (dark:* residuales) |

## Métricas antes/después

| Métrica | Pre | Post |
|---|---|---|
| TSC errors | 0 | 0 |
| bg-blue-{3-7} en components/admin | 3 | **0** |
| text-blue-{3-7} en components/admin | 3+ | **0** |
| text/bg-purple-* + text/bg-violet-* en components/admin | 53 | **0** |
| Tabs routing a módulos correctos (doc tabs) | 0/4 | **4/4** |
| Search+chips duplicados en Fiados | 2 sets | **1 set** |
| Headers duplicados en Facturación | 2 | **1** |
| Commits atómicos | — | **8** |
| HUSKY bypass | 0 | **0** |

## Commits

```
ac647140 fix(admin): finalize sweep — 0 blue + 0 purple/violet (G2)
03d1bd3e fix(admin): sidebar icon consistency + sweep purple/violet (G)
612e27e5 fix(admin): notas-credito — fix placeholder encoding (F)
169ef6b7 fix(admin): facturacion — consolidate header + uniform KPIs (E)
294316cc fix(admin): fiados — remove duplicate search/chips (D)
c959c6cd fix(admin): prestamos — remove blue tabs + saturated colors (C)
5150f91a fix(admin): remove non-brand blue from onboarding wizard (B)
f6348241 fix(admin): route cotizaciones/contratos/notas-credito/guias-remision (A)
```

## Evidencia visual

`reports/visual-verify/2026-04-17-admin/` → pre-fix (screenshots originales)
`reports/visual-verify/2026-04-17-phase4-post/` → post-fix
