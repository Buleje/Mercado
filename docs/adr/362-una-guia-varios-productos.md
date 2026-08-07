# ADR-362 — Una guía, varios productos: el despacho se registra como el papel

- **Fecha:** 2026-08-07
- **Estado:** aceptado
- **Contexto:** Libro CTP · Despacho · GTF de salida
- **Relacionado:** ADR-135 (atribución I4/I5) · ADR-336 (casilleros de la guía) · ADR-338 (la guía con forma de papel) · ADR-349 (paquetes)

## El problema

Un camión que sale del aserradero lleva **una** Guía de Transporte Forestal con
**varios** productos: cinco paquetes, tres especies, un volumen total. Así lo
pide el formato del LO-CTP del SNIFFS: primero los datos de la guía, después la
«Creación de Lista de Productos».

El alta del libro pedía lo contrario: una línea por vez —un producto, una
cantidad, un número de GTF— y el cuerpo del documento (propietario,
destinatario, transportista, vehículo) se cargaba **después**, desde la ficha del
despacho. Registrar la guía de cinco productos significaba repetir el número
cinco veces y rehacer las partes en cada una, o cargarlas una sola vez y dejar
las otras cuatro líneas sin documento.

## La decisión

El alta de Despacho pasa a tener la forma del formato oficial: **dos pestañas**.

1. **Datos de la Guía de Transporte Forestal** — vigencia y número, la instancia
   que registra (sale de la Ficha, no se tipea), propietario del producto,
   destinatario, transportista con su vehículo, traslado y títulos.
2. **Creación de Lista de Productos** — los renglones que viajan, elegidos del
   stock real («Productos en stock»: plan de manejo, lote, paquete, fecha,
   especie, producto), con su total movilizado y el cuadro resumen por especie.

Al registrar se crea **una línea del libro por producto**, todas con el mismo
cuerpo de guía. El libro no cambia: cada línea sigue teniendo su especie, su
cantidad y su atribución a la corrida de la que salió (I4/I5). Lo que cambia es
que el operador ya no tiene que desarmar el documento a mano.

## Consecuencias

| Decisión | Por qué |
|---|---|
| `POST /ctp` acepta `gtfDatos` | Con el `PATCH gtf_datos` como única vía, una guía de cinco productos eran cinco altas + cinco parches — y el **almacenero**, que puede registrar despachos pero no editar guías, se comía un 403 en el segundo paso. Escribir la guía al crear es parte de registrar la salida; **editar** una guía ya existente sigue siendo del PATCH (admin/owner). |
| Las altas van **en serie**, no en paralelo | Cada alta toma un lock sobre las líneas de producción para validar stock (I3/I5): mandarlas juntas las haría esperar igual, con más chance de pisarse. |
| Si una línea falla, se dice **cuáles entraron** | Las anteriores ya están. Se sacan de la lista las registradas, se nombra la que falló con su motivo y las que faltan quedan para reintentar. Media guía registrada en silencio sería peor que un error. |
| El saldo se chequea **antes** de mandar | Dos paquetes de la misma corrida son dos líneas pero **un solo saldo**: `excesosDeCorrida` lo suma en el cliente para no descubrir el rechazo con la mitad de la guía adentro. |
| La lista sale **sólo del stock** | Cada renglón guarda de qué corrida salió, así que la cadena de custodia nace completa. Se pierde el alta a mano de un producto sin corrida — que era justamente lo que producía despachos «sin origen declarado». |
| «Trozas / productos ingresados» queda **deshabilitado** | El libro despacha producto transformado: el saldo de una troza sin aserrar vive en el patio, no en producción, y `assertStockDisponible` lo rechazaría. Habilitarlo es otra decisión (salida de materia prima), no un botón. |

## Campos nuevos en `gtfDatos`

JSONB validado por Zod, todos con default — lo guardado antes se relee sin
tocar nada: `parte.zona` (casillero del destinatario), `vehiculo.placaRemolque`
(el control compara la placa de la carreta, no la del tracto) y
`vehiculo.tipoTransporte` (público = empresa inscrita en el MTC · privado).

## Verificación

Camino completo del usuario, en el navegador (no un script sobre el parser):
alta → «Producción» → dos productos de dos corridas → registrar. Resultado:
dos líneas (#54 y #55) con `2.4821` y `1.1911 m³`, el mismo `gtfNumber`, la
**cadena de custodia completa** (`atribuido == declarado`) y el cuerpo de la
guía guardado en las dos. Las líneas de prueba quedaron eliminadas (soft).
