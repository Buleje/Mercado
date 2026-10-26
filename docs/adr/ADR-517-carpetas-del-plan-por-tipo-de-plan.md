# ADR-517 — Las carpetas del plan cuentan lo que pide SU tipo de plan

- **Estado:** aceptado (2026-10-26). Sin schema: se alinea al leer, no se escribe nada en la base.
- **Pedido por:** Brandon (26-10): «que un PO pida sus papeles y no los de plantación; los dos números dicen lo mismo».
- **Relacionados:** ADR-467 (plantilla de carpetas del plan: esto enmienda su «lo que falta»), `lib/forestal/loth-plan-papeles.ts` (los papeles por tipo de plan).

## Contexto

En la pestaña «Papeles» de un plan se veían dos cuentas que no se hablaban. Arriba, los papeles que pide la norma según el TIPO de plan (`papelesDePlan`): un PO decía «1 de 4 papeles obligatorios». Abajo, «Carpetas del plan» decía «0 de 5 documentos esperados · 5 faltan».

La causa es que ADR-467 tiene UNA plantilla por negocio, sembrada pensando en una plantación, y contaba como faltante todo campo `archivo`. En un PO, el contrato de concesión no tenía casillero (el archivo quedaba suelto) y el «Título de propiedad», que un PO no pide, contaba como falta.

## Decisión

`ForestPlanDocumentosDB.vista()` pasa las carpetas armadas por `alinearConPapeles()` (`lib/forestal/plan-documentos-por-tipo.ts`, puro), junto con los papeles del plan calculados sobre esas mismas carpetas. Cada casillero recibe una `cuenta`:

| `cuenta` | Qué es | ¿Cuenta en «lo que falta»? |
|---|---|---|
| `obligatorio` | El casillero de un papel `siempre` de este tipo. Toma el estado y la fecha del papel. | Sí |
| `propio` | Lo que agregó el negocio, o lo que es sólo de este plan. | Sí, como siempre |
| `si_aplica` | Un papel `segun_caso`, o un casillero más que representa al mismo papel. | No. Si tiene archivo, igual avisa si vence. |
| `no_aplica` | De la semilla, pero este tipo de plan no lo pide (el título de propiedad en un PO). | No. Si está vacío, se esconde tras «Ver los que no aplican». |

- Si la plantilla no tiene un casillero para un papel que se sube, se arma uno «de la norma» (`norma-<papel>`, `campo.id = ""`). Ese casillero junta los archivos sueltos de su carpeta que llevan la etiqueta `papel:<clave>`. Subir ahí escribe sólo `papel:`, nunca `campo:`.
- La cuenta de las carpetas pasa a ser la de los papeles: «x de y papeles obligatorios», y aparte «· a de b que agregaste» si el negocio sumó casilleros propios.
- Una vista sin `cuenta` es la vieja (por ejemplo, la provisional de un negocio sin sembrar) y se cuenta como antes.

## Alternativas descartadas

- **Una plantilla por tipo de plan en la base.** Pide sembrar y migrar plantillas en todos los negocios, sobre la base compartida que es producción, y rompe las plantillas que cada negocio ya personalizó.
- **Un campo `tipos` en cada casillero.** Pide schema (o JSON en `opciones`) y que cada negocio marque a mano lo que ya dice la norma en `loth-plan-papeles.ts`.
- **Borrar el «Título de propiedad» en los PO.** Es la plantilla del negocio, compartida con sus plantaciones.

## Consecuencias

- Negocios con su plantilla: no cambia nada guardado.
  - Lo de la semilla que el tipo no pide sale «No aplica», sin contar.
  - Lo que el negocio agregó sigue contando.
  - En una plantación aparecen «Mapa» y «Comunidad» si la norma los pide, y el representante pasa a «Si aplica».
- La cuenta depende de `papelesDePlan`: cambiar un papel de la norma cambia las carpetas sin tocarlas.
- El alta de un plan nuevo (todavía sin tipo en el formulario de carpetas) sigue mostrando la plantilla tal cual.
