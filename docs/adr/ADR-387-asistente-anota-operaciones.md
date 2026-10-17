# ADR-387 — El asistente anota operaciones dictadas, y n8n entra por la misma puerta

**Estado:** aceptado · **Fecha:** 2026-09-04 · **Ámbito:** Asistente IA · Mi Plata · Integraciones

## Contexto

Brandon pidió poder decir —escribiendo o hablando— *«anotame compra de
combustible para el camión N12, el petróleo sale 27 y el tanque 25 galones»* y
que eso quede registrado solo, con un aviso de operación registrada, en el
módulo que corresponda.

El asistente ya hacía tool-calling real y tenía la infraestructura de aprobación
humana (ADR-010 / TD-025), pero **una sola acción escribía** (`inventory_ajustar_stock`)
y su propio prompt decía «eso todavía no lo puedo hacer desde acá». Todo lo
demás era lectura.

## Decisión 1 · Un dominio `plata` que escribe, con el contrato de la escritura

Ocho acciones nuevas en `lib/agents/domains/plata.agent.ts`: tres de búsqueda
(máquina, persona, deuda) y cinco que escriben (gasto, ingreso, adelanto, cobro
de fiado, liquidación de adelanto).

Las cinco de escritura respetan el contrato que dejó `ajustar-stock`:

| Paso | Qué garantiza |
|---|---|
| `requiresApproval: true` | El chat pinta [Confirmar]/[Cancelar]. Un monto mal oído no entra a la contabilidad |
| Ensayo (`__validar: true`) | Se valida ANTES de ofrecer la confirmación. Un id inventado da error, no una tarjeta que nadie puede juzgar |
| `resumen` legible | «Gasto de S/ 675.00 · combustible · Camión N12 (placa A4B-892) · 25 × S/ 27.00 = S/ 675.00» |
| Misma DB class que la pantalla | El asiento queda idéntico al que haría una persona a mano |
| Búsqueda previa obligatoria | Sin `maquinaId` real no hay escritura posible |

**Un total derivado se presenta como derivado.** Cuando el dictado trae cantidad
y precio, el total lo calcula el sistema y el resumen muestra la multiplicación
entera. Y si además dictaron el total y no cierra contra `cantidad × precio`, la
operación **se frena**: uno de los dos números está mal y adivinar cuál es
inventar plata. La tolerancia es S/ 0.05 —un céntimo de redondeo al
multiplicar—, no el epsilon del punto flotante.

## Decisión 2 · Cada gasto cae en el libro que le corresponde, y se dice cuál

| Lo que se dicta | Dónde se guarda | Dónde se ve |
|---|---|---|
| «combustible para el camión N12» | `AssetExpense` | Mi Plata › Reportes › Activos |
| «pagué la luz», «flete», «sueldo» | `Expense` | Mi Plata › Gastos |

Son **dos libros distintos y ninguna pantalla los suma** — es exactamente lo que
hacen hoy los formularios de Activos y de Gastos. Escribir en los dos sería
contar la misma plata dos veces. Por eso el resumen de la tarjeta dice en cuál
cae: «lo anoté» sin decir dónde manda a buscarlo al lugar equivocado.

⚠️ **Consecuencia conocida:** el combustible de una máquina no entra al P&L del
negocio. Es el comportamiento actual del módulo de Activos, no algo que este ADR
introduce, pero ahora es más visible porque se puede anotar dictando. Unificar
los dos libros es una decisión contable propia y necesita su propio ADR.

## Decisión 3 · Dos rondas de herramientas, no una

Anotar de una sola frase necesita **buscar** (el camión, la persona, la deuda) y
después **escribir** con el id que devolvió la búsqueda. Con una sola ronda,
«anotame el combustible del camión N12» terminaba en «encontré el camión» y el
usuario tenía que repetir el pedido entero.

La segunda ronda se dispara **sólo** después de una búsqueda que existe para
habilitar una escritura (`TOOLS_QUE_PRECEDEN_ESCRITURA`) y **sólo** si no quedó
ya una confirmación esperando. Fuera de ese caso no se gasta otra llamada.

La búsqueda además **da su veredicto**: cuando hay un ganador claro devuelve
`recomendado` y el mensaje «usá ese id sin preguntar». Que aparezca «Camión N7»
buscando «camión N12» no es una duda — es que comparten la palabra «camión».
Sin eso, el modelo preguntaba cuál de los dos, teniendo la respuesta al lado.

## Decisión 4 · n8n en los dos sentidos, con el token derivado

**Buleje → n8n:** el dueño registra sus flujos en *Asistente IA ›
Automatizaciones* (nombre + para qué sirve + URL del webhook). El asistente los
lista y los dispara desde el chat. Disparar manda datos afuera, así que también
pasa por confirmación. La URL va por `safeFetch` (HMAC + anti-SSRF); un n8n en la
red local sólo se permite fuera de producción y con `N8N_ALLOW_LOCAL=1`.

**n8n → Buleje:** `POST /api/integrations/n8n/anotar` recibe el texto (un audio
de WhatsApp que n8n transcribió, un mensaje de Telegram, un correo), lo
interpreta con las mismas herramientas y devuelve el resumen para que el flujo
lo haga confirmar. Es máquina a máquina: se autentica con
`Authorization: Bearer` + `X-Buleje-Tenant`, no con la cookie de sesión, y por eso
está exento de CSRF (no hay sesión de navegador que un tercero pueda abusar).

**El token no se guarda: se deriva** de `AUTH_SECRET` + tenantId + un número de
versión (`bul_n8n_<v>_<hmac>`). No queda una credencial en texto plano en la
base, y rotarla es subir el número — todo lo emitido antes deja de valer al
instante. La comparación es en tiempo constante.

## Decisión 5 · Se le mandan al modelo sólo las herramientas que la frase menciona

El catálogo completo son 52 herramientas = **7.043 tokens de puro esquema** en
CADA llamada. La cuenta Groq del negocio es free tier: **8.000 tokens por
minuto**. Una sola pregunta consumía el minuto entero y la segunda llamada —la
que anota— moría con 429.

`lib/agents/tool-routing.ts` manda sólo los dominios que la frase nombra, con el
vocabulario como se dice en Pucallpa. Medido: la frase de Brandon pasó de 52
herramientas / 7.043 tokens a **14 / 2.746**, y la operación se anota.

El riesgo es que un dominio deje de activarse **en silencio** — el modelo no dice
«no tengo esa herramienta», dice «no puedo hacer eso». Se acota con: `ui` que
viaja siempre, diccionarios generosos, un núcleo de respaldo para las preguntas
abiertas (en vez del catálogo entero), comparación por palabra completa, y
**15 tests que fijan cada frase real que tiene que funcionar**.

## Consecuencias

- El chat pasa de contestar preguntas a **operar el negocio**, con la
  confirmación como único freno.
- Cualquier canal que llegue a n8n (WhatsApp, Telegram, correo) puede anotar sin
  código nuevo del lado de Buleje.
- Agregar una acción de escritura nueva ahora es: DB class que ya existe →
  ensayo → `requiresApproval` → vocabulario en `tool-routing` → test.
- La confirmación en dos pasos de n8n vive en memoria y **expira a los 10
  minutos** (`lib/agents/pending-approvals`). Un flujo que pregunta por WhatsApp
  entra cómodo; uno que espera una respuesta de mañana tiene que mandar
  `confirmar: true` con su propia confirmación.

## Alternativas descartadas

- **Escribir sin confirmar, con deshacer.** Más rápido de dictar, pero un monto
  mal oído entra a la contabilidad y el «deshacer» depende de que alguien lea el
  aviso. Brandon eligió la tarjeta.
- **Registrar un ingreso suelto como venta.** Una venta lleva productos, stock y
  comprobante: fabricarla desde una frase descuadra el inventario. Un ingreso sin
  máquina va como movimiento de la caja abierta, y si no hay caja abierta se dice.
- **Interpretar el dictado con reglas propias en vez del LLM.** Es lo que hace el
  POS con el catálogo en pantalla, y ahí funciona porque el universo es cerrado.
  Acá el universo son cinco libros distintos con vocabulario libre.

## Referencias

- ADR-010 (router LLM y tiers) · TD-025 (human-in-the-loop)
- ADR-374 (la plantilla de gasto fijo no es un gasto)
- `lib/agents/domains/plata.agent.ts` · `lib/agents/tool-routing.ts` ·
  `lib/n8n/flows.ts` · `lib/plata/anotar.ts`
- `__tests__/agentes-tool-routing.test.ts`
