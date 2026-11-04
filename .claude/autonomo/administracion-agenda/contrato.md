# Contrato — Administración (agenda del negocio) · ADR-501 · 18-10

> Lo escribió `architect` (solo lectura). Las cifras salen de `scripts/sql-lectura.mjs` (READ ONLY) sobre Blas
> (`cmpxiv6p4000bohvzwl6bnfpv`) y la base entera, el 18-10. «Sin verificar» = no se midió en esta sesión.

## 0. Mapa del estado real (qué se reusa, qué es nuevo)

| Pieza pedida | Qué ya existe (archivo:línea) | Medido | Qué se hace |
|---|---|---|---|
| Recordatorios | `model Reminder` schema.prisma:2323 (sin recurrencia, `status` por fila) · `lib/db/reminders.db.ts:25` · campana lo lee en `use-alertas-consolidadas.ts:174` | 2 filas en TODA la base | NO se extiende (ver §2). Se muestra en el calendario como dato de solo lectura |
| Tareas de una vez | `model AdminTask` :2254 (dueDate, status, assignedTo, completedAt) · `lib/db/admin-tasks.db.ts:42` · `app/api/tasks/route.ts` · vista `rrhh›tareas` (subvistas-modulos.ts:295) | 0 filas en toda la base | Se REUSA: «tarea de una vez» en la agenda = AdminTask |
| Notas | `model Note` :1939 (sin fecha) · `lib/db/notes.db.ts:32` (prefijo `__` = nota de sistema, :30) · `app/api/notes/route.ts` · vista `rrhh›notas` (:296) | 1 fila en toda la base | Se REUSA + columna aditiva `fecha DATE` = «nota del día» |
| Recurrencia | `AdelantoRecurrente` :5493 (frecuencia semanal/quincenal/mensual, diaSemana, diaMes) | — | Mismo vocabulario de campos en el modelo nuevo |
| Avisos persistidos + Telegram + n8n | `calcularAvisos` lib/asistente/avisos.ts:256 → cron `asistente-avisos` (vercel.json:426, 12:20 UTC = 07:20 Lima): campana con dedupe 20 h + Telegram (tope 5) + n8n | — | Se REUSA: un chequeo más (`agenda`). **Cero crons nuevos** (hay 92) |
| Avisos «ahora» de la campana | `useAlertasConsolidadas` (use-alertas-consolidadas.ts:158) arma `AlertaAhora[]` al abrir con 3 `fetch` | — | Fuente nueva `/api/admin/agenda/hoy` + mapeador en `lib/` (enganche §4, no se toca el diseño) |
| Campana de upsert sin duplicar | `NotificationCenterDB.createOrReuse` / `sincronizarAvisos` lib/db/notification-center.db.ts:150/217 | — | Lo usa el cron que ya existe |
| Calendario mensual | `components/admin/metas/calendario/GrillaDelMes.tsx` (240 l.) y `CalendarioMes.tsx` (243 l.) · `components/admin/documentos/CalendarView.tsx` (153 l.) | — | Patrón para la grilla nueva; no se tocan |
| Reporte diario por WhatsApp/correo | `ForestReporteDiario` :8754 + `lib/forestal/reporte-diario-envio.ts` (07/13/18/21 Lima, `SECCIONES_REPORTE` reporte-diario.ts:17) | — | Fase 2: sección `agenda` (solo forestal) |
| Cifrar secretos | `cifrarSecreto/descifrarSecreto` lib/cripto-secretos.ts:87/102 (clave derivada de `AUTH_SECRET`) | — | Refresh token de Google |
| OAuth Google | `lib/auth/oauth-google.ts` (scope `openid email profile`, redirect fijo `/api/auth/google/callback` :39 → login de CLIENTES, `app/api/auth/google/callback` crea `Customer`) | `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están en `.env.local` | Se reusan las DOS env; flujo nuevo propio (no se toca el login) |
| Feed ICS | nada (`BEGIN:VCALENDAR` solo en un mapa MIME) | — | Nuevo |
| Push al dueño | `PushSubscription` :1516 se da de alta SOLO con sesión de cliente (`app/api/notifications/subscribe/route.ts:56` exige `customerId`, H004) o desde la tienda; `broadcastPush(tenantId)` lib/push-sender.ts:51 le llega a CLIENTES | — | **No se usa** (decisión 3) |

## 1. Dónde vive: pestaña nueva `administracion`, que absorbe Tareas y Notas

**Decisión**: tab nueva «Administración» en la categoría «Gestión» (`app/admin/_lib/tab-categories.ts:513-522`, junto a
`planificacion`). Vistas (`?vista=`):

| Vista | Qué contesta | Fuente |
|---|---|---|
| `hoy` «Hoy» | qué me toca hoy y qué quedó atrasado (7 días) | motor §3 |
| `calendario` «Calendario» | mes · semana · día, tipo Google Calendar: actividades, notas del día, tareas con fecha, vencimientos de otros módulos (solo lectura, con enlace) | §3 + Note.fecha + AdminTask.dueDate |
| `actividades` «Actividades» | configurar las que se repiten (las 6 sugeridas + manuales) | AgendaActividad |
| `tareas` «Tareas» | lo de una vez y quién lo hace | AdminTask (se muda de Equipo) |
| `notas` «Notas» | apuntes, con o sin día | Note (se muda de Equipo) |
| `conectar` «Conectar» | Google Calendar, Google Tasks, enlace ICS; Telegram/WhatsApp → link a Ajustes › Automatizaciones (subvistas-modulos.ts:260), no se duplica | §5 |

Por qué no una fusión con lo que ya hay (regla «cada pestaña con tarea propia»):

| Candidata | Su tarea | Por qué no |
|---|---|---|
| Planificación (ADR-497) | el plan de la empresa por escrito (12 secciones, versión, socios) | es un documento; la agenda es el día a día. Mezclarlas = dos tareas en una pestaña. Sí se lee: los objetivos con plazo salen en el calendario (fase 2) |
| Metas › calendario | cada día contra su meta de venta | números contra meta, no actividades |
| Cuentas por pagar › calendario | vencimientos de `Payable` | Blas: 0 payables. Entra al calendario como vencimiento de solo lectura |
| Cuentas por cobrar › agenda | fiados por vencer | ídem |
| **Equipo › Tareas y Notas** | «lo que tiene que hacer el equipo» / «apuntes» | **ESTE es el duplicado**: «lo que tengo que hacer en mi negocio» ES una lista de tareas. Se mudan a Administración con su `origen` (`["tareas"]`, `["tareas","notas"]`) para que las vea quien ya las veía, y `?tab=tareas` / `?tab=notas` (TabRouter.tsx:308-309) pasan a abrir `administracion`. Medido: 0 tareas y 1 nota en toda la base → mudarlas no mueve datos de nadie. (Decisión 1) |

Registro de la pestaña = mismo set que usó Planificación (commit `73de5b12c`): `TabRouter.tsx`, `tab-categories.ts`,
`tab-data.ts`, `tab-preload.ts`, `tabs.types.ts` + `lib/admin/subvistas-modulos.ts`. Planificación no está en
`lib/admin-template.ts` ni en `lib/billing/plan-tiers.ts` (grep); seguir el mismo camino (visible para todos los planes).

## 2. Modelo de datos (modelo nuevo, no `Reminder`)

**Por qué no `Reminder`**: guarda UN `status` por fila (`pendiente|completado|vencido`) y el cron
`app/api/cron/reminders/route.ts:28` lo pisa con un `updateMany` sobre TODOS los tenants. Una actividad que se repite
necesita estado POR DÍA; meterle recurrencia obliga a crear una fila por ocurrencia (miles de filas «pendiente» que el
cron marcaría vencidas) o cambia el significado de `status` de las 2 filas que ya existen. Modelo nuevo:

- **`AgendaActividad`** = la definición (qué, cada cuánto, cómo se sabe que está hecha, por dónde avisar).
- **`AgendaOcurrencia`** = SOLO los días con algo dicho a mano (hecha / omitida / pospuesta). Lo pendiente NO se guarda:
  se calcula. Lo «hecho por el sistema» tampoco: se lee de la fuente (una asistencia corregida corrige la agenda sola).
- **`AgendaFeedIcs`**, **`AgendaConexionGoogle`**, **`AgendaGoogleEvento`** = integraciones (§5).
- **`Note.fecha`** (columna nueva, NULL = nota sin día).

### Prisma (agregar al final del bloque «Metas y tareas del panel», después de `AdminTask` :2271)

```prisma
/// Agenda de Administración (ADR-501): lo que se repite en el negocio y cómo se sabe que se hizo.
/// Listas cerradas (regla, frecuencia, objetivoTipo): CHECK en SQL + z.enum en lib/agenda/schemas.ts.
/// Fechas date-only en hora de Lima; `hora` = «HH:MM» de pared, sin zona.
model AgendaActividad {
  id             String    @id @default(cuid())
  tenantId       String
  nombre         String
  /// asistencia | facturas | servicio_aserrio | gastos_ingresos | adelantos | cuenta_tercero | manual
  regla          String    @default("manual")
  /// parte (ForestParty, cuenta corriente ADR-322) | beneficiario (AdelantoBeneficiario) | NULL = todas
  objetivoTipo   String?
  objetivoId     String?
  /// Snapshot del nombre: la parte puede darse de baja y la agenda de marzo sigue diciendo con quién era.
  objetivoNombre String?
  /// una_vez | diaria | semanal | quincenal | mensual | cada_n_dias
  frecuencia     String
  desde          DateTime  @db.Date
  hasta          DateTime? @db.Date
  /// 0 = domingo … 6 = sábado (diaria/semanal/quincenal).
  diasSemana     Int[]     @default([])
  /// 1-31; 31 = último día del mes (mensual).
  diaMes         Int?
  cadaN          Int?
  hora           String?
  /// campana | telegram | n8n | reporte_diario | google
  canales        String[]  @default(["campana"])
  /// AdminRole que la ve y la marca (NULL = solo admin/owner/manager).
  responsableRol String?
  /// Validado por regla (PARAMETROS_POR_REGLA en lib/agenda/schemas.ts).
  parametros     Json      @default("{}")
  /// Token del DS: info | success | warning | error | neutral. Nunca hex.
  color          String    @default("info")
  nota           String?
  activo         Boolean   @default(true)
  creadoPor      String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?
  deletedBy      String?

  ocurrencias AgendaOcurrencia[]

  @@unique([tenantId, id])
  @@index([tenantId, activo])
}

/// Un día de una actividad con algo dicho A MANO. Lo pendiente no se guarda (se calcula).
model AgendaOcurrencia {
  id          String    @id @default(cuid())
  tenantId    String
  actividadId String
  fecha       DateTime  @db.Date
  /// hecha | omitida | pospuesta
  estado      String
  posponerA   DateTime? @db.Date
  nota        String?
  marcadoPor  String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  actividad AgendaActividad @relation(fields: [tenantId, actividadId], references: [tenantId, id], onDelete: Restrict)

  @@unique([tenantId, actividadId, fecha])
  @@index([tenantId, fecha])
}

/// Enlace ICS de solo lectura (Google Calendar / Outlook / Apple se suscriben por URL). Se guarda el
/// sha256 del token, nunca el token; se busca por hash (única lectura sin tenantId de entrada).
model AgendaFeedIcs {
  id         String    @id @default(cuid())
  tenantId   String
  nombre     String    @default("Agenda del negocio")
  tokenHash  String    @unique
  /// Últimos 4 caracteres, para reconocerlo en la lista.
  tokenPista String
  /// actividades | notas | tareas | vencimientos
  incluye    String[]  @default(["actividades", "notas", "tareas"])
  creadoPor  String
  createdAt  DateTime  @default(now())
  ultimoUso  DateTime?
  revocadoEn DateTime?

  @@index([tenantId])
}

/// Google conectado por un usuario del panel (Calendar + Tasks). refresh token cifrado (cripto-secretos).
model AgendaConexionGoogle {
  id                  String    @id @default(cuid())
  tenantId            String
  adminUserId         String
  email               String
  scopes              String[]  @default([])
  refreshTokenCifrado String
  calendarId          String?
  tasklistId          String?
  /// activa | revocada | error
  estado              String    @default("activa")
  ultimoError         String?
  ultimaSync          DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  eventos AgendaGoogleEvento[]

  @@unique([tenantId, adminUserId])
}

/// Qué evento de Google corresponde a qué actividad (para editar/borrar en vez de duplicar).
model AgendaGoogleEvento {
  id            String   @id @default(cuid())
  tenantId      String
  conexionId    String
  actividadId   String
  googleEventId String?
  googleTaskId  String?
  /// sha256 de lo último enviado: si no cambió, no se llama a Google.
  huella        String
  updatedAt     DateTime @updatedAt

  conexion AgendaConexionGoogle @relation(fields: [conexionId], references: [id], onDelete: Cascade)

  @@unique([conexionId, actividadId])
  @@index([tenantId])
}
```

`model Note` (:1939) suma: `fecha DateTime? @db.Date` + `@@index([tenantId, fecha])`. Sin relación con `Tenant`
(igual que `AdminTask` y `Asistencia`): no se toca el bloque de `Tenant`.

### SQL — `prisma/migrations/20261018_agenda_administracion/migration.sql` (solo EXPAND, todo aditivo)

```sql
-- ADR-501 · Agenda de Administración. Fase EXPAND (aditiva): 5 tablas nuevas + Note.fecha (NULL).
-- La app vieja de producción no conoce nada de esto y sigue igual. No hay fase contract.
-- Aplicar (pooler de SESIÓN :5432, una tx, SAVEPOINT por sentencia, SET LOCAL lock_timeout 5s; nunca SET de sesión):
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261018_agenda_administracion/migration.sql --ensayo dotenv_config_path=.env.local
--   node -r dotenv/config scripts/aplicar-migracion-sesion.mjs prisma/migrations/20261018_agenda_administracion/migration.sql dotenv_config_path=.env.local
--   node scripts/migraciones-cruce.mjs --verificar 20261018_agenda_administracion
--   node scripts/prisma-session.mjs migrate resolve --applied 20261018_agenda_administracion
-- Después: `npx prisma generate` y reiniciar el dev server.
-- Candado: "Note" tiene 1 fila en toda la base (18-10): ADD COLUMN NULL sin default = solo catálogo; el índice tarda ms.

CREATE TABLE "AgendaActividad" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "regla" TEXT NOT NULL DEFAULT 'manual',
  "objetivoTipo" TEXT,
  "objetivoId" TEXT,
  "objetivoNombre" TEXT,
  "frecuencia" TEXT NOT NULL,
  "desde" DATE NOT NULL,
  "hasta" DATE,
  "diasSemana" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "diaMes" INTEGER,
  "cadaN" INTEGER,
  "hora" TEXT,
  "canales" TEXT[] NOT NULL DEFAULT ARRAY['campana']::TEXT[],
  "responsableRol" TEXT,
  "parametros" JSONB NOT NULL DEFAULT '{}',
  "color" TEXT NOT NULL DEFAULT 'info',
  "nota" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  CONSTRAINT "AgendaActividad_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaActividad_regla_chk" CHECK ("regla" IN ('asistencia','facturas','servicio_aserrio','gastos_ingresos','adelantos','cuenta_tercero','manual')),
  CONSTRAINT "AgendaActividad_frecuencia_chk" CHECK ("frecuencia" IN ('una_vez','diaria','semanal','quincenal','mensual','cada_n_dias')),
  CONSTRAINT "AgendaActividad_objetivoTipo_chk" CHECK ("objetivoTipo" IS NULL OR "objetivoTipo" IN ('parte','beneficiario')),
  CONSTRAINT "AgendaActividad_objetivo_par_chk" CHECK (("objetivoTipo" IS NULL) = ("objetivoId" IS NULL)),
  CONSTRAINT "AgendaActividad_diaMes_chk" CHECK ("diaMes" IS NULL OR "diaMes" BETWEEN 1 AND 31),
  CONSTRAINT "AgendaActividad_cadaN_chk" CHECK ("cadaN" IS NULL OR "cadaN" BETWEEN 1 AND 366),
  CONSTRAINT "AgendaActividad_hora_chk" CHECK ("hora" IS NULL OR "hora" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "AgendaActividad_diasSemana_chk" CHECK ("diasSemana" <@ ARRAY[0,1,2,3,4,5,6]),
  CONSTRAINT "AgendaActividad_rango_chk" CHECK ("hasta" IS NULL OR "hasta" >= "desde")
);
CREATE UNIQUE INDEX "AgendaActividad_tenantId_id_key" ON "AgendaActividad"("tenantId", "id");
CREATE INDEX "AgendaActividad_tenantId_activo_idx" ON "AgendaActividad"("tenantId", "activo");

CREATE TABLE "AgendaOcurrencia" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actividadId" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "estado" TEXT NOT NULL,
  "posponerA" DATE,
  "nota" TEXT,
  "marcadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaOcurrencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaOcurrencia_estado_chk" CHECK ("estado" IN ('hecha','omitida','pospuesta')),
  CONSTRAINT "AgendaOcurrencia_posponer_chk" CHECK (("estado" = 'pospuesta') = ("posponerA" IS NOT NULL))
);
CREATE UNIQUE INDEX "AgendaOcurrencia_tenantId_actividadId_fecha_key" ON "AgendaOcurrencia"("tenantId", "actividadId", "fecha");
CREATE INDEX "AgendaOcurrencia_tenantId_fecha_idx" ON "AgendaOcurrencia"("tenantId", "fecha");
ALTER TABLE "AgendaOcurrencia" ADD CONSTRAINT "AgendaOcurrencia_tenantId_actividadId_fkey"
  FOREIGN KEY ("tenantId", "actividadId") REFERENCES "AgendaActividad"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AgendaFeedIcs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL DEFAULT 'Agenda del negocio',
  "tokenHash" TEXT NOT NULL,
  "tokenPista" TEXT NOT NULL,
  "incluye" TEXT[] NOT NULL DEFAULT ARRAY['actividades','notas','tareas']::TEXT[],
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoUso" TIMESTAMP(3),
  "revocadoEn" TIMESTAMP(3),
  CONSTRAINT "AgendaFeedIcs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgendaFeedIcs_tokenHash_key" ON "AgendaFeedIcs"("tokenHash");
CREATE INDEX "AgendaFeedIcs_tenantId_idx" ON "AgendaFeedIcs"("tenantId");

CREATE TABLE "AgendaConexionGoogle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "refreshTokenCifrado" TEXT NOT NULL,
  "calendarId" TEXT,
  "tasklistId" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'activa',
  "ultimoError" TEXT,
  "ultimaSync" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaConexionGoogle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgendaConexionGoogle_estado_chk" CHECK ("estado" IN ('activa','revocada','error'))
);
CREATE UNIQUE INDEX "AgendaConexionGoogle_tenantId_adminUserId_key" ON "AgendaConexionGoogle"("tenantId", "adminUserId");

CREATE TABLE "AgendaGoogleEvento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conexionId" TEXT NOT NULL,
  "actividadId" TEXT NOT NULL,
  "googleEventId" TEXT,
  "googleTaskId" TEXT,
  "huella" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaGoogleEvento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgendaGoogleEvento_conexionId_actividadId_key" ON "AgendaGoogleEvento"("conexionId", "actividadId");
CREATE INDEX "AgendaGoogleEvento_tenantId_idx" ON "AgendaGoogleEvento"("tenantId");
ALTER TABLE "AgendaGoogleEvento" ADD CONSTRAINT "AgendaGoogleEvento_conexionId_fkey"
  FOREIGN KEY ("conexionId") REFERENCES "AgendaConexionGoogle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note" ADD COLUMN "fecha" DATE;
CREATE INDEX "Note_tenantId_fecha_idx" ON "Note"("tenantId", "fecha");
```

Verificación tras aplicar (READ ONLY): `node scripts/sql-lectura.mjs "select count(*) from information_schema.tables where table_name like 'Agenda%'"` → 5;
`migraciones-cruce.mjs --verificar` en verde. `--ensayo` primero (regla: nunca ensayo con rollback parcheando prisma).

## 3. Motor de reglas: «¿ya está hecho hoy?» leyendo lo que el sistema YA registra

Puro y testeable: `lib/agenda/recurrencia.ts` (qué días toca) + `lib/agenda/motor.ts` (estado de cada día) reciben
los «hechos por día» que lee `lib/db/agenda-fuentes.db.ts` (UNA consulta agrupada por día de Lima por fuente y rango,
nunca una por día: 119 ms por ida a Supabase).

| Regla | «Hecho» automático si… | Tabla / DB class real | Detalle que muestra | Blas 18-10 (medido) |
|---|---|---|---|---|
| `asistencia` | marcas vivas del día ≥ colaboradores activos (`parametros.minimo: "todos"`) o ≥1 (`"alguno"`); parcial = «6 de 8» | `Asistencia` schema:2201 (idx `[tenantId, fecha]`), `AsistenciaDB.hoja(tenantId, desde, hasta)` lib/db/rrhh-asistencia.db.ts:211 | «6 de 8 marcados» → `/admin?tab=rrhh&vista=asistencia` | 58 marcas en 9 de los últimos 30 días; última 16-10; 8 colaboradores |
| `servicio_aserrio` | ≥1 `ForestCtpEntry` `section='produccion'`, `deletedAt IS NULL`, `entryDate` en el día de Lima; con `parametros.soloTerceros` además `duenoMadera='tercero'` (schema:6754, ADR-412) | `ForestCtpEntry` schema:6672. No hay método por día → nuevo `AgendaFuentesDB.corridasPorDia` | «2 corridas · 1 de tercero» → libro CTP producción | 5 corridas en total, última 01-08, 0 de tercero |
| `gastos_ingresos` | según `parametros.que`: gasto del día (`Expense.date`), ingreso/egreso/venta de caja del día (`CashMovement.type`, **sin tenantId: join `CashRegister.tenantId`**), caja cerrada (`CashRegister.closedAt`), movimiento de cuenta forestal (`ForestCuentaMov.fecha`) | `Expense` :1343 (`ExpensesDB` lib/db/expenses.db.ts:13) · `CashMovement` :1152 + `CashRegister` :1135 · `ForestCuentaMov` :7706 (`ForestCuentaDB.listar` lib/db/forest-cuenta.db.ts:303) | «0 gastos · 0 ingresos hoy» → Plata › Gastos / Caja | 1 gasto en total (03-07), 0 cajas en 30 días, 0 TreasuryMovimiento, 32 movimientos de cuenta |
| `adelantos` | ≥1 `AdelantoGestion` del día (para el `objetivoId` beneficiario, o de cualquiera si NULL) = «la revisé» | `AdelantoGestion` :5472 (idx `[tenantId, beneficiarioId, fecha]`), `AdelantosDB.listGestiones` lib/db/adelantos.db.ts:887 | con saldo (`Adelanto.saldoPendiente>0` :5516), vencidos (`fechaVencimiento<hoy`), entregas pactadas para hoy (`AdelantoEntregaPactada.fechaEsperada` :5743, **sin tenantId: join `Adelanto`**) | 7 con saldo, 0 vencidos, 0 gestiones, 4 beneficiarios |
| `cuenta_tercero` | **MANUAL** — no existe «revisé la cuenta» en ningún modelo (grep `controlad|revisad`: nada de cuentas). `AdelantosControlDB.controlar` (adelantos-control.db.ts:59) cambia vencimiento/contrato, no es una revisión | `ForestCuentaMov` por `parteId` · `ForestCuentaDB.saldoConsolidado` :406 · `movimientosDeParte` :492 | saldo + «N movimientos desde tu última revisión» (fecha > última `AgendaOcurrencia` hecha) | 1 parte con cuenta, 32 movimientos |
| `facturas` | **MANUAL** — no existe «entregué las facturas al contador» | apoyo: pendientes SUNAT `SunatDB.getPendingInvoices` lib/db/sunat.db.ts:206 (`SunatInvoice` :3967) · gastos del mes con comprobante (`Expense.supplierRuc`) · ventana del contador `ventanaVencimientoReferencial(ruc)` lib/tax/obligaciones-peru.ts:132 | «Referencial: 2da semana del mes siguiente (RUC termina en 3) — confirma con el cronograma de SUNAT». **Nunca una fecha exacta inventada** | 0 comprobantes electrónicos |
| `manual` | solo a mano | `AgendaOcurrencia` | — | — |

Reglas del motor (en este orden): ocurrencia manual manda (hecha/omitida/pospuesta) → fuente dice hecho → `hecha` /
`parcial` → fecha > hoy = `futura` → fecha = hoy: `pendiente` (pasa a aviso `critical` si `hora` ya pasó) → fecha < hoy
sin hecho = `atrasada` (se arrastra hasta 7 días; después queda en el historial, no en «Hoy»). «Hoy» = `limaDateKey()`;
aritmética de fechas en UTC sobre claves `YYYY-MM-DD`. `mensual` con `diaMes=31` = último día del mes; `quincenal` =
cada 2 semanas en `diasSemana` contando desde `desde` (igual que `AdelantoRecurrente`).

Las 6 sugeridas (`lib/agenda/plantillas.ts`, se crean con un clic, todas apagadas hasta que Brandon elige días):
asistencia (lun-sáb 09:00), servicio de aserrío de hoy (lun-sáb 17:00), registrar gastos e ingresos (diaria 19:00),
revisar adelantos (semanal lunes), revisar la cuenta de <parte> (semanal, una por parte), llevar facturas al contador
(mensual día 5). Cifras de hora = valores por defecto editables, no datos del negocio.

Caché de las fuentes: `getOrSet` 60 s con clave `agenda-fuentes:${tenantId}:${regla}:${desde}:${hasta}`. Las escriben
OTROS módulos, así que no hay `invalidate` en su write: TTL corto + «Actualizar» pide fresco (lo dice el ⓘ).

## 4. Avisos

| Canal | Cómo | Archivo que se toca |
|---|---|---|
| Campana › «Ahora» (al abrir, sin persistir) | `GET /api/admin/agenda/hoy` → `ResumenAgendaHoy.alertas: AlertaAgenda[]` (mismo shape que `AlertaAhora`, use-alertas-consolidadas.ts:20; `categoria: "sistema"` hasta que la campana sume una `agenda`). Mapeador puro `alertasDeAgenda()` en `lib/agenda/alertas-campana.ts` | **Enganche, fase final y EN FILA tras el rediseño**: 3 líneas en `use-alertas-consolidadas.ts:171-184` (un `leer("/api/admin/agenda/hoy", fresco)` gateado con `puedePedir`, y `...alertasDeAgenda(r)`). Ningún carril toca `components/notifications/**` |
| Campana persistida + Telegram + n8n (07:20 Lima) | chequeo `["agenda", avisosDeAgenda(tenantId, ahora)]` en `calcularAvisos` (lib/asistente/avisos.ts:258). Un aviso agrupado «Hoy te toca: …» (clave `agenda-hoy:<fecha>`) + uno por atrasada (`agenda-atrasada:<actividadId>:<fecha>`); solo actividades con ese canal en `canales` | `lib/asistente/avisos.ts` (1 línea + import), `lib/agenda/avisos-asistente.ts` (nuevo) |
| WhatsApp / correo a una hora | fase 2: sección `agenda` en `SECCIONES_REPORTE` (lib/forestal/reporte-diario.ts:17) → sale en los reportes de 07/13/18/21. Solo negocios con reporte configurado (hoy la UI es del forestal). WhatsApp depende de Twilio (en prueba) | `lib/forestal/reporte-diario.ts`, `reporte-diario-armado.ts` |
| Push al celular | **NO** en este lote (PushSubscription es de clientes; ver §0) | — |

Sin cron nuevo: «Hoy» y la campana se calculan al abrir; lo de afuera sale en el cron de las 07:20 que ya existe.
Límite honesto: un aviso «a las 19:00 si no anotaste gastos» por Telegram NO sale sin un disparo a esa hora (el de
07:20 avisa lo de ayer y lo de hoy). Si Brandon lo quiere, el disparo de las 18:00 de reportes-diarios es el lugar.

## 5. Google y otros

**(a) Feed ICS, sin OAuth (fase 1, lo más rápido)** — `GET /api/public/agenda-ics/[token]` (bajo `/api/public/`, que
ya existe: el proxy no exige sesión fuera de `/api/admin` y el rate limit de proxy.ts:69 aplica igual; **sin verificar**
que el tenant guard deje pasar sin cookie → lo prueba el tester con `curl`). Token 32 bytes base64url, se guarda
`sha256`; lookup por hash → `tenantId` de la fila; `revocadoEn` ⇒ 404. `Content-Type: text/calendar; charset=utf-8`.
Un `VEVENT` por actividad con `RRULE` (diaria `FREQ=DAILY;BYDAY=…`, semanal `FREQ=WEEKLY;BYDAY=…`, quincenal
`FREQ=WEEKLY;INTERVAL=2;BYDAY=…`, mensual `FREQ=MONTHLY;BYMONTHDAY=n` / `-1`, cada N `FREQ=DAILY;INTERVAL=N`,
`UNTIL` si hay `hasta`), `TZID=America/Lima` con `VTIMEZONE` fijo −05:00 (sin horario de verano), todo el día si no hay
`hora`; notas con fecha y tareas con fecha como `VEVENT` de todo el día (Google ignora `VTODO`). **Sin montos** (solo
nombres: «Revisar la cuenta de Juan»). Google refresca los calendarios suscritos cuando quiere (horas, a veces un día):
decirlo en el ⓘ. Sirve igual para Outlook y Apple.

**(b) Escribir en su Google Calendar (fase 3, OAuth)** — flujo propio, NO el del login (ese crea `Customer`):
`GET /api/admin/agenda/google/conectar` → 302 a Google con `scope = https://www.googleapis.com/auth/calendar.app.created
https://www.googleapis.com/auth/tasks openid email`, `access_type=offline`, `prompt=consent`, `state` firmado
(HMAC con `AUTH_SECRET`: tenantId + adminUserId + nonce; nonce en cookie httpOnly 10 min). `calendar.app.created` =
la app solo ve el calendario que ella crea («Buleje · Administración»), no la agenda personal (decisión 2).
Callback `GET /api/admin/agenda/google/callback` → intercambia el code (fetch a `https://oauth2.googleapis.com/token`
con su propio `redirect_uri`; `exchangeCodeForTokens` de oauth-google.ts:67 no sirve porque fija el redirect de :39) →
`cifrarSecreto(refresh_token)` → `AgendaConexionGoogle`. Al crear/editar/borrar una actividad con canal `google`:
`sincronizarActividad()` fire-and-forget `.catch(err => logger.error(...))`, upsert del evento recurrente; `huella`
evita llamadas sin cambios. Una sola dirección (Buleje → Google).
**Env**: se REUSAN `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (están en `.env.local`). No falta ninguna env nueva. Falta
en Google Cloud Console (lo hace Brandon): habilitar **Google Calendar API** y **Google Tasks API**; sumar el redirect
`<base>/api/admin/agenda/google/callback` (localhost y producción); sumar los scopes a la pantalla de consentimiento;
pasar la app de «Testing» a «In production» — en Testing los refresh token vencen a los 7 días (política de Google;
**sin verificar en vivo**). Sin verificación de Google sale la pantalla «app no verificada» (aceptable para su cuenta).

**(c) Google Keep — no se puede para una cuenta personal.** La API de Keep (`keep.googleapis.com`) es para Google
Workspace empresarial con delegación de dominio (documentación oficial; **sin verificar en vivo en esta sesión**). Lo más
cercano con API para Gmail personal: **Google Tasks** (mismo OAuth de arriba): las tareas de una vez (AdminTask) y las
notas con fecha van a una lista «Buleje», y se ven dentro de Google Calendar y en la app Tasks. «Y otros»: Outlook y
Apple por el mismo ICS; Microsoft To Do (Graph) queda fuera hasta que lo pida.

## 6. Tipos compartidos (escribirlos ANTES de lanzar carriles) — `lib/agenda/tipos.ts` + `lib/agenda/schemas.ts`

```ts
// lib/agenda/tipos.ts — sin imports de servidor (lo usan el panel y la API)
import type { AdminRole } from "@/lib/session";
export const REGLAS_AGENDA = ["asistencia","facturas","servicio_aserrio","gastos_ingresos","adelantos","cuenta_tercero","manual"] as const;
export const FRECUENCIAS_AGENDA = ["una_vez","diaria","semanal","quincenal","mensual","cada_n_dias"] as const;
export const CANALES_AGENDA = ["campana","telegram","n8n","reporte_diario","google"] as const;
export const ESTADOS_MANUALES = ["hecha","omitida","pospuesta"] as const;
export const COLORES_AGENDA = ["info","success","warning","error","neutral"] as const;
export type ReglaAgenda = (typeof REGLAS_AGENDA)[number];
export type FrecuenciaAgenda = (typeof FRECUENCIAS_AGENDA)[number];
export type CanalAgenda = (typeof CANALES_AGENDA)[number];
export type EstadoManual = (typeof ESTADOS_MANUALES)[number];
export type EstadoOcurrencia = EstadoManual | "parcial" | "pendiente" | "atrasada" | "futura";
/** «YYYY-MM-DD» en hora de Lima. */
export type FechaKey = string;

export interface Recurrencia {
  frecuencia: FrecuenciaAgenda; desde: FechaKey; hasta: FechaKey | null;
  diasSemana: number[]; diaMes: number | null; cadaN: number | null;
}
export interface ObjetivoActividad { tipo: "parte" | "beneficiario"; id: string; nombre: string }
export interface ActividadDTO {
  id: string; nombre: string; regla: ReglaAgenda; objetivo: ObjetivoActividad | null;
  recurrencia: Recurrencia; hora: string | null; canales: CanalAgenda[];
  responsableRol: AdminRole | null; parametros: Record<string, unknown>;
  color: (typeof COLORES_AGENDA)[number]; nota: string | null; activo: boolean;
  /** ISO de updatedAt: concurrencia optimista en PATCH. */
  version: string;
}
export interface OcurrenciaDTO {
  actividadId: string; nombre: string; regla: ReglaAgenda; fecha: FechaKey; hora: string | null;
  estado: EstadoOcurrencia;
  /** fuente = lo dijo el sistema · manual = lo marcó alguien · sin_fuente = regla manual sin marcar */
  origen: "fuente" | "manual" | "sin_fuente";
  detalle: string | null; avance: { hecho: number; total: number } | null;
  href: string; nota: string | null; marcadoPor: string | null; posponerA: FechaKey | null;
}
export interface NotaDelDia { id: string; titulo: string; contenido: string; color: string; fecha: FechaKey }
export interface TareaDelDia { id: string; titulo: string; estado: string; prioridad: string; asignadoA: string | null; fecha: FechaKey }
export interface VencimientoDelDia { id: string; origen: "adelanto" | "entrega_pactada" | "promesa_adelanto" | "recordatorio"; titulo: string; fecha: FechaKey; href: string }
export interface DiaAgenda { fecha: FechaKey; ocurrencias: OcurrenciaDTO[]; notas: NotaDelDia[]; tareas: TareaDelDia[]; vencimientos: VencimientoDelDia[] }
export interface AlertaAgenda {
  id: string; categoria: "sistema"; severity: "critical" | "warning";
  title: string; description: string; action?: { label: string; href: string }; cantidad?: number;
}
export interface ResumenAgendaHoy {
  fecha: FechaKey; hoy: OcurrenciaDTO[]; atrasadas: OcurrenciaDTO[];
  cuenta: { total: number; hechas: number; pendientes: number; atrasadas: number };
  alertas: AlertaAgenda[];
}
export interface FeedIcsDTO { id: string; nombre: string; pista: string; incluye: string[]; creadoEn: string; ultimoUso: string | null }
export interface ConexionGoogleDTO { email: string; estado: "activa" | "revocada" | "error"; ultimaSync: string | null; ultimoError: string | null; tareas: boolean }
```

`lib/agenda/schemas.ts` (Zod 4, siempre `safeParse`): `RecurrenciaSchema` (`superRefine`: semanal/quincenal/diaria
exigen `diasSemana.length ≥ 1`; mensual exige `diaMes`; cada_n_dias exige `cadaN`; `hasta ≥ desde`), `ActividadCrearSchema`
(`nombre` 1-80, `regla`, `objetivo` exigido si `cuenta_tercero`, `hora` regex HH:MM, `canales` ≥1),
`ActividadEditarSchema` = `.partial()` + `version` obligatorio (ojo Zod 4 `.partial()` con defaults: hub-gotchas-stack),
`PARAMETROS_POR_REGLA: Record<ReglaAgenda, ZodType>` (asistencia `{minimo: "todos"|"alguno"}`; servicio_aserrio
`{soloTerceros: boolean}`; gastos_ingresos `{que: ("gastos"|"ingresos"|"caja_cerrada"|"cuenta_forestal")[] ≥1}`;
facturas `{modo: "emitir"|"contador"}`; el resto `{}`), `MarcarOcurrenciaSchema` (`actividadId`, `fecha`, `estado`,
`posponerA` si pospuesta, `nota` ≤500), `RangoSchema` (`desde`/`hasta` FechaKey, ≤ 62 días), `NotaConFechaSchema`.

Stub que también va en la fase 0 (para que el carril A compile sin esperar al C):
`lib/agenda/google/sync.ts` → `export async function sincronizarActividad(tenantId: string, actividadId: string, accion: "guardar" | "borrar"): Promise<void>` (cuerpo vacío con `logger.debug`; el carril C lo llena).

## 7. Rutas API

Acceso en `lib/admin/agenda-acceso.ts` (patrón de `planificacion-acceso.ts:20-29`):
`ROLES_LEER_AGENDA = admin, owner, tienda_owner, manager, cajero, almacenero, analista` (igual que `ROLES_LEER_PLAN` :20) ·
`ROLES_ESCRIBIR_AGENDA = admin, owner, tienda_owner, manager` · `ROLES_CONECTAR_AGENDA = admin, owner, tienda_owner`.
Cajero/almacenero ven y marcan SOLO actividades con `responsableRol` = su rol (filtro en la DB class, no en la UI).
`/api/admin/agenda/hoy` entra a `RUTAS_PANEL` (lib/auth/roles-rutas-panel.ts:26) para que la campana no pida un 403.

| Método y ruta | Body (Zod) | Respuesta | Roles |
|---|---|---|---|
| GET `/api/admin/agenda/actividades` | — | `{ actividades: ActividadDTO[] }` | LEER (filtrado) |
| POST `/api/admin/agenda/actividades` | `ActividadCrearSchema` | 201 `ActividadDTO` | ESCRIBIR |
| PATCH `/api/admin/agenda/actividades/[id]` | `ActividadEditarSchema` | `ActividadDTO` · 409 si `version` cambió · 404 ajena | ESCRIBIR |
| DELETE `/api/admin/agenda/actividades/[id]` | — | `{ ok: true }` (soft delete; las ocurrencias quedan) | ESCRIBIR |
| GET `/api/admin/agenda/hoy` | — | `ResumenAgendaHoy` | LEER |
| GET `/api/admin/agenda/calendario?desde&hasta` | `RangoSchema` (query) | `{ dias: DiaAgenda[] }` | LEER |
| PUT `/api/admin/agenda/ocurrencias` | `MarcarOcurrenciaSchema` | `OcurrenciaDTO` (upsert por `[tenantId, actividadId, fecha]`) | LEER (si es suya) |
| DELETE `/api/admin/agenda/ocurrencias?actividadId&fecha` | — | `{ ok: true }` (deshacer) | LEER (si es suya) |
| POST/PATCH `/api/notes` (existente) | + `fecha?: FechaKey \| null` | igual que hoy | sin cambio |
| GET `/api/admin/agenda/ics` | — | `{ feeds: FeedIcsDTO[] }` | CONECTAR |
| POST `/api/admin/agenda/ics` | `{ nombre?, incluye? }` | 201 `{ feed: FeedIcsDTO, url }` (la URL se ve UNA vez) | CONECTAR |
| DELETE `/api/admin/agenda/ics/[id]` | — | `{ ok: true }` (revoca) | CONECTAR |
| GET `/api/public/agenda-ics/[token]` | — | `text/calendar` · 404 si no existe o revocado | público (token) |
| GET `/api/admin/agenda/google` | — | `ConexionGoogleDTO \| null` | CONECTAR |
| GET `/api/admin/agenda/google/conectar` | — | 302 a Google | CONECTAR |
| GET `/api/admin/agenda/google/callback` | `code`, `state` | 302 a `/admin?tab=administracion&vista=conectar` | sesión + state |
| POST `/api/admin/agenda/google/sincronizar` | — | `{ enviados, sinCambios, fallidos }` | CONECTAR |
| DELETE `/api/admin/agenda/google` | — | `{ ok: true }` (revoca en Google + borra token) | CONECTAR |

Toda ruta: `requireAdmin(req, ROLES_…)`, `tenantId` de la sesión (nunca del body, sin `"main"`), `safeParse` → 400 con
el primer mensaje, auditoría (`audit` del patrón vecino) en crear/editar/borrar/marcar/conectar/revocar.

## 8. DB classes (`tenantId` 1.er parámetro; `getOrSet` + `invalidateByPrefix` de lib/cache.ts:259/290)

- `lib/db/agenda.db.ts` → `AgendaDB`: `listarActividades(tenantId, rol)` (caché `agenda:${tenantId}:actividades`, 60 s),
  `crearActividad(tenantId, datos, usuario)`, `editarActividad(tenantId, id, datos, version, usuario)` (`updateMany`
  condicionado a `updatedAt = version` → 0 filas = 409), `borrarActividad(tenantId, id, usuario)`,
  `ocurrenciasDelRango(tenantId, desde, hasta)`, `marcarOcurrencia(tenantId, input, usuario)`,
  `desmarcarOcurrencia(tenantId, actividadId, fecha)`. Cada write: `invalidateByPrefix(\`agenda:${tenantId}\`)`.
- `lib/db/agenda-fuentes.db.ts` → `AgendaFuentesDB`: `asistenciaPorDia`, `corridasPorDia(…, soloTerceros)`,
  `plataPorDia(…, que)`, `gestionesAdelantoPorDia(…, beneficiarioId?)`, `movimientosCuentaDesde(tenantId, parteId, desde)`,
  `apoyoFacturas(tenantId, mes)`, `vencimientosDelRango(tenantId, desde, hasta)`. Todas `(tenantId, desde, hasta, …)`,
  un `GROUP BY` por día de Lima (`("fecha" AT TIME ZONE 'America/Lima')::date` donde la columna es timestamp; las `DATE`
  van directo). Raw SQL solo con `$1 $2 $3`.
- `lib/db/agenda-conexiones.db.ts` → `AgendaConexionesDB`: `crearFeed(tenantId, datos, usuario) → { feed, token }`,
  `listarFeeds(tenantId)`, `revocarFeed(tenantId, id, usuario)`, `feedPorToken(tokenHash)` (**única** sin tenantId de
  entrada: busca por secreto, como un webhook; devuelve el tenantId y anota `ultimoUso` con throttle 1 h),
  `conexionGoogle(tenantId, adminUserId)`, `guardarConexionGoogle(…)`, `revocarConexionGoogle(…)`, `eventoDe(…)`, `guardarEvento(…)`.
- `lib/db/notes.db.ts` (existente): `CreateData`/`UpdateData` + `fecha`; nuevo `delRango(tenantId, desde, hasta)` que
  excluye `PREFIJO_NOTA_DE_SISTEMA` (:30).

## 9. Carriles (archivos DISJUNTOS)

**Fase 0 — en serie, antes de lanzar nada** (`database`, opus): `prisma/schema.prisma` (5 modelos + `Note.fecha`),
`prisma/migrations/20261018_agenda_administracion/migration.sql` aplicada por el flujo manual + `prisma generate` +
reinicio; `lib/agenda/tipos.ts`, `lib/agenda/schemas.ts`, stub `lib/agenda/google/sync.ts`. Confirmar con `ls` que
existen antes de lanzar A/B/C.

| Carril | Agente | Archivos (solo estos) |
|---|---|---|
| **A · motor y API** | `backend` opus (RBAC + estado) | `lib/agenda/recurrencia.ts`, `lib/agenda/motor.ts`, `lib/agenda/plantillas.ts`, `lib/agenda/alertas-campana.ts`, `lib/agenda/avisos-asistente.ts`, `lib/admin/agenda-acceso.ts`, `lib/db/agenda.db.ts`, `lib/db/agenda-fuentes.db.ts`, `lib/db/notes.db.ts`, `app/api/notes/route.ts`, `app/api/admin/agenda/{actividades,actividades/[id],hoy,calendario,ocurrencias}/route.ts`, `lib/asistente/avisos.ts` (1 chequeo), `lib/auth/roles-rutas-panel.ts` (1 entrada), `__tests__/agenda/{recurrencia,motor,schemas}.test.ts` |
| **B · pantalla y calendario** | `frontend` opus (diseño nuevo) | `components/admin/unified/AdministracionModule.tsx`, `components/admin/administracion/**` (hoy/, calendario/ con `GrillaMes`, `VistaSemana`, `PanelDelDia`, `NotaDelDiaModal`; actividades/ con `ActividadModal`, `EditorRecurrencia`, `PlantillasSugeridas`; conectar/ `ConectarVista`), `hooks/use-agenda.ts`, `app/admin/_components/TabRouter.tsx`, `app/admin/_lib/{tab-categories,tab-data,tab-preload,tabs.types}.ts`, `lib/admin/subvistas-modulos.ts`, y la mudanza de Tareas/Notas (`RecursosHumanosHubModule` deja de montarlas) si Brandon dice sí |
| **C · ICS y Google** | `backend` opus (integración nueva) | `lib/agenda/ics.ts` (+ `__tests__/agenda/ics.test.ts`), `lib/agenda/google/{oauth,calendar,tasks}.ts`, `lib/agenda/google/sync.ts` (llena el stub), `lib/db/agenda-conexiones.db.ts`, `app/api/public/agenda-ics/[token]/route.ts`, `app/api/admin/agenda/ics/route.ts`, `app/api/admin/agenda/ics/[id]/route.ts`, `app/api/admin/agenda/google/{route,conectar/route,callback/route,sincronizar/route}.ts` |

Orden: fase 0 → A, B y C en paralelo (cada uno con su `scratchpad/<carril>/`) → **fase final en fila**: (1) enganche
de 3 líneas en `components/notifications/use-alertas-consolidadas.ts` DESPUÉS de que cierre el rediseño de la campana
(ningún carril lo toca); (2) `security` sobre A+C (RBAC, token público, OAuth, datos por tenant); (3) `tester`:
`qa-capturas` en `main` (`?tab=administracion&vista=hoy|calendario`), `curl` del ICS, SELECT de una ocurrencia
marcada; (4) commits con `git commit -F <msg> -- <archivos del carril>` tras `npm run test:guardianes`.
Fase 2 (otro lote): sección `agenda` del reporte diario; vencimientos de Planificación y Cuentas por pagar en el calendario.

## 10. Riesgos y bloqueos

- **Zona de peligro**: `prisma/schema.prisma` (aditivo, plan arriba). No se toca `proxy.ts`, `lib/middleware/**` ni
  `role-permissions.ts`. `roles-rutas-panel.ts` es RBAC → pasa por `security`.
- **Token público**: el ICS expone nombres de partes/beneficiarios a quien tenga la URL → sin montos, revocable, hash en base.
- **Refresh token de Google** = acceso a su calendario: cifrado con `cifrarSecreto` (clave derivada de `AUTH_SECRET`,
  cripto-secretos.ts:63): rotar `AUTH_SECRET` deja las conexiones en `error` → reconectar (decirlo en la UI).
- **Datos del tenant real que cambiarían de significado**: ninguno. `Note.fecha` nace NULL (1 nota en toda la base);
  Reminder/AdminTask no cambian. Blas hoy daría «no hecho» casi todos los días en gastos (1 gasto desde julio) y
  aserrío (última corrida 01-08): es la verdad de lo anotado, no un bug — por eso las plantillas nacen apagadas.
- **Doble aviso de adelantos**: `calcularAvisos` ya trae `adelantosVencidos` (avisos.ts:260) y existe el cron
  `adelantos-recordatorios`. El aviso de la agenda dice «toca revisar» (otra clave), no repite «vencido».
- `cron/reminders` (route.ts:28) usa `prisma` directo y `updateMany` sin tenant: preexistente, fuera de este lote (anotado).
- Sin cifras SERFOR/P&L involucradas.
- Sin verificar: tenant guard sobre `/api/public/*` sin cookie; vencimiento de 7 días en Testing y alcance exacto de la
  API de Keep (documentación de Google, no probado hoy).

## 11. Borrador ADR-501 (lo pega el hilo principal con `/adr`)

**Título**: ADR-501 — Agenda de Administración: actividades que se repiten, hechas según lo que el sistema ya registra

**Contexto**: Brandon (18-10) pide una página «Administración» que le avise lo que tiene que hacer en el negocio
(asistencia, facturas, servicio de aserrío de hoy, gastos e ingresos, adelantos y cuentas de terceros con su período),
con calendario tipo Google Calendar, notas por día, avisos en la campana «y otros», y vínculo con Google Calendar/Keep.
Existían `Reminder` (sin recurrencia, 2 filas en toda la base, su cron pisa `status` en todos los tenants), `AdminTask`
(0 filas) y `Note` (1 fila, sin fecha) en Equipo, y calendarios de meta, pagos y fiados que no son una agenda.

**Decisión**: (1) pestaña `administracion` en «Gestión» con vistas Hoy · Calendario · Actividades · Tareas · Notas ·
Conectar; Tareas y Notas se mudan de Equipo con su `origen` y alias. (2) Modelo nuevo `AgendaActividad` (definición +
recurrencia + regla) y `AgendaOcurrencia` (solo lo marcado a mano); lo pendiente y lo hecho por el sistema se calculan
leyendo las fuentes (Asistencia, ForestCtpEntry, Expense/CashMovement/ForestCuentaMov, AdelantoGestion). Cuentas de
terceros y facturas al contador se marcan a mano porque ningún modelo registra «lo revisé». (3) Avisos sin cron nuevo:
la campana lo calcula al abrir y el cron `asistente-avisos` (07:20) lo reparte a campana, Telegram y n8n. (4) Google:
feed ICS firmado por token (sin OAuth) primero; escritura con OAuth propio `calendar.app.created` + `tasks` reusando
`GOOGLE_CLIENT_ID/SECRET`; Keep no (solo Workspace) → Google Tasks. (5) Migración solo aditiva.

**Alternativas descartadas**: recurrencia en `Reminder` (cambia el significado de `status` y el cron global lo pisaría);
una fila por ocurrencia generada por cron (miles de «pendiente», cron 93); fusionar con Planificación (documento ≠ día
a día); push web al dueño (la suscripción es de clientes: le llegaría a ellos); OAuth con `calendar` completo (ve toda
su agenda personal); Keep (sin API para cuentas personales).
