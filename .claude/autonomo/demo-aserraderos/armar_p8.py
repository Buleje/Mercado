"""Página 8 del folleto «Buleje para aserraderos»: «Antes de pagar, revisa al proveedor» (04-11).

Uso: python3 armar_p8.py <folleto de 7 págs> <19 Aviso proveedor sancionado.png> <salida.pdf>
La foto sale del alta del ingreso en el tenant QA forestal con un titular REAL de la lista pública
(C.N. San Luis, RUC 20393286238): receta en aviso-sancionado/LEEME.md. Nada de Blas.
Precios elegidos por Brandon el 04-11: incluido en S/ 349 + revisión gratis del último mes; suelta S/ 49 hasta 30.
"""
import fitz, sys

src, img, out = sys.argv[1:4]
d = fitz.open(src)
assert d.page_count == 7, d.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255); NEGRO = (0, 0, 0)
BORDE = (0.85, 0.87, 0.86); TINTE = (0.902, 0.957, 0.945); RAYA = (0.898, 0.906, 0.922); CAJA = (0.059, 0.463, 0.431)
NB = " "  # Helvética base14 parte «S/» de su cifra si no va con espacio duro


def tb(r, t, font="helv", size=10, color=NEGRO, align=0):
    R0 = fitz.Rect(*r); R0.y1 += 6
    rc = p.insert_textbox(R0, t, fontname=font, fontsize=size, color=color, align=align, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)


def imagen(r, ruta):
    R = fitz.Rect(*r)
    pm = fitz.Pixmap(ruta); asp = pm.height / pm.width
    if asp < R.height / R.width:
        hh = R.width * asp; R = fitz.Rect(R.x0, R.y0, R.x1, R.y0 + hh)
    else:
        ww = R.height / asp; R = fitz.Rect(R.x0, R.y0, R.x0 + ww, R.y1)
    p.insert_image(R + (1, 1, -1, -1), filename=ruta, keep_proportion=True)
    p.draw_rect(R, color=BORDE, width=0.8)
    return R


tb((40, 38, 555, 60), "11. Antes de pagar, revisa al proveedor", "hebo", 13, VERDE)
tb((40, 64, 555, 110), "Cuando anota el ingreso de una guía, el sistema revisa solo al titular del permiso en el Registro "
   "de Infractores de SERFOR y en la lista roja de OSINFOR. Si figura, el aviso sale en rojo con la resolución y la "
   "fecha, antes de que usted pague.")
r1 = imagen((40, 108, 300, 372), img)
tb((r1.x0, r1.y1 + 4, r1.x1, r1.y1 + 18), "Sale solo al escribir el RUC del titular, en menos de 2 segundos", "heit", 8, GRIS, align=1)
tb((318, r1.y0 + 4, 555, r1.y0 + 70),
   "Es como pedir el DNI antes de fiar: un minuto de revisión le evita comprarle sin saber a quien SERFOR ya sancionó.",
   "heit", 10, GRIS)
tb((318, r1.y0 + 84, 555, r1.y0 + 104), "Qué le dice el aviso", "hebo", 11, VERDE)
tb((318, r1.y0 + 106, 555, r1.y0 + 250),
   "Rojo: sancionado en SERFOR o permiso en la lista roja de OSINFOR.\n"
   "Ámbar: OSINFOR le abrió un proceso (PAU) o el permiso tiene una sanción a otra persona.\n"
   "Si no figura: una línea discreta con visto verde.\n"
   "Siempre con la fuente, la fecha de la lista y el enlace para leer la resolución. Si SERFOR u OSINFOR no "
   "responden, lo dice: nunca da por revisado a medias.")

filas = [
    ("Revisa solo", "Al anotar el ingreso y al recepcionar la guía, sin que usted lo pida."),
    ("No le frena", "Es un aviso, no un candado: la decisión de comprar sigue siendo suya."),
    ("Cada mes, otra vez", "Vuelve a revisar a todos sus proveedores y le avisa por WhatsApp si alguno entró a la lista."),
]
y = r1.y1 + 52; h = 37
tb((51, y - 24, 400, y - 4), "Lo que hace", "hebo", 13, VERDE)
p.draw_rect(fitz.Rect(51, y, 170, y + h * len(filas)), color=None, fill=TINTE)
for i, (a, b) in enumerate(filas):
    yy = y + i * h
    if i:
        p.draw_line((51, yy), (544, yy), color=RAYA, width=0.8)
    tb((57, yy + 6, 169, yy + h), a, "hebo", 10)
    tb((178, yy + 6, 544, yy + h), b)

yb = y + h * len(filas) + 16; hb = 96
p.draw_rect(fitz.Rect(51, yb, 292, yb + hb), color=CAJA, width=1.2)
tb((60, yb + 8, 286, yb + 28), f"Incluido en los S/{NB}349 al mes", "hebo", 12, VERDE)
tb((60, yb + 30, 286, yb + hb - 6), "Para empezar, le revisamos gratis a los proveedores de su último mes y le "
   "decimos cuál figura.")
p.draw_rect(fitz.Rect(303, yb, 544, yb + hb), color=CAJA, width=1.2)
tb((312, yb + 8, 538, yb + 28), f"Revisión suelta: S/{NB}49", "hebo", 12, VERDE)
tb((312, yb + 30, 538, yb + hb - 6), "¿Todavía no usa el sistema? Revisamos hasta 30 proveedores y le entregamos un "
   "papel con el resultado de cada uno.")
tb((51, yb + hb + 12, 544, yb + hb + 28), "Pida su revisión o la prueba sin costo por WhatsApp: 917 013 738.", "hebo")
assert yb + hb + 28 < 788, yb
tb((40, 790, 555, 802), "Ejemplo con datos públicos de SERFOR (lista al 13/10/2026) y OSINFOR (consultado el 04/11/2026).",
   "heit", 8, GRIS)
tb((51, 805, 300, 817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb((480, 805, 544, 817), "Página 8", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count, round(yb + hb + 28))
