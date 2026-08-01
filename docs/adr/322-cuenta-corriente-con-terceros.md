# ADR-322 — La cuenta corriente con los terceros

- **Fecha:** 2026-07-31
- **Estado:** aceptado
- **Contexto:** directorio (ADR-317) · fletes (ADR-318) · port de `~/proyectos/appforestal` (`ingresos-camiones`, parte 2)

## El problema

El aserradero no cierra cada trato al contado: le adelanta plata a un titular
contra la madera que va a traer, le presta aserrío a otro, le descuenta el flete
que pagó por él. Eso vivía en un cuaderno —en AppForestal, en `localStorage`— y
al liquidar nadie coincidía en el número.

## La decisión

### 1. Se guardan MOVIMIENTOS, nunca un saldo

`saldo = Σ cargos − Σ abonos`, derivado al leer. Un `saldo` almacenado se
desincroniza con la primera corrección y deja dos verdades sobre la misma plata
— la misma razón por la que las existencias del libro salen de ingresos y
consumos en vez de un contador propio.

### 2. El signo se dice con palabras

Positivo = la parte le debe al CTP. Pero la UI muestra *"Comunidad X le debe
S/ 700"* y no *"saldo 700"*: el dueño y el contador no leen igual un número con
signo, y esta pantalla se usa discutiendo frente a la otra persona.

### 3. Un flete no se cobra dos veces

`@@unique([tenantId, fleteId])`. El botón "cargar fletes a cuenta" trae los que
van **a cargo del proveedor** —los que paga el CTP son su costo, no deuda de un
tercero— y sólo los que **tienen monto**: cargar un flete sin precio metería un
cero en una cuenta corriente, que es peor que no cargarlo.

### 4. El concepto sugiere el tipo, no lo impone

`adelanto → cargo`, `pago → abono`, `madera → abono`… pero se puede cambiar: hay
devoluciones y ajustes que van al revés, y forzarlo obligaría a inventar un
concepto falso para registrar lo que de verdad pasó.

### 5. Corrida de saldos, no sólo el total

Los movimientos del más viejo al más nuevo con el acumulado en cada paso. Un
total sin el camino no convence a nadie que venga a discutir su cuenta.

## Consecuencias

- Pestaña **Fletes → Cuenta corriente**. Baja lógica: un movimiento de plata
  borrado sin rastro deja un saldo que nadie puede explicar.
- Verificado contra la API real: adelanto 1000 + flete 800 − madera 300 = **1500**,
  y el segundo intento de cargar el mismo flete responde **409**.

## Lo que NO cierra todavía

La liquidación completa (valor de la madera recibida contra la cuenta) necesita
que el ingreso apunte al proveedor por id — hoy `providerName` es texto (ADR-134).
Lo que sí queda es el lado de los cargos y los pagos.

## Referencias

- `lib/forestal/cuenta-corriente.ts` (puro) · `lib/db/forest-cuenta.db.ts` · `__tests__/forestal-cuenta-corriente.test.ts` (14 casos).
