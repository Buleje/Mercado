"""Página 9 del folleto «Buleje para aserraderos»: «Sus papeles, con su marca» (04-11).

Uso: python3 armar_p9.py <folleto de 8 págs> <Muestra - papeles con su marca - Maderera El Bosque.pdf> <salida.pdf>
La muestra sale de papeles-con-su-marca/hacer.py (marca INVENTADA: el folleto va a Inforhuay y a COPESA a la vez,
ninguno ve el logo del otro; a cada uno se le manda aparte su propia muestra). Las hojas van como vector (nítidas).
Dato medido 04-11: un papel sale en 0,1 s (typst, 3 corridas).
"""
import fitz, sys

src, muestra, out = sys.argv[1:4]
d = fitz.open(src)
assert d.page_count == 8, d.page_count
m = fitz.open(muestra)
assert m.page_count == 2, m.page_count
p = d.new_page(width=595.2756, height=841.8898)
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255); NEGRO = (0, 0, 0)
BORDE = (0.85, 0.87, 0.86); TINTE = (0.902, 0.957, 0.945); RAYA = (0.898, 0.906, 0.922); CAJA = (0.059, 0.463, 0.431)
NB = " "  # Helvética base14 parte «S/» de su cifra si no va con espacio duro


def tb(r, t, font="helv", size=10, color=NEGRO, align=0):
    R0 = fitz.Rect(*r); R0.y1 += 6
    rc = p.insert_textbox(R0, t, fontname=font, fontsize=size, color=color, align=align, lineheight=1.25)
    assert rc >= 0, (t[:40], rc)


def hoja(x0, y0, ancho, pno):
    r = m[pno].rect
    R = fitz.Rect(x0, y0, x0 + ancho, y0 + ancho * r.height / r.width)
    p.show_pdf_page(R, m, pno)
    p.draw_rect(R, color=BORDE, width=0.8)
    return R


tb((40, 38, 555, 60), "12. Sus papeles, con su marca", "hebo", 13, VERDE)
tb((40, 64, 555, 104), "Proformas, cubicaciones, notas de venta, estados de cuenta y recibos salen con su logo, sus "
   "colores y su propia numeración, todos con el mismo diseño ordenado. Cada papel sale en menos de un segundo.")
r1 = hoja(51, 106, 238, 0)
r2 = hoja(306, 106, 238, 1)
tb((r1.x0, r1.y1 + 4, r1.x1, r1.y1 + 18), "Proforma con IGV y monto en letras", "heit", 8, GRIS, align=1)
tb((r2.x0, r2.y1 + 4, r2.x1, r2.y1 + 18), "Cubicación por especie, con pies tablares y m³", "heit", 8, GRIS, align=1)
yq = r1.y1 + 26
tb((51, yq, 544, yq + 30), "Es como tener su propia imprenta de talonarios: cada hoja sale con su marca y su número, "
   "sin esperar ni repetir números.", "heit", 10, GRIS)

filas = [
    ("Su marca", "Logo, colores, RUC, dirección y teléfono de su empresa en cada hoja."),
    ("Su numeración", "Cada tipo con su serie (PRO-0001, CUB-0001): sin repetir ni saltar números."),
    ("Cuentas exactas", "Pies tablares y m³ con la regla de la guía (pies ÷ 424), fila por fila."),
    ("Original o copia", "Código en el pie de cada hoja: con él se comprueba que el papel no fue cambiado."),
]
y = yq + 58; h = 30
tb((51, y - 22, 400, y - 4), "Lo que hace", "hebo", 13, VERDE)
p.draw_rect(fitz.Rect(51, y, 170, y + h * len(filas)), color=None, fill=TINTE)
for i, (a, b) in enumerate(filas):
    yy = y + i * h
    if i:
        p.draw_line((51, yy), (544, yy), color=RAYA, width=0.8)
    tb((57, yy + 6, 169, yy + h), a, "hebo", 10)
    tb((178, yy + 6, 544, yy + h), b)

yb = y + h * len(filas) + 14; hb = 62
p.draw_rect(fitz.Rect(51, yb, 544, yb + hb), color=CAJA, width=1.2)
tb((60, yb + 8, 538, yb + 26), f"Incluido en los S/{NB}349 al mes", "hebo", 12, VERDE)
tb((60, yb + 28, 538, yb + hb - 6), "Prueba sin costo: le armamos la proforma y la cubicación de una carga suya real, "
   "con su logo, para que la compare con la que usa hoy.")
tb((51, yb + hb + 10, 544, yb + hb + 26), "Pídala por WhatsApp: 917 013 738.", "hebo")
assert yb + hb + 26 < 788, yb
tb((40, 790, 555, 802), "Ejemplo con datos inventados (Maderera El Bosque, compradores y precios de muestra).",
   "heit", 8, GRIS)
tb((51, 805, 300, 817), "Buleje · sistema para aserraderos", "helv", 8, GRIS)
tb((480, 805, 544, 817), "Página 9", "helv", 8, GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count, round(yb + hb + 26))
