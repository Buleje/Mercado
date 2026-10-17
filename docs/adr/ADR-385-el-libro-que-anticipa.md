# ADR-385 — El libro que anticipa: «se viene» junto a «ahora»

**Estado:** aceptado · **Fecha:** 2026-09-04 · **Ámbito:** Libro de Operaciones CTP

## Contexto

`ctp-pendientes.ts` contesta bien una pregunta: **«¿qué tengo que hacer hoy?»**.
La campana del Libro lista lo que falta, ordenado por lo que traba el cierre.

Pero mirando la lista real de un tenant se ve el problema:

| Aviso de hoy | Cuándo se podía evitar |
|---|---|
| 3 ingresos registrados **fuera de plazo** | hace 3 días |
| 7 trozas **paradas hace 60 días o más** | hace una semana |
| un título habilitante **vencido** | hace un mes |

Los tres llegan **después**. «Fuera de plazo» es una infracción consumada: el
pasado no se corrige, sólo se espera a que salga del período. «Trozas varadas»
es plata ya perdida — la madera tropical ya se manchó. Un score que sólo sabe
contar lo irreversible informa, pero no sirve para actuar.

## Decisión

Un segundo módulo puro, `ctp-anticipa.ts`, que contesta la otra mitad: **«¿qué
se me viene?»**. Vive en la MISMA campana, en una sección «Se viene» arriba de
«Ahora», porque lo de arriba tiene fecha de vencimiento y lo de abajo no.

Cuatro cosas se pueden ver venir con lo que el libro ya guarda:

1. **Guías del monte a punto de vencer el plazo SERFOR.** Se cuentan días
   hábiles con `diasHabilesDeRegistro` — la MISMA función que decide
   `estaFueraDePlazo` (ADR-137). Contar corridos haría llegar el aviso el día
   equivocado justo los fines de semana, que es cuando más se acumula.
2. **Trozas que cruzan el umbral de varada esta semana.** El pendiente cuenta
   las que ya lo cruzaron; esto, las que todavía se salvan aserrándolas.
3. **Documentos de la Ficha que vencen con el patio cargado.**
4. **Cuántos días le queda materia prima al patio**, al ritmo REAL de consumo.

## Lo que se decidió NO inventar

**Los días exactos de la troza.** `contarTrozasVaradas` agrega en SQL para no
traerse cinco mil piezas por un aviso; la banda se arma restando dos conteos
(«≥53 días» menos «≥60»). Con eso se sabe *cuántas* cruzan el umbral en la
ventana, no *cuál día* cada una. El aviso dice «esta semana». Decir «cruzan el
jueves» sería inventarle precisión al dato que hay.

**El saldo por título habilitante.** El libro no lo guarda. El aviso muestra el
m³ del **patio entero** y lo dice con esas palabras («quedan X m³ de materia
prima en el patio»), en vez de repartirlo a ojo entre los títulos: un derivado
con cara de dato oficial es exactamente lo que no puede tener un libro que se
presenta ante una autoridad. Con el patio en cero no hay aviso — que es la
decisión que el número tenía que informar.

**El ritmo de consumo teórico.** Sale de lo realmente consumido en el período,
no de una capacidad declarada: la sierra que dice cortar 20 m³/día pero corta 11
haría que la proyección mienta a favor. Sin período acotado (todo el histórico)
no hay ritmo diario honesto y la proyección se calla sola.

## Consecuencias

- Sin migración y **sin fetches nuevos de fondo**: reusa los cinco pedidos que
  la campana ya hacía, más dos agregados baratos (el borde inferior de la banda
  de trozas y la Ficha).
- Lo YA vencido no se repite en «Se viene»: convertiría la lista de lo que va a
  pasar en otra lista de lo que ya pasó, y enseñaría a ignorarla.
- Una lista vacía es información («no se viene nada»), no una sección rota.
- `documentosDeFicha()` nace como single source de cómo se nombra un documento,
  compartida con `documentosVencimientoDeFicha()`: la campana y el panel de
  Cumplimiento no pueden llamarlo distinto.
