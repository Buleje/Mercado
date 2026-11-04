"""PDF de la noche 04-11 para Brandon.

Uso: python3 armar_pdf.py <resumen.txt> <salida.pdf>
Formato del resumen (texto plano):
  # Título            → título de la hoja (solo el primero)
  ## Sección          → subtítulo verde
  | a | b | c |       → fila de tabla (la 1.ª de cada bloque = cabecera)
  - texto             → viñeta
  otra línea          → párrafo
Helvética base14 (sin «›»: usar «>»), A4, pie con número de página.
"""
import sys
import fitz

src, out = sys.argv[1:3]
VERDE = (15/255, 118/255, 109/255); GRIS = (0x4b/255, 0x54/255, 0x62/255); NEGRO = (0, 0, 0)
TINTE = (0.902, 0.957, 0.945); RAYA = (0.898, 0.906, 0.922)
W, H = 595.2756, 841.8898
X0, X1, YTOP, YBOT = 40, 555, 40, 790
d = fitz.open()
st = {"p": None, "y": 0.0}


def pagina():
    st["p"] = d.new_page(width=W, height=H); st["y"] = YTOP


def alto(t, size, ancho):
    """Alto que ocupa un texto: se prueba en una página borrador."""
    tmp = fitz.open(); pg = tmp.new_page(width=W, height=H)
    for h in range(14, 600, 6):
        if pg.insert_textbox(fitz.Rect(0, 0, ancho, h), t, fontname="helv", fontsize=size, lineheight=1.25) >= 0:
            return h
    return 600


def texto(t, font="helv", size=10, color=NEGRO, x0=X0, x1=X1, gap=6, fondo=None):
    h = alto(t, size, x1 - x0)
    if st["p"] is None or st["y"] + h > YBOT:
        pagina()
    r = fitz.Rect(x0, st["y"], x1, st["y"] + h)
    if fondo:
        st["p"].draw_rect(r + (-4, -2, 4, 0), color=None, fill=fondo)
    st["p"].insert_textbox(r, t, fontname=font, fontsize=size, color=color, lineheight=1.25)
    st["y"] += h + gap


def tabla(filas):
    n = max(len(f) for f in filas)
    ancho = (X1 - X0) / n
    for i, f in enumerate(filas):
        f = f + [""] * (n - len(f))
        h = max(alto(c, 9, ancho - 8) for c in f) + 4
        if st["p"] is None or st["y"] + h > YBOT:
            pagina()
        y = st["y"]
        if i == 0:
            st["p"].draw_rect(fitz.Rect(X0, y, X1, y + h), color=None, fill=TINTE)
        else:
            st["p"].draw_line((X0, y), (X1, y), color=RAYA, width=0.8)
        for j, c in enumerate(f):
            st["p"].insert_textbox(fitz.Rect(X0 + j * ancho + 4, y + 3, X0 + (j + 1) * ancho - 4, y + h + 4), c,
                                   fontname="hebo" if i == 0 else "helv", fontsize=9, lineheight=1.25)
        st["y"] += h
    st["y"] += 8


lineas = open(src, encoding="utf-8").read().splitlines()
buf: list[list[str]] = []
for ln in lineas + [""]:
    if ln.startswith("|"):
        celdas = [c.strip() for c in ln.strip().strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in celdas):
            continue
        buf.append(celdas); continue
    if buf:
        tabla(buf); buf = []
    if ln.startswith("# "):
        texto(ln[2:], "hebo", 16, VERDE, gap=4)
    elif ln.startswith("## "):
        st["y"] += 4; texto(ln[3:], "hebo", 12.5, VERDE, gap=4)
    elif ln.startswith("- "):
        texto("·  " + ln[2:], x0=X0 + 6, gap=3)
    elif ln.strip():
        texto(ln)
for i, pg in enumerate(d):
    pg.insert_textbox(fitz.Rect(X0, 805, X1, 823), "Buleje · noche del 04-11-2026", fontname="helv", fontsize=8, color=GRIS)
    pg.insert_textbox(fitz.Rect(X0, 805, X1, 823), f"Página {i + 1} de {d.page_count}", fontname="helv", fontsize=8,
                      color=GRIS, align=2)
d.save(out, garbage=3, deflate=True)
print("ok", out, d.page_count)
