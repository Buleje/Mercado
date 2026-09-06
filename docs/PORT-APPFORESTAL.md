# Port AppForestal → Buleje · plan vivo

> Fuente: `~/proyectos/appforestal` (copia de `D:\APP WEB\AppForestal`), 23 módulos
> en `frontend/src/features/forestal/`. Objetivo de Brandon (2026-07-31): portar
> **todos** los módulos forestales, adaptados al stack de Buleje y mejorados.
>
> Regla heredada de [[appforestal-proyecto-referencia]]: **se toma la lógica de
> negocio, no el código.** Allá es React+Zustand+Express con estado en
> `localStorage`; acá es Next 16 + Prisma multi-tenant con invariantes I1-I6.
> Toda fórmula se verifica contra un documento real antes de adoptarla (su
> volumen por Smalian daba 3.3113 donde SERFOR declara 3.268).

## Estado

| Módulo (LOC) | Estado | Dónde quedó |
|---|---|---|
| `retrozado` (1650) | ✅ | ADR-313 |
| `reproceso` (1124) | ✅ | ADR-316 |
| `seguimiento-lote` (1651) | ✅ | ADR-315 |
| `emision-gtf` (3270) | ✅ libreta + padrón | ADR-317 · `CtpParteBarra` |
| `proveedores` (1479) | ✅ ficha + trazabilidad | ADR-317 · ADR-319 |
| `ingresos-camiones` (2432) | ✅ | ADR-318 (fletes) + ADR-322 (cuenta corriente: adelantos, fletes a cargo, aserrío prestado, pagos). Falta sólo el PDF del historial |
| `productos-disponibles` (2607) | ⚠️ parcial | atajo stock→guía (`d0a8ee86`) + parser del parte de turno (ADR-323). **Falta: el alta masiva de las corridas parseadas + su UI** (toca correlativo `lineNo` y guard de período cerrado) |
| `ingresos` · `ingresos-ctp` · `gtf` · `consumo` · `lop` · `lotes` · `produccion` | ✅ cubierto o superado | ver "brechas finas" |
| `export-import` (2194) | ✅ **superado** | Buleje ya tenía dictado por voz con comandos, modo continuo, medidas fijas y anti-eco (`lib/forestal/cubicacion.ts` + `useVozContinua`). No portar. |
| `gtf-emitidas` (2033) | ✅ | ADR-321: vista Trazabilidad → Guías emitidas (deriva de los despachos). **NO se portó el "desbloquear con clave"**: en Buleje una guía se corrige anulando el despacho y recargándolo (ADR-312), que deja rastro; una clave compartida no. |
| `trozas-disponibles` (2070) | ✅ parcial | ADR-320: pegar la lista de trozas en el ingreso. **NO se portó el alta/edición suelta de trozas**: en Buleje son inmutables y se crean con su guía (decisión deliberada de `CtpTrozasView`). |
| `asistencias` (466) | ❌ | personal del CTP + asistencia diaria |
| `panel` (443) | ❌ | tablero ejecutivo con alertas (ojo: Buleje ya tiene `CtpHealthChip`/`CtpPendientes`/`CtpAnalisis` — **evaluar si duplica antes de construir**) |
| `baseimg` (1357) | ❌ | foto por especie (fuentes OSINFOR/GBIF/iNaturalist) |
| `estado-productos` (370) | ❌ | reporte tabular filtrable por fechas |
| `gtf-registradas` (279) | ⚠️ | existe `CtpGuiasBandeja`. Falta "verificar conciliación GTF↔LOP" explícita |
| `repositorio` (21) | ⛔ | stub vacío, no portar |

## Brechas finas dentro de lo ya cubierto

- **`ingresos-ctp`**: código de planta correlativo automático (`AF_CTP_CODIGO_PLANTA_COUNTER`) y datos de transporte en la recepción (placa/conductor/orden de transporte).
- **`produccion`**: appforestal maneja 4 líneas (principal · recuperación · **recuperación multiespecies** · complementar principal); Buleje sólo `LP`/`LRE`.
- **`lotes`**: estados `Programado / En proceso / Finalizado` y "programar producción" con orden.
- **`lop`**: formato "Balance de transformación primaria" como reporte propio.
- **`emision-gtf`**: ubigeo jerárquico (dep→prov→dist) en punto de partida/llegada, hoy texto libre.

## Orden sugerido para la próxima oleada

1. **Cuenta corriente de terceros** sobre fletes (`ingresos-camiones` parte 2): aserrío recibido/prestado, saldo al día.
3. **Importar Excel de productos terminados** (`productos-disponibles`) — espeja lo que ADR-320 hizo con las trozas.
4. **Personal y asistencia** (`asistencias`).
5. **Fotos de especie** (`baseimg` simplificado) y **estado de productos** (reporte filtrable).
6. Brechas finas (arriba).

> ⚠️ **Lección de esta oleada:** dos de los tres candidatos que parecían huecos
> (dictado por voz, alta de trozas) ya estaban resueltos o resueltos MEJOR en
> Buleje. Los strings de UI de AppForestal no alcanzan para decidir: hay que
> cruzar contra el código de acá antes de construir.

## Cómo verificar (lo que costó descubrir)

- La nav del Libro usa `role="tab"`, **no** `button`.
- La vista activa se fija con `localStorage["admin-last-tab-ctp-libro"]` vía `addInitScript` (nunca `reload`).
- Login QA: `qaadmin` / `Qa-admin-1234`, tenant `main` (tiene la spec forestal ON y datos reales).
- Migraciones: SQL idempotente en `prisma/manual-migrations/` + `scripts/apply-NNN-migration.mjs`
  con `DIRECT_URL="$(grep DATABASE_URL .env.local ...)"` — el DNS directo de Supabase **no resuelve** desde acá.
  Después: `prisma generate` **y reiniciar el dev server**, si no los modelos nuevos dan 500.
