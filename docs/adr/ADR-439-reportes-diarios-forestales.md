# ADR-439 — Reportes diarios forestales por correo y WhatsApp

- **Fecha:** 2026-09-26
- **Estado:** aceptado (implementado; los canales necesitan credenciales válidas — ver «Qué falta afuera del código»)
- **Pedido por:** Brandon (26-09): «recibir reportes diarios por Gmail (correo) y WhatsApp, por ejemplo al terminar el día a las 6 pm, con el reporte completo forestal: producción, si cortamos, madera ingresada, deudas, etc. Todo configuro: la hora, el reporte, el medio, y todo personalizado de temas forestales».
- **Depende de:** ADR-437 (plata de la guía, deudas por proveedor) · `lib/forestal/ctp-pendientes.ts` (pendientes del libro) · `ctp-aviso-plazos.ts` (plazos SERFOR) · `NotificationLog` (historial) · `lib/email/resend.ts` y `lib/whatsapp.ts` (senders).

## Contexto (medido 2026-09-26, sólo lectura)

- **Lo que ya había:** `cron/daily-report` (ventas de la bodega por WhatsApp, cola BullMQ, sin registro por envío), `cron/daily-summary` (ventas/pedidos, sin envío), `cron/forestal-plazos` (plazos SERFOR por campana + correo + WhatsApp, un aviso fijo al `ownerPhone`/`ownerEmail`) y `cron/asistente-avisos` (campana + Telegram + n8n). Ninguno configurable ni forestal completo.
- **Vercel está en plan Hobby** (memoria `whatsapp-inbox-admin-2026-07-16`: los crons sub-diarios tumbaron un deploy). Los 87 crons de `vercel.json` son diarios; el tope es 100. Hobby dispara cada cron en **cualquier minuto de su hora**.
- **Canales caídos:** en Blas (`NotificationLog`) los únicos envíos forestales son del 13/09 04:41 UTC, `failed`: WhatsApp `401 Invalid OAuth access token - Cannot parse access token` y Resend `The buleje.pe domain is not verified`. Nada después. Con la clave de este servidor, el 26-09 dieron **los mismos dos errores**.

## Decisión

1. **Tabla nueva `ForestReporteDiario`** (aditiva, `prisma/migrations/20260926_reportes_diarios_adr439`): nombre, activo, hora «HH:MM» de Lima de media en media hora, días (0 = domingo), `porCorreo`/`porWhatsapp` + `correos[]`/`telefonos[]` (≤ 10 cada uno, teléfono sólo dígitos con 51), `secciones[]` (produccion · tala · ingresos · despachos · patio · plata · pendientes · plazos), `rango` (hoy · ayer · semana) y `ultimaFechaEnviada` (llave de idempotencia). Tope 20 reportes por negocio.
2. **El historial es `NotificationLog`**, un renglón por destinatario y canal: `type = "reporte_diario:<id>:<email|whatsapp>"`, `status` sent/failed y el error **crudo** en `message`. La pantalla lo traduce con `explicarFalloEnvio` («Correo: verifica buleje.pe en Resend»; «WhatsApp: el token cargado no es válido…»).
3. **Datos sólo por DB classes** (`lib/db/forest-reporte-diario-datos.db.ts`): producción = `ForestCtpDB.resumenDeJornadas` (el mismo PT/m³ de la tira de días) + consumo del rango para el rendimiento (se calla si > 100 %); tala/trozado = `ForestLothDB.resumenPeriodo`; ingresos = `WoodEntriesDB.stats`; despachos = `ForestCtpDB.list(despacho)` (sólo suma m³ de asientos en m³; el valor de venta sólo si alguno lo declara); patio = `ForestCtpDB.saldos` + `contarTrozasVaradas(60)`; plata = `GuiaPlataDB.sinPagarPorParte` + movimientos `pago_hecho`/`pago` del rango en soles + `AdelantosDB.resumen`; pendientes = `pendientesDelLibro` con los datos del mes; plazos = `construirAviso`. Cada sección se lee aparte: si una falla, el reporte lo **dice** («No se pudo leer esta parte») y sale igual.
4. **Armado puro** (`reporte-diario-bloques.ts` → `reporte-diario-armado.ts`): los datos pasan a bloques neutros y de ahí salen el correo (tablas con estilos en línea, sin imágenes externas, todo escapado) y el WhatsApp (≤ 1500 caracteres; primero se recortan renglones de detalle, nunca los totales ni el link «Ver más»). El asunto lleva `[Atención]` si algo pide acción.
5. **Despachador idempotente** (`despacharReportesDiarios`): manda los reportes activos cuyo día toca y cuya hora de Lima **ya pasó** hoy (no «es exactamente»: Hobby llega tarde). El reclamo es un `updateMany` con `tenantId` y `ultimaFechaEnviada ≠ hoy` en el WHERE: dos disparos (o dos simultáneos) → un envío. Se reclama **antes** de mandar: un 401 no se reintenta cuatro veces al día; el reintento es «Enviar ahora». Lo que no salió ayer no se arrastra a hoy.
6. **Disparos:** `vercel.json` registra 4 crons diarios (07:00, 13:00, 18:00 y 21:00 de Lima = `0 12|18|23|2 * * *` UTC) sobre `/api/cron/reportes-diarios/<HHMM>` — un path por cron para no depender de que Vercel acepte dos crons en la misma ruta. `DISPAROS_LIMA` lo refleja y un test lo compara con `vercel.json`. El editor dice cuándo llega de verdad (`cuandoSale`): «Llega entre las 18:00 y las 18:59» / «a más tardar entre las 21:00 y las 21:59». Con un disparador externo cada 30 min (cron-job.org, Supabase `pg_cron` + `pg_net`, GitHub Actions) contra `/api/cron/reportes-diarios` con `Authorization: Bearer <CRON_SECRET>`, sale a la media hora exacta sin tocar código.
7. **Rutas** (`app/api/admin/forestal/reportes-diarios/**`): `GET` (lista + últimos 8 envíos por reporte + disparos + qué canales tiene el servidor, sólo presencia), `POST` (crear), `GET/PUT/DELETE [id]`, `POST vista-previa` (arma con el borrador del editor, sin mandar) y `POST [id]/enviar` («Enviar ahora» a los destinatarios **guardados**, nunca a los del cuerpo; tope 20 por hora y negocio). Guard: `requireAdmin(admin, owner)` + **rol explícito** (manager pasa `requireAdmin` por el bypass de gestión) → CSRF en escrituras → rate limit → `spec:forestal:ctp-libro` → `safeParse`. El id de otro negocio da 404 (tenantId en el WHERE). Auditoría `ctp_reporte_diario_{crear,actualizar,eliminar,enviar}` con los destinatarios en el detalle.
8. **UI:** Libro CTP → Acciones → «Reportes diarios» (`CtpReportesDiariosModal`): lista de reportes con el estado del último envío, editor (hora, días, canales con destinatarios en fichas, secciones, rango, activo), «Cómo salió» con el error en palabras y vista previa lado a lado (correo en iframe sin permisos + burbuja de WhatsApp con su contador).

## Qué falta afuera del código (lo hace Brandon)

| Canal | Error medido | Qué hacer |
|---|---|---|
| Correo (Resend) | `The buleje.pe domain is not verified` | resend.com → Domains → agregar `buleje.pe` y cargar sus registros DNS (SPF/DKIM) donde está el dominio; o poner `RESEND_FROM_EMAIL` con un dominio ya verificado. |
| WhatsApp (Meta Cloud API) | `401 … Cannot parse access token` | Meta Business → Usuarios del sistema → generar token **permanente** con `whatsapp_business_messaging` → `WHATSAPP_API_TOKEN` en Vercel (sin comillas ni espacios) → redeploy. |
| WhatsApp, ventana de 24 h | (esperable después del token) | Meta sólo deja mandar **texto libre** a quien le escribió al número en las últimas 24 h. Para un reporte diario sin eso hace falta una **plantilla aprobada** (p. ej. `reporte_diario` con el link al panel); hoy el sender manda texto. |

## Consecuencias

- Hasta reiniciar el dev server tras `prisma generate`, las rutas que leen la tabla dan 500 (`prisma.forestReporteDiario` no existe en el cliente viejo); la vista previa anda porque no la toca.
- Un reporte guardado en QA (`main`) queda **pausado**: la base es la de producción y, una vez desplegado, un reporte activo saldría todos los días.
- El volumen no se suma entre secciones: tala, trozado, producción y despacho hablan de la misma madera en momentos distintos (memoria `volumen-del-libro-no-se-suma`).

## Alternativas descartadas

- **Guardar la config en `PlatformSetting` (KV) sin schema:** no da un reclamo atómico por día; dos disparos podían mandar dos veces.
- **Un cron cada 30 min en `vercel.json`:** Hobby lo rechaza y tumba el deploy entero.
- **Reintentar en cada disparo lo que falló:** con credenciales caídas son cuatro 401 al día por destinatario y un historial ilegible.
- **Mandar a los destinatarios que vengan en el cuerpo de «Enviar ahora»:** convertiría la ruta en un relé de mensajes desde la cuenta del negocio.

## Revisión 2026-09-26 (cifras + seguridad)

| # | Qué estaba mal (medido en `main`, 20/09–26/09) | Decisión |
|---|---|---|
| Cifras 1 | «11 guías · 7 por recibir» contaba asientos | `WoodEntriesDB.resumenPorGuia` → `resumirIngresosPorGuia` (puro): guía = serie + número (`claveDeGuia` de la bandeja), vigentes, por recibir si algún asiento no está recepcionado (`idsRecepcionados`), servicio aparte. Ahora **8 guías (1 de servicio) · 5 por recibir**. |
| Cifras 2 | Rendimiento 41,6 % (producido de TODAS las corridas ÷ consumo) | `rendimientoPonderado` extraído de `calcularKpisSeccion`: la MISMA función para la cabecera de Producción y el reporte. Ahora **38,4 %** (= `toFixed(1)` de 38,4497 del libro). |
| Cifras 3 | Patio leía saldos acumulados; Pendientes, los del mes | Una sola lectura: `saldos(tenantId, { toDate: fin del día del reporte })` (acumulado), para las dos secciones. |
| Cifras 4 | 21:30–23:30 se ofrecían y nunca salían | `horaSchema` rechaza > último disparo (422 con mensaje); el editor ofrece `HORAS_DEL_EDITOR` (05:00–21:00) y cada opción dice su ventana («18:30 · llega 21:00–21:59»). Con disparador externo cada 30 min tampoco hay horas después de las 21:00: se prefirió no prometerlas. |
| Cifras 5 | «Se intenta de nuevo en el próximo envío» era falso | El día se cierra si **al menos un** mensaje salió. Si fallaron todos, la reserva se devuelve como `«AAAA-MM-DD#n»` y el disparo siguiente lo reintenta, hasta `TOPE_INTENTOS_DIA` = 3; el reclamo es compare-and-swap contra el valor leído. Sin schema nuevo. |
| Cifras 6 | Adelantos sumaba PEN + USD | `AdelantosDB.resumen().porMoneda`; el reporte dice un renglón por moneda. |
| Seg 7 | Relé con nuestro remitente/número | Topes contados en `NotificationLog` (no en memoria): 60 mensajes/día por negocio (`TopeDiarioError` → 429 y renglón «Tope diario» en «Cómo salió»); 5 «Enviar ahora»/día por reporte (renglón `reporte_diario_manual:<id>`, fuera del historial); ≤ 10 destinatarios por reporte sumando canales; ≤ 10 reportes activos por negocio; teléfonos sólo `519XXXXXXXX`. |
| Seg 8 | CRLF en nombre de reporte/negocio | `sinCaracteresDeControl` en el esquema y en el armado (asunto, HTML, WhatsApp). |
| Seg 9 | El cron mandaba a negocios inactivos o sin módulo; sin módulo no se podía pausar | `paraDespachar` filtra `Tenant.active` + flag `spec:forestal:ctp-libro`. Ver lista, pausar (PUT `activo:false` → sólo apaga) y borrar no piden el módulo. |
| Seg 10 | Orden no determinista, sin presupuesto de tiempo | Orden hora → alta → id; corte a 250 s (`maxDuration` 300): lo no alcanzado queda sin reclamar; si el tiempo se acaba entre el reclamo y el primer mensaje, la reserva vuelve a su valor previo. |

## Revisión 2026-09-26 (noche) — hora exacta

- **La lógica del despachador aguanta tics cada 30 min** (medido: las 33 horas del editor × 3 días con tics `*/30` que llegan 2 s tarde → cada una sale una vez por día y en su tic; el de las 21:00 cae a las 02:00 UTC y se cuenta en el día de Lima; con los canales caídos, 18:30 → 19:00 → 19:30 y cierra). Tests en `__tests__/forestal-reporte-diario-hora-exacta.test.ts` y en el de despacho.
- **Lo que no aguantaba era la promesa:** con el disparador andando, el editor seguía diciendo «18:30 · llega 21:00–21:59». Ahora el disparador llama a `/api/cron/reportes-diarios/hora-exacta` (etiqueta propia; la raíz y los `/HHMM` de `vercel.json` no cuentan) y deja un **latido** en `PlatformSetting` (`reportes-diarios:latido-hora-exacta`, global como el despachador). El GET del panel devuelve `horaExacta` = latido < 65 min (`horaExactaViva`) y el editor promete «Llega a las 18:30.». Se mide, no se configura: si el job muere, en ≤ 65 min la pantalla vuelve sola a la ventana de Vercel.
- **Disparador elegido:** Supabase `pg_cron` + `pg_net` con el `CRON_SECRET` en Vault (GitHub Actions `schedule` sólo corre desde `master` y GitHub lo demora en el inicio de cada hora). **No aplicado:** el deploy de producción es de mayo y no tiene esta ruta (404), y los dos canales fallan. Requisitos, SQL, verificación y apagado: runbook `docs/runbooks/reportes-hora-exacta.md`.
