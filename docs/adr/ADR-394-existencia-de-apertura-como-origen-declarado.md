# ADR-394 — La existencia de apertura es un origen DECLARADO, no un hueco

- **Fecha:** 2026-09-06
- **Estado:** aceptado
- **Pedido por:** Brandon — «existencia de apertura como origen declarado» (ronda de alto nivel
  del Libro CTP, tras la Mesa «Origen incompleto»).

## Contexto

La Mesa «Origen incompleto» de Saldos lista las corridas con saldo que no pueden
certificarse. Medido en una planta real: **17.75 de 20.30 m³ (87 %)**, cinco corridas.
Las cinco tienen la misma historia: entraron por el importador del libro SNIFFS como
**inventario previo al sistema** (`observations` empieza con «Inventario de apertura ·
Lote X · Paquete Y», la marca que escribe `ctp-serfor-a-libro.ts`). No tienen guía ni
piezas que atar porque la madera se recibió y aserró **antes** de que existiera el libro
electrónico: no hay nada en el sistema de lo que hayan salido.

Hoy esas corridas se ven igual que una corrida de la semana pasada a la que alguien
olvidó atarle la guía. Son dos cosas distintas:

| | Hueco corregible | Existencia de apertura |
|---|---|---|
| Qué pasó | Se produjo y no se dijo de qué madera | La madera es anterior al libro |
| Remedio | Atar ingresos o piezas (I1/I2 lo validan) | No hay qué atar |
| Certificable | Sí, al atar | No, nunca desde este libro |
| Cómo se lee en rojo | Correcto: hay que actuar | Incorrecto: enseña a ignorar el rojo |

Y la marca actual vive en texto libre editable —la misma fragilidad que la auditoría
2026-09-05 (#12) encontró en la marca «Inventario» de los lotes.

## Decisión

### 1. Tres columnas explícitas, como `usado*`

`ForestCtpEntry.aperturaDeclaradaAt DateTime?` · `aperturaDeclaradaPor String?` ·
`aperturaDeclaradaMotivo String?`. Nullable, sin backfill: a lo importado no se le
inventa una declaración que nadie hizo — se sigue reconociendo por su marca de
importación (ver §2), que es un hecho del origen del dato.

### 2. Una sola función decide qué es apertura

`esExistenciaDeApertura(corrida)` = `aperturaDeclaradaAt != null` **o**
`observations` empieza con `ORIGEN_INVENTARIO_APERTURA` (la marca del importador).
Vive en `lib/forestal/origen-incompleto.ts`; la leen la Mesa, el CSV y el PDF. Nadie
más vuelve a mirar el texto.

### 3. Declararla es una acción con motivo, reversible

`ForestCtpDB.declararApertura(tenantId, id, { apertura, motivo, user })` — calco de
`marcarUsado`: exige motivo al declarar, no al deshacer; audita `ctp_apertura_declarar`;
**no toca ningún número** (saldo, libro, cierre, export SERFOR no la leen). Endpoint:
`PATCH /api/admin/forestal/ctp` con `action: "declarar_apertura"`.

### 4. Lo que NO cambia

- **El certificado sigue bloqueado.** `trazabilidadCompleta()` no mira esta marca: una
  existencia de apertura no tiene cadena de custodia hacia atrás, y decir lo contrario
  sería fabricar origen. La declaración cambia cómo se LEE el hueco, no si existe.
- La Mesa la muestra **aparte y sin rojo**: «N m³ declarados como existencia de
  apertura — no certificables desde este libro». El porcentaje rojo (lo corregible) se
  calcula sin ellas.
- Una corrida con consumos atados no puede declararse apertura (tiene origen).

## Consecuencias

- Migración aditiva (`prisma/migrations/adr-394-apertura-declarada.sql`), idempotente,
  aplicada por el pooler como las anteriores.
- Un fiscalizador que pregunta «¿y estos 17 m³?» recibe una respuesta con nombre, quién
  la declaró y cuándo — no un «sin origen» que parece descuido.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Sólo la marca en `observations` | Texto libre editable: se pierde al corregir la nota (auditoría #12) |
| Atarles un ingreso ficticio «apertura» | Fabrica una GTF que no existe: I2 y el certificado dejarían de significar algo |
| Excluirlas del depósito | Están en la pila y se venden; esconderlas rompe la capacidad |

## Referencias

ADR-316 (saldo único por corrida) · ADR-349 (productos disponibles) · marca `usado*`
(2026-09-01) · `ctp-serfor-a-libro.ts` (`ORIGEN_INVENTARIO_APERTURA`).
