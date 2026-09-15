# ADR-390 — El asistente deja de ser un anotador y pasa a conversar

**Estado:** aceptado · **Fecha:** 2026-09-04 · **Ámbito:** Asistente IA · Telegram · n8n

## Contexto

Brandon probó el bot y dijo: *«funciona pero está muy básico, no entiende
mucho»*. Tenía razón, y la causa no era el modelo. Cuatro cosas medidas sobre el
código de ADR-388:

| Hueco | Consecuencia |
|---|---|
| **Sin memoria** — cada mensaje arrancaba de cero | El bot preguntaba «¿qué camión?», el dueño contestaba «el N7», y del otro lado llegaba una frase suelta sin sentido |
| **Sólo 14 herramientas de escritura** de 59 | No podía contestar NADA: ni «¿cuánto gasté?» ni «¿quién me debe?» |
| **Sin contexto del negocio** | No sabía qué máquinas o personas existen; buscaba a ciegas o preguntaba de más |
| **Cortaba en la primera escritura** | Un audio que dictaba tres cosas anotaba una |

## Decisión 1 · Memoria de conversación, en memoria y por 30 minutos

`lib/asistente/memoria.ts` guarda el ida y vuelta por sesión (`telegram:<chatId>`).
Era el 90 % del «no entiende».

**No va a la base** porque es una conversación, no un registro: dura minutos, y
lo que importa de verdad ya quedó escrito en los libros. Persistirlo sería
guardar el andamio después de construir la pared.

**Media hora de vida.** Retomar un hilo de la mañana a la tarde con «sí, ese» es
más peligroso que empezar de nuevo: el «ese» apuntaría a algo que el dueño ya no
tiene en la cabeza, y del otro lado hay una escritura.

🚨 **El recorte nunca puede empezar con un `tool`.** Un resultado de herramienta
sin la llamada que lo pidió deja al proveedor con un mensaje huérfano y rechaza
la conversación entera con HTTP 400 — o sea, el bot deja de contestar del todo.
Está en los tests.

## Decisión 2 · El contexto lleva los ids, no sólo los nombres

`lib/asistente/contexto.ts` arma el «quién es quién»: máquinas con placa,
personas del padrón, cuentas de tesorería — **cada una con su id**.

Con sólo nombres, «anotame el combustible del N12» obligaba a una vuelta de
búsqueda antes de escribir: otra llamada al modelo, otros ~2.400 tokens de
esquema, la mitad del minuto de cuota para averiguar algo que ya sabíamos.

**Con el id a la vista, la operación se anota en UNA vuelta.** Y es más seguro,
no menos: copiar un id que está en el mensaje es lo contrario de inventarlo, y
el ensayo lo valida igual antes de mostrar la tarjeta.

Cuando son más de 12 no se listan: se dice cuántos hay y que se busquen. El
costo se iría de las manos y ahí la búsqueda sí paga.

## Decisión 3 · Las mismas herramientas que el panel, elegidas igual

El bot usa `lib/agents/tool-routing` — el mismo ruteo por intención del chat del
panel. Deja de ser un anotador ciego: contesta «¿quién me debe?» (verificado:
*«Cliente 4455 debe S/ 150.00 (vencido)»*), «¿cómo viene la caja?», «¿qué hay de
nuevo?».

El ruteo mira **el mensaje nuevo junto al anterior del usuario**: si el bot
preguntó «¿cuál camión?» y la respuesta es «el N7», esa frase sola no menciona
ningún dominio y se quedaría sin las herramientas de plata justo cuando hacen
falta.

## Decisión 4 · Varias operaciones, varias tarjetas

Un audio que dicta dos cosas deja dos confirmaciones. Aprobarlas juntas
obligaría a aceptar o rechazar el paquete entero cuando una sola está mal.

El corte del bucle mira si el mensaje **enumera** («y también», «además»,
«aparte»): ahí vale otra vuelta. Si no, con una propuesta alcanza — seguir
siempre sería pagar una llamada de más en el caso normal, que es una operación
sola.

## Decisión 5 · Las descripciones de las herramientas se acortan a la mitad

Medido: **1.261 tokens eran sólo texto de descripción**, repitiendo quince veces
reglas que el system prompt dice una (*«no multipliques vos»*, *«no inventes
ids»*, *«el usuario confirma»*).

Comprimidas: **3.481 → 2.416 tokens por turno (−31 %)**. Con eso **entran dos
turnos en el mismo minuto**, que es lo que hace posible una conversación. Antes,
literalmente, el segundo mensaje chocaba contra el límite.

En las descripciones queda sólo lo propio de cada herramienta; lo genérico vive
en el prompt, en una sola copia.

## Consecuencias

- El bot y el panel comparten cerebro (`lib/asistente/conversar.ts`). Un canal
  nuevo sólo tiene que llamar a `conversar()` y mostrar `texto` + `pendientes`.
- `lib/plata/anotar.ts` queda borrado: era el anotador de una sola frase.
  `/api/integrations/n8n/anotar` **mantiene su contrato** (`estado`,
  `aprobacionId`, `resumen`) porque hay flujos armados contra él; lo nuevo se
  expone en `pendientes`, que los flujos viejos ignoran.
- Comandos nuevos en el bot: `/hoy` (los avisos de ADR-389) y `/olvidar`.
- Al confirmar una tarjeta, la conversación se entera (`anotarHecho`): un
  «anotalo» dos minutos después ya no propone lo mismo de nuevo.

## Verificado punta a punta

| Caso | Resultado |
|---|---|
| «anotame 20 galones para el N12 a 27» | Una vuelta, sin buscar, sin preguntar |
| «cargué petróleo en el camión» → «el N7, 15 galones a 26» | Pregunta bien, y el segundo turno lo entiende **en el mismo minuto** |
| «cargué 10 gal en el N12 a 27 **y también** pagué 150 de luz por yape» | Dos tarjetas: una al libro de la máquina, otra a Gastos |
| «¿quién me debe plata?» | «Cliente 4455 debe S/ 150.00 (vencido)» |

## Lo que sigue doliendo

La cuenta Groq es free tier: **8.000 tokens por minuto**. Con la compresión
entran dos turnos, pero una conversación de cuatro sigue chocando. No hay
solución de código que lo arregle del todo — es el plan.

## Referencias

- ADR-387 (anotar dictado) · ADR-388 (bot y audio) · ADR-389 (más operaciones y avisos)
- `lib/asistente/{conversar,memoria,contexto}.ts`
- `__tests__/asistente-memoria.test.ts`
