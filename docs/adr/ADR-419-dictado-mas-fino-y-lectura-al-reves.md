# ADR-419 — Dictado más fino y leer la tabla al revés

- **Fecha:** 2026-09-15
- **Estado:** aceptado
- **Pedido por:** Brandon — «*quiero implementar en modal de producir sin lote función de dictado donde presionará un
  botón y me dictará de la última troza para atrás, es igual como el de dictado de cubicación pero este comienza de
  la última pieza y dictar para atrás. Este también tendrá el menú de dictado directo. También quiero que sigas
  mejorando el dictado por voz para que mejore el reconocimiento, se pueda dictar mejor y más rápido, y procesar esos
  datos y guardarse en la tabla*».
- **Depende de:** ADR-408 (producir sin lote), el cubicador de madera y su parser (`lib/forestal/cubicacion.ts`).

## Qué pedía realmente cada parte

| Lo pedido | Lo que resultó ser (medido en el código) |
|---|---|
| «me dictará de la última troza para atrás» | **Leer en voz alta** hacia atrás, no dictar. El botón «Leer la tabla en voz alta» ya existía; faltaba el sentido inverso |
| «el menú de dictado directo» | **Ya existía** dentro del modal: el botón «Cómo se dicta: comandos por voz y atajos» (`cubicador-entrada-voz.tsx:229`). Verificado en el navegador; no se construyó nada |
| «mejorar el reconocimiento» | Tres huecos concretos del parser, abajo |
| «procesar esos datos y guardarse en la tabla» | Ya ocurre: el dictado hace auto-add sobre la tabla del cubicador |

## Decisión

### 1. Leer al revés (`hooks/use-lectura-en-voz.ts`)
`leer(...)` y `leerDesde(...)` aceptan `{ haciaAtras: true }`, y el estado expone `haciaAtras` para que el panel
flotante lo diga: sin decirlo, «fila 12 de 15» bajando parece que la lectura se cuelga.

Se coteja contra la pila destapándola **desde arriba**, y arriba está lo último que se cargó: leer desde la primera
obliga a contar al revés en la cabeza.

- **El índice sigue siendo la posición real en la lista**, también hacia atrás (arranca en `length − 1` y resta).
  Invertir la lista sería una línea menos y una mentira en toda la pantalla: «fila 12 de 15» nombraría la cuarta
  contando por abajo, `irAFila(12)` saltaría a otra y el `<tr>` resaltado no sería el que suena.
- Hacia atrás el índice **se acota a la lista de cada paso**: si borran la última mientras suena, seguir por la que
  ahora es la última en vez de reventar con un `undefined`.
- «De nuevo» hacia atrás vuelve a **la última**, no a la primera: repetir es repetir lo que acabas de escuchar.

**Bug que sólo apareció en el navegador:** pedir el otro sentido sin cortar mataba la tanda nueva —leía una pieza y
se apagaba—. Chrome dispara un `onend` tardío por el `cancel()`, y la bandera «activa» no lo distingue de un final
legítimo. Se resolvió numerando las tandas; quitando esa guarda, el test se pone en rojo.

### 2. El parser entiende más (`lib/forestal/cubicacion.ts`)

| Hueco | Antes | Ahora |
|---|---|---|
| **Fracciones** | «tres cuartos por seis por ocho» → `3, 6, 8` | → `0.75, 6, 8`. **Perder media pulgada de espesor es perder ~6 % del volumen declarado** |
| **Centenas** | «ciento veinte piezas» → cantidad **20** | → **120** |
| **Separador explícito** | `por` / `x` / `×` se descartaban | Delimitan: lo que vino separado ya no se parte, y una lectura con los separadores en su lugar gana al desempatar |
| **Homófonos es-PE** | «sais por hocho por dies» → nada | → `6, 8, 10` |
| **Desempate** | Empate entre hipótesis → gana la del motor | Gana la que reproduce una escuadría que **este lote ya viene cortando** |

`RANGOS_MEDIDA.espesor.min` bajó de 1″ a 0,5″: con el mínimo en 1, **toda tabla fraccionada salía marcada como
rara**, y una lista de rojos falsos enseña a ignorar la lista entera. El rango sólo alimenta el aviso y el separador
de dígitos pegados (de ahí nunca sale un valor entre 0,5 y 1); no toca ningún volumen declarado.

### 3. El desempate usa el propio libro
`escuadriasFrecuentes(piezas)` saca las escuadrías más repetidas del lote en curso y `CubicadorMadera` se las pasa al
parser en los tres puntos donde lee (dictado, modo edición y el caption en vivo — si el caption usara otro criterio,
el operario vería una medida y entraría otra). Un aserradero corta las mismas cuatro o cinco escuadrías todo el día.

**Sólo desempata**: nunca le gana a una lectura con más números en rango y nunca reemplaza un número por otro.

## Lo que NO se hizo, y por qué

- **«siento» → ciento**: es el verbo sentir. **«dias» → diez**: son fechas. **«para» → por** suelto: es el gatillo de
  *pausar* (sólo se convierte entre dos números). Tres normalizaciones que parecían obvias y habrían roto otra cosa.
- **«mil»**: la cantidad se topea en 999.
- Fracción suelta sin numerador, sólo «medio/media»: un «cuarto» solo es más seguido un ambiente que una medida.
- El **audio real** no se pudo encadenar en el Chrome de Playwright (`getVoices()` devuelve 0). El orden inverso se
  verificó interceptando `speechSynthesis.speak`, y la secuencia capturada fue `["4, 11, 12", "3, 7, 9", "2, 6, 8"]`
  sobre tres piezas cargadas 1ª→3ª. El timbre y la velocidad reales quedan sin probar.

## Consecuencias
- El dictado entiende cómo se habla de verdad en el aserradero (fracciones y «por»), que era la causa de los
  reintentos.
- Ninguno de los 749 tests que tocan cubicación cambió de comportamiento: lo nuevo es aditivo y opcional.
- Una regresión propia encontrada y corregida antes de reportar: «no partir lo delimitado» rompía `"2 por 810"`
  cuando el motor se come un «por» al pegar dígitos; la regla quedó acotada a tokens de ≤ 2 cifras.
