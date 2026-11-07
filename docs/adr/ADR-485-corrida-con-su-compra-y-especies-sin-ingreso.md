# ADR-485 — Corrida con su compra y especies aserradas sin ingreso

- **Estado:** aceptado (2026-10-08). Construido: lectura pura, DB class, dos rutas, la tarjeta de un toque en la ficha de la corrida y en Herramientas › Rendimiento › Por corrida, el aviso en Saldos › Qué revisar y los tests.
- **Pedido por:** Brandon (08-10), dos opciones elegidas: «Corrida con su compra» (que el costo por PT deje de decir «Falta» cuando la madera quedó atribuida, y que ligarla sea de un toque) y «Especies aserradas sin ingreso» (riesgo SERFOR).
- **Depende de:** ADR-134 (consumos y costo on-read), ADR-139 (cierre de mes), ADR-316 (reproceso), ADR-394 (existencia de apertura), ADR-437 (madera de servicio), ADR-447 (mismo permiso), revisión `8af672b69` (madera sin atribuir deja el costo en null).

## Contexto (medido en Blas, sólo lectura, 08-10)

| Dato | Valor |
|---|---|
| Corridas de producción vivas | 5 (líneas 1-5, fechadas 01/08, cargadas el 03/10), 78,671 m³ de troza |
| `ForestCtpConsumo` | **0** · trozas consumidas: 0 |
| Especies de las corridas | Cachimbo 28,947 · Panguana 20,718 · Copal 13,537 · Mashonaste 9,420 · Azúcar huayo 6,049 |
| Ingresos (7, todos `validado`) | Shimbillo, Cumala ×2, Huayruro ×2, Yacuchapana, Ana Caspi — **llegados el 03/10** |
| Ingresos con costo | **0 de 7** |
| Trozas por especie | además Pashaco (colgada de filas de Cumala y Huayruro) |

**Por qué no había consumos**: el botón existía («Editar atribución» en la ficha de la corrida), pero no había madera que ligar. Las tres causas a la vez: (1) ninguna especie de las corridas tiene ingreso; (2) los ingresos llegaron dos meses después de las corridas; (3) ningún ingreso tiene costo. Aun ligadas, el costo por PT seguiría en «Falta» por (3). Hipótesis descartada: «el botón está escondido» — se ve en la ficha, sólo que su buscador ofrecía guías de cualquier especie y fecha, sin decir por qué ninguna servía.

## Decisión

1. **Propuesta en el servidor** (`lib/forestal/corrida-compra.ts`, puro): para lo que a la corrida le falta (`declarado − consumos − lo que llegó por reproceso`), las guías de la **misma especie** (`claveEspecie`), **llegadas el mismo día o antes** (recepción de la guía, si no el asiento; mismo criterio que T3), `validado|procesado`, del **mismo permiso** (`mismoPermiso`), del **mismo dueño** (propia con propia; la de servicio con su tercero) y **con saldo** (volumen − lo que usan otras corridas vivas − lo que ya usa ésta). **FIFO**: la que llegó primero, a igual día por N° de guía. Lo que no alcanza queda «sin atribuir» (nunca se fuerza: regla `≤`).
2. **Si no propone, dice por qué**: «No hay ningún ingreso de Cachimbo en el libro…», «la guía llegó después de la corrida (desde el 03/10/2026)», «ya se consumió», «sin validar», «otro permiso», «otro dueño». Bloqueada (sin propuesta) si está anulada, declarada como apertura, congelada, en un mes cerrado o sin m³ declarados (ahí manda «Editar atribución»).
3. **Confirmar = un toque, por el camino de siempre**: `POST /ctp/corrida-compra { ctpEntryId, firma }`. El servidor recalcula la propuesta; si la firma no es la que se vio → 422 `PROPUESTA_DESACTUALIZADA` y la pantalla muestra la nueva. Escribe con `ForestCtpConsumoDB.setConsumos` (lock de la corrida y de los ingresos `ORDER BY id`, I1, I2, mes cerrado, congelado, auditoría «Origen de la materia prima: … → …», caché). Esta capa no tiene una segunda versión de esas reglas.
4. **El costo no se inventa**: `costoDeLinea` devuelve `guiasSinCosto` con `falta_factura`. El costo por PT nombra la guía — «el costo de la guía QA-SEM-002 (no tiene costo cargado)» — en vez de «el costo de la madera»; el agregado por especie las junta en un faltante. La ficha de la corrida dice lo mismo.
5. **Especies aserradas sin ingreso**: corridas vivas (y por ellas sus paquetes, que siempre cuelgan de una corrida) cuya especie no aparece en **ninguna** guía viva ni en **ninguna** troza de una guía viva, en todo el libro (sin período: una guía del mes pasado sí respalda). `GET /ctp/especies-sin-ingreso`. En Saldos › Qué revisar va como bloque propio (error; warning si todas sus corridas están declaradas como apertura), con especie, corridas y m³, y botón a Ingresos. Esas especies salen de «en negativo» para no dar dos rojos por el mismo hecho.
6. **Sin schema.** Todo se deriva de lo que ya existe.

## Rutas (`requireAdmin` → rate limit `ctp` → `spec:forestal:ctp-libro` → `safeParse`; `tenantId` del JWT)

| Ruta | Qué | Roles |
|---|---|---|
| `GET /api/admin/forestal/ctp/corrida-compra?ctpEntryId=` | `{ propuesta }`; corrida de otro negocio o inexistente → 404 | admin, almacenero, owner (los de «Editar atribución») |
| `POST /api/admin/forestal/ctp/corrida-compra` | `{ propuesta, costo }`; 422 con motivo si no hay qué ligar o cambió | ídem |
| `GET /api/admin/forestal/ctp/especies-sin-ingreso` | `{ especies: [{ especie, corridas, lineNos, m3Troza, paquetes, conApertura }] }` | admin, almacenero, owner |

## Pantallas

- **Libro CTP › Producción › ficha de la corrida**: debajo del veredicto, «Sale de esta compra» con la guía, el día que llegó, los m³ y su costo por m³ (o «sin costo»), y el botón «Ligar X m³ a su compra». Si no hay, el motivo en una línea.
- **Herramientas › Rendimiento › Por corrida**: ícono de enlace en la fila con madera sin guía; abre la misma tarjeta y al cerrar se vuelve a leer el rendimiento.
- **Libro CTP › Saldos › Qué revisar**: «N especies aserradas sin ningún ingreso · X m³».

## Consecuencias

- En Blas la propuesta no liga nada (no hay guía de esas especies): el valor hoy es el **porqué** en palabras y el aviso SERFOR. Cuando ingrese una guía de Cachimbo fechada antes de la corrida, la corrida se liga de un toque.
- Ligar por m³ no marca piezas (`WoodEntryTroza.consumidaEnId`), igual que «Editar atribución». Las piezas siguen yendo por «Sumar a la corrida» / vincular trozas.
- Idea pendiente: el mismo aviso en Inicio (carril de Inicio) y «Ligar todas» en tanda.

## Revisión 08-10 (arreglos)

- **Dueño de la madera**: `ForestCtpEntry.duenoMadera` es `"propia" | "tercero" | null` (ADR-412), no un nombre. Se compara `duenoMadera === "tercero"` contra `WoodEntry.maderaDeTercero`, y el nombre del tercero (`titularNombre`) contra `duenoNombre` sólo si los dos lo dicen. Antes, toda corrida «propia» descartaba sus guías propias como «de otro dueño». E2E en main: corrida «propia» de Cumala 0,5 m³ → `completa` desde QA-SEM-002 (borrada después).
- **Trozas en la fila de otra especie**: sin ninguna fila de la especie, la propuesta cuenta las trozas de esa especie colgadas de otras filas (lo mismo que el aviso de Saldos) y las nombra por guía. No manda a «Acomodar trozas»: en Blas esas 3 guías no tienen fila de Pashaco ni de Shimbillo, y el acomodo no mueve una troza sin fila de su especie.
- **Monedas**: si las guías propias (ya ligadas + propuestas) mezclan soles y dólares, la tarjeta lo avisa (`monedasMezcladas`, misma regla que `costoDeLinea`).
- Rendimiento › Por corrida no ofrece «Ligar» con apertura declarada ni en mes cerrado (`ligable`). El costo congelado tras reabrir un mes lo explica la tarjeta.
