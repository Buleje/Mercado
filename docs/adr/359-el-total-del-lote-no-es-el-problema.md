# ADR-359 — «El total del lote no es el problema, es esa guía»

- **Fecha:** 2026-08-06
- **Estado:** aceptado
- **Contexto:** Libro CTP · Producción · invariante I2
- **Relacionado:** ADR-353 (cuadrar la guía) · ADR-356 (consumo parcial) · ADR-134 (I1/I2)

## El reporte

> *«¿Por qué dice "la guía 019-0000016 solo tiene 4.161 m³ sin consumir; estás
> pidiendo 8.247"? Si estoy en un lote cuyo volumen conjunto da 12.928 y estoy
> produciendo 7.105 m³, lo cual está bien.»*

Los dos tiene razón, y por eso el mensaje era malo.

**El rendimiento está bien** (7.105 de 12.928 = 55 %, dentro del tope). **El
bloqueo no es por rendimiento**: I2 se aplica **por guía**, no sobre el total del
lote. Un lote puede rendir perfecto y aun así una de sus guías estar mal
declarada — y no se compensa entre guías, porque consumir de una GTF más de lo
que ampara es el patrón de blanqueo que fiscaliza SERFOR.

El mensaje mandaba a buscar **un cupo que no existe**. Lo que pasa es otra cosa:
la guía `019-0000016` declara 4.161 m³ y sus propias piezas miden 8.247
(verificado contra SERFOR en ADR-353 — el papel se contradice a sí mismo).

## Las dos correcciones

### 1. El guard dice cuál de las dos cosas pasó

`ForestCtpConsumoDB.setConsumos` distinguía una sola causa. Ahora son dos:

| Situación | Mensaje |
|---|---|
| Ya se consumió parte de esa guía | «De la guía X quedan N m³ sin consumir (declara D y ya se consumieron C), y estás pidiendo P» |
| **Nada consumido y aun así se pasa** | «La guía X declara D m³ **en su cabecera**, pero las piezas que estás llevando a la sierra suman P. La guía no cuadra consigo misma — **el total del lote no es el problema, es esa guía**. Cuadrala en Ingresos: tocá el aviso naranja de su fila.» |

Es la misma distinción que el acta de consumo hace desde ADR-353; le faltaba al
servidor, que es de donde salía el mensaje que vio Brandon.

### 2. Producción avisa ANTES, como el acta

El acta de Consumos pre-chequea el cupo y frena antes de firmar. El modal de
**Producción** iba directo al servidor: el operador recibía el error crudo del
guard y **desde esa pantalla no podía hacer nada**.

Ahora `CtpProduccionDeLote` corre el **mismo** `cuposDeGuia` —no uno propio, o
las dos pantallas dirían cosas distintas de la misma madera—, bloquea «Registrar
producción» y muestra el aviso con su botón **«Cuadrar la guía»**, que abre el
cuadre sin salir de Producción.

## Verificación

Tenant real, lote `LA-2026-003`:

- Aviso: «La guía 019-0000016 declara 4.1610 m³ de Mashonaste en su cabecera,
  pero su lista de trozas suma 8.2470 m³. La guía no cuadra consigo misma: hay
  que cuadrarla antes de llevar estas piezas a la sierra.»
- **«Registrar producción» deshabilitado** y **1 botón «Cuadrar la guía»**.
- 0 errores de consola · 49 tests verdes.

Queda dicho: el bloqueo **es correcto y no se levanta**. Lo que cambió es que
ahora se entiende y se puede resolver desde donde aparece. El dato de fondo sigue
necesitando la decisión de Brandon con el papel a la vista: si `20/A` son tres
trozas o una.
