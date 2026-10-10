# ADR-395 — Dos operaciones para la misma planta: libros hermanos con switch en la cabina

- **Fecha:** 2026-09-07
- **Estado:** aceptado
- **Pedido por:** Brandon — «hacer dos operaciones distintas para la misma planta en el
  libro de operaciones CTP completo, y poder cambiar de una a la otra».

## Contexto

Un CTP puede llevar dos operaciones que no deben mezclarse —dos frentes de la misma
planta, dos títulos que se administran por separado, madera propia y servicio a
terceros— y cada una necesita el libro ENTERO: sus ingresos, consumos, lotes,
corridas, despachos, saldos, cierres y ficha, sin que un asiento de una aparezca
en los saldos de la otra.

Medido antes de decidir:

| Hecho | Consecuencia |
|---|---|
| No existe ningún concepto de sede/operación en los 26 modelos forestales | Habría que inventarlo |
| El módulo son 31 DB classes, 63 endpoints, 290 componentes; sólo `forest-ctp.db.ts` filtra por `tenantId` 160 veces | Una columna `operacionId` obliga a tocar cada filtro; el primero olvidado mezcla dos libros en silencio |
| Cada libro ya se aísla por `tenantId`, y el panel ya cambia de tenant por pestaña (`active-tenant-slug`) | Dos operaciones = dos tenants, aislamiento garantizado por construcción |
| SERFOR registra un LO-CTP por código de CTP | Dos libros de verdad son, ante la ARFFS, dos libros |

## Decisión

### 1. Una operación hermana ES un tenant

Mismo plan, mismo tipo, la misma gente con las **mismas credenciales** (hash y 2FA
copiados), los mismos módulos forestales habilitados y la **Ficha del CTP copiada**
(misma planta, misma ARFFS, mismos títulos). Lo crea el dueño/admin desde la cabina
del libro («Nueva operación…»), no el superadmin.

### 2. El grupo vive en la Ficha, sin migración

`CtpFicha.operacion = { grupoId, nombre }` en cada libro del grupo, y un índice
`ctp-operaciones:{grupoId}` en el KV global (mismo patrón que la Ficha). El primer
«Nueva operación» funda el grupo y mete al libro actual con el nombre que se le dé.

### 3. Cambiar de operación es un login sin contraseña, acotado

`POST /api/admin/forestal/operaciones/cambiar { slug }` emite sesión y refresh para el
tenant destino **sólo si**: está en el mismo grupo, está activo, tiene el libro CTP
habilitado, y el usuario tiene cuenta **activa con el mismo username** allí. El rol y
el nombre son los de la cuenta de destino (se puede ser cajero en una y admin en otra).
Se audita en los dos libros (`ctp_operacion_cambiar`). Rate limit `STRICT`.

### 4. Quitar una hermana la desactiva, no la borra

Un libro con asientos no se destruye desde el panel: `active = false` y fuera del
índice. Revertirlo es trabajo del superadmin.

### 5. Lo que NO cambia

- Ningún endpoint, DB class ni componente del libro cambia: siguen viendo un tenant.
- El folio, los cierres y el export SERFOR son por libro, como hoy.
- Los catálogos estáticos (especies) ya son compartidos; el directorio de partes y
  vehículos (`ForestParty`, `ForestVehiculo`) NO se copia en esta versión: se vuelve a
  cargar o se copia en una segunda ronda si hace falta.

## Consecuencias

- Cero migración; cero riesgo de mezclar libros.
- Cada operación cuenta como tenant para plan y límites: el plan se copia; si el plan
  del negocio limita tenants, es el superadmin quien lo resuelve.
- La persona tiene una cuenta por libro con las mismas credenciales: cambiar la clave
  en uno no la cambia en el otro (misma regla que hoy entre negocios).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Columna `operacionId` en ~10 modelos + filtro en cada query | Riesgo de mezcla silenciosa; toca 160+ filtros; un solo acta ante SERFOR |
| Dimensión «operación» como etiqueta filtrable | No es un libro completo: folio, cierres y ficha compartidos |
| Crear la hermana desde el superadmin | El dueño no puede autogestionar su planta |

## Referencias

`lib/db/forest-ctp-operaciones.db.ts` · `lib/forestal/ctp-operaciones.ts` ·
`components/admin/forestal/CtpOperacionSwitcher.tsx` · Ficha del CTP (`ctp-ficha:{tenantId}`).
