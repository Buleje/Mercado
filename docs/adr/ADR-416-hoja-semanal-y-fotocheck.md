# ADR-416 — Recursos Humanos: hoja de asistencia semanal con lo ganado, PDF con firma y fotocheck

- **Fecha:** 2026-09-14
- **Estado:** aceptado — migración de la foto aplicada el 2026-09-14 (2/2 sentencias)
- **Pedido por:** Brandon — «vamos a la pestaña de asistencia, quiero que se implemente mejores diseños, implementa el
  formato semanal, añade columnas como la ganancia diaria y la ganancia semanal acumulada según las asistencias,
  ausencias, junto con su referencia semanal, nº de días trabajados, y para descargar en PDF la tabla semanal con una
  columna para que firmen los empleados; y en Personal un formato tipo fotocheck para añadir imagen y descargar en PDF
  para los fotochecks oficiales, con código QR y demás información de cada empleado».
- **Depende de:** ADR-414 (Recursos Humanos) — mismos roles, misma semana lunes–domingo, mismo cálculo de lo ganado.

## Contexto (medido, 2026-09-14)

| Qué | Cifra / hecho | Fuente |
|---|---|---|
| Vistas de asistencia | Día y Mes; **no había semana** | `AsistenciaView.tsx` |
| Lo ganado | total y tramos por persona; **no el importe de cada día** | `calcularGanado` (`lib/rrhh/ganado.ts`) |
| Tenant real | 2 personas activas, 2 tarifas **semanales**, 8 marcas (todas del 14/9, pruebas de Brandon) | `SELECT` sobre `cmpxiv6p4000bohvzwl6bnfpv` |
| PDF y QR | `jspdf` + `jspdf-autotable` + `qrcode` ya instalados y usados (Adelantos, contratos, forestal) | `package.json` |
| Foto de la persona | `Colaborador` **no tenía** campo de foto; `/api/upload` ya sube a Supabase por tenant | schema, `app/api/upload/route.ts` |

## Decisión

### 1. Lo ganado de cada día sale de `calcularGanado`
`GanadoPersona` suma `dias: DiaGanado[]` (estado, factor e importe de cada día del rango) y `referencia` (la tarifa que
rige el último día que cuenta). El importe del día usa la MISMA fórmula que el tramo (`valorBruto`); el tramo sigue
redondeándose una sola vez, así que el total no es la suma de los importes redondeados. Un día que no entra (antes del
ingreso, después del cese o de hoy, sin tarifa) es `null`, nunca S/ 0. Tests: `__tests__/rrhh-ganado.test.ts`.

### 2. Hoja semanal = la misma hoja, otro rango
`HojaDeLaSemana` usa `use-rrhh-asistencia` (se marca igual que el día y el mes) y `use-rrhh-ganado` con `activo` sólo
en nivel completo (sin él, manager y almacenero dejaban un 403 por apertura). Columnas: persona, lunes a domingo (estado
editable + importe del día), días trabajados (presente y tardanza = 1, medio día = 0,5), faltas (+ permisos) y, sólo en
nivel completo, referencia y ganado de la semana, con el total al pie y el copy obligatorio de ADR-414 §3. Lo ganado se
vuelve a pedir cuando una marca queda guardada (sin pendientes), no con el toque optimista. Bajo 640 px va el calendario
por persona del mes con 7 días y un resumen por persona.

### 3. PDF semanal con firma
`lib/rrhh/asistencia-semanal-pdf.ts` (A4 apaisado, autotable): N°, trabajador con documento, puesto, los 7 días (letra +
monto del día), días trabajados, faltas, permisos, referencia y ganado (sólo nivel completo), columna **Firma** con fila
de 13 mm, total, leyenda, aclaración de referencia y firma del empleador. El documento se pide sólo al descargar
(`/api/rrhh/colaboradores`); el nivel marcar no ve documentos.

### 4. Fotocheck
- **Foto:** columna `Colaborador.fotoUrl` (TEXT, CHECK `https://`), subida por `/api/upload` en la carpeta nueva `rrhh`
  y guardada con la acción `editar` de la ficha. Cambiarla es de gestión y completo (los que editan la ficha).
- **PDF:** `lib/rrhh/fotocheck-pdf.ts` — tarjeta CR80 (54 × 85,6 mm) con frente (negocio, foto 3:4 o iniciales,
  nombre, puesto, documento, ingreso, QR) y dorso (personal e intransferible, QR grande, contacto de emergencia, a quién
  devolverlo, firma del titular); tres personas por A4. Desde la ficha (una) o desde Personal (todas las no cesadas).
- **QR → la ficha en el panel** (`/admin?tab=rrhh&vista=personal&persona=<id>`, que abre la ficha y pide iniciar
  sesión). No hay página pública de verificación: expondría datos personales (Ley 29733) y es otra decisión.

## Migración

`prisma/migrations/adr-416-foto-colaborador.sql` — EXPAND puro: `ADD COLUMN IF NOT EXISTS "fotoUrl"` + CHECK.
**Revertir:** contar personas con foto; si es 0, `DROP CONSTRAINT` y `DROP COLUMN`. El código se revierte con `git revert`.

## Consecuencias

- La hoja semanal y lo ganado no pueden dar distinto: una sola función.
- La foto vive en el bucket público de imágenes, con ruta difícil de adivinar, como el resto de las imágenes del panel.
- Pendiente: página pública de verificación del fotocheck (si Brandon la quiere), logo del negocio en la tarjeta, y
  vincular `assignedTo` de tareas o las personas de RRHH con usuarios del panel.
