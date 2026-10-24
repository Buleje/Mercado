# ADR-446 — Registrar en el libro la salida de un Anexo 04 guardado, y la GTF con el largo real de su talonario

**Estado:** Aceptado y construido (2026-09-28): talonario `8a9721f78`, puente `e3eb18571`, pantalla «Guías sin registrar» `fcd6d8ab4`. Revisado por reviewer y security (sin críticos). **En Blas no se registró nada todavía:** Brandon confirma guía por guía desde la pantalla. Pendiente: «Nuevo despacho» guarda el número sin lock (`forest-ctp.db.ts` ~1097); decisiones 5, 8 y 9 se resuelven al confirmar cada guía.
**Relacionados:** ADR-444 (un paquete en UNA guía vigente), ADR-445 (origen y salida del día), ADR-437 (madera de servicio WASACO).

## Contexto

Medido en Blas (`cmpxiv6p4000bohvzwl6bnfpv`) el 28-09, sólo lectura:

- **99,056 m³ (41 986 pt) en 9 guías** (19-001-0000054 a 064) viven sólo como Anexo 04 guardado (KV `ctp-anexos:<id>`, 10 anexos: la 064 tiene dos). Ninguno está atado a un despacho: el libro dice 0 salidas de ese período.
- **9 corridas marcadas «usado» (76,660 m³)**: #15-19 del 01/08 (76,564 m³, 20 paquetes «de montón» de 0 piezas) y #24-27 (0,096 m³, «Ajuste»). Días sin guía: 01/08, 28/08, 29/08, 30/08.
- **«Emitir GTF» inventó 2 números**: los despachos #1 y #4 del 28-09 salieron con `19-00000-000001` / `-000002`. La Ficha tiene la serie como `19-00000`; el talonario real es `19-001-00000NN` (7 dígitos) y `emitirGtf` fuerza 6 (`forest-ctp-despacho.db.ts` ~1200/1236). El máximo sólo mira despachos, no anexos ni números tipeados.

Reparto simulado de los 10 anexos contra las corridas:

| Escenario | Sin atribuir |
|---|---|
| Piso (ninguna asignación baja de esto) | 3,159 m³ (Azúcar huayo 0,92 sin producción + Tornillo corta/tabla/larga angosta 2,24) |
| Primera corrida que aparece | 17,994 m³ |
| Mejor ajuste, partiendo 10 paquetes de montón | 3,214 m³ — pero 242 líneas si va una por paquete |

## Decisión (propuesta)

1. **Propuesta de mejor ajuste con `≤`**; lo que no se cubre queda «sin atribuir», nunca se fuerza. Una línea por especie × tipo × corrida (~50 en total, no 242).
2. **Una transacción por guía** (con los locks de siempre producción → paquete). Separar `ForestCtpDB.create` en `crearEnTx` + envoltorio, sin cambiar su comportamiento. La tanda de las 9 se registra guía por guía, idempotente por número de guía comparado por tramos numéricos (`019-001-…` ≡ `19-001-…`).
3. **ADR-444 intacto para paquetes físicos.** Un paquete «de montón» (0 piezas, sin medidas) que sale en varias guías se **parte** dentro de la transacción: lo salido en esta guía, el resto en un paquete nuevo (decisión 10).
4. **«Usado» no se desmarca solo.** El puente puede usar corridas «usado» como origen; el resto (~8,4 m³) queda como «salió sin guía».
5. **El anexo queda enlazado** (`despachoIds[]`, `reemplazadoPor` en el mismo registro KV, sin migración). Lectura fresca de la base, no de la caché (lección ADR-445).
6. **WASACO = servicio**: `valorVenta` queda `null`, nunca 0.
7. **Talonario**: la Ficha guarda cuántos dígitos tiene el correlativo; el máximo cuenta anexos y números tipeados; rechaza uno ya usado; **propone** el número y el operador lo confirma. Se construye después del puente.
8. Cierre de período verificado en todo lo que escribe (partir un paquete toca una corrida del 01/08). **No cerrar agosto antes del puente.**

## Archivos

| # | Archivo | Qué |
|---|---|---|
| 1 | `lib/forestal/anexo-a-despacho.ts` (nuevo, puro) | `proponerDespachoDeAnexo()` |
| 2 | `lib/db/forest-ctp.db.ts` (`create`) | separar `crearEnTx` |
| 3 | `lib/db/forest-ctp-guia-desde-anexo.db.ts` (nuevo) | `proponer` / `registrarGuia` / `registrarTanda` / `partirMontonEnTx` |
| 4 | `lib/db/forest-anexos.db.ts`, `lib/forestal/anexo04-registro.ts` | lectura fresca, vincular, marcar reemplazado |
| 5 | `lib/db/forest-ctp-despacho.db.ts` (`emitirGtf`) + Ficha | dígitos, máximo, `proximaGtf()` |
| 6 | `app/api/admin/forestal/anexos/a-despacho/route.ts` (nuevo) | GET pendientes / propuesta; POST tanda (`safeParse`) |
| 7 | `components/admin/forestal/CtpGuiasSinRegistrarModal.tsx` + `hooks/use-guias-sin-registrar.ts` (nuevos) | entrada desde el historial de anexos y el aviso de Despacho |

## Orden

Decisiones → módulo puro + test con estos anexos (≈95,85 atribuido / ≈3,21 sin atribuir) → `crearEnTx` con los tests existentes en verde → clase + tanda → ruta + interfaz → talonario → prueba en `…-op-qa-ui` → Blas sólo con OK de Brandon.

## Riesgos

- Partir paquetes de montón se sale de ADR-444 (10 paquetes de 0,05 a 5 m³).
- Una línea a nivel corrida puede dejar en «Disponibles» paquetes físicos ya salidos: test antes del paso 4.
- El puntaje de cumplimiento cae 25 puntos (9 guías de corridas sin origen): es honesto.
- Los anexos guardados no traen el tipo forzado a mano ni el dueño por pieza.
- La corrida #20 está fechada 19-10-2025 (probable tipeo).

## Qué NO hacer

Forzar `==` · desmarcar «usado» automáticamente · inventar un número de guía · borrar el anexo duplicado · registrar la 064 sin su Azúcar huayo · una sola transacción para las 9 · una línea por paquete físico · texto libre como origen · cerrar agosto antes del puente.

## Alternativas descartadas

El modal de despacho actual (no ofrece corridas «usado», no es atómico) · aflojar ADR-444 «por grupo» · una línea por paquete (242) · desmarcar «usado».

## Decisiones de Brandon (pendientes)

1. ✅ **La guía 064 viajó con el Anexo de 256 piezas (25/09, 19,720 m³).** El de 251 (24/09) queda marcado «reemplazado», no se borra.
2. ✅ **Anotar la producción de Azúcar huayo** (16 piezas, 0,92 m³) antes de registrar la 064, así entra entera.
3. ✅ **Eran pruebas: anulados el 28-09** (despachos #1 SL-680 y #4 SL-682, con motivo, por `ForestCtpDB.annul`). Blas queda con 0 despachos vigentes.
4. ✅ **Serie 19-001, correlativo de 7 dígitos** (19-001-0000065 es el siguiente).
5. Guías 060 y 062 (09/09): ¿salieron del inventario del 1 de agosto?
6. ✅ **Los ~8 m³ sobrantes siguen en el patio:** al registrar las guías, el resto vuelve a Productos disponibles (se le quita «usado» SÓLO a ese resto, no automáticamente a toda la corrida).
7. ✅ **El Tornillo del inventario del 1 de agosto es de WASACO (servicio):** sin precio de venta ni costo (`valorVenta` null), igual que el permiso de Santos Muñoz.
8. ~2 m³ de Tornillo corto y tablas sin producción de ese tipo: ¿anotar producción o dejar sin origen?
9. Guías 059 y 061 sin anexo: ¿existen?
10. ✅ **Sí, se parten** en «lo que salió en esta guía» y «lo que queda» (decisión 3 del diseño).
