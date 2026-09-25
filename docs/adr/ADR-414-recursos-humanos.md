# ADR-414 — Recursos Humanos: personal, asistencia, lo ganado de referencia y contratos en un solo hub

- **Fecha:** 2026-09-13
- **Estado:** propuesto
- **Pedido por:** Brandon — «Quiero integrar funciones que permita registrar las asistencias de las personas,
  guardar datos como nombre, celular, observaciones, puestos, estados etc, marcar asistencias, poner cuanto de
  referencia de ganancia diario, hora, semanal, mensual, guardar información como contratos etc. Quiero que
  pongas tipo recursos humanos en la barra lateral para entrar ahí y ahí estará todo de temas de personas,
  contratos, asistencias etc. Integra todo de manera amplia y mejorada.»
- **Depende de:** ADR-307 (Contratos) · ADR-329 (descuento por planilla) · ADR-412 §5 (una cuenta por persona) ·
  ADR-413 (liquidar la cuenta de una persona)
- **No toca:** `lib/auth/role-permissions.ts` (zona de peligro) — ver §7.

## Contexto (medido, 2026-09-13, sólo lectura)

Tenant real `cmpxiv6p4000bohvzwl6bnfpv` (Inversiones Agroforestales BLAS):

| Qué | Cifra | Fuente |
|---|---|---|
| Modelos de personal, asistencia o pago de sueldo | **0** | `grep '^model' prisma/schema.prisma` — sólo `Contract*` y `Turno` (turno de CAJA de un `AdminUser`) |
| Usuarios del panel | 3 — 2 admin · 1 almacenero | los trabajadores del patio no entran al sistema |
| Personas en Adelantos | 3 — «Quispe Galindo Victor» es trabajador; **él y «MAMA DE ALEX» sin documento ni celular**; la tercera es de prueba | `AdelantoBeneficiario` |
| Adelantos | 4, **todos `CUENTA_CORRIENTE`**, **0 `DESCUENTO_PLANILLA`** · abiertos S/ 20,642 (Quispe S/ 17,000) | `Adelanto` |
| Contratos | **0 en el tenant** · 1 en toda la base (SERVICIO) | `Contract` |
| Plantillas de contrato laboral | `trabajo-plazo-fijo`, `trabajo-indeterminado`, `locacion-servicios` | `lib/contratos/plantillas.ts` |
| Construido sin estrenar | `lib/adelantos/planilla-lote.ts` + `DescuentoPlanillaModal` (0 adelantos de planilla) · `ModuleId "rrhh"` en owner/manager sin pestaña · `TAB_MIGRATION` manda `rrhh` y `nomina` a `config` | `lib/module-permissions.ts`, `app/admin/_lib/tab-migration.ts` |
| Calendario de feriados | **no existe** en el repo | `lib/forestal/ctp-compliance.ts:57` lo declara como limitación |
| Quién lee la auditoría | el almacenero tiene `"activity-log": ["read"]` | `lib/auth/role-permissions.ts`, bloque `almacenero` |
| Rate limit | `MODERATE` = 20 escrituras / 5 min | `lib/rate-limit.ts:385` — marcar 25 personas de a una da 429 |
| Script de migración | parte el archivo por `;`, salta líneas `--`, autocommit por sentencia, «already exists» = skip | `scripts/apply-fiados-gestion-migration.mjs` |

**Lectura.** La persona del patio existe hoy en una sola libreta (Adelantos) y sin datos para ubicarla. Lo que
se pide es la ficha, la hoja de asistencia y una referencia de lo ganado. Lo más riesgoso no es construirlo: es
**presentar una resta («le debes S/ X − Y») que el sistema no puede saber**, porque no hay ningún pago de sueldo
anotado.

## Decisión

### 1. La persona: modelo propio `Colaborador`, vinculado por id

| Alternativa | Por qué no |
|---|---|
| Extender `AdelantoBeneficiario` | Es la contraparte de una libreta de plata: la usan clientes y conocidos («MAMA DE ALEX»). Puesto, estado laboral, ingreso/cese y contacto de emergencia no aplican a 2 de sus 3 filas reales |
| Extender `AdminUser` | Los trabajadores no entran al sistema (0 de 3 usuarios son del patio). Un usuario por jornalero abre superficie de login |
| `ForestParty` | Directorio de terceros forestales (proveedor, transportista, conductor) |

`Colaborador` guarda sólo lo laboral. Lo bancario vive en su `AdelantoBeneficiario` vinculado: un solo número de
cuenta por persona.

**Vínculos** — texto sin FK hacia tablas de otros módulos (mismo criterio que `LiquidacionCuenta`), siempre
leídos con `tenantId`, **nunca por nombre**:

| Columna | Apunta a | Regla |
|---|---|---|
| `beneficiarioId` | `AdelantoBeneficiario.id` | único parcial entre vivos · si los dos tienen documento y no coinciden → 409 `documento_no_coincide` · se elige a mano (id) o se **sugiere** por mismo documento normalizado; la sugerencia nunca vincula sola |
| `adminUserId` | `AdminUser.id` | único parcial entre vivos · opcional (el cajero que además es empleado) |
| `puestoId` | `Puesto` | FK compuesta `(tenantId, puestoId) → Puesto(tenantId, id)` |

Elegir a Quispe «a mano» de la lista de Adelantos está permitido: la regla «nunca por nombre» prohíbe que la
máquina una por parecido, no que una persona elija un id (mismo criterio que `vincular_parte`, ADR-412).

**Documento.** `tipoDocumento` ∈ `DNI · CE · PASAPORTE · OTRO`; `documento` normalizado a letras y dígitos en
mayúsculas (DNI = 8 dígitos, CHECK). Único parcial `(tenantId, documento)` entre vivos, **sin el tipo**: el cruce
con Adelantos (`normalizarDocumento` en `lib/adelantos/cuenta-unificada.ts`) tampoco lo mira, y un DNI tipeado
como CE no puede crear a la misma persona dos veces. Sin documento se permite (los NULL no chocan).

**Aislamiento en la base.** `@@unique([tenantId, id])` en `Colaborador` y `Puesto`; `Asistencia` y
`ColaboradorTarifa` referencian `(tenantId, colaboradorId)`. Es la defensa que Adelantos no tiene (FK de una
columna, memoria `adelantos-idor-beneficiario-ajeno`): Postgres rechaza una marca que apunte a la persona de otro
negocio aunque el código falle. Como las tablas nacen hoy, no hace falta expand→contract.

> Gotcha Prisma: con una relación compuesta que comparte `tenantId`, **no usar `connect`/`disconnect`** en
> `puesto` — `disconnect` intenta poner `tenantId` en null. Escribir el escalar `puestoId`.

**Estados** — `ACTIVO · VACACIONES · LICENCIA · SUSPENDIDO · CESADO`. Es el estado de HOY; lo que pasó cada día lo
dice la asistencia. CHECK: `CESADO ⇔ fechaCese IS NOT NULL`.

**Campos:** `nombre` (como se le conoce) · `apodo` · `tipoDocumento` · `documento` · `celular` · `direccion` ·
`contactoEmergenciaNombre` · `contactoEmergenciaCelular` · `puestoId` · `estado` · `fechaIngreso` (nullable: «no
se sabe» no inventa una fecha) · `fechaCese` · `motivoCese` · `observaciones` · `beneficiarioId` · `adminUserId`.
No se pide fecha de nacimiento, estado civil, foto ni huella (proporcionalidad, §8).

### 2. Puestos: tabla por tenant con tarifa sugerida

`Puesto { nombre, descripcion, tarifaModalidad?, tarifaMonto?, horasJornada = 8, orden }`.

- Único parcial y sin mayúsculas: `(tenantId, lower(btrim(nombre)))` entre vivos — «Tornillo» y «TORNILLO» ya
  fueron dos especies distintas (ADR-400).
- **Tabla y no KV** (ADR-410 usó KV para especies): la persona apunta al puesto por id y renombrar no reescribe
  nada; un blob KV entregaría todos los sueldos sugeridos a cualquiera que lo lea.
- La tarifa del puesto **sólo prellena** la de la persona: nunca entra al cálculo y cambiarla no toca a nadie.
- Catálogo vacío: la pantalla ofrece chips de un clic («Motosierrista», «Ayudante de sierra», «Estibador»,
  «Chofer», «Vigilante», «Cajero», «Almacenero»). No se siembra nada que no se eligió.
- Eliminar un puesto que usan personas no cesadas → 409 `puesto_en_uso { n }`.

### 3. Tarifa de referencia: versionada por persona

`ColaboradorTarifa { modalidad: HORA | DIA | SEMANA | MES | SIN_PAGO, monto Decimal(12,2), moneda = PEN,
horasJornada, vigenteDesde DATE, motivo }`.

- Vigente el día D = la viva con mayor `vigenteDesde ≤ D` (criterio de `versionVigente`, ADR-412).
- Único parcial `(tenantId, colaboradorId, vigenteDesde)` entre vivas. **Guardar otra vez la misma fecha corrige
  esa versión:** baja lógica de la anterior + fila nueva, en una tx (queda rastro). Las filas no se editan.
- Subir el sueldo desde el 01/10 no toca setiembre: cada día se calcula con la versión de SU fecha.
- **`SIN_PAGO`** (monto 0, CHECK) = «desde esta fecha no gana». La escribe `cesar` (desde el día siguiente al cese)
  y la suspensión sin goce. Así un reingreso no cuenta como pagados los días del hueco, y la ficha se lee como una
  línea de tiempo: «S/ 60 por día desde 01/08 · Sin pago desde 11/09 (cesó) · S/ 65 por día desde 20/09
  (reingresó)».
- Vigencia futura permitida («desde el 1 de octubre»). Asistencia futura no (§4).
- **Tabla y no KV** (ADR-412 usó KV para el tarifario): es sueldo, se lee por persona y por rol.

**Copy obligatorio** junto a todo monto: «Referencia: no es planilla electrónica ni boleta. No calcula CTS,
gratificaciones, EsSalud, ONP/AFP ni horas extra.» No se imita ningún formato oficial (PLAME, T-Registro).

### 4. Asistencia: una marca viva por persona y día

`Asistencia { fecha DATE, estado, entradaMin?, salidaMin?, refrigerioMin = 0, horas?, nota, origen, marcadoPor,
deletedAt, deletedBy, reemplazadaPorId, motivoCorreccion }`.

- **Estados:** `PRESENTE · TARDANZA · MEDIO_DIA · FALTA · PERMISO · DESCANSO · VACACIONES`.
- **Horas de pared en minutos desde las 00:00 de Lima** (enteros), no timestamps: una hora de pared no tiene zona
  que se corra. La API habla `"HH:MM"`. `horas` la escribe el servidor: `(salida − entrada − refrigerio) / 60` si
  vienen las dos; si no, la que se tipeó; si no, null. Sólo PRESENTE/TARDANZA/MEDIO_DIA llevan horas (CHECK).
- **«Hoy» = `limaDateKey()` en el servidor.** `fecha > hoy` → 422 («Todavía no llega el viernes 12/09»). Nunca el
  reloj del navegador: a las 20:00 de Pucallpa el UTC ya es mañana.
- Salida ≤ entrada → 422 en esta entrega: 0 turnos nocturnos conocidos, y adivinar confunde un «07:00» mal tipeado
  con un turno que cruzó la medianoche.
- Único parcial `(tenantId, colaboradorId, fecha)` entre vivas.
- **Corregir = versión nueva.** La marca viva se da de baja con `reemplazadaPorId` y nace otra, en una tx; un
  P2002 por carrera se relee y reintenta una vez. Quitar = baja sin reemplazo. Igual a la viva → no escribe
  (`sinCambio`). El historial de un día son todas sus filas.
- **Masivo del día («Todos presentes»)** escribe sólo a quien **no tiene marca** (`sobrescribir = false` por
  defecto). Reemplazar exige `sobrescribir: true` y el botón pasa a decir «Reemplazar N marcas» — en una acción
  masiva el valor por defecto nunca pisa lo cargado (lección «Cobrar en tanda», ADR-412). Incluye a los `ACTIVO`
  con `fechaIngreso ≤ fecha` (o null) y sin cese; `VACACIONES/LICENCIA/SUSPENDIDO` quedan en «No incluidos», cada
  uno con su botón («Marcar vacaciones»).
- **Ventana por rol:** almacenero y cajero sólo `hoy − 2 … hoy`; admin, owner y manager cualquier día pasado.
  Fuera → 403 `fuera_de_ventana`. La marca cambia lo ganado; tres días alcanzan para corregir el olvido del día.
- **Lote atómico:** `PUT /api/rrhh/asistencia` recibe hasta 200 marcas; si una no pasa, 422 con `errores[]` por
  celda y no se escribe ninguna. Bucket `GENEROUS`: la hoja del mes guarda en ráfagas (debounce ~800 ms).

### 5. Lo ganado (referencia): función pura, on-read, por tramo

`lib/rrhh/ganado.ts` — sin Prisma ni React. Servidor y pantalla la llaman con los **mismos argumentos** (ADR-412:
la vista previa llamaba la misma función sin `unit` y previsualizaba 424 veces más).

**Días que cuentan:** D ∈ [max(desde, fechaIngreso), min(hasta, fechaCese, hoy)].

**Factor por estado:**

| Estado | Jornal (`HORA`, `DIA`) | Sueldo (`SEMANA`, `MES`) |
|---|---|---|
| PRESENTE | 1 | 1 |
| TARDANZA | 1 | 1 |
| MEDIO_DIA | 0.5 | 0.5 |
| FALTA | 0 | 0 |
| PERMISO | 0 | 0 |
| DESCANSO | 0 | 1 |
| VACACIONES | 0 | 1 |
| sin marcar | 0 — y se lista en «sin marcar» | 1 |

**Valor del día:**

| Modalidad | Valor |
|---|---|
| `DIA` | monto × factor |
| `HORA` | monto × horas; sin horas → monto × horasJornada × factor, marcado «horas estimadas» |
| `SEMANA` | monto ÷ 7 × factor |
| `MES` | monto ÷ días del mes × factor |
| `SIN_PAGO` | 0 |
| sin tarifa | no suma y se lista en «sin tarifa» — **nunca S/ 0** |

- **Tardanza paga completo** y se cuenta aparte: descontarla es una política del negocio, no una cuenta (mismo
  criterio que `planilla-lote.ts`). Medio día es explícito: 0.5.
- **`MES` ÷ días del mes, no ÷ 30:** un mes completo sin faltas da **exactamente** el monto (las cifras contiguas
  cierran); una falta en febrero vale 1/28. El ÷ 30 es de planilla; esto es referencia y el copy lo dice.
- **Céntimos:** se acumula Σ factor por **tramo** (misma tarifa, mismo mes) y se redondea una sola vez por tramo:
  31 × 1500/31 = 1500.00, no 1500.09.
- Marcas antes del ingreso o después del cese no suman y salen en `fueraDePeriodo` + `avisos`.

**El cruce con adelantos, en esta entrega: al lado, no restado.** La fila dice «Ganó S/ 1,320 (referencia)» y,
aparte, «Adelantos abiertos: S/ 17,000 → Ver su cuenta». No se escribe «le debes S/ X − Y» porque:

1. **No hay ningún pago de sueldo anotado.** Para cualquier período que ya se pagó en efectivo la resta afirmaría
   una deuda que no existe (rule `verificacion-de-verdad` §2).
2. El saldo de adelantos no es del período: los S/ 17,000 de Quispe son `CUENTA_CORRIENTE`, no descuento de
   planilla.

**F2 — Pagar un período, sin segunda cuenta.** «Cerrar semana/mes» congela el cálculo en un acta
(`CierrePeriodo.detalle`, como `LiquidacionCuenta.detalle`) con un saldo «Sueldo por pagar». Ese saldo entra como
**una partida más** de `PartidasDePersona` (ADR-413 §3, hoy adelantos + cuenta forestal) y se paga con el mismo
`LiquidacionCuentaDB.crear`: cruzar adelantos (propuesta de `proponerDescuentos`, ya construida), pagar el neto,
caja una sola vez, código LIQ, anular la última. **RRHH nunca escribe `AdelantoEntrega` ni la caja por su
cuenta.** Cruzar exige `Colaborador.beneficiarioId` (vínculo explícito, ADR-413 §4). Corregir la asistencia de un
período cerrado → 409 `periodo_cerrado`.

### 6. Contratos: columna `Contract.colaboradorId`, no el documento del firmante

- Mismo patrón que `customerId`/`supplierId` (`components/admin/contratos/VinculoContraparte.tsx`): id, texto sin
  FK, nullable.
- Por documento no sirve: `Contract.clienteDoc` vale `""` por defecto y 2 de las 3 personas reales no tienen
  documento.
- La ficha muestra los contratos con `colaboradorId = id` y, aparte, «¿Son de esta persona?»: los no vinculados con
  el mismo documento normalizado en `clienteDoc` o en un firmante. Botón «Vincular»; nunca automático.
- Por contrato: número, tipo, `estadoVisible` (VIGENTE / POR_VENCER / VENCIDO…), «vence en N días»
  (`diasParaVencer`), PDF (`/api/contratos/[id]/pdf`), firmantes pendientes.
- `VinculoContraparte` suma un tercer lado **«Trabajador»**.
- La sub-pestaña Contratos del hub lista los `TRABAJO`/`LOCACION` + los vinculados, con la columna Persona. Crear y
  editar siguen en `ContratosModule`: no se duplica el wizard.
- **F2:** «Contrato de trabajo» desde la ficha abre `?tab=contratos&plantilla=trabajo-plazo-fijo&colaborador=<id>` y
  prellena `NOMBRE_TRABAJADOR`, `DNI_TRABAJADOR`, `DOMICILIO_TRABAJADOR`, `CARGO`, `REMUNERACION`, `FECHA_INICIO`
  (claves verificadas en `lib/contratos/plantillas.ts`) y guarda `colaboradorId`.
- La remuneración del contrato y la tarifa de referencia **no se sincronizan**: una es el papel firmado, la otra la
  cuenta del patio. La ficha muestra las dos.

### 6b. Traer desde Adelantos («Estrenar RRHH con tu gente»)

Pedido de Brandon (2026-09-14): RRHH nace con 0 personas y Adelantos ya tiene 3 beneficiarios (2 sin documento ni
teléfono) — hay que poder traerlos de una, no tipearlos de nuevo. Mismo criterio que el resto del ADR: **nunca se
vincula solo**, y lo que se guarda lo decide el servidor, no lo que mande el cliente.

**Candidatos** (`GET .../desde-adelantos`, nivel completo): beneficiarios VIVOS (`activo = true`) del tenant que
todavía NO tienen un `Colaborador` vivo con ese `beneficiarioId`. Por cada uno, `saldoAbierto` sale de
`resumirPersona` (la misma cuenta que gobierna el tope de crédito de Adelantos — nunca una suma aparte que pueda
desalinearse) y `esEmpresa` es informativo (la pantalla lo puede usar para atenuar la fila; el filtro real es al
traer).

**`esEmpresa` = RUC que empieza con 20** (persona jurídica). Un RUC-10 es una persona natural con RUC — no es una
empresa y se trae como cualquier otra persona. No se inventa otra regla (ni por nombre, ni por el `tipoDocumento`
que Adelantos tenga guardado).

**El `tipoDocumento` de un `Colaborador` sale del FORMATO del número, no de lo que Adelantos tenga escrito en el
suyo.** Adelantos admite `"RUC"` como `tipoDocumento`, un valor que `Colaborador` no acepta (§1: sólo
`DNI · CE · PASAPORTE · OTRO`). Confiar en la etiqueta guardada podría copiar `"RUC"` tal cual y violar el CHECK de
la base, o peor, clasificar mal un documento mal tipeado. La regla (`tipoDocumentoPorFormato`, puro): 8 dígitos
exactos → `DNI`; cualquier otro número no vacío → `OTRO`; vacío → `null`. Un RUC (10 u 11 dígitos empezando en 10
o 20) siempre cae en `OTRO` — es el catch-all seguro, nunca inventa un CE o un PASAPORTE que nadie confirmó.

**Traer** (`POST .../desde-adelantos`, nivel completo, CSRF, `MODERATE`): hasta 100 `beneficiarioId` por request.
Cada persona es **independiente** — una que choca con una carrera o ya está vinculada no tumba a las demás del
lote (nunca todo-o-nada). Por cada `beneficiarioId`:

1. Se relee el beneficiario con `tenantId` (nunca se confía en lo que mandó el cliente sobre él) — si no aparece
   en la lista de ESTE tenant → `no_encontrado` (defensa IDOR, igual criterio que `Contract.colaboradorId`).
2. Si ya tiene un `Colaborador` vivo vinculado → `ya_vinculado`.
3. Si es una empresa (RUC-20) y su id no viene en `incluirEmpresas` (lista aparte, opt-in explícito) → `es_empresa`
   — un `Colaborador` es una PERSONA que trabaja en el negocio, no una razón social.
4. Si su documento normalizado ya lo tiene otro `Colaborador` vivo → `documento_duplicado`.
5. Si nada de eso aplica: crea con `nombre`, `documento`/`tipoDocumento` (regla de arriba), `celular` ← `telefono`,
   `estado: ACTIVO`, `fechaIngreso` (la que mandó el request, o `null`), `beneficiarioId` — **sin tarifa**: no se
   inventa un sueldo que nadie puso. Un P2002 de carrera (otro request coló el mismo vínculo entre la relectura y
   el `create`) se relee para decir CUÁL de los dos únicos parciales chocó, en vez de adivinar.

`ResultadoTraerDesdeAdelantosDTO.creados` trae la ficha completa (nivel completo) de cada persona creada;
`omitidos` la razón de cada una que no se trajo, para que la pantalla explique fila por fila, no un contador solo.
Auditoría `rrhh_colaborador_crear` por persona, «Creó desde Adelantos» — sin valores (§8).

### 7. Pantalla y roles

**Barra lateral.** Categoría nueva `recursos-humanos` «Recursos Humanos» (icono `Users`) con una sola pestaña
`rrhh`: se dibuja como enlace directo, un clic. Sección «Gestión», antes de «Equipo». Sin atajos a sub-pestañas
(auditoría 2026-08-02: un renglón por hub). `rrhh` pasa a ser pestaña real: `TAB_MIGRATION` deja de mandarla a
`config` y los links viejos (`?tab=rrhh`, `?tab=nomina`) aterrizan acá.

**Hub** `RecursosHumanosHubModule` = `AdminTabBar` + `useVistaModulo("rrhh-hub", …)`, igual que `EquipoHubModule`.

| `?vista=` | Qué | Nivel mínimo |
|---|---|---|
| `asistencia` (**por defecto**) | Hoja del día · Hoja del mes | marcar |
| `personal` | Lista + ficha | gestion |
| `ganado` | Lo ganado (referencia) | completo |
| `contratos` | Contratos del personal | gestion |
| `puestos` | Catálogo (la tarifa sugerida sólo en completo) | gestion |

Por defecto Asistencia: es lo de todos los días. Vacía, su estado vacío es «Agrega a tu primera persona» y abre el
alta. El hub **no deduce el rol en el cliente**: `GET /api/rrhh/resumen` devuelve `nivel` y la barra filtra con
eso; el servidor rechaza igual.

**Niveles** (`lib/rrhh/roles.ts`):

| Nivel | Roles | Ve y hace |
|---|---|---|
| `completo` | admin, owner | todo: documento, celular, contacto de emergencia, tarifas, lo ganado, vincular cuenta, exportar, eliminar |
| `gestion` | + manager | personal, puestos, contratos y asistencia; documento enmascarado (`•••• 5678`); sin tarifas ni ganado |
| `marcar` | + almacenero, cajero | nombre, apodo, puesto y estado; marcar dentro de la ventana de 3 días |

- UI por defecto: `"rrhh"` se suma a `MODULE_PERMISSIONS.almacenero` (`ModuleId "rrhh"` ya existe). El cajero no
  por defecto; se habilita desde Configuración › permisos por rol (el servidor ya lo acepta en `marcar`).
- `lib/auth/role-permissions.ts` **no se toca**: cada ruta nueva lleva su lista explícita en `requireAdmin`, como
  `app/api/contratos/**`. Deuda: sumar el recurso `rrhh` a la matriz en un cambio DANGER propio.
- `"rrhh"` entra en `PLAN_BASICO.unlockedTabs` (herramienta interna, igual que `adelantos` y `tareas`) y en
  `EASY_MODE_TABS`.

**Detalles de UI que ya costaron un bug:**

- **Hoja del día:** fila por persona; estado en botones segmentados con letra + palabra (P Presente · T Tardanza · ½
  Medio día · F Falta · Pe Permiso · D Descanso · V Vacaciones): el color nunca va solo. Entrada/salida opcionales.
  Contadores arriba («18 presentes · 2 faltas · 3 sin marcar») que suman el total de incluidos. ◀ ▶ por día, ▶
  apagado en hoy. Fecha como «jueves 11/09», con nombres escritos a mano.
- **Hoja del mes:** personas × días, letra por celda con tokens `--data-*` en su variante AA (`-700` claro, `-500`
  oscuro); totales P · T · ½ · F · sin marcar por fila. A 400 px pasa a lista por persona. El popover de celda se
  portalea dentro del `[role=dialog]` si vive en un modal (lección `ActionMenu`).
- **Lo ganado:** chips «Esta semana · Semana pasada · Este mes · Mes pasado · Rango» (semana lunes–domingo); tabla
  Persona · Días · Horas · Tarifa · Ganado (referencia) · Adelantos abiertos · Avisos; «Cómo sale» desplegable con
  `explicarGanado()`; pie = suma exacta de la columna.
- Nunca `loading && !datos` mostrando «Sin personal» durante la carga.
- Toda acción dentro de un modal avisa `onCambio` y la lista que lo abrió se recarga (lección liquidar).
- Modal abierto desde la ficha (cesar, historial) → `AdminModal aboveModals`.
- Copy en tuteo peruano («Marca», «Agrega», «le adelantaste»).

### 8. Datos personales (Ley 29733)

| Dato | Quién lo ve | Qué queda en la auditoría |
|---|---|---|
| documento, celular, dirección, contacto de emergencia, observaciones | completo · gestion con documento enmascarado | `rrhh_colaborador_editar` · «Cambió: celular, documento» — **nombres de campo, nunca valores** |
| tarifa | completo | `rrhh_tarifa_guardar` · «Nueva tarifa desde 01/10 (por día)» — **sin el monto** |
| asistencia | marcar | `rrhh_asistencia_corregir` · «11/09: FALTA → PRESENTE» |

- **Por qué sin valores:** el almacenero lee `ActivityLog`. El log no puede ser una segunda copia del DNI y del
  sueldo.
- `logActivity(accion, entidad, detalle, id, usuario, undefined, tenantId)` **siempre con `tenantId`** (ADR-413
  encontró rutas de adelantos que caían en `__unknown__`).
- **Serializador por nivel con whitelist explícita** (`lib/rrhh/dto.ts`) + test que fija que el JSON de `marcar`
  no trae `documento`, `celular`, `direccion`, `contactoEmergencia`, `observaciones` ni `tarifa*`.
- **Derecho de acceso:** `GET /api/rrhh/colaboradores/[id]/exportar` (completo) → JSON con ficha, tarifas,
  asistencias, contratos vinculados (id, número, estado) y adelantos (id, código, saldo).
  `rrhh_colaborador_exportar` en la auditoría.
- Excel de la hoja del mes (F2): sin documento ni celular salvo nivel completo.
- `Cache-Control: private, no-store` en todo GET. Sin caché de servidor en F1 (tablas chicas, respuesta distinta
  por rol); si se agrega, prefijo `rrhh:{tenantId}` e invalidar tras cada write.
- **Sin biometría:** ni huella ni reconocimiento facial con las cámaras de ADR-411.
- Eliminar = baja lógica. La purga definitiva queda fuera (F3, con el plazo que decida Brandon).

### 9. Migración

`prisma/migrations/adr-414-recursos-humanos.sql` — **borrador, NO aplicado.** EXPAND puro: 3 enums, 4 tablas y
una columna nullable en `Contract`. Ningún dato existente cambia.

El script parte por `;` y corre en autocommit: por eso **no hay bloques `DO $$`** ni `;` en comentarios de fin de
línea. `CREATE TYPE` y `ADD CONSTRAINT` son idempotentes porque el script salta «already exists». Si algo falla a
mitad, se vuelve a correr el archivo entero.

```bash
USE_POOLER=1 SQL_FILE=prisma/migrations/adr-414-recursos-humanos.sql node -r dotenv/config scripts/apply-fiados-gestion-migration.mjs dotenv_config_path=.env.local
# leer que cada ✓ diga la sentencia esperada (memoria migracion-pooler-y-resolve-quirurgico)
npx prisma generate   # y reiniciar el dev server
```

Verificar contra la base (tenant de QA): dos marcas vivas el mismo día → P2002 · una marca con el `tenantId` de
otro negocio → violación de FK · `CESADO` sin `fechaCese` → violación de CHECK.

**Bloques para `schema.prisma`** (los índices únicos parciales y el funcional viven sólo en el SQL, como en
ADR-412b; Prisma igual traduce su violación a P2002):

```prisma
enum ColaboradorEstado {
  ACTIVO
  VACACIONES
  LICENCIA
  SUSPENDIDO
  CESADO
}

enum AsistenciaEstado {
  PRESENTE
  TARDANZA
  MEDIO_DIA
  FALTA
  PERMISO
  DESCANSO
  VACACIONES
}

enum TarifaModalidad {
  HORA
  DIA
  SEMANA
  MES
  SIN_PAGO
}

/// Puesto de trabajo del negocio (ADR-414). La tarifa es SUGERIDA: sólo prellena
/// la de la persona al darla de alta, nunca entra al cálculo de lo ganado.
/// Único parcial sin mayúsculas `(tenantId, lower(btrim(nombre)))` entre vivos: sólo en SQL.
model Puesto {
  id              String           @id @default(cuid())
  tenantId        String
  nombre          String
  descripcion     String?
  tarifaModalidad TarifaModalidad?
  tarifaMonto     Decimal?         @db.Decimal(12, 2)
  horasJornada    Decimal          @default(8) @db.Decimal(4, 2)
  orden           Int              @default(0)
  createdBy       String
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  deletedAt       DateTime?

  colaboradores Colaborador[]

  @@unique([tenantId, id])
  @@index([tenantId, deletedAt])
}

/// Una persona que trabaja en el negocio (ADR-414). No es un usuario del panel ni
/// una contraparte de plata: se vincula por id a su `AdelantoBeneficiario` (su
/// cuenta) y, si entra al sistema, a su `AdminUser`. Nunca por nombre.
/// Únicos parciales entre vivos (sólo en SQL): `(tenantId, documento)`,
/// `(tenantId, beneficiarioId)`, `(tenantId, adminUserId)`.
model Colaborador {
  id                        String            @id @default(cuid())
  tenantId                  String
  nombre                    String
  apodo                     String?
  /// DNI | CE | PASAPORTE | OTRO
  tipoDocumento             String?
  /// Sólo letras y dígitos, en mayúsculas.
  documento                 String?
  celular                   String?
  direccion                 String?
  contactoEmergenciaNombre  String?
  contactoEmergenciaCelular String?
  puestoId                  String?
  estado                    ColaboradorEstado @default(ACTIVO)
  /// `null` = no se sabe. Date-only: formatear con timeZone "UTC".
  fechaIngreso              DateTime?         @db.Date
  fechaCese                 DateTime?         @db.Date
  motivoCese                String?
  observaciones             String?
  /// `AdelantoBeneficiario.id` — texto sin FK, siempre leído con tenantId.
  beneficiarioId            String?
  /// `AdminUser.id` — texto sin FK, siempre leído con tenantId.
  adminUserId               String?
  createdBy                 String
  createdAt                 DateTime          @default(now())
  updatedAt                 DateTime          @updatedAt
  deletedAt                 DateTime?

  /// FK compuesta: no usar connect/disconnect (disconnect intentaría anular tenantId).
  puesto      Puesto?             @relation(fields: [tenantId, puestoId], references: [tenantId, id], onDelete: Restrict)
  tarifas     ColaboradorTarifa[]
  asistencias Asistencia[]

  @@unique([tenantId, id])
  @@index([tenantId, estado])
  @@index([tenantId, nombre])
  @@index([tenantId, puestoId])
}

/// Referencia de lo que gana una persona, versionada por fecha (ADR-414 §3). Las
/// filas no se editan: corregir = baja lógica + fila nueva. `SIN_PAGO` (monto 0)
/// = desde esa fecha no gana (cese, suspensión sin goce).
/// Único parcial `(tenantId, colaboradorId, vigenteDesde)` entre vivas: sólo en SQL.
model ColaboradorTarifa {
  id            String          @id @default(cuid())
  tenantId      String
  colaboradorId String
  modalidad     TarifaModalidad
  monto         Decimal         @db.Decimal(12, 2)
  moneda        String          @default("PEN")
  horasJornada  Decimal         @default(8) @db.Decimal(4, 2)
  vigenteDesde  DateTime        @db.Date
  motivo        String?
  createdBy     String
  createdAt     DateTime        @default(now())
  deletedAt     DateTime?
  deletedBy     String?

  colaborador Colaborador @relation(fields: [tenantId, colaboradorId], references: [tenantId, id], onDelete: Restrict)

  @@index([tenantId, colaboradorId, vigenteDesde])
}

/// Una marca de asistencia por persona y día (ADR-414 §4). Corregir = la viva se
/// da de baja con `reemplazadaPorId` y nace otra: el historial del día son sus filas.
/// Único parcial `(tenantId, colaboradorId, fecha)` entre vivas: sólo en SQL.
model Asistencia {
  id               String           @id @default(cuid())
  tenantId         String
  colaboradorId    String
  fecha            DateTime         @db.Date
  estado           AsistenciaEstado
  /// Minutos desde las 00:00 de Lima (hora de pared, sin zona).
  entradaMin       Int?
  salidaMin        Int?
  refrigerioMin    Int              @default(0)
  /// La escribe el servidor: (salida − entrada − refrigerio)/60, o la tipeada.
  horas            Decimal?         @db.Decimal(4, 2)
  nota             String?
  /// manual | masivo
  origen           String           @default("manual")
  marcadoPor       String
  createdAt        DateTime         @default(now())
  deletedAt        DateTime?
  deletedBy        String?
  reemplazadaPorId String?
  motivoCorreccion String?

  colaborador Colaborador @relation(fields: [tenantId, colaboradorId], references: [tenantId, id], onDelete: Restrict)

  @@index([tenantId, fecha])
  @@index([tenantId, colaboradorId, fecha])
}

// model Contract   + colaboradorId String?   + @@index([tenantId, colaboradorId])
```

Sin relación con `Tenant` (mismo criterio que `LiquidacionCuenta`): no se toca el modelo `Tenant`.

## Contrato

### Tipos compartidos — `lib/rrhh/tipos.ts` (lo escribe backend PRIMERO; frontend sólo importa tipos)

```ts
export const ESTADOS_COLABORADOR = ["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO", "CESADO"] as const;
export type EstadoColaborador = (typeof ESTADOS_COLABORADOR)[number];
export const ESTADOS_ASISTENCIA = ["PRESENTE", "TARDANZA", "MEDIO_DIA", "FALTA", "PERMISO", "DESCANSO", "VACACIONES"] as const;
export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];
export const MODALIDADES = ["HORA", "DIA", "SEMANA", "MES", "SIN_PAGO"] as const;
export type Modalidad = (typeof MODALIDADES)[number];
export type ModalidadPagada = Exclude<Modalidad, "SIN_PAGO">;
export const TIPOS_DOCUMENTO = ["DNI", "CE", "PASAPORTE", "OTRO"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export type NivelRrhh = "completo" | "gestion" | "marcar";
/** "YYYY-MM-DD", día de Lima. */
export type FechaKey = string;

export interface PuestoDTO {
  id: string;
  nombre: string;
  descripcion: string | null;
  horasJornada: number;
  orden: number;
  /** Personas no cesadas con este puesto. */
  personas: number;
  /** Sólo nivel completo: en los demás la clave NO viene. */
  tarifaSugerida?: { modalidad: ModalidadPagada; monto: number } | null;
}

export interface TarifaDTO {
  id: string;
  modalidad: Modalidad;
  monto: number;
  moneda: "PEN";
  horasJornada: number;
  vigenteDesde: FechaKey;
  motivo: string | null;
  creadaPor: string;
  creadaEn: string;
}

/** Nivel marcar. */
export interface ColaboradorMinDTO {
  id: string;
  nombre: string;
  apodo: string | null;
  puesto: { id: string; nombre: string } | null;
  estado: EstadoColaborador;
  fechaIngreso: FechaKey | null;
  fechaCese: FechaKey | null;
}

/** Niveles gestion y completo. */
export interface ColaboradorDTO extends ColaboradorMinDTO {
  tipoDocumento: TipoDocumento | null;
  /** gestion: «•••• 5678». */
  documento: string | null;
  celular: string | null;
  direccion: string | null;
  contactoEmergencia: { nombre: string | null; celular: string | null };
  observaciones: string | null;
  motivoCese: string | null;
  beneficiarioId: string | null;
  adminUserId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  /** Sólo completo. */
  tarifaVigente?: TarifaDTO | null;
}

export interface ContratoDeColaboradorDTO {
  id: string;
  numero: string;
  tipo: string;
  estadoVisible: string;            // EstadoVisible de lib/types/contracts.ts
  fechaInicio: FechaKey;
  fechaVencimiento: FechaKey | null;
  diasParaVencer: number | null;
  firmantesPendientes: number;
  tienePdf: boolean;
}

export interface FichaColaboradorDTO {
  nivel: Exclude<NivelRrhh, "marcar">;
  colaborador: ColaboradorDTO;
  /** Sólo completo, más nueva primero (incluye las SIN_PAGO). */
  tarifas?: TarifaDTO[];
  vinculo: {
    beneficiario: { id: string; nombre: string; documento: string | null } | null;
    /** Mismo documento normalizado, sin vincular. Nunca se vinculan solos. */
    sugeridos: { id: string; nombre: string }[];
    adminUser: { id: string; username: string; role: string } | null;
  };
  /** Sólo completo y con beneficiario vinculado. */
  cuenta?: { adelantosAbiertosPen: number; abiertos: number; otrasMonedas: Record<string, number> } | null;
  contratos: ContratoDeColaboradorDTO[];
  contratosSugeridos: ContratoDeColaboradorDTO[];
  mes: { mes: string; conteo: Record<EstadoAsistencia, number>; sinMarcar: number };
}

export interface AsistenciaDTO {
  id: string;
  colaboradorId: string;
  fecha: FechaKey;
  estado: EstadoAsistencia;
  entrada: string | null;          // "HH:MM"
  salida: string | null;
  refrigerioMin: number;
  horas: number | null;
  nota: string | null;
  origen: "manual" | "masivo";
  marcadoPor: string;
  marcadoEn: string;
  /** Sólo en el historial. */
  reemplazada?: { en: string; por: string | null; motivo: string | null } | null;
}

export interface HojaAsistenciaDTO {
  nivel: NivelRrhh;
  hoy: FechaKey;
  desde: FechaKey;
  hasta: FechaKey;
  /** `desde: null` = sin límite hacia atrás. */
  ventana: { desde: FechaKey | null; hasta: FechaKey };
  colaboradores: ColaboradorMinDTO[];   // vigentes en algún día del rango, orden por nombre
  marcas: AsistenciaDTO[];              // sólo vivas
}

export interface ResumenRrhhDTO {
  nivel: NivelRrhh;
  hoy: FechaKey;
  personal: Record<EstadoColaborador, number>;
  hoyAsistencia: { incluidos: number; conteo: Record<EstadoAsistencia, number>; sinMarcar: number };
  /** gestion y completo. */
  contratos?: { porVencer: number; vencidos: number; activosSinContrato: number };
}

export interface TramoGanado {
  desde: FechaKey;
  hasta: FechaKey;
  modalidad: Modalidad;
  monto: number;
  horasJornada: number;
  dias: number;
  /** Σ factor del tramo. */
  factor: number;
  horas: number;
  horasEstimadas: boolean;
  importe: number;                 // redondeado UNA vez por tramo
}

export interface GanadoPersona {
  colaboradorId: string;
  total: number;
  tramos: TramoGanado[];
  conteo: Record<EstadoAsistencia, number>;
  sinMarcar: FechaKey[];           // sólo días de jornal
  sinTarifa: FechaKey[];
  fueraDePeriodo: FechaKey[];
  avisos: string[];
}

export interface GanadoDTO {
  desde: FechaKey;
  hasta: FechaKey;
  hoy: FechaKey;
  personas: (GanadoPersona & {
    nombre: string;
    puesto: string | null;
    beneficiarioId: string | null;
    adelantos: { abiertosPen: number; abiertos: number } | null;
  })[];
  /** Σ personas[].total, exacta. */
  total: number;
}
```

### Puros — sin Prisma, React ni fetch

| Archivo | Exporta |
|---|---|
| `lib/rrhh/fechas.ts` | `esFechaKey` · `sumarDias(key, n)` · `diasDelMes(key)` · `rangoDeDias(desde, hasta)` · `semanaDe(key) → { desde, hasta }` (lunes–domingo) · `mesDe(key)` · `minutosDeHora("HH:MM")` · `horaDeMinutos(n)` · `fechaKeyDeDate(d)` (partes UTC) · `dateDeFechaKey(key)` (`T00:00:00.000Z`) · `etiquetaDia(key)` («jueves 11/09», nombres a mano) |
| `lib/rrhh/documento.ts` | `normalizarDocumento(v) → string \| null` (mayúsculas) · `mismoDocumento(a, b)` (sin mayúsculas, igual semántica que `cuenta-unificada.ts`) · `enmascararDocumento(v)` · `esDniValido(v)` |
| `lib/rrhh/roles.ts` | `RRHH_COMPLETO = ["admin","owner"]` · `RRHH_GESTION = [...RRHH_COMPLETO, "manager"]` · `RRHH_MARCAR = [...RRHH_GESTION, "almacenero", "cajero"]` (tipados `AdminRole[]`) · `nivelDeRol(role) → NivelRrhh \| null` · `ventanaDeMarcado(nivel, role, hoy) → { desde: FechaKey \| null; hasta: FechaKey }` |
| `lib/rrhh/dto.ts` | `aColaboradorDTO(row, nivel)` · `aColaboradorMinDTO(row)` · `aPuestoDTO(row, nivel, personas)` · `aTarifaDTO(row)` · `aAsistenciaDTO(row, conHistorial?)` — whitelist explícita, sin spread del row |
| `lib/rrhh/asistencia.ts` | `calcularHoras(m) → number \| null` · `revisarMarca(input, ctx) → { ok: true; marca: MarcaNormalizada } \| { ok: false; motivo: MotivoRechazo; message: string }` · `incluidosEnMasivo(colaboradores, fecha, vivas, opts) → { incluidos: string[]; omitidos: Omitido[] }` · `esIgualALaViva(viva, nueva)` |
| `lib/rrhh/ganado.ts` | `tarifaVigente(tarifas, fecha)` · `factorDe(estado \| null, modalidad)` · `calcularGanado({ colaborador, tarifas, marcas, desde, hasta, hoy }) → GanadoPersona` · `explicarGanado(g) → string[]` («22 días × S/ 60.00 = S/ 1,320.00») |
| `lib/rrhh/schemas.ts` | Zod de abajo |

`MotivoRechazo = "futuro" | "fuera_de_ventana" | "antes_del_ingreso" | "despues_del_cese" | "horas_invalidas" |
"horas_en_estado_sin_trabajo" | "turno_cruza_medianoche" | "colaborador_eliminado"`.

### Zod — `lib/rrhh/schemas.ts` (siempre `safeParse`)

```ts
const fechaKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1).max(40);
const texto = (max: number) => z.string().trim().max(max);
const tarifaInput = z.object({
  modalidad: z.enum(["HORA", "DIA", "SEMANA", "MES"]),
  monto: z.number().positive().max(9_999_999),
  horasJornada: z.number().positive().max(24).optional(),
  vigenteDesde: fechaKey,
});

/** Ausente = mantener · null = quitar · valor = cambiar (ADR-412). */
const camposColaborador = {
  nombre: z.string().trim().min(2).max(120),
  apodo: texto(40).nullable(),
  tipoDocumento: z.enum(TIPOS_DOCUMENTO).nullable(),
  documento: texto(20).nullable(),
  celular: texto(20).nullable(),
  direccion: texto(300).nullable(),
  contactoEmergenciaNombre: texto(120).nullable(),
  contactoEmergenciaCelular: texto(20).nullable(),
  puestoId: id.nullable(),
  fechaIngreso: fechaKey.nullable(),
  observaciones: texto(2000).nullable(),
};

export const colaboradorCrearSchema = z.object({
  ...camposColaborador,
  apodo: camposColaborador.apodo.optional(),
  tipoDocumento: camposColaborador.tipoDocumento.optional(),
  documento: camposColaborador.documento.optional(),
  celular: camposColaborador.celular.optional(),
  direccion: camposColaborador.direccion.optional(),
  contactoEmergenciaNombre: camposColaborador.contactoEmergenciaNombre.optional(),
  contactoEmergenciaCelular: camposColaborador.contactoEmergenciaCelular.optional(),
  puestoId: camposColaborador.puestoId.optional(),
  fechaIngreso: camposColaborador.fechaIngreso.optional(),
  observaciones: camposColaborador.observaciones.optional(),
  estado: z.enum(["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"]).default("ACTIVO"),
  beneficiarioId: id.nullable().optional(),        // sólo completo
  tarifaInicial: tarifaInput.nullable().optional(), // sólo completo
});

export const colaboradorAccionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("editar"), ...z.object(camposColaborador).partial().shape }),
  z.object({ action: z.literal("cambiar_estado"), estado: z.enum(["ACTIVO", "VACACIONES", "LICENCIA", "SUSPENDIDO"]), sinPagoDesde: fechaKey.optional() }),
  z.object({ action: z.literal("cesar"), fechaCese: fechaKey, motivo: z.string().trim().min(3).max(300), confirmar: z.boolean().optional() }),
  z.object({ action: z.literal("reingresar"), fecha: fechaKey, tarifa: tarifaInput.nullable().optional() }),
  z.object({ action: z.literal("vincular_beneficiario"), beneficiarioId: id.nullable() }),
  z.object({ action: z.literal("vincular_usuario"), adminUserId: id.nullable() }),
  z.object({ action: z.literal("restaurar") }),
]);

export const tarifaGuardarSchema = z.object({
  modalidad: z.enum(MODALIDADES),
  monto: z.number().min(0).max(9_999_999),        // SIN_PAGO ⇔ 0 lo valida el puro
  horasJornada: z.number().positive().max(24).optional(),
  vigenteDesde: fechaKey,
  motivo: texto(300).optional(),
});

export const puestoSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: texto(300).nullable().optional(),
  tarifaSugerida: z.object({ modalidad: z.enum(["HORA", "DIA", "SEMANA", "MES"]), monto: z.number().positive().max(9_999_999) }).nullable().optional(),
  horasJornada: z.number().positive().max(24).optional(),
  orden: z.number().int().min(0).max(999).optional(),
});

export const marcaInputSchema = z.object({
  colaboradorId: id,
  fecha: fechaKey,
  /** null = quitar la marca del día. */
  estado: z.enum(ESTADOS_ASISTENCIA).nullable(),
  entrada: hora.nullable().optional(),
  salida: hora.nullable().optional(),
  refrigerioMin: z.number().int().min(0).max(240).optional(),
  horas: z.number().positive().max(24).nullable().optional(),
  nota: texto(300).nullable().optional(),
});

export const guardarMarcasSchema = z.object({
  marcas: z.array(marcaInputSchema).min(1).max(200),
  motivo: texto(300).optional(),
});

export const masivoSchema = z.object({
  fecha: fechaKey,
  estado: z.enum(ESTADOS_ASISTENCIA).default("PRESENTE"),
  entrada: hora.nullable().optional(),
  salida: hora.nullable().optional(),
  colaboradorIds: z.array(id).max(500).optional(),  // ausente = todos los incluibles
  sobrescribir: z.boolean().default(false),
  nota: texto(300).nullable().optional(),
});

export const rangoSchema = z.object({ desde: fechaKey, hasta: fechaKey, colaboradorId: id.optional() });
```

Las reglas entre campos (documento sin tipo, DNI de 8 dígitos, `SIN_PAGO ⇔ 0`, par repetido
`(colaboradorId, fecha)` dentro del lote, rango ≤ 62/93 días) van en los puros `revisar*`, no en `.refine` dentro
de la unión discriminada.

### DB classes — `tenantId` primer argumento, Prisma sólo acá

**`lib/db/rrhh-puestos.db.ts` — `PuestosDB`**

| Método | Firma | Tira |
|---|---|---|
| `listar` | `(tenantId) → Promise<PuestoRow[]>` (con `personas`) | — |
| `crear` | `(tenantId, input, usuario) → Promise<PuestoRow>` | `NombreDePuestoDuplicadoError` |
| `actualizar` | `(tenantId, id, patch, usuario) → Promise<PuestoRow \| null>` | `NombreDePuestoDuplicadoError` |
| `eliminar` | `(tenantId, id, usuario) → Promise<{ ok: true } \| { ok: false; enUso: number } \| null>` | — |

**`lib/db/rrhh-colaboradores.db.ts` — `ColaboradoresDB`**

| Método | Firma | Tira |
|---|---|---|
| `listar` | `(tenantId, filtros: { estados?: EstadoColaborador[]; puestoId?: string; q?: string; incluirCesados?: boolean }) → Promise<ColaboradorRow[]>` | — |
| `obtener` | `(tenantId, id) → Promise<ColaboradorRow \| null>` | — |
| `existe` | `(tenantId, id) → Promise<boolean>` | — |
| `ficha` | `(tenantId, id, nivel) → Promise<FichaColaboradorDTO \| null>` — compone `AdelantosDB`, `ContractsDB`, `AsistenciaDB` | — |
| `crear` | `(tenantId, input, usuario) → Promise<ColaboradorRow>` — tx: persona + tarifa inicial | `DocumentoDuplicadoError(existente)` · `BeneficiarioYaVinculadoError` · `DocumentoNoCoincideError` · `PuestoNoEncontradoError` · `BeneficiarioNoEncontradoError` |
| `editar` | `(tenantId, id, patch, usuario) → Promise<{ row: ColaboradorRow; camposCambiados: string[] } \| null>` | `DocumentoDuplicadoError` · `PuestoNoEncontradoError` |
| `cambiarEstado` | `(tenantId, id, { estado, sinPagoDesde? }, usuario) → Promise<ColaboradorRow \| null>` | `EstadoInvalidoError` (desde CESADO se sale con `reingresar`) |
| `cesar` | `(tenantId, id, { fechaCese, motivo, confirmar? }, usuario) → Promise<ColaboradorRow \| null>` — tx: estado + `fechaCese` + `SIN_PAGO` desde `fechaCese + 1` si tiene tarifa | `MarcasDespuesDelCeseError(n, primera)` si hay marcas vivas posteriores y no `confirmar` |
| `reingresar` | `(tenantId, id, { fecha, tarifa? }, usuario) → Promise<ColaboradorRow \| null>` — tx: `ACTIVO`, `fechaCese = null`, tarifa desde `fecha` (la dada o la última pagada) | `NoEstaCesadoError` |
| `vincularBeneficiario` | `(tenantId, id, beneficiarioId \| null, usuario) → Promise<ColaboradorRow \| null>` | `BeneficiarioNoEncontradoError` · `BeneficiarioYaVinculadoError` (P2002) · `DocumentoNoCoincideError` |
| `vincularUsuario` | `(tenantId, id, adminUserId \| null, usuario) → Promise<ColaboradorRow \| null>` | `UsuarioNoEncontradoError` · `UsuarioYaVinculadoError` |
| `eliminar` | `(tenantId, id, usuario) → Promise<{ marcasOcultas: number } \| null>` — baja lógica | — |
| `restaurar` | `(tenantId, id, usuario) → Promise<ColaboradorRow \| null>` | `DocumentoOcupadoError(existente)` |
| `tarifasDe` | `(tenantId, colaboradorIds: string[]) → Promise<Map<string, TarifaRow[]>>` | — |
| `guardarTarifa` | `(tenantId, colaboradorId, input, usuario) → Promise<TarifaRow[]>` — tx: baja de la viva con la misma fecha + fila nueva; P2002 → reintento | `TarifaInvalidaError` |
| `quitarTarifa` | `(tenantId, colaboradorId, tarifaId, usuario) → Promise<TarifaRow[] \| null>` | — |
| `exportar` | `(tenantId, id) → Promise<ExportColaborador \| null>` | — |
| `resumen` | `(tenantId, hoy) → Promise<Omit<ResumenRrhhDTO, "nivel" \| "hoy">>` | — |

**`lib/db/rrhh-asistencia.db.ts` — `AsistenciaDB`**

| Método | Firma | Tira |
|---|---|---|
| `hoja` | `(tenantId, desde, hasta) → Promise<{ colaboradores: ColaboradorRow[]; marcas: AsistenciaRow[] }>` | — |
| `guardar` | `(tenantId, marcas: MarcaNormalizada[], ctx: { usuario; motivo?; origen: "manual" }) → Promise<{ guardadas: AsistenciaRow[]; quitadas: number; sinCambio: number }>` — una tx; `SELECT … FOR UPDATE` de las vivas de los pares; P2002 → releer y reintentar una vez | `ColaboradorAjenoError(ids)` |
| `masivo` | `(tenantId, input, ctx) → Promise<{ creadas: number; reemplazadas: number; omitidos: Omitido[] }>` | — |
| `historial` | `(tenantId, colaboradorId, fecha) → Promise<AsistenciaRow[]>` | — |
| `posterioresA` | `(tenantId, colaboradorId, fecha) → Promise<{ n: number; primera: FechaKey \| null }>` | — |
| `delPeriodo` | `(tenantId, desde, hasta, colaboradorIds?: string[]) → Promise<AsistenciaRow[]>` | — |

**`lib/db/rrhh-ganado.db.ts` — `GanadoDB`** (orquesta, sin `prisma` propio)

| Método | Firma |
|---|---|
| `periodo` | `(tenantId, { desde, hasta, hoy, colaboradorId? }) → Promise<GanadoDTO>` — `ColaboradoresDB.listar` + `tarifasDe` + `AsistenciaDB.delPeriodo` + `AdelantosDB.saldosPorPersona` → `calcularGanado` por persona |

**Cambios en clases existentes:** `ContractsDB` (`mapContract`, `create`, `update`, `list` con filtro
`colaboradorId`) · `lib/types/contracts.ts` (`DbContract.colaboradorId`, `ContractListFilters.colaboradorId`,
`CreateContractInput`/`UpdateContractInput.colaboradorId`).

### API — `/api/rrhh/**`

Todas: `assertCsrf` en escrituras · `requireAdmin(req, <roles>)` · `Cache-Control: private, no-store` ·
`logActivity(..., tenantId)` · ids del cuerpo releídos con `tenantId` (IDOR). Rate limit: lecturas `GENEROUS`
`rrhh-lectura` · asistencia `GENEROUS` `rrhh-asistencia` · resto de escrituras `MODERATE` `rrhh-escritura` ·
exportar `STRICT` `rrhh-exportar`.

| Método y ruta | Roles | Cuerpo / query | Respuesta | Errores |
|---|---|---|---|---|
| `GET /api/rrhh/resumen` | marcar | — | `ResumenRrhhDTO` | — |
| `GET /api/rrhh/puestos` | marcar | — | `{ puestos: PuestoDTO[] }` (tarifa sólo completo) | — |
| `POST /api/rrhh/puestos` | gestion | `puestoSchema` | 201 `{ puesto }` | 422 `validation_error` · 409 `nombre_duplicado` · 403 `tarifa_requiere_admin` |
| `PATCH /api/rrhh/puestos/[id]` | gestion | `puestoSchema.partial()` | `{ puesto }` | 404 · 409 `nombre_duplicado` · 403 `tarifa_requiere_admin` |
| `DELETE /api/rrhh/puestos/[id]` | gestion | — | `{ ok: true }` | 404 · 409 `puesto_en_uso { n }` |
| `GET /api/rrhh/colaboradores` | marcar (`campos=min`) · gestion | `?estado=ACTIVO,VACACIONES&puestoId=&q=&incluirCesados=1&campos=min` | `{ nivel, colaboradores: ColaboradorDTO[] \| ColaboradorMinDTO[] }` | 403 si pide completo sin nivel |
| `POST /api/rrhh/colaboradores` | gestion (`beneficiarioId`/`tarifaInicial`: completo) | `colaboradorCrearSchema` | 201 `{ colaborador: ColaboradorDTO }` | 422 `validation_error` · 422 `documento_invalido` · 409 `documento_duplicado { colaboradorId, nombre }` · 409 `beneficiario_ya_vinculado` · 409 `documento_no_coincide` · 403 `requiere_admin` |
| `GET /api/rrhh/colaboradores/[id]` | gestion | — | `FichaColaboradorDTO` | 404 |
| `PATCH /api/rrhh/colaboradores/[id]` | gestion (`vincular_*`, `reingresar` con tarifa: completo) | `colaboradorAccionSchema` | `{ colaborador: ColaboradorDTO }` | 404 · 422 · 409 `documento_duplicado` · 409 `marcas_despues_del_cese { n, primera }` · 409 `beneficiario_ya_vinculado` · 409 `documento_no_coincide` · 409 `documento_ocupado` · 409 `no_esta_cesado` |
| `DELETE /api/rrhh/colaboradores/[id]` | completo | — | `{ ok: true, marcasOcultas }` | 404 |
| `GET /api/rrhh/colaboradores/[id]/exportar` | completo | — | JSON (`Content-Disposition: attachment`) | 404 |
| `GET /api/rrhh/colaboradores/[id]/tarifas` | completo | — | `{ tarifas: TarifaDTO[] }` | 404 |
| `PUT /api/rrhh/colaboradores/[id]/tarifas` | completo | `tarifaGuardarSchema` | `{ tarifas: TarifaDTO[] }` | 404 · 422 `tarifa_invalida { message }` |
| `DELETE /api/rrhh/colaboradores/[id]/tarifas?tarifaId=` | completo | — | `{ tarifas: TarifaDTO[] }` | 404 |
| `GET /api/rrhh/colaboradores/desde-adelantos` | completo | — | `{ candidatos: CandidatoDesdeAdelantosDTO[], yaVinculados: number }` | — |
| `POST /api/rrhh/colaboradores/desde-adelantos` | completo | `traerDesdeAdelantosSchema` | `ResultadoTraerDesdeAdelantosDTO` | 422 `validation_error` |
| `GET /api/rrhh/asistencia` | marcar | `?desde=&hasta=` (≤ 62 días; default hoy) | `HojaAsistenciaDTO` | 422 `rango_invalido` |
| `PUT /api/rrhh/asistencia` | marcar | `guardarMarcasSchema` | `{ guardadas: AsistenciaDTO[], quitadas, sinCambio }` | 422 `marcas_invalidas { errores: { colaboradorId, fecha, motivo, message }[] }` · 403 `fuera_de_ventana` |
| `POST /api/rrhh/asistencia/masivo` | marcar | `masivoSchema` | `{ creadas, reemplazadas, omitidos: { colaboradorId, nombre, motivo: "ya_marcado" \| "no_activo" \| "no_ingresado" \| "cesado" }[] }` | 422 · 403 `fuera_de_ventana` |
| `GET /api/rrhh/asistencia/historial` | marcar | `?colaboradorId=&fecha=` | `{ versiones: AsistenciaDTO[] }` | 404 |
| `GET /api/rrhh/ganado` | completo | `?desde=&hasta=&colaboradorId=` (≤ 93 días) | `GanadoDTO` | 422 `rango_invalido` |
| `GET /api/contratos?colaboradorId=` (existente) | admin, owner, manager | + filtro | igual | — |
| `POST /api/contratos` · `PATCH /api/contratos/[id]` (existentes) | igual | + `colaboradorId: z.string().max(40).nullish()` | igual | + 422 `colaborador_no_encontrado` (se relee con `tenantId`) |

Mensajes (tuteo, con la cifra): «Ya está registrado como Quispe Galindo Victor.» · «Todavía no llega el viernes
12/09.» · «Cesó el 10/09: no se le puede marcar el 11/09.» · «Ingresó el 15/09: no se le puede marcar antes.» ·
«Sólo puedes corregir desde el martes 09/09.» · «La salida tiene que ser después de la entrada.» · «Una falta no
lleva horas.» · «Tiene 3 marcas después del 10/09: se guardan, pero no suman.» · «Ese puesto lo usan 4 personas.»

### UI — archivos (≤ 300 líneas cada uno)

| Archivo | Qué |
|---|---|
| `components/admin/unified/RecursosHumanosHubModule.tsx` | `AdminTabBar` + `useVistaModulo`, sub-pestañas filtradas por `resumen.nivel` |
| `components/admin/rrhh/rrhh-ui.ts` | etiquetas, letras y clases de token por estado; `leyendaDeCalculo`; copy de referencia |
| `components/admin/rrhh/asistencia/AsistenciaView.tsx` | switch Día / Mes, contadores |
| `components/admin/rrhh/asistencia/HojaDelDia.tsx` | lista del día, «Todos presentes», «No incluidos» |
| `components/admin/rrhh/asistencia/FilaMarcaDelDia.tsx` | botones de estado + entrada/salida + nota |
| `components/admin/rrhh/asistencia/HojaDelMes.tsx` | grilla personas × días + totales; lista a 400 px |
| `components/admin/rrhh/asistencia/CeldaMarcaPopover.tsx` | editar una celda |
| `components/admin/rrhh/asistencia/HistorialMarcaModal.tsx` | versiones del día (`aboveModals`) |
| `components/admin/rrhh/personal/PersonalView.tsx` | `DataTable` + filtros en cabecera + KPIs |
| `components/admin/rrhh/personal/ColaboradorFormModal.tsx` | alta/edición; DNI → `/api/reniec/lookup`; puesto con alta en línea; tarifa inicial prellenada del puesto (completo) |
| `components/admin/rrhh/personal/FichaColaboradorModal.tsx` | cabecera + pestañas internas |
| `components/admin/rrhh/personal/FichaTarifas.tsx` | línea de tiempo de versiones + «Nueva tarifa» |
| `components/admin/rrhh/personal/FichaContratos.tsx` | vinculados + «¿Son de esta persona?» |
| `components/admin/rrhh/personal/FichaCuenta.tsx` | vínculo con Adelantos, sugeridos por documento, saldo abierto, «Ver su cuenta» |
| `components/admin/rrhh/personal/CesarColaboradorModal.tsx` | cese / reingreso (`aboveModals`) |
| `components/admin/rrhh/ganado/GanadoView.tsx` | chips de período + tabla + total |
| `components/admin/rrhh/ganado/FilaGanado.tsx` | fila + «Cómo sale» |
| `components/admin/rrhh/contratos/ContratosDelPersonalView.tsx` | lista con columna Persona, enlace a `ContratosModule` |
| `components/admin/rrhh/puestos/PuestosView.tsx` · `PuestoFormModal.tsx` | catálogo + chips de un clic |

Hooks: `hooks/use-rrhh-resumen.ts` · `use-rrhh-puestos.ts` · `use-rrhh-colaboradores.ts` · `use-rrhh-ficha.ts` ·
`use-rrhh-asistencia.ts` (`{ hoja, loading, error, marcar(parciales), pendientes, guardando, masivo(input),
recargar }` — acumula cambios y guarda en ráfaga) · `use-rrhh-ganado.ts`.

## Plan de implementación

### F1 — hoy (útil ya): alta de personas, puestos con tarifa, asistencia del día y del mes, lo ganado de referencia, contratos vinculados

**Orden entre agentes:** backend escribe `lib/rrhh/tipos.ts` y `lib/rrhh/fechas.ts` **antes que nada** (export
primero, import después: un import sin su export tumbó toda la app en Turbopack, ADR-412). Frontend arranca por
el cableado de la barra lateral mientras tanto. Nadie verifica en el navegador mientras el otro esté a mitad de un
cambio de contrato.

**Backend** — dueño de `prisma/**`, `lib/rrhh/**`, `lib/db/**`, `lib/types/contracts.ts`, `app/api/**`, `__tests__/**`

| Crear | Tocar |
|---|---|
| `lib/rrhh/tipos.ts` · `fechas.ts` · `documento.ts` · `roles.ts` · `dto.ts` · `asistencia.ts` · `ganado.ts` · `schemas.ts` | `prisma/schema.prisma` (sólo los bloques de §9 + `Contract.colaboradorId`) |
| `lib/db/rrhh-puestos.db.ts` · `rrhh-colaboradores.db.ts` · `rrhh-asistencia.db.ts` · `rrhh-ganado.db.ts` | `lib/types/contracts.ts` · `lib/db/contracts.db.ts` |
| `app/api/rrhh/resumen/route.ts` | `app/api/contratos/route.ts` (crear + filtro) |
| `app/api/rrhh/puestos/route.ts` · `puestos/[id]/route.ts` | `app/api/contratos/[id]/route.ts` (`colaboradorId`) |
| `app/api/rrhh/colaboradores/route.ts` · `[id]/route.ts` · `[id]/tarifas/route.ts` · `[id]/exportar/route.ts` | aplicar `prisma/migrations/adr-414-recursos-humanos.sql` + `prisma generate` |
| `app/api/rrhh/asistencia/route.ts` · `asistencia/masivo/route.ts` · `asistencia/historial/route.ts` | |
| `app/api/rrhh/ganado/route.ts` | |
| `__tests__/rrhh-ganado.test.ts` · `rrhh-asistencia.test.ts` · `rrhh-documento.test.ts` · `rrhh-dto-nivel.test.ts` | |

**Frontend** — dueño de `app/admin/**`, `components/**`, `hooks/**`, `lib/billing/plan-tiers.ts`, `lib/module-permissions.ts`

| Tocar | Cambio |
|---|---|
| `app/admin/_lib/tabs.types.ts` | `Tab` + `VALID_TABS` += `"rrhh"` (el panel importa ESTE archivo, no `app/admin/admin-types.ts`) |
| `app/admin/_lib/tab-data.ts` | `ALL_TABS` += `{ id: "rrhh", label: "Recursos Humanos", icon: Users }` |
| `app/admin/_lib/tab-categories.ts` | `MODULE_INFO.rrhh` · categoría `recursos-humanos` en `BASIC_MODULES` · `byId("recursos-humanos")` antes de `byId("equipo")` · `EASY_MODE_TABS` += `"rrhh"` |
| `app/admin/_lib/tab-migration.ts` | `rrhh` y `nomina` → `"rrhh"` · alias `recursos-humanos`, `personal`, `asistencia`, `asistencias`, `colaboradores`, `trabajadores`, `empleados`, `planilla` → `"rrhh"` |
| `app/admin/_components/TabRouter.tsx` | `dynamic(RecursosHumanosHubModule)` + `if (tab === "rrhh")` |
| `app/admin/_lib/tab-preload.ts` | `rrhh` → mismo loader |
| `app/admin/_hooks/useCommandItems.ts` | `MODULES` += `rrhh` · acción «Marcar asistencia» |
| `lib/billing/plan-tiers.ts` | `PLAN_BASICO.unlockedTabs` += `"rrhh"` |
| `lib/module-permissions.ts` | `almacenero` += `"rrhh"` |
| `components/admin/contratos/VinculoContraparte.tsx` | tercer lado «Trabajador» (`/api/rrhh/colaboradores?campos=min`) |

Crear: los componentes y hooks de la sección UI.

**Revisión** (otro agente, contexto fresco): diff + estos criterios — whitelist por nivel, `tenantId` en cada
`where` y en cada `logActivity`, ningún monto ni PII en la auditoría, masivo que no pisa, `fecha > hoy` rechazado
con hoy de Lima, mes completo = monto exacto, sub-pestañas y rutas coherentes por rol.

**Verificación para decir «listo»:** `tsgo` → `tsc --noEmit` · `npm run lint` · vitest de los 4 tests · humo por API
en un tenant de QA (`scripts/create-qa-admin-blas.mjs`, login con `tenantSlug` explícito): alta → puesto → tarifa →
masivo → corrección → ganado → export; almacenero: `GET /api/rrhh/ganado` → 403 y la hoja no trae `documento` ·
navegador: hoja del día y del mes en claro, oscuro y 400 px; masivo + corregir + historial; Escape en el popover
no cierra la ficha; `node scripts/barrido-modales-anidados.mjs` en verde.

### F2 — pagar y papeles

`CierrePeriodo` + partida «Sueldo por pagar» en ADR-413 (con `proponerDescuentos`) · contrato de trabajo prellenado
desde la ficha · «Aplicar la tarifa del puesto a N personas desde el dd/mm» · Excel de la hoja del mes · horario
esperado por persona → tardanza sugerida · «Descanso para todos (feriado)» en un clic · adjuntos al Drive (copia del
DNI, certificados) como punteros `documentId`, igual que `ForestParty.adjuntos`.

### F3 — que la asistencia entre sin tipear

«Llegué» por WhatsApp desde el celular registrado (requiere celular: hoy 0 de las 2 personas reales lo tienen) ·
QR por persona que escanea el almacenero · asistente IA por voz («márcale falta a Victor», 6 lugares según
`hub-asistente-ia`) · recurso `rrhh` en `role-permissions.ts` (cambio DANGER) · purga por retención.

## Casos límite y decisión por defecto

| Caso | Decisión |
|---|---|
| Persona sin documento | Se permite. Chip «Sin documento»; no se une a nada por documento; cuenta y contratos sólo se vinculan eligiendo a mano |
| Dos personas con el mismo DNI | Único parcial entre vivos → 409 `documento_duplicado` con el nombre y «Abrir ficha». Un cesado sigue vivo: la misma persona que vuelve es un **reingreso**, no una ficha nueva |
| Cambio de tarifa a mitad de mes | Versión con `vigenteDesde`; los días anteriores siguen con la vieja; el mes muestra dos tramos, redondeados cada uno una vez |
| Guardar dos tarifas el mismo día | La segunda corrige la primera (baja lógica + fila nueva) |
| Marcar un día futuro | 422 con el hoy de Lima del servidor. La tarifa futura sí se permite |
| Almacenero corrige una semana atrás | 403 `fuera_de_ventana` (ventana hoy − 2) |
| Cesado con asistencias posteriores | Escribir después del cese → 422. Cesar con marcas posteriores → 409 con cuántas; con `confirmar` se cesa, las marcas **se conservan** y salen en «fuera de período» sin sumar |
| Reingreso | `SIN_PAGO` desde el día siguiente al cese (lo escribió `cesar`); `reingresar` vuelve a `ACTIVO`, anula `fechaCese` y crea la tarifa desde la fecha de reingreso. `fechaIngreso` conserva el primer ingreso |
| Borrar persona con asistencias | Baja lógica: ficha y marcas quedan fuera de toda vista; el documento se libera; restaurar → 409 si otro vivo lo tomó; los contratos vinculados muestran «persona eliminada» |
| Feriados | No hay calendario en el repo. Masivo con `DESCANSO` y nota «Feriado»: jornal no suma, sueldo sí. Trabajado en feriado = `PRESENTE` sin recargo (el recargo es de planilla) |
| Sin tarifa | No suma y se lista en «sin tarifa desde dd/mm». Nunca S/ 0 |
| `HORA` sin horas | Estimado con `horasJornada × factor` y rotulado «horas estimadas» |
| Masivo con marcas ya cargadas | No las toca (`sobrescribir = false`); reemplazar exige confirmarlo con el número en el botón |
| Dos usuarios marcan a la misma persona el mismo día | Único parcial → P2002 → se relee y la segunda queda como versión nueva |
| Vincular una cuenta con otro documento | 409 `documento_no_coincide` |
| Turno que cruza la medianoche | 422 en F1 |
| `MES` en meses de 28 a 31 días | Valor diario = monto ÷ días de ESE mes: el mes completo da el monto exacto |
| Persona en vacaciones y «Todos presentes» | No incluida; aparece en «No incluidos» con «Marcar vacaciones» |
| Puesto eliminado con personas | 409 `puesto_en_uso { n }` |
| Otra moneda | No en F1 (CHECK `moneda = 'PEN'`) |

## Lo que NO se hace

- No es planilla electrónica ni emite boletas; no genera PLAME ni T-Registro.
- No calcula CTS, gratificaciones, EsSalud, ONP/AFP, quinta categoría ni horas extra con sobretasa.
- No resta «le debes» en F1 (§5).
- No escribe adelantos ni mueve la caja: el pago va por ADR-413 en F2.
- No une personas por nombre ni vincula sola por documento.
- No usa biometría ni cámaras para marcar.
- No toca `lib/auth/role-permissions.ts`.
- No duplica el wizard de contratos.

## Dudas que decide Brandon (se aplica la recomendación por defecto)

| # | Pregunta | Por defecto |
|---|---|---|
| 1 | ¿La tardanza descuenta? | No: paga el día y se cuenta aparte |
| 2 | ¿La semana cierra el domingo o el día de pago (p. ej. sábado)? | Lunes a domingo |
| 3 | ¿El cajero marca asistencia? | No en la barra por defecto; se habilita por rol |
| 4 | ¿Un jornalero cobra vacaciones o descanso? | No (factor 0); el sueldo semanal/mensual sí |

## Referencias

`lib/adelantos/cuenta-unificada.ts` · `lib/adelantos/planilla-lote.ts` · `lib/cuentas/liquidacion.ts` ·
`lib/db/adelantos.db.ts` · `lib/db/contracts.db.ts` · `lib/types/contracts.ts` · `lib/contratos/plantillas.ts` ·
`components/admin/contratos/VinculoContraparte.tsx` · `components/admin/unified/EquipoHubModule.tsx` ·
`app/admin/_lib/tab-categories.ts` · `app/admin/_lib/tabs.types.ts` · `app/admin/_hooks/useAdminTabsDerived.ts` ·
`lib/module-permissions.ts` · `lib/billing/plan-tiers.ts` · `lib/require-admin.ts` · `lib/activity-logger.ts` ·
`lib/utils.ts` (`limaDateKey`) · `scripts/apply-fiados-gestion-migration.mjs`.
