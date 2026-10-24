# ADR-491 — Registro de firmas y huellas de adelantos, solo de agregar; entregar desde la caja

- **Estado:** aceptado (2026-10-10). Brandon aprobó construirlo el 10-10. **Capa de datos aplicada** en la base el 10-10 (`--ensayo` → corrida real «27 nuevas» → 2.ª corrida «0 nuevas · 27 ya estaban»); backfill «0 candidatos» ×2. Backend, pantallas y página pública: carriles del mismo lote. Falta la pasada de `security` antes del merge (zona de peligro: RBAC + plata + ruta pública).
- **Pedido por:** Brandon (10-10): entregar un adelanto en una sola pantalla desde la caja, con firma (y huella para quien no sabe firmar), y poder mandar la firma por enlace al celular de la persona.
- **Extiende:** ADR-118 (comprobante del adelanto), ADR-448 (dirección + `idempotencyKey` del alta). **Schema:** 2 tablas nuevas, 2 enums, 1 índice único en `Adelanto`, 1 columna en `Settings`. Nada se quita ni se renombra.

## Contexto (medido, sólo lectura, 10-10)

- Blas: **0 de 8** adelantos firmados, cargados 3-11 días tarde. El cajero que entrega la plata recibe 403 (no tiene `adelantos:write`).
- La firma vive en `Adelanto.comprobanteUrl`, **la misma columna que el voucher**: firmar reemplaza y no queda rastro (ADL-2026-0023 de main quedó en `null` sin historia). La base no sabe quién firmó, cuándo, ni por qué monto.
- La huella no existe. El voucher del alta va a un bucket público.
- Toda la base: 78 adelantos, **0 recibos firmados** en `comprobanteUrl` → el backfill hoy no tiene filas (se entrega igual, idempotente).
- main DADO (n=55): p50 S/ 300 · p80 S/ 560 · p95 S/ 2 375 → tope del cajero por defecto S/ 500 ≈ p75.

## Decisión

1. **`AdelantoFirma`, solo de agregar.** Cada firma o huella es una fila nueva; la vigente de cada tipo es la última por `createdAt`. La base lo garantiza aunque la app se equivoque:
   - Trigger `AdelantoFirma_inmutable` (`BEFORE UPDATE OR DELETE … FOR EACH ROW`) → `restrict_violation` (23001). Única salida: supresión Ley 29733 con `SET LOCAL app.permitir_borrar_firmas = 'on'` dentro de la tx, y solo para DELETE (UPDATE sigue prohibido).
   - Trigger `AdelantoFirma_sin_truncate` (`BEFORE TRUNCATE … FOR EACH STATEMENT`): `TRUNCATE`, también el que llega en cascada, siempre se rechaza (agregado al construir: sin él, un `TRUNCATE "Adelanto" CASCADE` vaciaba el registro sin disparar el trigger por fila).
   - FK compuesta `(tenantId, adelantoId) → Adelanto(tenantId, id)` **NO ACTION** (una firma no puede apuntar a un adelanto de otro negocio; un adelanto con firmas no se borra) — de ahí el `@@unique([tenantId, id])` nuevo en `Adelanto`. FK a `Tenant` en CASCADE, pero el trigger frena la cascada si hay firmas.
   - `sha256` del binario guardado (`CHAR(64)`, CHECK hex) + `bytes > 0`; `ruta` dentro de `<tenantId>/adelantos/<adelantoId>/` (CHECK); canal `PANTALLA | ENLACE | BACKFILL` con `ENLACE ⇔ enlaceId` (CHECK); **HUELLA exige `consentimiento`** (versión del texto aceptado, CHECK); `montoFirmado`/`monedaFirmada` = lo que la persona vio al firmar.
   - Únicos `(tenantId, idempotencyKey)` y `(tenantId, ruta)`; índice `(tenantId, adelantoId, tipo, createdAt DESC)`.
2. **`AdelantoEnlaceFirma`: enlace de un uso, 48 h.** Se guarda solo el sha256 del token (`tokenHash @unique`, CHECK hex); el token se muestra una vez. `usadoEn` (CAS en la tx del INSERT), `revocadoEn`, `intentosFallidos` (DNI distinto; a los 5 se revoca). FK compuesta igual que el registro; `AdelantoFirma.(tenantId, enlaceId)` también compuesta (MATCH SIMPLE: con `enlaceId` null no se chequea).
3. **Recurso RBAC nuevo `adelantos-entregar`** (cajero: solo crear, DADO, cuenta corriente, fecha de hoy, tope, caja abierta, firma obligatoria), separado de `adelantos`.
4. **`Settings.adelantoTopeCajero DECIMAL(12,2)`**: null = `TOPE_CAJERO_POR_DEFECTO` (S/ 500); 0 = el cajero no entrega. Se lee en el servidor, nunca del body.
5. **`comprobanteUrl` queda solo para el voucher**; el PDF lee la firma del registro.
6. **Expand → migrate → contract.**
   - *Expand* (este lote): `prisma/migrations/adr-491-registro-firmas-adelantos.sql`, archivo suelto (sin `migrate resolve`, como ADR-488), aplicado con `scripts/aplicar-migracion-sesion.mjs` por el pooler de sesión :5432, una tx, `SET LOCAL lock_timeout '5s'`. `Settings` (tabla caliente, se lee en cada request) va **al final** para que su ACCESS EXCLUSIVE dure lo menos posible.
   - *Migrate* (este lote): las pantallas escriben en el registro; `scripts/backfill-firmas-adelantos.mjs` (dry-run por defecto, `--aplicar`, `idempotencyKey = 'backfill:' || ruta`, `ON CONFLICT DO NOTHING`) pasa los recibos firmados viejos sin mover el archivo ni tocar `comprobanteUrl`.
   - *Contract* (otro lote, ≥14 días, tras medir 0 llamadas): sacar la rama de firma de `PATCH adjuntarComprobante` y el `hojaFirmada` legado; dejar de aceptar `comprobanteUrl` público en el alta.
   - *Vuelta atrás*: `prisma/migrations/adr-491-vuelta-atras.sql`, solo con el registro, los enlaces y el tope vacíos (tres guardas que abortan la tx); ensayada con ROLLBACK el 10-10. No se aplica salvo decisión.
7. **El ejecutor parte respetando `$$`.** `scripts/aplicar-migracion-sesion.mjs` partía por `;` y rompía los cuerpos plpgsql. Ahora `partirSentencias` (exportada, con test) respeta `'…'`, `$tag$…$tag$` y comentarios; `CREATE OR REPLACE FUNCTION|TRIGGER` cuenta «ya estaba» si la definición quedó idéntica, así la 2.ª corrida sigue en «0 nuevas». De paso deja bien partidos `adr-377`, `adr-417` y `adr-418` (tienen `DO $$`; el splitter viejo los cortaba mal).

### Decisiones de negocio (por defecto, confirmadas al construir)

| # | Decisión | Por defecto |
|---|---|---|
| D1 | ¿Qué anota el cajero? | Solo CREA: DADO, cuenta corriente, fecha de hoy, sin pasar el tope de crédito, sin permiso/contrato |
| D2 | ¿Almacenero también? | No (se habilita con 1 línea) |
| D3 | Tope del cajero | S/ 500, editable en Ajustes › Cobros; 0 = no entrega |
| D4 | ¿Firma obligatoria? | Cajero sí; admin/dueño opcional (puede mandar enlace) |
| D5 | ¿Sale de la caja abierta? | Cajero: obligatorio («Abre la caja primero»); admin elige como hoy |
| D6 | Huella | Opcional; obligatoria solo si el enlace la pide |
| D7 | Vencimiento del enlace | 48 h, un uso; generar otro revoca el anterior |
| D8 | ¿Cajero crea personas nuevas? | No (v1) |
| D9 | DNI en el enlace | Si la ficha tiene DNI debe coincidir (5 intentos); si no tiene, se guarda el escrito y NO se copia a la ficha |
| D10 | ¿Cajero manda enlaces? | No (v1) |
| D11 | Retención de la huella | Mientras el adelanto esté abierto + 5 años (confirmar con el contador) |

## Alternativas descartadas

- **(a) Seguir en `comprobanteUrl` con historial en la carpeta del bucket:** la base no sabe quién firmó ni cuándo, y el `null` se pierde.
- **(b) Dar `adelantos:write` al cajero:** le abre editar, anular y liquidar en 15 rutas.
- **(c) Token en claro como contratos (`/firmar-contrato`):** un volcado de la base daría enlaces vivos.
- **(d) WebAuthn / huella del celular:** prueba quién es el dueño del teléfono, no da la imagen.
- **(e) Lector USB + puente en la PC:** fase 2.
- **Trigger en archivo aparte / opción `--sin-partir`:** innecesario una vez que el splitter respeta `$$`; un solo archivo = una sola tx (todo o nada).

## Consecuencias

- **Borrar un adelanto o un tenant con firmas falla a propósito** (FK NO ACTION / trigger). Hoy no hay ningún `adelanto.delete` en `lib/` ni `app/`; sí borran tenants `app/api/superadmin/tenants/[slug]/delete/route.ts:161`, `app/api/cron/cleanup-demos/route.ts:40`, `scripts/cleanup-test-tenant.ts:19`, `prisma/seed-demo.ts:57`, `prisma/seed-fruteria.ts:55`, y dos tests limpian adelantos (`__tests__/cuentas-cruce-recibido-db.test.ts:58`, `__tests__/caja-cierre-carrera-db.test.ts:81`). Con firmas, esos caminos tienen que hacer la supresión explícita o devolver un 409 claro.
- La supresión Ley 29733 de una huella exige `SET LOCAL app.permitir_borrar_firmas = 'on'` en la misma tx que el DELETE, y borrar también los archivos de `registro/` del bucket privado.
- `Adelanto` gana un índice único redundante con la PK (`(tenantId, id)`): unos KB, lo exige la FK compuesta.
- Un cambio de esta tabla que no sea INSERT pasa por migración, nunca por la app.

## Verificación (10-10)

- Ensayo con ROLLBACK de comportamiento (tenant QA `main`): INSERT válido ✓; UPDATE/DELETE → 23001; DELETE del adelanto con firma → 23503; HUELLA sin consentimiento, sha256 no hex, bytes 0, ENLACE sin enlaceId, ruta de otro adelanto → 23514; adelanto de otro tenant → 23503 (FK compuesta); ruta repetida → 23505; TRUNCATE → 23001; DELETE con `SET LOCAL` ✓; UPDATE con `SET LOCAL` → 23001. Después: 0 filas.
- `__tests__/adelantos-firmas-migracion.test.ts` (14 casos): idempotencia, triggers, FKs, CHECKs, índices por `tenantId`, orden de la vuelta atrás, backfill sin interpolación, `partirSentencias`.

## Referencias

- Contrato del lote (architect, 10-10) · memoria `adelantos-idor-beneficiario-ajeno` (Fase B opcional: FK compuesta en `AdelantoBeneficiario`).
- `prisma/migrations/adr-491-registro-firmas-adelantos.sql` · `adr-491-vuelta-atras.sql` · `scripts/backfill-firmas-adelantos.mjs` · `scripts/aplicar-migracion-sesion.mjs`.
