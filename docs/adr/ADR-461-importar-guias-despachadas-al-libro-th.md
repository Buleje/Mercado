# ADR-461 — Importar al Libro TH guías que ya se despacharon

- **Estado:** aceptado (2026-10-02). Sin cambio de schema.
- **Relacionados:** ADR-125/305 (Libro TH, invariantes T1–T8), ADR-312 (alta desde SERFOR por especie), ADR-446 (anexo → despacho), ADR-452 (talonario por titular), ADR-459 (plantación sin censo).
- **Pedido (Brandon, 02-10):** «subir guías o poner guías que ya se despacharon; según la guía se identifica a qué permiso pertenece y se agrega a los permisos ya creados o se crea un permiso nuevo […] con el número de registro traer las guías y según la lista de trozas ponerse en trozas y en tala (en plantación no es obligatorio) pero si es DEMA o POA que en la tala se ponga referencial según el código de trozas: 12A 6 m, 12B 3 m y diámetros 50… → tala 12, 9 m, D1 50 y el otro 45».

## Contexto (medido, sólo lectura en Blas)

| Qué | Cifra |
|---|---|
| Ingresos del CTP con la ficha de SERFOR guardada (`WoodEntry.serforGtf`) | 26 de 28; un asiento por especie → 13 guías distintas |
| Títulos de esas guías | `10-HUA-PUE/PER-FMP-2026-007` 21 asientos · `19-SEC/PER-FMC-2024-008` 2 · `19-SEC/REG-PLT-2021-017` 2 · `19-SEC/REG-PLT-2018-020` 1 |
| Planes del Libro TH | 3; ninguno con esos códigos — pero el permiso `REG-PLT-2021-017` (`ForestContrato`) ya apunta al plan «PO1» |
| Escrituras de la codificación | `186A` (pegado), `173-D` (guion), `84/A (0000005)` (barra + N° de lista), `35` (sin sufijo), `-` (49 trozas sin código) |
| Árboles en dos guías | 173 (173-A/B/C en la GTF 7, 173-D en la 8), 161, 116, 215, 226, 233 |
| `arbolDeTroza` («186A») | devolvía «186A»: sólo entiende el guion |
| Consulta pública SERFOR | `1-19-0313629` encontrada; `1-10-0474633` «No se encontraron datos» el 02-10 (la ficha sí está guardada en el CTP) |

## Decisión

1. **Una revisión pura para la vista previa y la importación** (`lib/forestal/loth-importar-guia.ts`, `revisarGuia`). La pantalla y el servidor ven lo mismo; el servidor la corre DENTRO de la transacción con lo leído bajo los candados.
2. **Permiso por el código del título**, tramo a tramo (`claveTitulo`: mayúsculas, sin ceros a la izquierda por tramo), contra `planNumber`, `tituloHabilitante` y los permisos (`ForestContrato`) atados a un plan. Uno → existente; ninguno → nuevo (PLANTACION si el origen o el código lo dicen, DEMA si PER-FMC, PMFI si PER-FMP, si no PO; atado al permiso del mismo código si no tiene plan); varios → la persona elige. El titular no decide.
3. **Trozado = la lista de la guía.** El volumen es el de la guía (no se recalcula); D1/D2 pasan a metros y se ordenan mayor/menor (SERFOR a veces publica el menor primero). «-» = sin código → `SC-<registro>-<n>`, sin árbol.
4. **Tala referencial = la suma de las trozas del árbol en ese plan** (las de la guía + las que ya estaban): largo Σ, D1 el mayor, D2 el menor, m³ Σ — así T4 cierra exacto. Marcada en `medicionCruda.referencial` (`{ gtfs, registros, trozas }`) y en la observación. Si el árbol ya tiene una tala referencial del mismo plan, **se amplía** (aunque el interruptor de talas esté apagado: si no, T4 frena la troza nueva); si tiene una medida en campo, se respeta y T4 tiene que cerrar. En plantación viene apagada.
5. **Una guía = una transacción**: (plan nuevo) → talas → trozados → despacho, reusando los cuerpos de `create` y `despacharConGuia` extraídos sin cambiar su comportamiento (`ForestLothDB.registrarLineaEnTx`, `despacharConGuiaEnTx`). T1–T7 pasan por `enforceInvariants`; T8 (DMC) se mira sólo en el censo del plan destino (`arbolesBajoDmc`) y el importador no justifica: esa tala se registra a mano.
6. **Candados**: el del título (`pg_advisory_xact_lock`, «loth-titulo:<clave>») si se crea el plan — dos guías del mismo permiso nuevo a la vez crean UN plan (medido) — y el del N° normalizado (`GtfNumeroDB.bloquear`).
7. **Idempotencia**: ya está si hay una guía VIGENTE con el mismo N° (tramo a tramo) del mismo dueño, o que cita el mismo N° de registro SERFOR. Una anulada no cuenta (a diferencia del talonario propio: un N° de SERFOR anulado en el libro se vuelve a anotar). Troza ya trozada en el mismo plan con la misma especie → se reutiliza; en otro plan, sin plan, ya despachada → choque que bloquea la guía.
8. **Guía anulada en SERFOR, mes cerrado, sin trozas, sin N° o sin fecha** → no se importa, con el motivo.
9. **Fuentes**: `serfor` (el SNIFFS, por el único punto de red `consultarGtfEnSerfor`), `ctp` (la ficha guardada en un ingreso del negocio), `ficha` (foto/PDF con el lector IA: se anota «sin verificar en SERFOR»). Las fichas guardadas se reparan con `repararFichaSerfor` («MUÃ?OZ»).
10. **Rutas**: `POST /api/admin/forestal/loth/importar-guia/vista-previa`, `POST /api/admin/forestal/loth/importar-guia` (sólo admin o dueño: `soloAdminODueno`), `GET …/importar-guia/candidatas`. Contrato en `lib/forestal/loth-importar-guia-tipos.ts`; Zod en `loth-importar-guia-esquemas.ts`.
11. `claveOrigen`, `separarDocumento`, `partirDimensiones` y `estadoGtf` se mudaron a `serfor-gtf-campos.ts` (sin `"use client"`) y `ctp-gtf-desde-serfor.ts` los re-exporta.
12. **Deshacer la importación** (02-10 tarde; `lib/forestal/loth-importar-guia-deshacer.ts` puro + `lib/db/forest-loth-importar-deshacer.db.ts`; `GET|POST …/importar-guia/deshacer`, sólo admin o dueño). «Anular» una guía cuya madera está en el CTP da 409 `guia_ya_en_el_ctp`, y eso NO cambia. Una guía IMPORTADA (su observación es la exacta de `observacionGuia`) se deshace por su camino, en una transacción con el turno del negocio y el candado del N°:
    - el CTP **depende** de la guía (409, igual que antes) si hay un ingreso vivo de la misma guía creado DESPUÉS de importarla y sin ficha de SERFOR (vino de «Recibir»), o una troza del CTP atada (`lothTrozadoId`) a uno de sus trozados. Un ingreso que ya existía o trae su ficha no depende: la importación lo copió;
    - se anulan la guía, sus despachos y los trozados que creó ESA importación (observación exacta de `observacionTrozado` con ese N° y registro); los trozados de antes quedan;
    - tala referencial que cita la guía: si sólo ella la sostenía → se anula; si otra guía también la amplió → **se reduce** a las trozas vivas que quedan del árbol en el plan (la misma regla `medidasDeTala` del importador: T4 sigue cerrando exacto). Una tala medida en campo no se toca;
    - el plan se da de baja si lo creó una importación (`notaPlanImportado`) y no le queda nada (líneas vivas, guías vigentes, especies, censo, permisos); si alguien le cargó algo, queda y se dice por qué;
    - mes cerrado en cualquier línea tocada → 422. Rastro `loth_gtf_deshacer_importar`, `loth_linea_reducir_referencial`, `ctp_plan_baja`.
13. **Revisión de seguridad (02-10)**: la ficha de un ingreso del CTP la pone el SERVIDOR (`POST wood-entries` ya no acepta `serforGtf`; con `serforNumeroRegistro` la pide a SERFOR y la guarda sólo si es de esa GTF); la ficha guardada se lee con `fichaGtfSchema` (una ilegible se salta y se cuenta en `ilegibles`); un ingreso anulado/rechazado no es fuente; una importación por negocio a la vez (`pg_try_advisory_xact_lock` → 409 `importacion_en_curso`, `lock_timeout` LOCAL 15 s); hasta `IMPORTAR_SERFOR_POR_PEDIDO` = 10 N° de registro por pedido, cobrados al bucket `forestal:gtf-serfor`; rate limit por negocio en importar; `maxDuration` 300 s en importar y vista previa (también en `vercel.json`).
14. SERFOR: la caché guarda 10 min sólo lo encontrado; un «no encontrada» vale 60 s (el SNIFFS tropieza: `1-10-0474633` salió «no existe» mientras un curl la traía). El lector de guías (`gtf-ocr`) lee también PDF de hasta 5 hojas (la reserva sale de las hojas) y sirve al Libro TH.

## Consecuencias

- Rastro: `ctp_plan_alta`, `loth_linea_create` por línea, `loth_gtf_create`, `loth_linea_ampliar_referencial` y un resumen `loth_gtf_importar`.
- Tiempo: ~20 consultas por troza dentro de la transacción; desde la PC por el pooler, 5 trozas ≈ 13 s y 49 ≈ 100 s (`IMPORTAR_TX_OPTS` 240 s). La pantalla manda de a pocas (`IMPORTAR_GUIAS_POR_PEDIDO` = 10).
- Un plan nuevo nace sin especies: T6/T7 no frenan hasta que se cargue lo autorizado/registrado (se avisa).
- Pendiente: atar las trozas del CTP a su trozado importado (`WoodEntryTroza.lothTrozadoId`) para que la troza del aserradero recuerde su árbol.
