---
name: qa-dos-pantallas-una-corrida
description: qa-capturas prueba dos pantallas de Compras en UNA llamada — el parche de la plantilla sigue vigente tras `location.href=` en un eval (17-10)
metadata:
  type: reference
---

El `{"parchear": …}` de qa-capturas intercepta la ruta para toda la página, así que sobrevive a
`{"eval":"location.href='/admin?tab=compras&vista=ordenes-compra&sub=recibir'"}` + `{"esperar":8000}`.
Medido 17-10: Presupuesto y el formulario «Recibir» de Compras (oculta en main por la plantilla), las dos en
una corrida de 53 s con 0 respuestas ≥400. Sale más barato que dos corridas (cada una paga login + onboarding).

Selectores estables en Compras: «Recibir mercadería» = `button[title='Recibir mercadería, con o sin orden']`;
cantidad que llegó = `input[aria-label^='Cantidad que llegó']`; campos C20 = `input[id$='-revision']` /
`input[id$='-rechazo']`.

Dato de main (17-10): una compra recurrente de Frigorífico Amazonia crea una orden pendiente de S/ 600 cada
día a las 01:34 de Lima, así que «por recibir» crece solo. Receta de la plantilla: [[qa-parchear-plantilla-main]].
