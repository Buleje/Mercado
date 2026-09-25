# ADR-388 — El bot de Telegram y el audio de verdad

**Estado:** aceptado · **Fecha:** 2026-09-04 · **Ámbito:** Asistente IA · Integraciones

## Contexto

ADR-387 dejó al asistente anotando operaciones dictadas, pero con dos límites
que se notan justo donde se usa:

1. **El dictado vive en el navegador.** La Web Speech API se cae en un celular
   viejo, con ruido de motor atrás, y no sirve para un audio que YA existe — el
   que mandó el chofer por WhatsApp.
2. **Hay que estar en el panel.** Brandon pidió explícitamente un bot de
   Telegram que reciba las conversaciones —texto y audio— y las registre en la
   sección que corresponda.

## Decisión 1 · Whisper como transcriptor, en la cuenta que ya existe

`whisper-large-v3-turbo` lo sirve **Groq, gratis, con la misma `GROQ_API_KEY`**
que ya usa el asistente, y lee el `.oga` de Telegram sin convertir nada. No hace
falta proveedor nuevo, credencial nueva ni ffmpeg del lado del servidor.

Verificado con un dictado real en español:

> «Anótame compra de combustible para camión N12, el precio del petróleo sale 27
> y el tanque 25 galones» → transcrito palabra por palabra, «N12» incluido.

Se le pasa un `prompt` con el **vocabulario del negocio** (galones, GTF, troza,
Yape, horómetro, pies tablares). Sin eso, «GTF» sale «ge te efe» y «Yape» sale
«llape» — y una palabra mal transcrita es una operación que no se puede anotar.

El chat del panel suma un clip 📎 al lado del micrófono: sube el audio, lo
transcribe y **lo pone en el campo, no lo manda**. Lo transcrito se lee antes de
anotarlo.

## Decisión 2 · El bot de Telegram, con la confirmación como botón

```
Vos: 🎤 «anotame 25 galones de petróleo para el camión N12 a 27 el galón»
Bot: 🎤 Te entendí: «anotame 25 galones de petróleo…»
Bot: 📝 Gasto de S/ 675.00 · combustible · Camión N12 (placa A4B-892)
     25 × S/ 27.00 = S/ 675.00 · Se anota en Mi Plata › Reportes › Activos
     [ ✅ Confirmar ]  [ ✖ Cancelar ]
Vos: (tocás Confirmar)
Bot: ✅ Anotado: S/ 675.00 de combustible para Camión N12.
```

El teclado inline de Telegram **es** el gate humano: el mismo `pending-approval`
que pinta la tarjeta en el panel, con otra piel. Nada se escribe sin que alguien
toque Confirmar.

Se muestra la transcripción ANTES de interpretarla. Si Whisper oyó «venti siete»
donde había «27», se ve en el chat y no en el asiento.

## Decisión 3 · Tres candados, porque esto escribe plata desde afuera

| Candado | Qué frena |
|---|---|
| `X-Telegram-Bot-Api-Secret-Token`, derivado del token del bot y comparado en tiempo constante | Que alguien que descubra la URL inyecte mensajes |
| El chat tiene que estar **vinculado** a un negocio | Que un desconocido le escriba al bot y anote |
| Ensayo + confirmación (ADR-387) | Que un monto mal oído entre a la contabilidad |

**El código de vinculación es efímero, no derivado.** El token de n8n vive para
siempre porque vive en un servidor; este se tipea en un chat, se ve en la
pantalla del celular y se reenvía sin pensar. Funciona como el código de un
cajero: se pide cuando se va a usar, **dura 15 minutos, se quema al canjearlo**,
y un negocio tiene uno solo vivo a la vez. Sin ceros ni oes, ni unos ni íes: se
copia de una pantalla a otra y se dicta por teléfono.

Además, el webhook contesta **200 a todo**. Telegram reintenta lo que no
responde rápido, y un 500 haría que el mismo audio se procese —y se anote—
cuatro veces. Los errores se loguean y se cuentan por el mensaje del bot, que es
lo que el usuario ve; el código HTTP no lo lee nadie.

## Decisión 4 · Un tope de 12 mensajes por minuto y por chat

Cada mensaje puede disparar una transcripción y dos llamadas al modelo. Sin
freno, un audio reenviado en cadena vacía la cuota del día del negocio. El tope
es por chat y en memoria: no hace falta persistirlo para frenar una avalancha.

## Consecuencias

- El dueño anota desde el celular sin abrir el panel, hablando.
- Cualquier persona del negocio puede tener su chat vinculado — y el dueño ve
  quién lo vinculó, cuándo, y cuándo lo usó por última vez, con un botón para
  cortarlo.
- ⚠️ **Telegram no llega a `localhost`.** En desarrollo hace falta un túnel
  público (ngrok, cloudflared) y registrar el webhook contra esa URL. La
  pantalla lo dice y trae el botón para registrarlo.
- ⚠️ La confirmación pendiente vive en memoria y **expira a los 10 minutos**.
  Por Telegram sobra; el botón vencido lo explica en vez de fallar.
- Cualquier canal nuevo (WhatsApp Business, correo) ya sólo tiene que llamar a
  `anotarOperacion` y mostrar el resumen: el resto está.

## Alternativas descartadas

- **Un solo bot por negocio (token por tenant).** Multiplica la configuración y
  obliga a cada dueño a pasar por @BotFather. Con un bot y vínculos por chat, el
  dueño toca un botón y tipea seis caracteres. El día que haga falta aislar, el
  webhook ya resuelve el tenant por chat.
- **Un código de vinculación permanente derivado de `AUTH_SECRET`.** Es lo que
  hace n8n, pero ahí el secreto vive en un servidor. Un código que se ve en un
  celular tiene que vencer.
- **Transcribir en el navegador y mandar el texto.** Deja afuera el caso que
  más importa: el audio que ya existe y llegó por WhatsApp.

## Referencias

- ADR-387 (el asistente anota operaciones dictadas) · ADR-010 (router LLM)
- `lib/ai/transcribir.ts` · `lib/telegram/bot.ts` · `lib/telegram/vinculacion.ts`
- `lib/db/telegram.db.ts` · `app/api/integrations/telegram/webhook/route.ts`
- `__tests__/telegram-vinculacion.test.ts`
