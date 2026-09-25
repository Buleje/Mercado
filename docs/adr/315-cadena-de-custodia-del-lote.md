# ADR-315 — La cadena de custodia del lote, de punta a punta

- **Fecha:** 2026-07-30
- **Estado:** aceptado
- **Contexto:** Lotes de producción (ADR-136) · trazabilidad que fiscaliza OSINFOR
- **Relacionado:** ADR-134 (consumos), ADR-135 (despachos), ADR-136 (lotes)

## El problema

Buleje ya tenía las tres piezas de la cadena —`ForestCtpConsumo`,
`ForestProdLoteMiembro`, `ForestCtpDespachoOrigen`— pero ninguna vista las
recorría. `trazabilidadLote()` responde *"¿está completa?"*, que es lo que gatea
el certificado; nadie respondía *"¿cuál es?"*.

Para contestarle a un fiscalizador —*"este lote, ¿de qué árbol salió y a dónde
fue?"*— había que abrir tres pantallas y cruzarlas a mano.

## La decisión

`construirCadenaLote()` (pura) arma tres bandas en el orden en que ocurre:

```
GTF de ingreso  →  corridas del lote  →  despachos
  (consumido)        (producido)          (despachado)
```

más el balance: **consumido → producido → en este lote → despachado → en stock**,
con el rendimiento del lote.

### ⚠️ La atribución hacia adelante es PARCIAL cuando la corrida se comparte

Un lote toma una parte de cada corrida (`miembro.quantity`) y un despacho toma
otra parte de la misma corrida (`origen.quantity`). Son **dos particiones
independientes del mismo producto**:

- Si la corrida entró **entera** al lote, sus despachos son del lote sin ambigüedad.
- Si entró **a medias**, no existe dato que diga qué mitad se despachó.

Eso se marca (`compartida: true`) y se cuenta como hueco, **en vez de repartirlo a
prorrata**. Un número inventado que parece exacto es peor que uno declarado
incompleto — es la misma razón por la que I1–I5 usan `≤` y no `==`.

### Otras decisiones

- **Los huecos van arriba, no al pie.** Si la cadena está incompleta, eso es lo
  primero que hay que ver, no una nota final que nadie lee.
- **Los despachos anulados no cuentan.** Contarlos mostraría el lote como
  despachado cuando la madera sigue en el patio.
- **`enStock` nunca es negativo.** Si lo despachado supera lo que el lote se
  lleva es porque la corrida estaba compartida, y eso ya se reporta como hueco.
- **Sin consumo, `rendimientoPct` es `null`**, no 0 ni infinito.
- Se ignora todo lo que no pertenece a las corridas del lote: un consumo o un
  despacho de otra corrida no ensucia la cadena.

## Consecuencias

- `cadenaDeLote()` convive con `trazabilidadLote()`: son dos preguntas distintas
  y las dos hacen falta. La primera gatea el certificado; la segunda se le muestra
  a un fiscalizador.
- La cadena viaja con el detalle del lote (una lectura más) porque el modal la
  necesita siempre; pedirla aparte duplicaría el round-trip.
- El modal se ensanchó a `min(95vw, 80rem)`: con tres bandas más la tabla de
  corridas, el ancho anterior comprimía todo.

## Lo que NO se hace

- No se reparte a prorrata lo despachado de una corrida compartida.
- No se recalcula ningún volumen: la cadena lee lo que ya está atribuido.
- No bloquea nada. El gate del certificado sigue siendo `trazabilidadLote()`.
