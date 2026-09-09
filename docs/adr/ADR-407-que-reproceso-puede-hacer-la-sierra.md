# ADR-407 — Qué reproceso puede hacer la sierra

- **Estado:** aceptado
- **Fecha:** 2026-09-09
- **Ámbito:** `lib/forestal/reproceso-reglas.ts`, `lib/forestal/reproceso-sugerido.ts`, `lib/forestal/reparto-revision.ts`, `components/admin/forestal/reparto-reprocesos.tsx`
- **Relacionado:** [ADR-404](./ADR-404-reprocesos-sugeridos.md) (los reprocesos sugeridos), [ADR-316](./316-reproceso-y-saldo-unico-de-corrida.md) (el reproceso real, el que mueve stock)

## Contexto

El sugeridor de reprocesos de la distribución (ADR-404) cruzaba **cualquier** tipo
comercial contra cualquier otro: si sobraba paquetería y faltaba comercial,
ofrecía «reprocesá paquetería en comercial». En el patio eso no existe — la
sierra recorta, no agranda —, y declararlo sería afirmar ante SERFOR una
transformación que la máquina no puede hacer.

Brandon lo dictó el 2026-09-09 sobre la pantalla:

> «de comercial para reprocesar a paquetería, corta, larga angosta se pueda
> poner con la cantidad aumentada pero el volumen menos […] pero de paquetería a
> comercial no se pueda, ni paquetería a corta ni tabla; pero sí paquetería
> larga a paquetería corta eso sí se pueda».

## Decisión

**1. Una matriz única de conversiones posibles**, en `reproceso-reglas.ts`:

| De ↓ · a → | Comercial | Paq. larga | Paq. corta | Tabla | L. angosta | Corta |
|---|---|---|---|---|---|---|
| **Comercial**  | — | ✅ | ✅ | ✖ | ✅ | ✅ |
| **Paq. larga** | ✖ | — | ✅ | ✖ | ✖ | ✖ |
| **Paq. corta** | ✖ | ✖ | — | ✖ | ✖ | ✖ |
| **Tabla**      | ✖ | ✖ | ✖ | — | ✖ | ✖ |
| **L. angosta** | ✖ | ✖ | ✖ | ✖ | — | ✖ |
| **Corta**      | ✖ | ✖ | ✖ | ✖ | ✖ | — |

En una frase: **la comercial es la madera de la que sale todo lo demás** y **la
paquetería sólo se recorta de largo**. Nada vuelve a comercial, a tabla ni a
«Otro» (que además no es un producto del Libro).

Lo que la regla no dice se prohíbe: una sugerencia de más manda madera a la
sierra sin necesidad y ensucia el papel; una de menos sólo no aparece.

**2. Lo que un bloque ampara sin poder darlo deja de ser «reproceso a declarar»
y pasa a ser un respaldo imposible** (`amparosImposibles`). No es lo mismo:

| | Reproceso sin declarar | Respaldo imposible |
|---|---|---|
| Qué pasa | el bloque ampara un tipo que **sí** puede dar | ampara un tipo que **no** puede dar |
| Cómo se arregla | declarando el reproceso en el Libro | corrigiendo el respaldo o el tipo de las piezas |
| En la revisión | `aviso` | `error` |
| En la pantalla | tabla del producto | aviso rojo arriba, con el porqué |

**3. Las opciones se suman cuando entran juntas en la capacidad libre.** El
ejemplo de Brandon —«comercial 2.500 → paquetería larga 1.500 y larga angosta
0.800»— son dos salidas que caben a la vez; decir «elegí una» era falso.
Compiten sólo cuando la suma se pasa de lo libre.

**4. El pie del producto suma el renglón imposible**, o «reproceso + mismo tipo»
no llegaría a lo que el bloque ampara y se leería como el descuadre que ya se
corrigió una vez (`quedaM3 = origenM3 − amparadoM3`).

## Consecuencias

- Una conversión nueva del aserradero se agrega en **una fila** de
  `SALIDAS_DE_REPROCESO`; la pantalla y la revisión la toman solas (la frase de
  ayuda se arma del mapa, no a mano).
- Deja de ser posible sugerir —y por lo tanto declarar desde esta pantalla— una
  transformación que la sierra no hace.
- Los bloques mal tipados dejan de esconderse detrás de una sugerencia
  razonable: aparecen como error antes de firmar el papel.
- Sigue siendo una **sugerencia**: no escribe en el Libro. El reproceso real se
  declara desde Productos disponibles (ADR-316).

## Alternativas descartadas

- **Derivar la regla de las medidas** (permitir sólo lo que quepa dentro de la
  pieza de origen): la comercial de 2×8 no da un 6×6 y sin embargo Brandon la
  quiere como origen de paquetería — el criterio del patio es comercial, no
  geométrico. Una regla derivada habría contradicho al dueño del negocio.
- **Seguir sugiriendo todo y marcar en amarillo lo imposible**: una lista que
  ofrece cosas que no se pueden hacer enseña a ignorar la lista entera (la
  lección de los siete rojos falsos del importador CTP).
- **Permitir comercial → tabla** por ser el reaserrado más clásico: Brandon no
  lo nombró. Queda como pregunta abierta, a una fila de distancia.
