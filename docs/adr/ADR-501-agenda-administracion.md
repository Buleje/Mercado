# ADR-501 — Agenda de Administración: actividades que se repiten, hechas según lo que el sistema ya registra

- **Estado:** aceptado (2026-10-18). Cambio de schema aditivo (fase expand), ya aplicado en la base compartida.
- **Pedido por:** Brandon (18-10): una página «Administración» que le avise lo que tiene que hacer en el negocio (asistencia, facturas, servicio de aserrío de hoy, gastos e ingresos, adelantos y cuentas de terceros con su período), con calendario tipo Google Calendar, notas por día, avisos en la campana «y otros», y vínculo con Google Calendar/Keep. Eligió las recomendaciones: Tareas y Notas se mudan a Administración; Google en un calendario aparte; avisos por Telegram, sin push al dueño.

## Contexto

Existían `Reminder` (sin recurrencia, 2 filas en toda la base, su cron pisa `status` en todos los tenants), `AdminTask` (0 filas) y `Note` (1 fila, sin fecha) en Equipo, y calendarios de meta, pagos y fiados que no son una agenda.

## Decisión

1. **Pestaña `administracion`** en «Gestión» con vistas Hoy · Calendario · Actividades · Tareas · Notas · Conectar. Tareas y Notas se mudan de Equipo con su `origen` y alias.
2. **Modelo nuevo** `AgendaActividad` (definición + recurrencia + regla) y `AgendaOcurrencia` (sólo lo marcado a mano: hecha / omitida / pospuesta, único `(tenantId, actividadId, fecha)`). Lo pendiente y lo hecho por el sistema se calculan leyendo las fuentes (Asistencia, ForestCtpEntry, Expense/CashMovement/ForestCuentaMov, AdelantoGestion): una asistencia corregida corrige la agenda sola. Cuentas de terceros y facturas al contador se marcan a mano porque ningún modelo registra «lo revisé». Listas cerradas (regla, frecuencia, objetivo, color, estado) = CHECK en SQL + `z.enum` en `lib/agenda/schemas.ts`; tipos compartidos en `lib/agenda/tipos.ts`.
3. **Avisos sin cron nuevo**: la campana lo calcula al abrir y el cron `asistente-avisos` (07:20) lo reparte a campana, Telegram y n8n.
4. **Google**: primero un feed ICS firmado por token (`AgendaFeedIcs`, se guarda el sha256, nunca el token; sin montos; revocable), sin OAuth. Después, escritura con OAuth propio `calendar.app.created` + `tasks` reusando `GOOGLE_CLIENT_ID/SECRET` (`AgendaConexionGoogle` con el refresh token cifrado, `AgendaGoogleEvento` con la huella de lo enviado). Keep no (sólo Workspace) → Google Tasks.
5. **Migración** `20261018_agenda_administracion`, sólo aditiva: 5 tablas nuevas + `Note.fecha` (DATE NULL, índice `(tenantId, fecha)`), en un solo `.sql` por :5432 y marcada con `migrate resolve --applied`. Sin FK a `Tenant` (como `AdminTask`): el aislamiento es el `tenantId` en cada WHERE de la DB class.

## Alternativas descartadas

- Recurrencia en `Reminder`: cambia el significado de `status` y el cron global lo pisaría.
- Una fila por ocurrencia generada por cron: miles de «pendiente» y un cron más (serían 93).
- Fusionar con Planificación: un documento no es el día a día.
- Push web al dueño: la suscripción es de clientes, le llegaría a ellos.
- OAuth con `calendar` completo: vería toda su agenda personal.
- Keep: sin API para cuentas personales.

## Consecuencias

- El `contract` no aplica: no se reemplazó nada. La app vieja de producción no lee ninguna de las tablas nuevas.
- `AgendaFeedIcs.tokenHash` es la única lectura sin `tenantId` de entrada (busca por secreto, como un webhook) y devuelve el `tenantId` de la fila.
- Rotar `AUTH_SECRET` deja las conexiones de Google en `error` (el refresh token se cifra con una clave derivada): hay que reconectar, y la UI lo dice.
- Blas hoy daría «no hecho» casi todos los días en gastos y aserrío: es la verdad de lo anotado, no un bug; por eso las plantillas nacen apagadas.
- El aviso de adelantos de la agenda dice «toca revisar» (otra clave), no repite el «vencido» que ya da `calcularAvisos`.
