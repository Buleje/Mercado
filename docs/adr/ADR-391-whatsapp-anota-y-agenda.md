# ADR-391 — Anotar por WhatsApp en el mismo número que atiende clientes, y agendar actividades

- **Fecha:** 2026-09-05
- **Estado:** aceptado
- **Pedido por:** Brandon — «quiero un asistente de WhatsApp para registrar operaciones
  de mi negocio forestal por voz, texto o foto: gastos, ingresos, adelantos,
  cubicaciones y actividades/citas».

## Contexto

El pedido original describía construir de cero: webhook de Twilio, transcripción con
Whisper de OpenAI, un system prompt propio con schemas JSON, validación de campos
faltantes y escritura en Prisma.

Casi todo eso ya existía, en otro canal:

| Pieza | Dónde ya estaba |
|---|---|
| Entender el dictado y extraer la operación | `lib/asistente/conversar.ts` (ADR-387) |
| Memoria entre mensajes | `lib/asistente/memoria.ts` (ADR-390) |
| Validar y pedir el dato que falta | ensayo `__validar` + `requiresApproval` (ADR-387) |
| Escribir gasto/ingreso/adelanto | dominio `plata`, 14 acciones (ADR-387/389) |
| Transcribir audio | `lib/ai/transcribir.ts` — Whisper en Groq (ADR-388) |
| El mismo flujo, punta a punta | bot de Telegram (ADR-388) |

Lo que faltaba era **el canal**, no el motor. `conversar()` ya recibía un parámetro
`canal` precisamente porque se anticipó que habría más de uno.

Tres correcciones a la premisa del pedido, todas medidas:

1. **El proyecto no usa Twilio para WhatsApp.** Usa Meta Cloud API
   (`graph.facebook.com`); Twilio está sólo para SMS de OTP. Sumar Twilio habría
   dejado dos proveedores de WhatsApp que mantener.
2. **Whisper de OpenAI sería gasto nuevo por lo mismo.** Groq ya sirve
   `whisper-large-v3-turbo` con la key que el asistente ya paga.
3. **`/api/whatsapp/webhook` ya existía y estaba ocupado**: es el Concierge que
   atiende clientes (ADR-058).

## Decisión

### 1. Un solo número, lista blanca de teléfonos

El dueño le escribe **al mismo número del negocio**. El webhook decide de qué lado
cae cada mensaje antes de hacer nada, consultando `WhatsAppDuenosDB`.

**El default es siempre cliente.** Un teléfono anota únicamente si está en la lista, y
entra a la lista únicamente canjeando un código de 15 minutos pedido desde el panel.
Equivocarse hacia el otro lado significa darle a un cliente una herramienta que
escribe plata; equivocarse hacia éste sólo significa que el dueño repite el mensaje.

La bifurcación va **antes** del inbox de atención: lo que dicta el dueño no es una
conversación de venta y no tiene por qué aparecer en la bandeja. Y si el bot que anota
falla, el mensaje **sigue al Concierge** en vez de perderse: un cliente sin respuesta
es peor que un dictado que hay que repetir.

### 2. La vinculación se generalizó por canal

`lib/telegram/vinculacion.ts` pasó a `lib/asistente/vinculacion.ts` con el canal como
parte de la llave del código. Telegram quedó como binding fino (sus llamadores no se
tocaron). **Pedir el código de WhatsApp no puede matar el de Telegram**: son dos
pantallas distintas y el dueño podría estar tipeando el otro en ese mismo momento.

### 3. Dominio `agenda` sobre el `Reminder` que ya existe

«Recordame el lunes llamar al ingeniero» escribe en el modelo `Reminder` que el panel
ya muestra, en vez de una tabla «Actividad» paralela que partiría en dos la lista de
pendientes del negocio (lo dictado por voz en un lado, lo cargado a mano en el otro).

Su fecha va **al revés que en plata**: `fechaValida()` rechaza fechas futuras a
propósito —un gasto se anota cuando ya salió la plata— y una cita sin futuro no es una
cita. Reusar aquél habría hecho que «recordame mañana» fallara con «esa fecha es
futura», el peor mensaje de error posible.

Sin fecha **no se asume hoy**: se pregunta. Una cita sin cuándo no sirve para nada.

## Consecuencias

- **Cero variables de entorno nuevas.** Reusa `WHATSAPP_ACCESS_TOKEN` /
  `WHATSAPP_API_TOKEN` (ya configurados por negocio en `TenantWhatsAppConfig`) y
  `GROQ_API_KEY`.
- **Cero migraciones.** Los teléfonos viven en `Settings.featureFlagsJson`, igual que
  los chats de Telegram; la agenda usa una tabla que ya existe.
- Un cambio de validación cambia para los dos canales a la vez: **cambia el canal, no
  la regla**.
- El tope de 12 mensajes/minuto por teléfono es del canal, no del negocio: el free tier
  de Groq son 8.000 tokens **por minuto** y cada mensaje puede gastar una transcripción
  más dos llamadas al modelo.

## Lo que NO se hizo, y por qué

**Fotos de boletas.** Requiere un modelo con visión y **hoy no hay ninguno
disponible**: verificado contra el catálogo real de Groq el 2026-09-05 —14 modelos,
ninguno multimodal—, `xAI` sin créditos y `ANTHROPIC_API_KEY` sin configurar. El bot
contesta explícitamente que todavía no lee boletas y pide que se le dicte, en vez de
ignorar la foto: una boleta enviada y no contestada se lee como «lo anotó».
Para habilitarlo alcanza con configurar `ANTHROPIC_API_KEY` (el provider ya está
escrito en `lib/llm-providers/anthropic.ts`).

**Cubicación por dictado.** Queda pendiente: `forestal.agent` es hoy sólo lectura
(`existencias`, `buscar-guia`, `buscar-troza`, `pendientes`) y necesitaría una acción
de escritura nueva contra `ForestCubicacionesDB`.

## Referencias

- ADR-058 — WhatsApp AI-first (el Concierge de clientes que comparte el número)
- ADR-387 — el asistente que anota operaciones
- ADR-388 — bot de Telegram y audio (el canal que este ADR replica)
- ADR-390 — memoria y contexto del asistente
