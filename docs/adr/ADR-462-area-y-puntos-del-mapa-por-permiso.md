# ADR-462 — El área y los puntos del mapa del Libro TH se guardan por permiso

- **Estado:** aceptado (2026-10-02). Sin cambio de schema (cero DDL).
- **Relacionados:** ADR-305 (Libro TH), ADR-459 (plantación sin censo), ADR-461 (importar guías); memoria `loth-permiso-unico-del-libro` (un solo permiso para todo el libro, commit del 02-10).
- **Pedido (Brandon, 02-10):** «escoger el permiso y aparecerse ahí el mapa y los detalles de tala y DEMAs según el permiso, o poner el permiso y crear los puntos». Eligió «Área y puntos por permiso».

## Contexto (medido, sólo lectura)

El libro ya filtra todo por el permiso de la banda, salvo el plano. El área (parcela) y la cartografía (referencias, vías, accesos, predio) **no son modelos Prisma**: son un documento JSON por negocio en `PlatformSetting`.

| Dato | Dónde | Clave |
|---|---|---|
| Área (vértices) | `lib/db/forest-loth-parcela.db.ts:24` | `loth-parcela:{tenantId}` |
| Referencias, vías, accesos, predio | `lib/db/forest-loth-cartografia.db.ts:22` | `loth-cartografia:{tenantId}` |

| Negocio | Área | Cartografía | Planes vivos |
|---|---|---|---|
| Blas | 4 vértices | 2 referencias · 15 vías «(propuesta)» · predio vacío | 3 |
| main | 20 vértices | 2 referencias · 2 accesos | 2 |

En Blas, 3 de las 4 talas con GPS caen dentro del área y las tres son de `PLANTACION 19-SEC/REG-PLT-2025-096`: el área es de hecho de ese plan, pero se ve igual en los tres.

## Decisión

1. **Una clave de `PlatformSetting` por plan**, con la misma forma de documento: `loth-parcela:{tid}:{planId}` y `loth-cartografia:{tid}:{planId}`. La clave actual pasa a significar «del negocio / sin permiso». Helper puro `lib/forestal/loth-alcance-geo.ts` (`claveGeo`, `alcanceDeLectura`); `planId` validado (`/^[A-Za-z0-9_-]{1,64}$/`) y, en las rutas, contra el tenant y vivo (`ForestPlanDB.getPlan`, como el POST de GTF).
2. **Lectura con el criterio de `cumplePermiso`**: Todos → el del negocio + todos los planes vivos; `sin-plan` → sólo el del negocio; `planId=X&solo=1` → sólo X; `planId=X` → X, y si X no tiene área, la del negocio marcada `heredada`.
3. **Escritura al permiso de la banda.** Con «Todos», dibujar pide elegir el permiso (y cambia el de la banda: no se agrega un séptimo selector). El bloqueo optimista (409) de la cartografía pasa a ser por plan.
4. **Sin backfill automático.** Ningún negocio con datos tiene un solo plan. Botón «Pasar a este permiso»: **copia** el área del negocio al plan elegido; idempotente; nunca pisa un plan que ya tenga área. Borrar la del negocio es opcional, ≥7 días después.
5. Los cachés `interno:loth-geografia:{tid}` e `interno:loth-imagenes:{tid}` suman el `planId` a la clave (son cachés: nada que migrar).
6. Un polígono por plan; junto al área dibujada se muestra el `areaHa` declarado y la diferencia.

## Consecuencias

- Cero DDL: `prisma/schema.prisma` no se toca; los clientes viejos (sin `planId`) siguen leyendo y escribiendo la clave del negocio.
- Dos personas editando planes distintos ya no chocan con un 409 falso.
- Un plan dado de baja deja una clave huérfana que no molesta.
- Rollback: revertir el código. Si hiciera falta limpiar: `DELETE FROM "PlatformSetting" WHERE key LIKE $1` con `$1 = 'loth-parcela:<tid>:%'`.

## Alternativas descartadas

- **Tablas Prisma con `planId`**: tocar el schema y migrar por el flujo de migración para 24 vértices y 19 ítems.
- **Un solo documento con `planId` por ítem** (como el POA): cada guardado reemplaza el documento entero; un cliente filtrado borraría lo de los otros planes.
- **Backfill automático**: no hay a qué plan asignarlo sin adivinar.
- **Un selector propio en la herramienta de dibujo**: volvería a los selectores sueltos que se acaban de quitar.

## No confirmado

- De qué plan son las 15 trochas propuestas de Blas (ningún árbol del censo tiene UTM).
- «DEMAs» en el pedido: DEMA es un `planType` y ya sale en el selector del permiso; las talas ya se filtran por permiso.
