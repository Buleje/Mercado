# ADR-447 — ¿De qué trozas salió?: arreglar en el lugar y vincular en tanda

**Estado:** Aceptado (2026-09-28), en construcción.
**Relacionados:** ADR-443 (bandeja «¿De qué trozas salió?»), ADR-434 (corregir llegada), ADR-435 (acomodar trozas en su especie), ADR-446 (patrón: propuesta pura + una tx por ítem + try-lock + pantalla guía por guía).

## Contexto

Medido en Blas (`cmpxiv6p4000bohvzwl6bnfpv`) el 28-09, sólo lectura, con el diagnóstico real del servidor: **44 de 46 corridas sin origen (141,874 m³), 0 vinculables hoy**. Hay 65 trozas candidatas (129,154 m³): 27 de guías recibidas y 38 de dos guías sin recibir.

| Grupo | Corridas | m³ | Qué la frena |
|---|---|---|---|
| Llegada posterior | 11 (Mashonaste, Copal, Cumala, Pashaco, Shimbillo; Huánuco) | 20,432 | 8 guías recibidas el 11 y el 23/09 con fecha de guía del 31/08 al 07/09 |
| Guía sin recibir | #36 Tornillo | 10,406 | sus 31 trozas son de la 019-001-0000004, pendiente |
| Apertura | #15-19 Tornillo 01/08 | 76,564 | lotes de inventario |
| Madera tomada por otra corrida | 5 Cachimbo + 5 Panguana | 19,759 | la #61 (27/09) tomó las 12 de Cachimbo; la #62 (27/09, abierta) las 7 de Panguana. **La bandeja dice «No hay trozas en el patio»: falso** |
| Permiso sin guía / guía sin trozas | 8 Tornillo (#20-27) | 8,748 | permisos 2025-096, 2026-032, 2026-033 sin guía; la del 2018-020 pendiente y sin trozas |
| Permiso distinto | #56, #60 Copaiba | 0,911 | la Copaiba del patio es del permiso 2024-008 |
| Especie parecida / sin madera | 4 Huayruro negro, 1 Tacho, 2 Machimango | 5,053 | en el patio sólo hay «Huayruro» |

Tras corregir las 8 llegadas: 11 vinculables (10 en tanda, 19,231 m³); tras recibir la 019-001-0000004: 12 (11 en tanda, 29,637 m³). Los 5 vinculadores existentes tuvieron 0 usos. `vincularCorridaEnTx` (`lib/db/forest-vincular-corrida.db.ts` ~227) **no revisa el permiso** y se alcanza directo desde `lotes-aserrio/route.ts` ~435 (`vincularTrozas` sí lo revisa).

## Decisión

1. **Permiso en el núcleo:** `vincularCorridaEnTx` compara `mismoPermiso(lote, corrida)` tras bloquear los lotes y rechaza con `PERMISO_DISTINTO`. Con test.
2. **Propuesta de la tanda, pura** (`lib/forestal/origen-en-tanda.ts`): agrupa por especie + permiso y reparte con `repartoDelGrupo` (ninguna troza a dos corridas), siempre `≤`, lo que falta queda sin atribuir; `simularArreglos()` da «hoy / tras llegada / tras recibir». Test con Blas congelado (`__tests__/fixtures/blas-sin-origen-2026-09-28.json`): hoy 0, tras llegada 11 (10 en tanda), tras recibir 12, el permiso frena 7. **Medido al construir (28-09):** en tanda entran 11 y 12, no 10 y 11. La que sobra es la N° 59 de Mashonaste (1,2014 m³): `repartoDelGrupo` cubre primero lo producido de cada corrida y sus 3 trozas alcanzan para las 3 (la N° 55 rinde 65,0 % y la N° 59 62,5 %: se avisa). Para esas 11 alcanza con corregir 5 guías, no 8.
3. **Motivos que dicen la verdad:** `MotivoSinOrigen` suma `tomada_por_otra_corrida` (qué corrida la tomó y el rendimiento de las dos sumadas), `guia_sin_trozas`, `permiso_distinto`, `especie_parecida`; el diagnóstico gana `arreglo: ArregloDeCorrida` (`corregir_llegada` con fecha propuesta = la de la guía y su fuente, `recibir_guia`, `declarar_apertura`, `soltar_corrida`, `corregir_corrida` permiso/especie, `cargar_guia`, `ninguno`).
4. **Vincular en tanda** (`ForestVincularTrozasDB.vincularTanda`): una tx por corrida, la más vieja primero, recalculando sobre lo que dejó la anterior; `set_config('lock_timeout', …, true)`; idempotente («ya vinculada», y si faltaba su renglón `ctp_corrida_vincular` se repone); los cierres se releen antes de cada corrida; estados `vinculada | ya_vinculada | bloqueada | error | pendiente`. El bloqueo de la tanda es de transacción, así que **se suelta entre corridas**: la primera lo pide con `pg_try_advisory_xact_lock` y, si otra tanda lo tiene, responde **409 sin escribir nada**; las siguientes lo esperan hasta 15 s, de modo que dos tandas que arrancan casi juntas se turnan corrida por corrida (si una espera vence, esa corrida vuelve `error TANDA_EN_CURSO` y las anteriores quedan escritas). Los datos quedan bien igual: cada troza se decide bajo su `FOR UPDATE` (T1). Ruta `ctp/vincular-trozas`: POST `{corridaId, trozaIds}` o `{tanda: [...] (máx 15)}`, `safeParse`; pasados 240 s no se empieza otra corrida y las que faltan vuelven `pendiente` (`maxDuration` 300 s en `vercel.json`); límite propio por negocio (MODERATE) para el POST de tanda; leer admin/almacenero/owner (y manager, por el «management tier»), vincular sólo admin/owner.
5. **Pantalla:** `CtpOrigenEnTandaModal.tsx` (como «Guías sin registrar»: grupos por especie y permiso, propuesta con selector, «Revisar», «Vincular las N») + `ctp-sin-origen-arreglos.tsx` (una línea por arreglo con el botón que abre el modal que ya existe, `aboveModals`, p. ej. «Corregir las 7 llegadas»). La bandeja `CtpSinOrigenBandeja.tsx` se parte (270 líneas). PT primero, después m³ y piezas. Las cuatro situaciones que dependen de Brandon (Cachimbo, Panguana, Huayruro, Copaiba) se muestran como arreglos que él elige en pantalla («soltar la corrida del 27/09», «es la misma especie», «cambiar el permiso de la corrida»), nunca se resuelven solas.

## Qué NO hacer

Vincular sin confirmación · igualar «Huayruro» con «Huayruro negro» en la regla de especie · mover las trozas de #61/#62 sin que Brandon lo elija · `==` · inventar la llegada (se propone la de la guía y se confirma con motivo) · un segundo algoritmo de reparto · migrar · contar «sin origen» por volumen de entrada.

## Alternativas descartadas

Vincular solo · especies parecidas como una · una sola tx para toda la tanda · una pantalla nueva aparte de la bandeja.
