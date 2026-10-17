# ADR-381 — Plazos por trámite y aviso T-3

**Status:** Accepted
**Fecha:** 2026-08-22
**Autor:** Brandon (Buleje) + Claude Code

## 1. Contexto

`forestal-tramites` ya avisaba de dos plazos, los dos genéricos:

- `tramitesSinRespuesta` (`tramites-registro.ts`) — 15 días fijos desde
  `fechaPresentacion` para TODOS los formatos por igual, y sólo mira hacia
  ATRÁS (ya pasaron 15 días sin que la autoridad responda).
- `avisoPlazoRelacion` (`tramites-relacion-guias.ts`) — específico del formato
  con `correlativo` (relación de guías SERFOR), no generaliza al resto.

Ninguno de los dos cubre el caso real: un trámite que responde a una
notificación con plazo LEGAL propio (ej. "Descargo ante una supervisión"
OSINFOR) — cada uno de los 9 formatos del catálogo vence en un número de días
distinto según su norma/TUPA, y el aviso tiene que llegar ANTES del
vencimiento, no 15 días después de presentado (que para un trámite que
todavía no se presentó no dice nada).

La "regla de honestidad legal" del módulo (`tramites-catalogo.ts`) prohíbe que
el catálogo invente un plazo fijo por formato: cada TUPA/norma sectorial
cuenta distinto y el sistema no lo sabe con certeza para los 25 gobiernos
regionales de Perú. Un número de días por formato, hardcodeado, sería
exactamente el tipo de dato fabricado que el módulo evita a propósito.

## 2. Decisión

Campo `fechaLimite` (date-only, `YYYY-MM-DD`) en `TramiteRegistro`/
`TramiteInput` (`lib/forestal/tramites-registro.ts`), **siempre tipeado por el
operador** — nunca derivado ni sugerido por el catálogo. El formato
`descargo-osinfor` ya tenía el campo `fechaNotificacion` (la fecha que dispara
el plazo real); `fechaLimite` es donde el operador anota el resultado de esa
cuenta, la que sabe por la notificación o por su TUPA.

Dos funciones puras nuevas:

- `diasHastaLimite(t, hoy)` — resta simple, negativo si ya venció.
- `tramitesPorVencer(lista, hoy, diasAntes = 3)` — trámites vivos (ni
  `resuelto` ni `desistido`) con `fechaLimite` cargada, a `diasAntes` días o
  menos del vencimiento (incluye vencidos).

Tres superficies, todas leyendo el mismo par de funciones (single source):

1. **Campo** en la sección "Seguimiento" de `TramiteCamposPanel` (junto a
   `fechaPresentacion`), con hint explícito de que el sistema no inventa el
   número.
2. **Chip en vivo** en la cabecera de `TramiteFormulario` mientras se edita
   (mismo lugar que el chip de N° correlativo) — "Vence en N días" / "Venció
   hace N días", tono `warning` (≤3 días o vencido) o neutro.
3. **Banner proactivo** en `ForestalTramites` arriba del catálogo — ANTES del
   aviso de Ficha CTP incompleta, porque un plazo legal pesa más que un
   membrete — y **chip por fila** en `TramitesExpediente`, con el mismo tono.

`tramitesSinRespuesta` (15 días genérico) NO se toca ni se reemplaza: sigue
siendo el recordatorio de "andá a preguntar" para lo ya presentado. Son dos
relojes distintos — uno mira hacia atrás (¿la autoridad tarda?), el otro hacia
adelante (¿me queda tiempo?) — y conviven.

## 3. Consecuencias

### Positivas

- El aviso llega ANTES del vencimiento (T-3 configurable), no después.
- Cero plazos legales inventados: el dato siempre lo carga quien conoce el
  caso real.
- Tres superficies comparten las mismas dos funciones puras — un cambio de
  criterio (ej. T-3 → T-5) se hace en un solo lugar.

### Negativas

- El aviso depende de que el operador cargue `fechaLimite` a mano — si no la
  carga, no hay aviso (igual que `fechaPresentacion` hoy).
- Un noveno campo en la grilla de "Seguimiento" (`sm:grid-cols-2
  lg:grid-cols-4`) rompe la cuadrícula pareja — se acepta el wrap.

### Migraciones requeridas

Ninguna — `ForestTramitesDB` guarda en KV (`PlatformSettingsDB`), sin schema
Prisma que migrar. Los trámites existentes sin `fechaLimite` siguen
funcionando (`null`, sin aviso).

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| `plazoDias` fijo por formato en el catálogo | Cero tipeo para el operador | Inventa un número de días que varía por TUPA/región — rompe la regla de honestidad legal del módulo | Descartada |
| Sólo bajar el umbral de `tramitesSinRespuesta` (ej. de 15 a 3 días) | Cambio mínimo | Sigue siendo genérico para los 9 formatos y sigue mirando hacia atrás (post-presentación), no resuelve "avisame ANTES" | Descartada |
| Integración con la API de SNIFFS para traer el plazo real | Dato oficial, cero tipeo | El SNIFFS no tiene API pública para esto (ya documentado en `relacion-guias-serfor`); complejidad alta, beneficio incierto | Descartada por ahora |

## 5. Verificación

- [x] Verificado end-to-end en navegador (Playwright, tenant real): campo →
  chip en vivo en el formulario → banner en el shell → chip en Expediente,
  con `fechaLimite` a 2 días → "Vence en 2 días" en las tres superficies.
- [x] `eslint` + `tsgo --noEmit` en verde en los 7 archivos tocados.
- [ ] Tests unitarios de `diasHastaLimite`/`tramitesPorVencer` (pendiente —
  son funciones puras, fáciles de cubrir cuando se toque el módulo de nuevo).
- [x] Memoria actualizada (sesión 2026-08-22).
- [x] Rollback: revertir el commit — sin migración de datos que deshacer.

## 6. Referencias

- ADR-308 — módulo Trámites y Oficios (base).
- ADR-364 (relación de guías) — mismo archivo `tramites-catalogo.ts`, mismo
  patrón de "no inventar códigos oficiales".
- Sesión 2026-08-22: priorización externa vía Claude.ai (erp-saas-architect),
  ítem #1 de "alto impacto" — grounded contra un caso real del operador
  (notificación con plazo respondida tarde por falta de aviso previo).
