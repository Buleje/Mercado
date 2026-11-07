# ADR-455 — Una plantación no reserva semilleros · unir plan y permiso desde Extracción

- **Estado:** aceptado (2026-09-29). Sin schema, sin migración.
- **Relacionados:** ADR-454 (Extracción del Libro TH, riesgo 1), ADR-426 (plan ↔ permiso sin FK), ADR-421 (el permiso como eje), commit 80a3bf25f («Unirlos» en Plan de Manejo).
- **Pedido (Brandon, 29-09):** que el POA no le quite semilleros a la plantación si la norma no los pide, y un botón en Extracción para unir cada plan con su permiso.

## Contexto (medido, sólo lectura)

| Qué | Cifra |
|---|---|
| Plan de Blas `19-SEC/REG-PLT-2025-096` | `planType = PLANTACION`, POA **sin** config guardada → regía el 10 % de fábrica |
| Lo que ese 10 % le quitaba | 11 árboles, **162,882 m³** (29 % del censo); el regente declaró 0 semilleros |
| KV `loth-poa:<Blas>` | sólo `cmrtxh5bp…` (PO-2026-001) con 10 % guardado |
| Planes vivos unidos a su permiso | **0 de 3** (Blas 2, main 1); Blas 096 tiene un permiso con el mismo código |

**Norma (texto de los decretos, descargado el 29-09):**

| Fuente | Dice |
|---|---|
| D.S. 018-2015-MINAGRI, art. 38.4 | Los semilleros son parte del **censo comercial en áreas de títulos habilitantes**, «con la finalidad de formular los planes operativos»: bosque natural. |
| D.S. 020-2015-MINAGRI, art. 16 | Plantación en tierra privada: «no requieren autorización de la autoridad forestal […] ni la presentación de plan de manejo»; sólo el Registro Nacional de Plantaciones y su actualización antes de la cosecha. |
| D.S. 021-2015-MINAGRI, art. 88 | Plantación en tierra de comunidades (Blas: CCNN San Luis de Chinchiguani): «no son parte del Patrimonio; por lo tanto, no requieren autorización de la ARFFS para su aprovechamiento, ni la presentación del plan de manejo». |
| D.S. 020-2015, art. 54 | Sólo la **concesión** para plantaciones en tierra del Estado lleva plan de manejo, con lineamientos de SERFOR (no leídos; no hablan de semilleros en el reglamento). |

Ningún artículo de los tres reglamentos pide reservar árboles semilleros en una plantación. El «10 %» de bosque natural es el criterio usado en los planes de manejo (no se volvió a verificar acá).

## Decisión

1. **Una regla, un lugar.** `defaultPoaConfig(plan)` (`lib/forestal/loth-poa.ts`): plantación → **0 %**; bosque o plan desconocido → 10 %. Plantación = `planType = PLANTACION` **o** el N° del plan/título con `REG-PLT` (`tipoDesdeCodigo`: el N° del Registro de Plantaciones, aunque el tipo quedara en «PO»).
2. **Lo guardado manda.** `ForestLothPoaDB.leer(tenantId, planId, plan?)` devuelve `{ config, origen: guardado | plantacion | defecto }`; `get` delega. Es la única lectura: vista POA, censo de tala, mapa (vía `GET /loth/poa`, que ahora trae `origen`), planificador (`loth-geografia-servidor`) y Extracción. Un `PUT` sin `semillerosPct` guarda el defecto del plan (antes, un 10 fijo del Zod).
3. **Avisos.** POA de una plantación en 0 %: «Plantación: sin semilleros» (info, con la norma) en vez de «Sin semilleros reservados» (warning). Extracción: `semilleros_sistema_vs_regente` desaparece con el 0 %; si alguien guarda un % a mano en una plantación, sigue y dice «la norma no los pide». `PermisoExtraccion.poa.plantacion`.
4. **Unir desde Extracción.** El aviso `plan_sin_permiso` trae `permisoSugerido` (el gemelo de `permisoGemeloDelPlan`, o `null`). En pantalla: «Unir» (gemelo) o «Elegir su permiso» (lista de permisos libres o ya de este plan). Las dos escrituras son las de «Unirlos» (`PATCH /plan` `contratoId` + `PATCH /contratos/[id]` `planId`), ahora en un solo módulo (`loth-plan-unir.ts`) que usan las dos pantallas; al terminar, evento de ventana → la Extracción vuelve a leer. Botón sólo para admin/dueño/encargado (los roles de esas rutas). Dentro de su color, el aviso con botón va primero.

## Cifras de Blas, antes → después (plan 096, `hasta` 28-09)

| | Antes (10 %) | Después (0 %) |
|---|---|---|
| Semilleros del POA | 11 · 162,882 m³ | 0 |
| Aprobado según censo | 400,519 m³ · 54 árboles | **563,401 m³ · 65 árboles** |
| Saldo de tala / trozado / despacho | 367,5844 / 393,9088 / 400,519 | **530,4664 / 556,7908 / 563,401** |
| Extraído del censo | 8,22 % | **5,85 %** |
| «Todos» (con PO-2026-001, que aporta 0) | 400,519 · 8,22 % | 563,401 · 5,85 % |

## Alternativas descartadas

- **Poner 0 % en Parámetros de Blas a mano:** arregla un plan, no la regla; la próxima plantación vuelve a nacer con 10 %.
- **Tope fijo sin configurar:** si el registro de una plantación compromete semilleros, el negocio tiene que poder decirlo.
- **Endpoint nuevo «unir» atómico:** el existente (dos PATCH) ya verifica el tenant de los dos lados y se probó en Plan de Manejo; si el segundo falla, el plan queda unido y se dice.

## Consecuencias

- La base de Blas sube 162,882 m³ (el aviso rojo/ámbar de 80/100 % tarda más en encenderse). El formulario de tala (`restanteDeEspecie`, censo entero) y la Extracción ahora coinciden en la plantación (ADR-454 riesgo 2).
- Un plan cargado como «PO» con un N° `REG-PLT` pasa a 0 %. Si fuera un error de código, se ve en Parámetros del POA y se corrige guardando el %.
