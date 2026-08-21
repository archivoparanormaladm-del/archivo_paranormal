"""
ARCHIVO PARANORMAL — Backend Flask + PostgreSQL
"""

import os
import uuid
import re
import secrets
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from functools import wraps

import psycopg2
import psycopg2.extras
from flask import (
    Flask, request, jsonify, session,
    send_from_directory, abort
)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static")
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key-cambiar")
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_CONTENT_MB", 50)) * 1024 * 1024

# Endurecer la cookie de sesión. En producción (FLASK_DEBUG=0) exige HTTPS.
_EN_PROD = os.getenv("FLASK_DEBUG", "1") != "1"
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=_EN_PROD,
)

BASE_DIR    = os.path.dirname(__file__)
# En Railway se monta un Volume persistente y se apunta UPLOADS_DIR ahí
# (p. ej. /data). En local cae por defecto a ./uploads.
UPLOADS_DIR = os.getenv("UPLOADS_DIR", os.path.join(BASE_DIR, "uploads"))
ADUANA      = os.path.join(UPLOADS_DIR, "aduana")
APROBADOS   = os.path.join(UPLOADS_DIR, "aprobados")
AVATARES    = os.path.join(UPLOADS_DIR, "avatares")

# Categorías iniciales — solo se usan para sembrar la tabla `categorias`
# la primera vez. A partir de ahí, la fuente de la verdad es la base de datos
# (el admin puede crear/eliminar categorías desde su panel).
CATEGORIAS_SEED = ["Fantasmas", "Duendes", "Exorcismo", "Poltergeist",
                   "Psicofonias", "Ouija", "Animales", "Brujeria", "Modo Incognito"]

# ── Galerías de fotos (photoset) ──
# Varias fotos en una misma publicación. La especificación del panel fija
# 10 MB por foto y una rejilla de 1, 2 o 3 columnas (540 / 268 / 177 px).
MAX_FOTOS_GALERIA   = 10
MAX_MB_FOTO_GALERIA = 10

# ── Publicaciones de audio ──
# La especificación fija 10 MB por pista, MP3, y una publicación de audio
# por usuario y día. Varias pistas subidas juntas forman una lista.
# Publicaciones de texto: sin archivo, sólo asunto y cuerpo.
MAX_CARACTERES_TEXTO = 20000

MAX_MB_FOTO        = 20   # publicación de una sola foto
MAX_MB_AUDIO       = 10
MAX_PISTAS_LISTA   = 20
AUDIOS_POR_DIA     = 1

EXT_IMAGEN = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"}
EXT_VIDEO  = {"mp4", "mov", "avi", "mkv", "webm", "wmv"}
EXT_AUDIO  = {"mp3", "wav", "ogg", "flac", "m4a", "aac"}

os.makedirs(ADUANA, exist_ok=True)
os.makedirs(AVATARES, exist_ok=True)

# ══════════════════════════════════════════════════════════
#  ALMACENAMIENTO  (disco local  ó  S3/R2/B2 compatible)
# ══════════════════════════════════════════════════════════
# Los archivos se referencian por "key" (ruta relativa lógica):
#   aduana/<uuid>.<ext>            → subidas pendientes de revisión
#   aprobados/<categoria>/<uuid>.<ext> → media publicada
#   avatares/<uuid>.<ext>          → fotos de perfil
# Si defines las variables S3_* se usa almacenamiento de objetos
# (persistente); si no, cae al disco local (efímero en Render free).
S3_BUCKET   = os.getenv("S3_BUCKET")
S3_ENDPOINT = os.getenv("S3_ENDPOINT_URL")          # R2/B2; vacío = AWS S3
S3_KEY      = os.getenv("S3_ACCESS_KEY")
S3_SECRET   = os.getenv("S3_SECRET_KEY")
S3_REGION   = os.getenv("S3_REGION", "auto")
USAR_S3     = bool(S3_BUCKET and S3_KEY and S3_SECRET)

_s3 = None
def _s3_client():
    global _s3
    if _s3 is None:
        import boto3
        from botocore.config import Config
        _s3 = boto3.client(
            "s3", endpoint_url=S3_ENDPOINT or None,
            aws_access_key_id=S3_KEY, aws_secret_access_key=S3_SECRET,
            region_name=S3_REGION, config=Config(signature_version="s3v4"))
    return _s3

def _ruta_local(key):
    return os.path.join(UPLOADS_DIR, *key.split("/"))

def st_guardar(file_storage, key):
    """Guarda un archivo subido (werkzeug FileStorage) bajo la key dada."""
    if USAR_S3:
        try: file_storage.stream.seek(0)
        except Exception: pass
        _s3_client().upload_fileobj(
            file_storage.stream, S3_BUCKET, key,
            ExtraArgs={"ContentType": file_storage.mimetype or "application/octet-stream"})
    else:
        ruta = _ruta_local(key)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        file_storage.save(ruta)

def st_mover(src_key, dst_key):
    if USAR_S3:
        cli = _s3_client()
        cli.copy_object(Bucket=S3_BUCKET, CopySource={"Bucket": S3_BUCKET, "Key": src_key}, Key=dst_key)
        cli.delete_object(Bucket=S3_BUCKET, Key=src_key)
    else:
        r_src, r_dst = _ruta_local(src_key), _ruta_local(dst_key)
        os.makedirs(os.path.dirname(r_dst), exist_ok=True)
        if os.path.exists(r_src):
            os.rename(r_src, r_dst)

def borrar_archivo(key):
    if USAR_S3:
        try: _s3_client().delete_object(Bucket=S3_BUCKET, Key=key)
        except Exception: pass
    else:
        r = _ruta_local(key)
        if os.path.exists(r):
            try: os.remove(r)
            except OSError: pass

def servir_archivo_st(key):
    """Devuelve una respuesta Flask sirviendo el objeto de la key.
    En S3 redirige a una URL prefirmada de corta duración (soporta Range/seek
    y descarga la banda del bucket, no del servidor web)."""
    if USAR_S3:
        from flask import redirect
        url = _s3_client().generate_presigned_url(
            "get_object", Params={"Bucket": S3_BUCKET, "Key": key}, ExpiresIn=3600)
        return redirect(url)
    ruta = _ruta_local(key)
    if not os.path.exists(ruta):
        abort(404)
    return send_from_directory(os.path.dirname(ruta), os.path.basename(ruta))

def listar_prefijo(prefix):
    """Lista las keys existentes bajo un prefijo (para renombrar categorías)."""
    if USAR_S3:
        cli = _s3_client(); keys = []; token = None
        while True:
            kw = {"Bucket": S3_BUCKET, "Prefix": prefix}
            if token: kw["ContinuationToken"] = token
            resp = cli.list_objects_v2(**kw)
            keys += [o["Key"] for o in resp.get("Contents", [])]
            if resp.get("IsTruncated"): token = resp.get("NextContinuationToken")
            else: break
        return keys
    base = _ruta_local(prefix)
    if not os.path.isdir(base):
        return []
    return [f"{prefix}/{f}" for f in os.listdir(base)]

def _content_type_por_ext(key):
    e = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    return {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "gif": "image/gif"}.get(e, "application/octet-stream")

def st_guardar_bytes(data, key, content_type=None):
    """Guarda `data` (bytes) bajo la key dada."""
    content_type = content_type or _content_type_por_ext(key)
    if USAR_S3:
        _s3_client().put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
    else:
        ruta = _ruta_local(key)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "wb") as f:
            f.write(data)

def st_leer(key):
    """Devuelve los bytes de la key, o None si no existe."""
    if USAR_S3:
        try:
            obj = _s3_client().get_object(Bucket=S3_BUCKET, Key=key)
            return obj["Body"].read()
        except Exception:
            return None
    ruta = _ruta_local(key)
    if not os.path.exists(ruta):
        return None
    with open(ruta, "rb") as f:
        return f.read()

def st_existe(key):
    if USAR_S3:
        try:
            _s3_client().head_object(Bucket=S3_BUCKET, Key=key)
            return True
        except Exception:
            return False
    return os.path.exists(_ruta_local(key))

def st_uso(prefijo=""):
    """Bytes ocupados y número de objetos bajo un prefijo del almacenamiento.

    Mide el disco (o el bucket), no la base de datos: así aparecen también
    los ficheros huérfanos —los que quedaron sin fila, por ejemplo tras
    borrar una publicación— que son justo el espacio recuperable."""
    if USAR_S3:
        total = n = 0
        try:
            paginador = _s3_client().get_paginator("list_objects_v2")
            for pagina in paginador.paginate(Bucket=S3_BUCKET, Prefix=prefijo):
                for obj in pagina.get("Contents", []):
                    total += obj["Size"]
                    n += 1
        except Exception:
            pass
        return total, n
    base = _ruta_local(prefijo) if prefijo else UPLOADS_DIR
    total = n = 0
    for raiz, _dirs, ficheros in os.walk(base):
        for f in ficheros:
            try:
                total += os.path.getsize(os.path.join(raiz, f))
                n += 1
            except OSError:
                pass
    return total, n

def key_de_archivo(fila):
    """Devuelve la key de storage de una fila de `archivos` según su estado."""
    if fila["estado"] == "aprobado":
        return f"aprobados/{fila['categoria']}/{fila['nombre_guardado']}"
    return f"aduana/{fila['nombre_guardado']}"

# ── Optimización de imágenes (Pillow) ─────────────────────
try:
    from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageFilter, ImageSequence, ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True   # tolerar archivos ligeramente truncados
    _PIL_OK = True
except Exception:
    _PIL_OK = False

# Tope de la imagen guardada. La especificación admite hasta 2048 x 3072 px
# (2:3 en vertical) y recomienda 1280 x 1920. Se usa una caja en vez de un
# único lado para no recortar calidad a los retratos: un 2048x3072 entra tal
# cual, mientras que antes (lado mayor 2000) bajaba a 1333x2000.
MAX_IMG_W  = 2048
MAX_IMG_H  = 3072
MAX_LADO   = 2048   # compatibilidad: lado mayor de referencia
THUMB_LADO = 600    # px del lado mayor de la miniatura
EXT_OPTIMIZABLE = {"jpg", "jpeg", "png", "webp"}   # gif (animado) y svg (vector) se dejan tal cual

def _pil_a_bytes(img, ext):
    import io
    buf = io.BytesIO()
    e = ext.lower()
    if e in ("jpg", "jpeg"):
        img.convert("RGB").save(buf, format="JPEG", quality=82, optimize=True, progressive=True)
    elif e == "png":
        img.save(buf, format="PNG", optimize=True)
    elif e == "webp":
        img.save(buf, format="WEBP", quality=82, method=6)
    else:
        return None
    return buf.getvalue()

def optimizar_imagen(file_storage, ext):
    """Corrige orientación, reduce a MAX_LADO y recomprime. Devuelve bytes o None."""
    if not _PIL_OK or ext.lower() not in EXT_OPTIMIZABLE:
        return None
    try:
        file_storage.stream.seek(0)
        img = ImageOps.exif_transpose(Image.open(file_storage.stream))
        # thumbnail sólo reduce y conserva la proporción: encaja la imagen
        # dentro de la caja permitida sin deformarla ni recortarla.
        if img.width > MAX_IMG_W or img.height > MAX_IMG_H:
            img.thumbnail((MAX_IMG_W, MAX_IMG_H), Image.LANCZOS)
        return _pil_a_bytes(img, ext)
    except Exception as e:
        print("aviso: no se pudo optimizar imagen:", e)
        return None

def miniatura_bytes(data, ext):
    """Genera una miniatura (lado mayor THUMB_LADO) a partir de bytes."""
    if not _PIL_OK:
        return None
    try:
        import io
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        img.thumbnail((THUMB_LADO, THUMB_LADO), Image.LANCZOS)
        return _pil_a_bytes(img, ext if ext.lower() in EXT_OPTIMIZABLE else "jpg")
    except Exception:
        return None

# ── Historias con marca de agua (formato 9:16 para Instagram/Tumblr/Reddit) ──
STORY_W, STORY_H = 1080, 1920
_ROJO = (225, 29, 42)

def _fuente(size):
    try:
        return ImageFont.load_default(size=size)   # Pillow ≥10.1 trae fuente escalable
    except Exception:
        return ImageFont.load_default()

def _marca_wordmark(draw, x, y, size, anchor_right=False):
    """Dibuja 'DARK FILES' (DARK blanco + FILES rojo). Devuelve el ancho total."""
    f = _fuente(size)
    w_dark  = draw.textlength("DARK ", font=f)
    w_files = draw.textlength("FILES", font=f)
    total = w_dark + w_files
    if anchor_right:
        x -= total
    draw.text((x, y), "DARK ", font=f, fill=(255, 255, 255))
    draw.text((x + w_dark, y), "FILES", font=f, fill=_ROJO)
    return total

def historia_imagen(data, autor, asunto=None):
    """Compone una imagen estática en una historia 9:16 con marca de agua."""
    import io
    orig = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    src = orig.convert("RGB")
    # Fondo: la imagen recortada a 9:16, desenfocada y oscurecida
    bg = ImageOps.fit(src, (STORY_W, STORY_H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(45))
    bg = Image.eval(bg, lambda p: int(p * 0.5)).convert("RGB")
    # Imagen principal centrada (respetando transparencia sobre el fondo)
    fg = orig.convert("RGBA")
    fg.thumbnail((STORY_W - 120, STORY_H - 560), Image.LANCZOS)
    pos = ((STORY_W - fg.width) // 2, (STORY_H - fg.height) // 2)
    bg.paste(fg, pos, fg)
    _pintar_marca_final(bg, autor, asunto)
    out = io.BytesIO(); bg.save(out, "JPEG", quality=88, optimize=True)
    return out.getvalue()

def _pintar_marca_final(canvas, autor, asunto=None):
    draw = ImageDraw.Draw(canvas, "RGBA")
    _marca_wordmark(draw, 46, 46, 52)                       # logo arriba-izquierda
    if asunto:
        fa = _fuente(46)
        txt = asunto if len(asunto) <= 42 else asunto[:41] + "…"
        tw = draw.textlength(txt, font=fa)
        draw.text(((STORY_W - tw) / 2, STORY_H - 210), txt, font=fa, fill=(255, 255, 255))
    # Pie centrado: DARK FILES · @autor
    handle = f"@{autor}" if autor else ""
    f = _fuente(40)
    w_marca = draw.textlength("DARK FILES", font=f)
    w_rest  = draw.textlength((" · " + handle) if handle else "", font=f)
    x0 = (STORY_W - (w_marca + w_rest)) / 2
    y0 = STORY_H - 110
    ancho = _marca_wordmark(draw, x0, y0, 40)
    if handle:
        draw.text((x0 + ancho, y0), " · " + handle, font=f, fill=(235, 235, 235))

def historia_gif(data, autor):
    """Marca de agua sobre un GIF conservando la animación (tamaño acotado)."""
    import io
    src = Image.open(io.BytesIO(data))
    MAXW = 640
    frames, durations = [], []
    for frame in ImageSequence.Iterator(src):
        fr = frame.convert("RGB")
        if fr.width > MAXW:
            h = int(fr.height * MAXW / fr.width)
            fr = fr.resize((MAXW, h), Image.LANCZOS)
        W, H = fr.width, fr.height + 62
        canvas = Image.new("RGB", (W, H), (17, 18, 20))
        canvas.paste(fr, (0, 0))
        draw = ImageDraw.Draw(canvas)
        _marca_wordmark(draw, 14, fr.height + 16, 28)
        if autor:
            f = _fuente(26)
            hw = draw.textlength("@" + autor, font=f)
            draw.text((W - hw - 14, fr.height + 18), "@" + autor, font=f, fill=(210, 210, 210))
        frames.append(canvas.convert("P", palette=Image.ADAPTIVE, colors=128))
        durations.append(frame.info.get("duration", 90))
    out = io.BytesIO()
    frames[0].save(out, "GIF", save_all=True, append_images=frames[1:],
                   duration=durations, loop=0, optimize=True, disposal=2)
    return out.getvalue()

def enviar_email(destino, asunto, cuerpo):
    """Envía un correo por SMTP si está configurado. Si no, lo registra en el
    log del servidor (útil en local / mientras no configures SMTP)."""
    host = os.getenv("SMTP_HOST")
    remitente = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "no-reply@darkfiles.app"
    if not host:
        print(f"\n[EMAIL SIN SMTP] Para: {destino}\nAsunto: {asunto}\n{cuerpo}\n")
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = asunto
        msg["From"] = remitente
        msg["To"] = destino
        msg.set_content(cuerpo)
        puerto = int(os.getenv("SMTP_PORT", 587))
        with smtplib.SMTP(host, puerto, timeout=15) as s:
            s.starttls()
            usuario, clave = os.getenv("SMTP_USER"), os.getenv("SMTP_PASS")
            if usuario and clave:
                s.login(usuario, clave)
            s.send_message(msg)
        return True
    except Exception as e:
        print("aviso: no se pudo enviar email:", e)
        return False

def crear_notificacion(usuario_id, actor_id, tipo, archivo_id=None):
    """Crea una notificación para `usuario_id`. No notifica acciones propias."""
    if not usuario_id or usuario_id == actor_id:
        return
    try:
        query("INSERT INTO notificaciones (usuario_id, actor_id, tipo, archivo_id) VALUES (%s,%s,%s,%s)",
              (usuario_id, actor_id, tipo, archivo_id), commit=True)
    except Exception as e:
        print("aviso: no se pudo crear notificación:", e)

# ── Base de datos ──────────────────────────────────────────
def get_db():
    # Railway (y la mayoría de PaaS) inyecta una sola DATABASE_URL.
    # Si existe, se usa directamente; si no, se cae a las DB_* de local.
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(
            database_url,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME", "paranormal_db"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

def query(sql, params=(), fetchone=False, commit=False):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        if commit:
            conn.commit()
            return cur.rowcount
        return cur.fetchone() if fetchone else cur.fetchall()
    finally:
        conn.close()

# ── Inicialización automática de la base ──────────────────
def init_db_si_necesario():
    """Si la base está vacía (no existe la tabla `usuarios`), ejecuta schema.sql
    para crear todo y sembrar el super admin. Idempotente y seguro: si las
    tablas ya existen, no hace nada. Facilita el primer deploy (Render/Neon)."""
    try:
        existe = query("SELECT to_regclass('public.usuarios') AS t", fetchone=True)["t"]
    except Exception as e:
        print("aviso: no se pudo verificar el estado de la base:", e)
        return
    if existe:
        return
    ruta = os.path.join(BASE_DIR, "schema.sql")
    if not os.path.exists(ruta):
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        with open(ruta, encoding="utf-8") as fh:
            cur.execute(fh.read())
        conn.commit()
        conn.close()
        print("Base de datos inicializada desde schema.sql")
    except Exception as e:
        print("aviso: no se pudo inicializar la base:", e)

init_db_si_necesario()


def asegurar_columnas():
    """Migraciones menores idempotentes. `init_db_si_necesario` sólo corre
    schema.sql cuando la base está vacía, así que las columnas añadidas
    después no llegan a una base ya creada. Aquí se aseguran una a una."""
    cambios = [
        # Quién aprobó o rechazó el archivo. `revisado_at` ya existía, pero
        # sin el autor no se podía auditar quién publicó qué.
        "ALTER TABLE archivos ADD COLUMN IF NOT EXISTS revisado_por INTEGER "
        "REFERENCES usuarios(id) ON DELETE SET NULL",
        # Reposteos. La restricción única impide repostear dos veces lo
        # mismo, así el botón es un interruptor y no un contador que sube.
        """CREATE TABLE IF NOT EXISTS reposts (
               id         SERIAL PRIMARY KEY,
               usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
               archivo_id INTEGER NOT NULL REFERENCES archivos(id) ON DELETE CASCADE,
               created_at TIMESTAMP NOT NULL DEFAULT NOW(),
               UNIQUE (usuario_id, archivo_id)
           )""",
        "CREATE INDEX IF NOT EXISTS idx_reposts_archivo ON reposts(archivo_id)",
        "CREATE INDEX IF NOT EXISTS idx_reposts_fecha   ON reposts(created_at DESC)",
        # Encuadre elegido al subir: proporción del marco y qué parte del
        # medio se ve dentro de él. No se recorta el fichero —no hay
        # codificador de vídeo— sino que se aplica al mostrarlo.
        "ALTER TABLE archivos ADD COLUMN IF NOT EXISTS aspecto  VARCHAR(8)",
        "ALTER TABLE archivos ADD COLUMN IF NOT EXISTS encuadre VARCHAR(16)",
    ]
    for sql in cambios:
        try:
            query(sql, commit=True)
        except Exception as e:
            print("aviso: no se pudo aplicar la migración:", sql[:60], e)

asegurar_columnas()

# ── Categorías ────────────────────────────────────────────
# "Modo Incognito" se ancla siempre al final del listado, sin importar su
# `orden`. Se compara por prefijo para que calce con o sin tilde
# ("Modo Incognito" / "Modo Incógnito"). En Postgres FALSE ordena antes
# que TRUE, así que la incógnita queda última.
ORDEN_CATS = "ORDER BY (POSITION('modo inc' IN LOWER(nombre)) = 1), orden, id"

def get_categorias():
    """Nombres de categorías, en orden, desde la base de datos."""
    filas = query("SELECT nombre FROM categorias " + ORDEN_CATS)
    return [f["nombre"] for f in filas]

def get_categorias_detalle():
    """Nombre + icono de cada categoría, en el mismo orden."""
    filas = query("SELECT nombre, icono FROM categorias " + ORDEN_CATS)
    return [{"nombre": f["nombre"], "icono": f["icono"] or ""} for f in filas]

def asegurar_categorias():
    """Al iniciar: siembra las categorías por defecto si la tabla está vacía
    y crea la carpeta en disco de cada categoría existente."""
    nombres = CATEGORIAS_SEED
    try:
        filas = query("SELECT nombre FROM categorias " + ORDEN_CATS)
        if filas:
            nombres = [f["nombre"] for f in filas]
        else:
            for i, c in enumerate(CATEGORIAS_SEED):
                query("INSERT INTO categorias (nombre, orden) VALUES (%s,%s) "
                      "ON CONFLICT (nombre) DO NOTHING", (c, i), commit=True)
    except Exception as e:
        # Si la tabla aún no existe (base sin migrar), no bloquear el arranque.
        print("aviso: no se pudieron sincronizar categorías:", e)
    if not USAR_S3:
        for c in nombres:
            os.makedirs(os.path.join(APROBADOS, c), exist_ok=True)

asegurar_categorias()

# ── Configuración y permisos ──────────────────────────────
# Permisos que el Super Admin (perfil 0) siempre tiene y que puede
# delegar al Admin (perfil 1). La clave interna mapea a la fila de `configuracion`.
PERMISOS_DELEGABLES = {
    "renombrar_carpetas":   "admin_perm_renombrar_carpetas",
    "mover_archivos":       "admin_perm_mover_archivos",
    "editar_usuarios":      "admin_perm_editar_usuarios",
    "editar_peso":          "admin_perm_editar_peso",
    "moderar_archivos":     "admin_perm_moderar_archivos",
    "gestionar_usuarios":   "admin_perm_gestionar_usuarios",
    "gestionar_categorias": "admin_perm_gestionar_categorias",
    "responder_soporte":    "admin_perm_responder_soporte",
    "gestionar_reportes":   "admin_perm_gestionar_reportes",
    "eliminar_publicaciones": "admin_perm_eliminar_publicaciones",
}

# Peso máximo por tipo de archivo. Los valores de partida son los que ya
# regían en el código (foto suelta 20, foto de galería 10, audio 10, vídeo
# el tope global de 50), ahora editables desde el panel.
# Encuadres que ofrece el panel de subida, por tipo de medio.
ASPECTOS = {
    # Ordenadas de más ancha a más alta; cuál se recomienda lo dice
    # `ASPECTO_RECOMENDADO`, no la posición.
    "imagen": ["16:9", "5:4", "1:1", "4:5"],
    "video":  ["16:9", "5:4", "7:5", "4:3", "5:3", "3:2"],
}
# El recomendado va aparte y no por posición: así se puede reordenar la
# lista sin cambiar sin querer cuál se sugiere.
ASPECTO_RECOMENDADO = {"imagen": "1:1", "video": "16:9"}
ASPECTOS_VALIDOS = {a for lista in ASPECTOS.values() for a in lista}

def limpiar_encuadre(valor):
    """Normaliza "X% Y%" a algo que se pueda escribir en un estilo.

    Llega del cliente, así que se reconstruye a partir de dos números
    acotados en vez de confiar en la cadena recibida."""
    try:
        x, y = str(valor).replace("%", "").split()
        x = min(100.0, max(0.0, float(x)))
        y = min(100.0, max(0.0, float(y)))
        return f"{x:.4g}% {y:.4g}%"
    except Exception:
        return "50% 50%"

PESOS_TIPO = {
    "peso_imagen_mb":  "20",
    "peso_galeria_mb": "10",
    "peso_video_mb":   "50",
    "peso_audio_mb":   "10",
}

CONFIG_DEFAULTS = {
    "max_content_mb": os.getenv("MAX_CONTENT_MB", "50"),
    **PESOS_TIPO,
    "admin_perm_renombrar_carpetas": "false",
    "admin_perm_mover_archivos": "false",
    "admin_perm_editar_usuarios": "false",
    "admin_perm_editar_peso": "false",
    # Permisos delegables nuevos. Por defecto activos para no romper el flujo
    # actual del Admin; el Super Admin puede revocarlos desde el panel.
    "admin_perm_moderar_archivos": "true",
    "admin_perm_gestionar_usuarios": "true",
    "admin_perm_gestionar_categorias": "true",
    "admin_perm_responder_soporte": "true",
    "admin_perm_gestionar_reportes": "true",
    "admin_perm_eliminar_publicaciones": "true",
}

def get_config(clave, default=None):
    try:
        fila = query("SELECT valor FROM configuracion WHERE clave=%s", (clave,), fetchone=True)
        return fila["valor"] if fila else default
    except Exception:
        return default

def set_config(clave, valor):
    query("INSERT INTO configuracion (clave, valor) VALUES (%s,%s) "
          "ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor",
          (clave, str(valor)), commit=True)

def peso_mb(clave):
    """Peso máximo (MB) de un tipo, desde la configuración."""
    try:
        return int(get_config(clave, PESOS_TIPO[clave]))
    except (TypeError, ValueError):
        return int(PESOS_TIPO[clave])

def calcular_tope_global():
    """Tope de la petición entera, derivado de los pesos por tipo.

    Debe cubrir el envío más grande posible: una galería de fotos o una
    lista de audio viajan como una sola petición multiparte.
    """
    return max(
        peso_mb("peso_imagen_mb"),
        peso_mb("peso_video_mb"),
        peso_mb("peso_audio_mb"),
        peso_mb("peso_galeria_mb") * MAX_FOTOS_GALERIA,
        peso_mb("peso_audio_mb")   * MAX_PISTAS_LISTA,
    )

def aplicar_peso_maximo():
    """Lee el peso máximo (MB) de la config y lo aplica a Flask."""
    try:
        mb = int(get_config("max_content_mb", os.getenv("MAX_CONTENT_MB", "50")))
        app.config["MAX_CONTENT_LENGTH"] = mb * 1024 * 1024
        return mb
    except Exception:
        return int(os.getenv("MAX_CONTENT_MB", "50"))

def asegurar_config():
    try:
        for k, v in CONFIG_DEFAULTS.items():
            query("INSERT INTO configuracion (clave, valor) VALUES (%s,%s) "
                  "ON CONFLICT (clave) DO NOTHING", (k, v), commit=True)
    except Exception as e:
        print("aviso: no se pudo sincronizar configuración:", e)
    aplicar_peso_maximo()

asegurar_config()

def es_super_admin():
    return session.get("perfil") == 0

def permisos_efectivos():
    """Permisos delegables efectivos del usuario en sesión."""
    perfil = session.get("perfil")
    if perfil == 0:                      # Super Admin: todo
        return {k: True for k in PERMISOS_DELEGABLES}
    if perfil == 1:                      # Admin: según delegación del Super Admin
        return {k: get_config(clave, "false") == "true"
                for k, clave in PERMISOS_DELEGABLES.items()}
    return {k: False for k in PERMISOS_DELEGABLES}

def puede(accion):
    return permisos_efectivos().get(accion, False)

# ── Helpers ───────────────────────────────────────────────
def peso_archivo(file_storage):
    """Bytes de un archivo subido, sin cargarlo en memoria."""
    stream = file_storage.stream
    pos = stream.tell()
    stream.seek(0, os.SEEK_END)
    n = stream.tell()
    stream.seek(pos)
    return n

def tipo_por_extension(nombre):
    ext = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    if ext in EXT_IMAGEN: return "imagen"
    if ext in EXT_VIDEO:  return "video"
    if ext in EXT_AUDIO:  return "audio"
    return "otro"

def username_valido(u):
    return bool(re.match(r'^[a-zA-Z0-9_\.]{3,30}$', u))

# ── Decoradores ───────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "No autenticado"}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    """Admin (1) o Super Admin (0)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get("perfil") not in (0, 1):
            return jsonify({"error": "Acceso denegado"}), 403
        return f(*args, **kwargs)
    return decorated

def super_admin_required(f):
    """Solo Super Admin (0)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get("perfil") != 0:
            return jsonify({"error": "Solo el Super Administrador puede hacer esto"}), 403
        return f(*args, **kwargs)
    return decorated

def permiso_required(accion):
    """Requiere ser admin/super admin Y tener el permiso delegable indicado."""
    def wrapper(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if session.get("perfil") not in (0, 1):
                return jsonify({"error": "Acceso denegado"}), 403
            if not puede(accion):
                return jsonify({"error": "No tienes este permiso. Solicítalo al Super Administrador."}), 403
            return f(*args, **kwargs)
        return decorated
    return wrapper

# ── Protección CSRF (sincronizador por sesión) ────────────
# Endpoints exentos: previos a tener sesión/token o de sólo lectura por diseño.
CSRF_EXENTOS = {
    "/api/auth/login", "/api/auth/register",
    "/api/auth/recuperar", "/api/auth/reset",
}

@app.before_request
def csrf_protect():
    # Los archivos estáticos no necesitan sesión ni token. Tocar `session`
    # aquí hacía que Flask enviara la cookie de sesión con CADA css, js e
    # imagen: tráfico inútil en cada petición y un estorbo para la caché.
    if es_asset(request.path):
        return
    # Cada visitante tiene un token de sesión (se usa para validar formularios).
    # Si la sesión venía vacía se acuña uno nuevo, pero entonces la petición
    # en curso NO puede validarse contra él: el cliente envió el anterior.
    # Se marca como token recién creado para responder con un código propio
    # que el frontend reconoce, refresca la cookie y reintenta una vez.
    recien_creado = False
    if not session.get("csrf"):
        session["csrf"] = secrets.token_urlsafe(32)
        recien_creado = True

    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.path in CSRF_EXENTOS:
            return
        enviado = request.headers.get("X-CSRF-Token", "")
        if not enviado or enviado != session.get("csrf"):
            return jsonify({
                "error": "Token de seguridad inválido o expirado. Recarga la página.",
                # El frontend usa esta marca para reintentar en silencio.
                "csrf": True,
                "renovado": recien_creado,
            }), 403

@app.route("/api/csrf")
def dar_csrf():
    """Devuelve el token vigente. Cualquier GET refresca la cookie mediante
    `set_csrf_cookie`; este endpoint existe para pedirlo explícitamente."""
    return jsonify({"csrf_token": session.get("csrf", "")})

def es_asset(path):
    """¿La ruta es un archivo estático servido tal cual?"""
    return path.rsplit(".", 1)[-1].lower() in (
        "css", "js", "png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
        "woff", "woff2", "ttf", "mp4", "webm", "mp3", "wav",
    ) if "." in path else False

@app.after_request
def set_csrf_cookie(resp):
    # Los assets no necesitan cookie de sesión: ponerla en cada css/js
    # añadía un Set-Cookie por archivo y estorbaba a la caché.
    if es_asset(request.path):
        return resp
    token = session.get("csrf")
    if token:
        # Cookie legible por JS (el frontend la reenvía en la cabecera X-CSRF-Token).
        resp.set_cookie("csrf_token", token, samesite="Lax",
                        secure=_EN_PROD, httponly=False)
    return resp

# ── Páginas estáticas ──────────────────────────────────────
def get_client_ip():
    return request.headers.get('X-Forwarded-For', request.remote_addr)

def check_rate_limit(email, ip, max_intentos=5, ventana_min=15):
    filas = query(
        "SELECT COUNT(*) n FROM login_intentos WHERE (email=%s OR ip=%s) AND created_at > NOW() - INTERVAL '15 minutes'",
        (email, ip), fetchone=True)
    return filas["n"] < max_intentos

def registrar_intento(email, ip):
    query("INSERT INTO login_intentos (email, ip) VALUES (%s,%s)", (email, ip), commit=True)


@app.route("/")
def index():
    # Landing pública: feed tipo Tumblr con las últimas publicaciones.
    # Las carpetas (categorías) están en /dashboard.html; el login en /index.html.
    return send_from_directory("static", "feed.html")

@app.route("/<path:filename>")
def static_files(filename):
    resp = send_from_directory("static", filename)
    # Los assets se piden con ?v=<version>. Al cambiar el contenido cambia
    # la URL, así que la respuesta puede cachearse indefinidamente: se evita
    # una revalidación por archivo en CADA navegación. Sin ?v= se mantiene
    # la revalidación de siempre.
    if request.args.get("v"):
        resp.headers["Cache-Control"] = "max-age=31536000, immutable"
    return resp

# ══════════════════════════════════════════════════════════
#  COMPRESIÓN
# ══════════════════════════════════════════════════════════
# CSS y JS viajaban sin comprimir (≈350 KB en texto plano). Se comprimen
# sólo los tipos que lo aprovechan: imágenes, audio y vídeo ya vienen
# comprimidos y volver a pasarlos por gzip gasta CPU sin ganar nada, así
# que se sirven intactos — la calidad de los archivos no se toca.
COMPRIMIBLES = (
    "text/", "application/javascript", "application/json",
    "image/svg+xml", "application/xml",
)
MIN_COMPRIMIR = 1024        # por debajo, el encabezado gzip no compensa

@app.after_request
def comprimir(resp):
    if resp.status_code != 200:
        return resp
    if "gzip" not in request.headers.get("Accept-Encoding", "").lower():
        return resp
    if resp.headers.get("Content-Encoding"):
        return resp
    tipo = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
    if not tipo.startswith(COMPRIMIBLES):
        return resp

    # send_from_directory entrega la respuesta en modo passthrough (streaming
    # del fichero). Hay que desactivarlo para poder leer el cuerpo; se hace
    # sólo aquí, sobre tipos de texto, nunca sobre media.
    if resp.direct_passthrough:
        resp.direct_passthrough = False
    datos = resp.get_data()
    if len(datos) < MIN_COMPRIMIR:
        return resp

    import gzip as _gzip
    comprimido = _gzip.compress(datos, compresslevel=6)
    if len(comprimido) >= len(datos):
        return resp                      # no comprime: se deja como estaba

    resp.set_data(comprimido)
    resp.headers["Content-Encoding"] = "gzip"
    resp.headers["Content-Length"] = str(len(comprimido))
    # El contenido varía según Accept-Encoding: sin esto, un proxy podría
    # servir la versión comprimida a un cliente que no la admite.
    resp.headers["Vary"] = "Accept-Encoding"
    return resp

# ── Auth ───────────────────────────────────────────────────
@app.route("/api/auth/register", methods=["POST"])
def register():
    data     = request.get_json()
    nombre   = (data.get("nombre")   or "").strip()
    username = (data.get("username") or "").strip().lower()
    email    = (data.get("email")    or "").strip().lower()
    password = data.get("password")  or ""

    if not nombre or not username or not email or not password:
        return jsonify({"error": "Todos los campos son obligatorios"}), 400
    if not username_valido(username):
        return jsonify({"error": "El nombre de usuario solo puede tener letras, números, puntos y guiones bajos (3-30 caracteres)"}), 400
    if len(password) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400

    if query("SELECT id FROM usuarios WHERE email=%s", (email,), fetchone=True):
        return jsonify({"error": "El correo ya está registrado"}), 409
    if query("SELECT id FROM usuarios WHERE username=%s", (username,), fetchone=True):
        return jsonify({"error": "El nombre de usuario ya está en uso"}), 409

    hashed = generate_password_hash(password)
    query(
        "INSERT INTO usuarios (nombre, username, email, password, perfil) VALUES (%s,%s,%s,%s,2)",
        (nombre, username, email, hashed),
        commit=True,
    )
    return jsonify({"ok": True, "mensaje": "Usuario registrado correctamente"})


@app.route("/api/auth/login", methods=["POST"])
def login():
    data  = request.get_json()
    email = (data.get("email") or "").strip().lower()
    pwd   = data.get("password") or ""

    ip = get_client_ip()
    if not check_rate_limit(email, ip):
        return jsonify({"error": "Demasiados intentos fallidos. Espera 15 minutos."}), 429

    user = query("SELECT * FROM usuarios WHERE email=%s", (email,), fetchone=True)
    if not user:
        registrar_intento(email, ip)
        return jsonify({"error": "Credenciales incorrectas"}), 401
    if user["bloqueado"]:
        return jsonify({"error": "Tu cuenta está bloqueada"}), 403
    if not check_password_hash(user["password"], pwd):
        registrar_intento(email, ip)
        return jsonify({"error": "Credenciales incorrectas"}), 401

    session["user_id"]     = user["id"]
    session["nombre"]      = user["nombre"]
    session["username"]    = user["username"]
    session["email"]       = user["email"]
    session["perfil"]      = user["perfil"]
    session["puede_subir"] = user["puede_subir"]
    session["avatar"]      = user.get("avatar")

    return jsonify({
        "ok":          True,
        "perfil":      user["perfil"],
        "nombre":      user["nombre"],
        "username":    user["username"],
        "puede_subir": user["puede_subir"],
    })


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


# ── Recuperación de contraseña ────────────────────────────
@app.route("/api/auth/recuperar", methods=["POST"])
def recuperar_password():
    email = (request.get_json() or {}).get("email", "").strip().lower()
    # Respuesta genérica siempre (no revelar si el correo existe).
    generico = {"ok": True, "mensaje": "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña."}
    if not email:
        return jsonify(generico)
    user = query("SELECT id, nombre FROM usuarios WHERE email=%s", (email,), fetchone=True)
    if not user:
        return jsonify(generico)
    token  = secrets.token_urlsafe(32)
    expira = datetime.utcnow() + timedelta(hours=1)
    query("INSERT INTO password_resets (token, usuario_id, expira) VALUES (%s,%s,%s)",
          (token, user["id"], expira), commit=True)
    base = (os.getenv("APP_URL") or request.url_root).rstrip("/")
    enlace = f"{base}/restablecer.html?token={token}"
    enviar_email(
        email, "Restablecer tu contraseña — DARK FILES",
        f"Hola {user['nombre']},\n\n"
        f"Recibimos una solicitud para restablecer tu contraseña. "
        f"Abre este enlace (válido por 1 hora):\n\n{enlace}\n\n"
        f"Si no fuiste tú, ignora este correo; tu contraseña no cambiará.")
    return jsonify(generico)

@app.route("/api/auth/reset", methods=["POST"])
def reset_password():
    data     = request.get_json() or {}
    token    = (data.get("token") or "").strip()
    password = data.get("password") or ""
    if len(password) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400
    fila = query("SELECT * FROM password_resets WHERE token=%s", (token,), fetchone=True)
    if not fila or fila["usado"] or fila["expira"] < datetime.utcnow():
        return jsonify({"error": "El enlace es inválido o ha expirado. Solicita uno nuevo."}), 400
    query("UPDATE usuarios SET password=%s WHERE id=%s",
          (generate_password_hash(password), fila["usuario_id"]), commit=True)
    query("UPDATE password_resets SET usado=TRUE WHERE token=%s", (token,), commit=True)
    return jsonify({"ok": True, "mensaje": "Contraseña actualizada. Ya puedes iniciar sesión."})


@app.route("/api/auth/me")
def me():
    if "user_id" not in session:
        return jsonify({"autenticado": False})
    return jsonify({
        "autenticado":  True,
        "nombre":       session["nombre"],
        "username":     session.get("username", ""),
        "email":        session["email"],
        "perfil":       session["perfil"],
        "puede_subir":  session["puede_subir"],
        "es_super":     session["perfil"] == 0,
        "permisos":     permisos_efectivos(),
        "avatar":       (lambda a: f"/api/avatar/{a['avatar']}" if a and a.get("avatar") else None)(
                            query("SELECT avatar FROM usuarios WHERE id=%s", (session["user_id"],), fetchone=True)),
        "seguidores":   query("SELECT COUNT(*) AS n FROM seguidores WHERE seguido_id=%s", (session["user_id"],), fetchone=True)["n"],
        "siguiendo":    query("SELECT COUNT(*) AS n FROM seguidores WHERE seguidor_id=%s", (session["user_id"],), fetchone=True)["n"],
    })

@app.route("/api/auth/check_username")
def check_username():
    u = (request.args.get("username") or "").strip().lower()
    if not username_valido(u):
        return jsonify({"disponible": False, "error": "Formato inválido"})
    existe = query("SELECT id FROM usuarios WHERE username=%s", (u,), fetchone=True)
    return jsonify({"disponible": not existe})

# ── Subida de archivos ─────────────────────────────────────
@app.route("/api/upload", methods=["POST"])
@login_required
def upload():
    if session["perfil"] == 3:
        return jsonify({"error": "No tienes permiso para subir archivos"}), 403
    if session["perfil"] == 2 and not session["puede_subir"]:
        return jsonify({"error": "Tu permiso de subida está desactivado"}), 403

    # Se admite un archivo suelto o varias fotos en una misma publicación
    # (photoset). El campo del formulario es el mismo: "file".
    archivos = [f for f in request.files.getlist("file") if f and f.filename]
    # Publicación de texto: sin archivo. Basta con asunto y/o descripción.
    es_texto = not archivos
    if es_texto:
        asunto_txt = (request.form.get("asunto") or "").strip()
        cuerpo_txt = (request.form.get("descripcion") or "").strip()
        if not asunto_txt and not cuerpo_txt:
            return jsonify({"error": "Escribe un texto o adjunta un archivo"}), 400
        if len(cuerpo_txt) > MAX_CARACTERES_TEXTO:
            return jsonify({"error": f"El texto no puede superar los "
                                     f"{MAX_CARACTERES_TEXTO} caracteres"}), 400
    tipos_lote = {tipo_por_extension(a.filename) for a in archivos}
    es_lote_audio = len(archivos) > 1 and tipos_lote == {"audio"}
    if len(archivos) > 1 and len(tipos_lote) > 1:
        return jsonify({"error": "Al subir varios a la vez, todos deben ser del mismo tipo "
                                 "(fotos para una galería, o audios para una lista)"}), 400
    if len(archivos) > 1 and tipos_lote not in ({"imagen"}, {"audio"}):
        return jsonify({"error": "Sólo se pueden agrupar imágenes o audios"}), 400
    if es_lote_audio and len(archivos) > MAX_PISTAS_LISTA:
        return jsonify({"error": f"Máximo {MAX_PISTAS_LISTA} pistas por lista"}), 400
    if not es_lote_audio and len(archivos) > MAX_FOTOS_GALERIA:
        return jsonify({"error": f"Máximo {MAX_FOTOS_GALERIA} fotos por publicación"}), 400

    # Una publicación de audio por día y usuario (regla de la especificación).
    if "audio" in tipos_lote:
        usados = query(
            """SELECT COUNT(DISTINCT COALESCE(galeria_id, id::text)) AS n FROM archivos
               WHERE usuario_id=%s AND tipo='audio'
                 AND created_at >= date_trunc('day', NOW())""",
            (session["user_id"],), fetchone=True)["n"]
        if usados >= AUDIOS_POR_DIA:
            return jsonify({"error": "Sólo se permite una publicación de audio por día. "
                                     "Vuelve a intentarlo mañana."}), 429

    categoria   = request.form.get("categoria", "Fantasmas")
    tipo        = request.form.get("tipo", "auto")
    asunto      = (request.form.get("asunto")      or "").strip()
    descripcion = (request.form.get("descripcion") or "").strip()
    artista     = (request.form.get("artista")     or "").strip()[:120]

    if categoria not in get_categorias():
        return jsonify({"error": "Categoría inválida"}), 400

    if session["perfil"] == 2:
        palabras = len(descripcion.split())
        if palabras > 200:
            return jsonify({"error": "La descripción no puede superar las 200 palabras"}), 400

    if es_texto:
        # Sin fichero: nombre_guardado queda vacío y nada del pipeline de
        # almacenamiento se toca. Sigue pasando por la cola de moderación.
        query(
            """INSERT INTO archivos
                 (nombre_original, nombre_guardado, categoria, tipo, asunto, descripcion,
                  estado, usuario_id)
               VALUES (%s, '', %s, 'texto', %s, %s, 'pendiente', %s)""",
            ((asunto or "Publicación de texto")[:200], categoria, asunto, descripcion,
             session["user_id"]),
            commit=True,
        )
        return jsonify({"ok": True, "mensaje": "Publicación enviada a revisión del administrador"})

    # Las fotos de una misma subida comparten galeria_id: el feed las agrupa
    # en una sola publicación. Con un archivo suelto queda en NULL y todo se
    # comporta igual que antes.
    galeria_id = uuid.uuid4().hex if len(archivos) > 1 else None
    tipo_pedido = tipo

    # Encuadre elegido en el panel: una proporción para toda la publicación
    # y una posición por fichero, en el mismo orden en que se enviaron.
    aspecto_pedido = (request.form.get("aspecto") or "").strip()
    if aspecto_pedido not in ASPECTOS_VALIDOS:
        aspecto_pedido = None
    encuadres = request.form.getlist("encuadre")

    for indice, archivo in enumerate(archivos):
        nombre_original = secure_filename(archivo.filename)
        ext = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
        nombre_guardado = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

        tipo = tipo_por_extension(nombre_original) if tipo_pedido == "auto" else tipo_pedido

        # Tope por tipo, configurable desde el panel de administración.
        if tipo == "imagen":
            clave = "peso_galeria_mb" if galeria_id else "peso_imagen_mb"
            etiqueta = "Cada foto de una galería" if galeria_id else "Una foto"
        elif tipo == "video":
            clave, etiqueta = "peso_video_mb", "Un vídeo"
        elif tipo == "audio":
            clave, etiqueta = "peso_audio_mb", "Cada pista de audio"
        else:
            clave, etiqueta = None, None

        if clave:
            tope = peso_mb(clave)
            if peso_archivo(archivo) > tope * 1024 * 1024:
                return jsonify({"error": f"{etiqueta} puede pesar como máximo "
                                         f"{tope} MB ({nombre_original})"}), 400

        # Optimizar imágenes al subir (corrige orientación, reduce tamaño y comprime).
        optimizada = optimizar_imagen(archivo, ext) if tipo == "imagen" else None
        if optimizada is not None:
            st_guardar_bytes(optimizada, f"aduana/{nombre_guardado}", archivo.mimetype)
        else:
            st_guardar(archivo, f"aduana/{nombre_guardado}")

        # El encuadre sólo aplica a lo que se ve: imagen, GIF y vídeo.
        if tipo in ("imagen", "video") and aspecto_pedido in ASPECTOS.get(tipo, []):
            aspecto = aspecto_pedido
            encuadre = limpiar_encuadre(encuadres[indice] if indice < len(encuadres) else "")
        else:
            aspecto = encuadre = None

        query(
            """INSERT INTO archivos
                 (nombre_original, nombre_guardado, categoria, tipo, asunto, descripcion,
                  estado, usuario_id, galeria_id, artista, aspecto, encuadre)
               VALUES (%s, %s, %s, %s, %s, %s, 'pendiente', %s, %s, %s, %s, %s)""",
            (nombre_original, nombre_guardado, categoria, tipo, asunto, descripcion,
             session["user_id"], galeria_id, artista or None, aspecto, encuadre),
            commit=True,
        )

    if len(archivos) > 1:
        cosa = "pistas" if es_lote_audio else "fotos"
        return jsonify({"ok": True,
                        "mensaje": f"{len(archivos)} {cosa} enviadas a revisión del administrador"})
    return jsonify({"ok": True, "mensaje": "Archivo enviado a revisión del administrador"})

# ── Archivos aprobados por categoría ──────────────────────
@app.route("/api/archivos/<categoria>")
def archivos_por_categoria(categoria):
    filas = query(
        """SELECT a.*, u.username AS subido_por, u.avatar AS autor_avatar
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.categoria=%s AND a.estado='aprobado'
             -- Una galería (photoset o lista de audio) es UNA publicación en
             -- la lista, no una entrada por archivo: entra sólo la primera.
             AND (a.galeria_id IS NULL OR a.id = (
                   SELECT MIN(x.id) FROM archivos x
                   WHERE x.galeria_id = a.galeria_id AND x.estado='aprobado'))
           ORDER BY a.created_at DESC""",
        (categoria,),
    )
    incognito = categoria == "Modo Incognito"
    uid = session.get("user_id")
    resultado = []
    for f in filas:
        resultado.append({
            "id":          f["id"],
            "nombre":      f["nombre_original"],
            "tipo":        f["tipo"],
            "asunto":      f["asunto"],
            "descripcion": f["descripcion"],
            "url":         url_de(f),
            "fecha":       f["created_at"].strftime("%d/%m/%Y"),
            "visitas":     f["visitas_count"] or 0,
            "subido_por":  "" if incognito else (f["subido_por"] or ""),
            "avatar":      "" if (incognito or not f["autor_avatar"]) else f"/api/avatar/{f['autor_avatar']}",
            "artista":     f["artista"] or "",
            # Para el botón "Seguir" del detalle: si ya lo sigo y si es mío
            # (a uno mismo no se le ofrece seguirse).
            "es_mio":      uid is not None and f["usuario_id"] == uid,
            "siguiendo":   bool(uid and f["usuario_id"] and query(
                               "SELECT 1 FROM seguidores WHERE seguidor_id=%s AND seguido_id=%s",
                               (uid, f["usuario_id"]), fetchone=True)),
            # Piezas de la galería: fotos si es un photoset, pistas si es una
            # lista de audio. Vacío cuando la publicación es de un solo archivo.
            "imagenes":    piezas_de_galeria(f["galeria_id"]) if f["tipo"] == "imagen" else [],
            "pistas":      piezas_de_galeria(f["galeria_id"]) if f["tipo"] == "audio"  else [],
        })
    return jsonify(resultado)

# ── Feed global (home tipo Tumblr) ────────────────────────
def url_de(fila):
    """URL pública del archivo, o cadena vacía en publicaciones de texto."""
    nombre = fila.get("nombre_guardado") if hasattr(fila, "get") else fila["nombre_guardado"]
    return f"/api/archivo/{nombre}" if nombre else ""

def piezas_de_galeria(galeria_id, solo_aprobadas=True):
    """Archivos de una galería (fotos o pistas), en orden de subida.

    Devuelve [] cuando la publicación es de un solo archivo, para que el
    frontend distinga sin ambigüedad entre post normal, photoset y lista.

    `solo_aprobadas=False` la usan el perfil y los paneles de moderación,
    que también muestran publicaciones pendientes o rechazadas: allí la
    galería debe verse entera, no sólo las piezas ya publicadas.
    """
    if not galeria_id:
        return []
    filtro = "AND estado='aprobado' AND oculto=FALSE" if solo_aprobadas else ""
    filas = query(
        f"""SELECT id, nombre_guardado, nombre_original, asunto, artista,
                   estado, categoria, aspecto, encuadre
            FROM archivos
            WHERE galeria_id=%s {filtro}
            ORDER BY id""",
        (galeria_id,))
    return [{"id": f["id"],
             # La aduana y lo publicado se sirven por rutas distintas.
             "url": (url_de(f) if f["estado"] == "aprobado"
                     else f"/api/aduana/{f['nombre_guardado']}"),
             "nombre": f["nombre_original"],
             "titulo": f["asunto"] or f["nombre_original"],
             "estado": f["estado"],
             "aspecto": f["aspecto"] or "",
             "encuadre": f["encuadre"] or "",
             "artista": f["artista"] or ""} for f in filas]

@app.route("/api/feed")
def feed():
    try:
        offset = max(0, int(request.args.get("offset", 0)))
        limit  = min(30, max(1, int(request.args.get("limit", 6))))
    except (TypeError, ValueError):
        offset, limit = 0, 6
    uid = session.get("user_id")
    solo_siguiendo = request.args.get("filtro") == "siguiendo" and uid is not None

    # Condiciones que debe cumplir una publicación para entrar al feed, tanto
    # si aparece por sí misma como si aparece porque alguien la reposteó.
    VISIBLE = """a.estado='aprobado' AND a.oculto=FALSE
                 -- De una galería sólo entra su primera foto: las demás se
                 -- adjuntan luego como `imagenes`, para no repetir el post.
                 AND (a.galeria_id IS NULL OR a.id = (
                       SELECT MIN(x.id) FROM archivos x
                       WHERE x.galeria_id = a.galeria_id
                         AND x.estado='aprobado' AND x.oculto=FALSE))"""

    # En "Siguiendo", un original entra si sigo a su autor y un reposteo si
    # sigo a quien lo reposteó: es la razón por la que llega a mi feed.
    f_orig = ("AND a.usuario_id IN (SELECT seguido_id FROM seguidores WHERE seguidor_id=%s) "
              if solo_siguiendo else "")
    f_rep  = ("AND rp.usuario_id IN (SELECT seguido_id FROM seguidores WHERE seguidor_id=%s) "
              if solo_siguiendo else "")

    params = []
    if solo_siguiendo:
        params += [uid, uid]          # un filtro por cada rama de la unión
    params += [uid, uid, uid, uid, limit, offset]

    filas = query(
        f"""WITH items AS (
               -- La publicación, en su sitio original
               SELECT a.id AS archivo_id, a.created_at AS orden,
                      NULL::integer AS repost_uid, NULL::timestamp AS repost_at
               FROM archivos a
               WHERE {VISIBLE} {f_orig}
               UNION ALL
               -- Y una entrada más por cada vez que alguien la reposteó
               SELECT rp.archivo_id, rp.created_at AS orden,
                      rp.usuario_id AS repost_uid, rp.created_at AS repost_at
               FROM reposts rp
               JOIN archivos a ON a.id = rp.archivo_id
               WHERE {VISIBLE} {f_rep}
           )
           SELECT a.*, u.username AS subido_por, u.avatar AS autor_avatar,
                  ru.username AS repost_por, ru.avatar AS repost_avatar,
                  i.repost_at,
                  (SELECT COUNT(*) FROM reacciones r WHERE r.archivo_id=a.id AND r.tipo='like') AS likes,
                  (SELECT COUNT(*) FROM comentarios c WHERE c.archivo_id=a.id AND c.oculto=FALSE) AS comentarios,
                  (SELECT COUNT(*) FROM reposts rr WHERE rr.archivo_id=a.id) AS reposts,
                  EXISTS(SELECT 1 FROM reacciones r WHERE r.archivo_id=a.id AND r.usuario_id=%s AND r.tipo='like') AS liked,
                  EXISTS(SELECT 1 FROM guardados g WHERE g.archivo_id=a.id AND g.usuario_id=%s) AS guardado,
                  EXISTS(SELECT 1 FROM reposts rr WHERE rr.archivo_id=a.id AND rr.usuario_id=%s) AS reposteado,
                  EXISTS(SELECT 1 FROM seguidores s WHERE s.seguidor_id=%s AND s.seguido_id=a.usuario_id) AS siguiendo
           FROM items i
           JOIN archivos a ON a.id = i.archivo_id
           LEFT JOIN usuarios u  ON u.id  = a.usuario_id
           LEFT JOIN usuarios ru ON ru.id = i.repost_uid
           ORDER BY i.orden DESC
           LIMIT %s OFFSET %s""",
        tuple(params),
    )
    resultado = []
    for f in filas:
        incognito = f["categoria"] == "Modo Incognito"
        resultado.append({
            "id":          f["id"],
            "nombre":      f["nombre_original"],
            "tipo":        f["tipo"],
            "url":         url_de(f),
            "asunto":      f["asunto"],
            "descripcion": f["descripcion"],
            "categoria":   f["categoria"],
            "fecha":       f["created_at"].strftime("%d/%m/%Y"),
            "visitas":     f["visitas_count"] or 0,
            "likes":       f["likes"],
            "comentarios": f["comentarios"],
            "liked":       bool(f["liked"]),
            "guardado":    bool(f["guardado"]),
            "siguiendo":   bool(f["siguiendo"]),
            "es_mio":      uid is not None and f["usuario_id"] == uid,
            "usuario":     "" if incognito else (f["subido_por"] or ""),
            "subido_por":  "" if incognito else (f["subido_por"] or ""),
            "avatar":      "" if (incognito or not f["autor_avatar"]) else f"/api/avatar/{f['autor_avatar']}",
            "artista":     f["artista"] or "",
            # Para el botón "Seguir" del detalle: si ya lo sigo y si es mío
            # (a uno mismo no se le ofrece seguirse).
            "es_mio":      uid is not None and f["usuario_id"] == uid,
            # Piezas de la galería: fotos si es un photoset, pistas si es una
            # lista de audio. Vacío cuando la publicación es de un solo archivo.
            "imagenes":    piezas_de_galeria(f["galeria_id"]) if f["tipo"] == "imagen" else [],
            "pistas":      piezas_de_galeria(f["galeria_id"]) if f["tipo"] == "audio"  else [],
            # Reposteo: cuántos hay, si yo lo reposteé, y —cuando esta
            # entrada del feed ES un reposteo— quién lo hizo y cuándo.
            # Encuadre elegido al subir; vacío en publicaciones antiguas.
            "aspecto":       f.get("aspecto") or "",
            "encuadre":      f.get("encuadre") or "",
            "reposts":       f["reposts"],
            "reposteado":    bool(f["reposteado"]),
            "repost_por":    f["repost_por"] or "",
            "repost_avatar": f"/api/avatar/{f['repost_avatar']}" if f["repost_avatar"] else "",
            "repost_fecha":  f["repost_at"].strftime("%d/%m/%Y") if f["repost_at"] else "",
        })
    return jsonify(resultado)

# ══════════════════════════════════════════════════════════
#  DONACIONES (PayPal)
# ══════════════════════════════════════════════════════════
# El enlace lo pega el administrador desde su panel; la aplicación nunca
# maneja credenciales ni procesa pagos: sólo abre el enlace de PayPal en
# una pestaña nueva. Se restringe a dominios de PayPal para que el botón
# no pueda convertirse en un redirector a cualquier sitio.
DOMINIOS_PAYPAL = {
    "paypal.me", "www.paypal.me",
    "paypal.com", "www.paypal.com",
}

def validar_url_paypal(url):
    """Devuelve la URL normalizada, o None si no es un enlace de PayPal."""
    u = (url or "").strip()
    if not u:
        return None
    if len(u) > 300:
        return None
    try:
        from urllib.parse import urlparse
        partes = urlparse(u)
    except Exception:
        return None
    if partes.scheme != "https":
        return None
    if partes.hostname is None or partes.hostname.lower() not in DOMINIOS_PAYPAL:
        return None
    return u

@app.route("/api/donaciones")
def donaciones_publicas():
    """Datos del botón de donación, para pintarlo en la barra superior."""
    url = validar_url_paypal(get_config("donaciones_url", ""))
    activo = get_config("donaciones_activo", "false") == "true" and bool(url)
    return jsonify({
        "activo": activo,
        "url":    url if activo else "",
        "texto":  (get_config("donaciones_texto", "") or "Donar").strip()[:40],
    })

@app.route("/api/admin/donaciones", methods=["GET", "POST"])
@login_required
@admin_required
def donaciones_admin():
    if request.method == "GET":
        return jsonify({
            "url":    get_config("donaciones_url", "") or "",
            "texto":  get_config("donaciones_texto", "") or "Donar",
            "activo": get_config("donaciones_activo", "false") == "true",
        })

    if not es_super_admin():
        return jsonify({"error": "Sólo el Super Administrador puede cambiar el enlace de donaciones"}), 403

    datos  = request.get_json() or {}
    activo = bool(datos.get("activo"))
    texto  = (datos.get("texto") or "Donar").strip()[:40] or "Donar"
    bruto  = (datos.get("url") or "").strip()

    if bruto:
        url = validar_url_paypal(bruto)
        if not url:
            return jsonify({"error": "El enlace debe ser https y de PayPal "
                                     "(paypal.me o paypal.com)"}), 400
    else:
        url, activo = "", False

    set_config("donaciones_url", url)
    set_config("donaciones_texto", texto)
    set_config("donaciones_activo", "true" if activo else "false")
    return jsonify({"ok": True, "url": url, "texto": texto, "activo": activo})

# ── Servir archivo aprobado ────────────────────────────────
@app.route("/api/archivo/<nombre_guardado>")
def servir_archivo(nombre_guardado):
    fila = query(
        "SELECT categoria FROM archivos WHERE nombre_guardado=%s AND estado='aprobado'",
        (nombre_guardado,), fetchone=True,
    )
    if not fila:
        abort(404)
    return servir_archivo_st(f"aprobados/{fila['categoria']}/{nombre_guardado}")

# ── Miniatura de un archivo aprobado (se genera y cachea al vuelo) ──
@app.route("/api/thumb/<nombre_guardado>")
def servir_thumb(nombre_guardado):
    fila = query(
        "SELECT categoria, tipo FROM archivos WHERE nombre_guardado=%s AND estado='aprobado'",
        (nombre_guardado,), fetchone=True,
    )
    if not fila:
        abort(404)
    original = f"aprobados/{fila['categoria']}/{nombre_guardado}"
    ext = nombre_guardado.rsplit(".", 1)[-1].lower() if "." in nombre_guardado else ""
    # Solo imágenes en formatos rasterizables tienen miniatura; el resto
    # (video, audio, gif animado, svg…) cae al archivo original.
    if fila["tipo"] != "imagen" or not _PIL_OK or ext not in EXT_OPTIMIZABLE:
        return servir_archivo_st(original)
    thumb_key = f"thumbs/{nombre_guardado}"
    if not st_existe(thumb_key):
        data = st_leer(original)
        mini = miniatura_bytes(data, ext) if data else None
        if not mini:
            return servir_archivo_st(original)   # fallback: original
        st_guardar_bytes(mini, thumb_key)
    return servir_archivo_st(thumb_key)

# ── Historia con marca de agua (para compartir tipo Instagram) ──
@app.route("/api/historia/<int:archivo_id>")
def historia(archivo_id):
    fila = query(
        """SELECT a.nombre_guardado, a.categoria, a.tipo, a.asunto, u.username
           FROM archivos a LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.id=%s AND a.estado='aprobado' AND a.oculto=FALSE""",
        (archivo_id,), fetchone=True)
    if not fila:
        abort(404)
    autor = "" if fila["categoria"] == "Modo Incognito" else (fila["username"] or "")
    # El video no se puede re-codificar aquí (sin ffmpeg): el cliente arma la portada.
    if fila["tipo"] == "video":
        return jsonify({"cliente": True, "tipo": "video"})
    if not _PIL_OK:
        return jsonify({"cliente": True, "tipo": fila["tipo"]})
    from flask import Response
    key = f"aprobados/{fila['categoria']}/{fila['nombre_guardado']}"
    data = st_leer(key)
    if not data:
        abort(404)
    ext = fila["nombre_guardado"].rsplit(".", 1)[-1].lower() if "." in fila["nombre_guardado"] else ""
    try:
        if ext == "gif":
            return Response(historia_gif(data, autor), mimetype="image/gif")
        if fila["tipo"] == "imagen":
            return Response(historia_imagen(data, autor, fila["asunto"]), mimetype="image/jpeg")
    except Exception as e:
        print("aviso: no se pudo generar la historia:", e)
    return jsonify({"cliente": True, "tipo": fila["tipo"]})

# ── Categorías (público: listar) ──────────────────────────
@app.route("/api/limites")
def api_limites():
    """Topes de subida vigentes, para que el panel valide con los mismos
    números que el servidor.

    Antes el navegador los llevaba escritos a mano y, al cambiarlos desde
    Administración, seguía rechazando con el valor viejo.
    """
    return jsonify({
        "imagen":     peso_mb("peso_imagen_mb"),
        "galeria":    peso_mb("peso_galeria_mb"),
        "video":      peso_mb("peso_video_mb"),
        "audio":      peso_mb("peso_audio_mb"),
        "max_fotos":  MAX_FOTOS_GALERIA,
        "max_pistas": MAX_PISTAS_LISTA,
    })

@app.route("/api/aspectos")
def api_aspectos():
    """Proporciones que ofrece el panel de subida, por tipo de medio."""
    return jsonify({**ASPECTOS, "recomendado": ASPECTO_RECOMENDADO})

@app.route("/api/categorias")
def listar_categorias():
    # Sólo nombres: lo consumen los <select> de subida y de mover archivo.
    return jsonify(get_categorias())

@app.route("/api/categorias/detalle")
def listar_categorias_detalle():
    # Nombre + icono: lo consume el grid de carpetas del dashboard.
    return jsonify(get_categorias_detalle())

# ── Categorías (admin: gestionar) ─────────────────────────
@app.route("/api/admin/categorias")
@login_required
@admin_required
def admin_listar_categorias():
    filas = query(
        """SELECT c.id, c.nombre, c.icono,
                  (SELECT COUNT(*) FROM archivos a WHERE a.categoria = c.nombre) AS archivos
           FROM categorias c
           ORDER BY (POSITION('modo inc' IN LOWER(c.nombre)) = 1), c.orden, c.id""")
    return jsonify([{"id": f["id"], "nombre": f["nombre"],
                     "icono": f["icono"] or "", "archivos": f["archivos"]} for f in filas])

# La clave del icono se guarda tal cual y el frontend la resuelve contra
# static/iconos.js. Sólo se aceptan claves con la forma de identificador,
# para que nunca llegue nada que se pueda inyectar en el DOM.
def limpiar_icono(valor):
    v = (valor or "").strip()
    if not v:
        return None
    if len(v) > 40 or not re.fullmatch(r"[a-z0-9_]+", v):
        return None
    return v

@app.route("/api/admin/categorias", methods=["POST"])
@login_required
@permiso_required("gestionar_categorias")
def crear_categoria():
    nombre = (request.get_json().get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio"}), 400
    if len(nombre) > 100:
        return jsonify({"error": "El nombre no puede superar los 100 caracteres"}), 400
    # Evitar nombres que rompan rutas de archivos en disco
    if "/" in nombre or "\\" in nombre or nombre in (".", ".."):
        return jsonify({"error": "El nombre contiene caracteres no permitidos"}), 400
    if query("SELECT id FROM categorias WHERE LOWER(nombre)=LOWER(%s)", (nombre,), fetchone=True):
        return jsonify({"error": "Ya existe una categoría con ese nombre"}), 409
    icono = limpiar_icono(request.get_json().get("icono"))
    orden = query("SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM categorias", fetchone=True)["n"]
    query("INSERT INTO categorias (nombre, orden, icono) VALUES (%s,%s,%s)",
          (nombre, orden, icono), commit=True)
    if not USAR_S3:
        os.makedirs(os.path.join(APROBADOS, nombre), exist_ok=True)
    return jsonify({"ok": True})

@app.route("/api/admin/categorias/<int:cid>/icono", methods=["POST"])
@login_required
@permiso_required("gestionar_categorias")
def cambiar_icono_categoria(cid):
    if not query("SELECT id FROM categorias WHERE id=%s", (cid,), fetchone=True):
        return jsonify({"error": "Categoría no encontrada"}), 404
    icono = limpiar_icono(request.get_json().get("icono"))
    query("UPDATE categorias SET icono=%s WHERE id=%s", (icono, cid), commit=True)
    return jsonify({"ok": True, "icono": icono or ""})

@app.route("/api/admin/categorias/<int:cid>", methods=["DELETE"])
@login_required
@permiso_required("gestionar_categorias")
def eliminar_categoria(cid):
    cat = query("SELECT nombre FROM categorias WHERE id=%s", (cid,), fetchone=True)
    if not cat:
        return jsonify({"error": "Categoría no encontrada"}), 404
    n = query("SELECT COUNT(*) AS n FROM archivos WHERE categoria=%s", (cat["nombre"],), fetchone=True)["n"]
    if n > 0:
        return jsonify({"error": f"No se puede eliminar: la categoría tiene {n} archivo(s). "
                                 "Elimina o mueve esos archivos primero."}), 400
    query("DELETE FROM categorias WHERE id=%s", (cid,), commit=True)
    return jsonify({"ok": True})

# ── Admin — pendientes ─────────────────────────────────────
@app.route("/api/admin/pendientes")
@login_required
@admin_required
def pendientes():
    # Una galería se revisa como una sola publicación: entra su primera
    # pieza y el resto viaja en `imagenes`. Aprobar o rechazar sigue
    # actuando sobre cada fichero, pero el moderador ve una tarjeta.
    filas = query(
        """SELECT a.*, u.nombre AS usuario_nombre, u.username AS usuario_username, u.email AS usuario_email
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.estado='pendiente'
             AND (a.galeria_id IS NULL OR a.id = (
                   SELECT MIN(x.id) FROM archivos x
                   WHERE x.galeria_id = a.galeria_id AND x.estado='pendiente'))
           ORDER BY a.created_at DESC"""
    )
    return jsonify([{
        "id":          f["id"],
        "nombre":      f["nombre_original"],
        "categoria":   f["categoria"],
        "tipo":        f["tipo"],
        "asunto":      f["asunto"],
        "descripcion": f["descripcion"],
        "usuario":     f["usuario_nombre"],
        "username":    f["usuario_username"] or "",
        "email":       f["usuario_email"],
        "fecha":       f["created_at"].strftime("%d/%m/%Y %H:%M"),
        "url_preview": f"/api/aduana/{f['nombre_guardado']}",
        "galeria_id":  f["galeria_id"] or "",
        "piezas":      piezas_de_galeria(f["galeria_id"], False),
    } for f in filas])

# ── Servir aduana (solo admin) ─────────────────────────────
@app.route("/api/aduana/<nombre_guardado>")
@login_required
@admin_required
def servir_aduana(nombre_guardado):
    return servir_archivo_st(f"aduana/{secure_filename(nombre_guardado)}")

# ── Admin — aprobar ────────────────────────────────────────
@app.route("/api/admin/aprobar/<int:archivo_id>", methods=["POST"])
@login_required
@permiso_required("moderar_archivos")
def aprobar(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s AND estado='pendiente'", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Archivo no encontrado"}), 404
    # Una galería se aprueba entera: el panel la muestra como una sola
    # publicación, así que aprobar sólo la primera pieza dejaría el resto
    # colgado en la cola y reaparecería como una publicación nueva.
    lote = filas_del_lote(fila, "pendiente")
    for f in lote:
        if f["nombre_guardado"]:            # las de texto no tienen fichero
            st_mover(f"aduana/{f['nombre_guardado']}",
                     f"aprobados/{f['categoria']}/{f['nombre_guardado']}")
        query("UPDATE archivos SET estado='aprobado', revisado_at=NOW(), revisado_por=%s WHERE id=%s",
              (session.get("user_id"), f["id"]), commit=True)
    return jsonify({"ok": True, "archivos": len(lote)})

def filas_del_lote(fila, estado=None):
    """Filas que forman la misma publicación que `fila`.

    Una galería se subió junta y los paneles la muestran como una sola
    publicación, así que aprobar, ocultar, mover o borrar deben actuar
    sobre todas sus piezas. Si no es un lote, devuelve sólo esa fila.
    """
    if not fila["galeria_id"]:
        return [fila]
    if estado:
        return query("SELECT * FROM archivos WHERE galeria_id=%s AND estado=%s ORDER BY id",
                     (fila["galeria_id"], estado))
    return query("SELECT * FROM archivos WHERE galeria_id=%s ORDER BY id",
                 (fila["galeria_id"],))

# ── Admin — rechazar ───────────────────────────────────────
@app.route("/api/admin/rechazar/<int:archivo_id>", methods=["POST"])
@login_required
@permiso_required("moderar_archivos")
def rechazar(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s AND estado='pendiente'", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Archivo no encontrado"}), 404
    # Se rechaza el lote completo, por el mismo motivo que se aprueba entero.
    lote = filas_del_lote(fila, "pendiente")
    for f in lote:
        if f["nombre_guardado"]:
            borrar_archivo(f"aduana/{f['nombre_guardado']}")
        query("UPDATE archivos SET estado='rechazado', revisado_at=NOW(), revisado_por=%s WHERE id=%s",
              (session.get("user_id"), f["id"]), commit=True)
    return jsonify({"ok": True, "archivos": len(lote)})

# ── Admin — usuarios ───────────────────────────────────────
@app.route("/api/admin/usuarios")
@login_required
@admin_required
def listar_usuarios():
    filas = query(
        "SELECT id, nombre, username, email, perfil, puede_subir, bloqueado, created_at FROM usuarios ORDER BY id"
    )
    return jsonify([{
        "id":          f["id"],
        "nombre":      f["nombre"],
        "username":    f["username"],
        "email":       f["email"],
        "perfil":      f["perfil"],
        "puede_subir": f["puede_subir"],
        "bloqueado":   f["bloqueado"],
        "fecha":       f["created_at"].strftime("%d/%m/%Y"),
    } for f in filas])

@app.route("/api/admin/usuarios/<int:uid>/bloquear", methods=["POST"])
@login_required
@permiso_required("gestionar_usuarios")
def bloquear(uid):
    query("UPDATE usuarios SET bloqueado=TRUE WHERE id=%s", (uid,), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/desbloquear", methods=["POST"])
@login_required
@permiso_required("gestionar_usuarios")
def desbloquear(uid):
    query("UPDATE usuarios SET bloqueado=FALSE WHERE id=%s", (uid,), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/perfil", methods=["POST"])
@login_required
@permiso_required("gestionar_usuarios")
def cambiar_perfil(uid):
    perfil = request.get_json().get("perfil")
    if perfil not in (0, 1, 2, 3):
        return jsonify({"error": "Perfil inválido"}), 400
    # Solo el Super Admin puede asignar/quitar roles de administración (0 y 1).
    if perfil in (0, 1) and not es_super_admin():
        return jsonify({"error": "Solo el Super Administrador puede asignar roles de administración"}), 403
    # Un admin no puede tocar a un Super Admin.
    objetivo = query("SELECT perfil FROM usuarios WHERE id=%s", (uid,), fetchone=True)
    if objetivo and objetivo["perfil"] == 0 and not es_super_admin():
        return jsonify({"error": "No puedes modificar a un Super Administrador"}), 403
    query("UPDATE usuarios SET perfil=%s WHERE id=%s", (perfil, uid), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/subida", methods=["POST"])
@login_required
@permiso_required("gestionar_usuarios")
def toggle_subida(uid):
    habilitado = request.get_json().get("habilitado", True)
    query("UPDATE usuarios SET puede_subir=%s WHERE id=%s", (habilitado, uid), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/password", methods=["POST"])
@login_required
@permiso_required("gestionar_usuarios")
def cambiar_password(uid):
    nueva = request.get_json().get("password") or ""
    if len(nueva) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400
    query("UPDATE usuarios SET password=%s WHERE id=%s", (generate_password_hash(nueva), uid), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>", methods=["DELETE"])
@login_required
@permiso_required("gestionar_usuarios")
def eliminar_usuario(uid):
    if uid == session["user_id"]:
        return jsonify({"error": "No puedes eliminarte a ti mismo"}), 400
    query("DELETE FROM usuarios WHERE id=%s", (uid,), commit=True)
    return jsonify({"ok": True})


@app.route("/api/admin/archivos/<int:archivo_id>/descripcion", methods=["POST"])
@login_required
@admin_required
def editar_descripcion(archivo_id):
    descripcion = (request.get_json().get("descripcion") or "").strip()
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "No encontrado"}), 404
    for f in filas_del_lote(fila):
        query("UPDATE archivos SET descripcion=%s WHERE id=%s", (descripcion, f["id"]), commit=True)
    return jsonify({"ok": True})

@app.route("/api/comentarios/<int:cid>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_comentario(cid):
    query("UPDATE comentarios SET oculto=TRUE WHERE id=%s", (cid,), commit=True)
    return jsonify({"ok": True})


# ── Buscador global ───────────────────────────────────────
@app.route("/api/buscar")
def buscar():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify([])
    like = f"%{q}%"
    filas = query(
        """SELECT id, nombre_original, tipo, asunto, categoria, nombre_guardado
           FROM archivos
           WHERE estado='aprobado' AND oculto=FALSE
             AND (asunto ILIKE %s OR descripcion ILIKE %s OR nombre_original ILIKE %s)
           ORDER BY created_at DESC LIMIT 20""",
        (like, like, like)
    )
    return jsonify([{
        "id":        f["id"],
        "nombre":    f["nombre_original"],
        "tipo":      f["tipo"],
        "asunto":    f["asunto"] or f["nombre_original"],
        "categoria": f["categoria"],
    } for f in filas])

# ── Estadísticas admin ────────────────────────────────────
@app.route("/api/admin/estadisticas")
@login_required
@admin_required
def estadisticas():
    total_archivos  = query("SELECT COUNT(*) n FROM archivos WHERE estado='aprobado'", fetchone=True)["n"]
    total_pendientes = query("SELECT COUNT(*) n FROM archivos WHERE estado='pendiente'", fetchone=True)["n"]
    total_usuarios  = query("SELECT COUNT(*) n FROM usuarios", fetchone=True)["n"]
    total_likes     = query("SELECT COUNT(*) n FROM reacciones WHERE tipo='like'", fetchone=True)["n"]
    total_comentarios = query("SELECT COUNT(*) n FROM comentarios WHERE oculto=FALSE", fetchone=True)["n"]
    total_guardados = query("SELECT COUNT(*) n FROM guardados", fetchone=True)["n"]
    # `visitas_count` va en el SELECT y en el GROUP BY: el panel muestra
    # "♥ n · n visitas" y sin este campo salía "undefined visitas".
    top_archivos = query(
        """SELECT a.id, a.asunto, a.nombre_original, a.categoria,
                  COALESCE(a.visitas_count, 0) AS visitas,
                  COUNT(r.id) likes
           FROM archivos a
           LEFT JOIN reacciones r ON r.archivo_id=a.id AND r.tipo='like'
           WHERE a.estado='aprobado'
           GROUP BY a.id ORDER BY likes DESC LIMIT 5""")
    total_visitas = query(
        "SELECT COALESCE(SUM(visitas_count), 0) AS n FROM archivos",
        fetchone=True)["n"]
    total_rechazados = query(
        "SELECT COUNT(*) n FROM archivos WHERE estado='rechazado'", fetchone=True)["n"]

    # ── Series para los gráficos del panel ──
    # Subidas por día de los últimos 30. La consulta sólo devuelve los días
    # con actividad, así que los huecos se rellenan aquí: una línea con
    # días ausentes se lee como si no hubiera pasado el tiempo.
    filas_dia = query(
        """SELECT created_at::date AS d, COUNT(*) n
           FROM archivos
           WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
           GROUP BY d""")
    conteo = {f["d"]: f["n"] for f in filas_dia}
    hoy = datetime.now().date()
    por_dia = []
    for i in range(29, -1, -1):
        d = hoy - timedelta(days=i)
        por_dia.append({"fecha": d.strftime("%d/%m"), "iso": d.isoformat(),
                        "n": conteo.get(d, 0)})

    por_categoria = query(
        """SELECT categoria, COUNT(*) n FROM archivos
           WHERE estado='aprobado' GROUP BY categoria ORDER BY n DESC, categoria""")
    por_tipo = query(
        """SELECT tipo, COUNT(*) n FROM archivos
           WHERE estado='aprobado' GROUP BY tipo ORDER BY n DESC""")

    return jsonify({
        "total_rechazados":  total_rechazados,
        "por_dia":       por_dia,
        "por_categoria": [{"nombre": f["categoria"], "n": f["n"]} for f in por_categoria],
        "por_tipo":      [{"nombre": f["tipo"], "n": f["n"]} for f in por_tipo],
        # El panel lee estas claves con prefijo `total_`; las seis salían
        # como "undefined" porque aquí se devolvían sin él.
        "total_archivos":    total_archivos,
        "total_pendientes":  total_pendientes,
        "total_usuarios":    total_usuarios,
        "total_likes":       total_likes,
        "total_comentarios": total_comentarios,
        "total_guardados":   total_guardados,
        "total_visitas":     total_visitas,
        "top_archivos": [{"id": f["id"],
                          "asunto": f["asunto"] or f["nombre_original"],
                          "categoria": f["categoria"],
                          "likes": f["likes"],
                          "visitas": f["visitas"]} for f in top_archivos],
    })

# ── Limitar intentos de login ─────────────────────────────
def check_rate_limit(email, ip, max_intentos=5, ventana_min=15):
    desde = f"NOW() - INTERVAL '{ventana_min} minutes'"
    intentos = query(
        f"SELECT COUNT(*) n FROM login_intentos WHERE (email=%s OR ip=%s) AND created_at > {desde}",
        (email, ip), fetchone=True)["n"]
    return intentos < max_intentos

def registrar_intento(email, ip):
    query("INSERT INTO login_intentos (email, ip) VALUES (%s,%s)", (email, ip), commit=True)

# ── Contador de visitas ───────────────────────────────────
@app.route("/api/archivos/<int:archivo_id>/visita", methods=["POST"])
def registrar_visita(archivo_id):
    uid = session.get("user_id")
    ip  = get_client_ip()
    query("INSERT INTO visitas (archivo_id, usuario_id, ip) VALUES (%s,%s,%s)",
          (archivo_id, uid, ip), commit=True)
    query("UPDATE archivos SET visitas_count = visitas_count + 1 WHERE id=%s",
          (archivo_id,), commit=True)
    return jsonify({"ok": True})

# ── Reportes ──────────────────────────────────────────────
@app.route("/api/reportar", methods=["POST"])
def reportar():
    data = request.get_json()
    tipo      = data.get("tipo")      # 'archivo' o 'comentario'
    objeto_id = data.get("objeto_id")
    motivo    = (data.get("motivo") or "").strip()[:500]
    if tipo not in ("archivo","comentario") or not objeto_id:
        return jsonify({"error":"Inválido"}), 400
    uid = session.get("user_id")
    ip  = get_client_ip()
    query("INSERT INTO reportes (tipo, objeto_id, usuario_id, ip, motivo) VALUES (%s,%s,%s,%s,%s)",
          (tipo, objeto_id, uid, ip, motivo), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/reportes")
@login_required
@admin_required
def get_reportes():
    filas = query(
        "SELECT * FROM reportes WHERE resuelto=FALSE ORDER BY created_at DESC")
    return jsonify([{
        "id":        f["id"],
        "tipo":      f["tipo"],
        "objeto_id": f["objeto_id"],
        "motivo":    f["motivo"],
        "fecha":     f["created_at"].strftime("%d/%m/%Y %H:%M"),
    } for f in filas])

@app.route("/api/admin/reportes/<int:rid>/resolver", methods=["POST"])
@login_required
@permiso_required("gestionar_reportes")
def resolver_reporte(rid):
    query("UPDATE reportes SET resuelto=TRUE WHERE id=%s", (rid,), commit=True)
    return jsonify({"ok": True})


# ── Repostear ─────────────────────────────────────────────
@app.route("/api/archivos/<int:archivo_id>/repost", methods=["POST"])
@login_required
def repostear(archivo_id):
    """Interruptor de reposteo. Sólo para usuarios registrados: el decorador
    `login_required` lo garantiza en el servidor, no sólo en la interfaz."""
    uid = session.get("user_id")
    fila = query("SELECT id, usuario_id FROM archivos "
                 "WHERE id=%s AND estado='aprobado' AND oculto=FALSE",
                 (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Publicación no disponible"}), 404

    ya = query("SELECT id FROM reposts WHERE usuario_id=%s AND archivo_id=%s",
               (uid, archivo_id), fetchone=True)
    if ya:
        query("DELETE FROM reposts WHERE id=%s", (ya["id"],), commit=True)
        reposteado = False
    else:
        query("INSERT INTO reposts (usuario_id, archivo_id) VALUES (%s,%s) "
              "ON CONFLICT DO NOTHING", (uid, archivo_id), commit=True)
        reposteado = True
        # Avisar al autor, salvo que se reposte a sí mismo.
        if fila["usuario_id"] and fila["usuario_id"] != uid:
            try:
                crear_notificacion(fila["usuario_id"], uid, "repost", archivo_id)
            except Exception:
                pass

    n = query("SELECT COUNT(*) n FROM reposts WHERE archivo_id=%s",
              (archivo_id,), fetchone=True)["n"]
    return jsonify({"ok": True, "reposteado": reposteado, "reposts": n})


# ══ BUSCADOR ══
@app.route("/api/archivos/<int:archivo_id>/reaccion", methods=["POST"])
def reaccionar(archivo_id):
    tipo = request.get_json().get("tipo")
    if tipo not in ("like", "dislike"):
        return jsonify({"error": "Tipo inválido"}), 400

    usuario_id = session.get("user_id")
    ip = get_client_ip()

    if usuario_id:
        existente = query(
            "SELECT id, tipo FROM reacciones WHERE archivo_id=%s AND usuario_id=%s",
            (archivo_id, usuario_id), fetchone=True)
        if existente:
            if existente["tipo"] == tipo:
                query("DELETE FROM reacciones WHERE id=%s", (existente["id"],), commit=True)
                accion = "eliminada"
            else:
                query("UPDATE reacciones SET tipo=%s WHERE id=%s", (tipo, existente["id"]), commit=True)
                accion = "cambiada"
        else:
            query("INSERT INTO reacciones (archivo_id, usuario_id, tipo) VALUES (%s,%s,%s)",
                  (archivo_id, usuario_id, tipo), commit=True)
            accion = "agregada"
            if tipo == "like":
                dueno = query("SELECT usuario_id FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
                if dueno:
                    crear_notificacion(dueno["usuario_id"], usuario_id, "like", archivo_id)
    else:
        existente = query(
            "SELECT id, tipo FROM reacciones WHERE archivo_id=%s AND ip=%s AND usuario_id IS NULL",
            (archivo_id, ip), fetchone=True)
        if existente:
            if existente["tipo"] == tipo:
                query("DELETE FROM reacciones WHERE id=%s", (existente["id"],), commit=True)
                accion = "eliminada"
            else:
                query("UPDATE reacciones SET tipo=%s WHERE id=%s", (tipo, existente["id"]), commit=True)
                accion = "cambiada"
        else:
            query("INSERT INTO reacciones (archivo_id, ip, tipo) VALUES (%s,%s,%s)",
                  (archivo_id, ip, tipo), commit=True)
            accion = "agregada"

    conteos = query(
        "SELECT tipo, COUNT(*) as n FROM reacciones WHERE archivo_id=%s GROUP BY tipo",
        (archivo_id,))
    likes = next((r["n"] for r in conteos if r["tipo"] == "like"), 0)
    dislikes = next((r["n"] for r in conteos if r["tipo"] == "dislike"), 0)
    return jsonify({"ok": True, "accion": accion, "likes": likes, "dislikes": dislikes})

@app.route("/api/archivos/<int:archivo_id>/reacciones")
def get_reacciones(archivo_id):
    conteos = query(
        "SELECT tipo, COUNT(*) as n FROM reacciones WHERE archivo_id=%s GROUP BY tipo",
        (archivo_id,))
    likes    = next((r["n"] for r in conteos if r["tipo"] == "like"), 0)
    dislikes = next((r["n"] for r in conteos if r["tipo"] == "dislike"), 0)
    mi_reaccion = None
    if session.get("user_id"):
        r = query("SELECT tipo FROM reacciones WHERE archivo_id=%s AND usuario_id=%s",
                  (archivo_id, session["user_id"]), fetchone=True)
        if r: mi_reaccion = r["tipo"]
    return jsonify({"likes": likes, "dislikes": dislikes, "mi_reaccion": mi_reaccion})

# ── Comentarios ───────────────────────────────────────────
@app.route("/api/archivos/<int:archivo_id>/comentarios")
def get_comentarios(archivo_id):
    filas = query(
        """SELECT c.*, u.username, u.nombre as u_nombre
           FROM comentarios c
           LEFT JOIN usuarios u ON u.id = c.usuario_id
           WHERE c.archivo_id=%s AND c.oculto=FALSE
           ORDER BY c.created_at ASC""",
        (archivo_id,))
    return jsonify([{
        "id":      f["id"],
        "texto":   f["texto"],
        "autor":   f["username"] or f["nombre_anon"] or "Anónimo",
        "fecha":   f["created_at"].strftime("%d/%m/%Y %H:%M"),
        "es_mio":  f["usuario_id"] == session.get("user_id"),
    } for f in filas])

@app.route("/api/archivos/<int:archivo_id>/comentarios", methods=["POST"])
def agregar_comentario(archivo_id):
    data  = request.get_json()
    texto = (data.get("texto") or "").strip()
    if not texto or len(texto) > 1000:
        return jsonify({"error": "Comentario inválido"}), 400

    usuario_id  = session.get("user_id")
    nombre_anon = (data.get("nombre") or "Anónimo").strip()[:80] if not usuario_id else None

    query(
        "INSERT INTO comentarios (archivo_id, usuario_id, nombre_anon, texto) VALUES (%s,%s,%s,%s)",
        (archivo_id, usuario_id, nombre_anon, texto), commit=True)
    if usuario_id:
        dueno = query("SELECT usuario_id FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
        if dueno:
            crear_notificacion(dueno["usuario_id"], usuario_id, "comentario", archivo_id)
    return jsonify({"ok": True})

@app.route("/api/archivos/<int:archivo_id>/guardar", methods=["POST"])
@login_required
def guardar_archivo(archivo_id):
    uid = session["user_id"]
    existente = query("SELECT id FROM guardados WHERE archivo_id=%s AND usuario_id=%s",
                      (archivo_id, uid), fetchone=True)
    if existente:
        query("DELETE FROM guardados WHERE archivo_id=%s AND usuario_id=%s",
              (archivo_id, uid), commit=True)
        return jsonify({"ok": True, "guardado": False})
    else:
        query("INSERT INTO guardados (archivo_id, usuario_id) VALUES (%s,%s)",
              (archivo_id, uid), commit=True)
        return jsonify({"ok": True, "guardado": True})

@app.route("/api/usuario/guardados")
@login_required
def mis_guardados():
    uid = session["user_id"]
    filas = query(
        """SELECT a.*, u.username AS subido_por
           FROM guardados g
           JOIN archivos a ON a.id = g.archivo_id
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE g.usuario_id=%s AND a.estado='aprobado' AND a.oculto=FALSE
           ORDER BY g.created_at DESC""",
        (uid,))
    return jsonify([{
        "id":          f["id"],
        "nombre":      f["nombre_original"],
        "tipo":        f["tipo"],
        "asunto":      f["asunto"],
        "descripcion": f["descripcion"],
        "url":         url_de(f),
        "fecha":       f["created_at"].strftime("%d/%m/%Y"),
        "subido_por":  "" if f["categoria"] == "Modo Incognito" else (f["subido_por"] or ""),
        "categoria":   f["categoria"],
    } for f in filas])

def _post_de_fila(f):
    """Publicación en el formato que consume la tarjeta del perfil."""
    incognito = f["categoria"] == "Modo Incognito"
    return {
        "id":          f["id"],
        "nombre":      f["nombre_original"],
        "tipo":        f["tipo"],
        "asunto":      f["asunto"],
        "descripcion": f["descripcion"],
        "categoria":   f["categoria"],
        "estado":      f["estado"],
        "url":         url_de(f),
        "fecha":       f["created_at"].strftime("%d/%m/%Y"),
        "subido_por":  "" if incognito else (f.get("subido_por") or ""),
        "aspecto":     f["aspecto"] or "",
        "encuadre":    f["encuadre"] or "",
        "imagenes":    piezas_de_galeria(f["galeria_id"]) if f["tipo"] == "imagen" else [],
        "pistas":      piezas_de_galeria(f["galeria_id"]) if f["tipo"] == "audio"  else [],
    }

# De una galería sólo entra su primera pieza: el resto viaja en `imagenes`.
_SOLO_PRIMERA = """AND (a.galeria_id IS NULL OR a.id = (
                        SELECT MIN(x.id) FROM archivos x
                        WHERE x.galeria_id = a.galeria_id
                          AND x.estado='aprobado' AND x.oculto=FALSE))"""

@app.route("/api/usuario/reposts")
@login_required
def mis_reposts():
    """Publicaciones que he reposteado, propias o de otros."""
    filas = query(
        f"""SELECT a.*, u.username AS subido_por
            FROM reposts rp
            JOIN archivos a ON a.id = rp.archivo_id
            LEFT JOIN usuarios u ON u.id = a.usuario_id
            WHERE rp.usuario_id=%s AND a.estado='aprobado' AND a.oculto=FALSE
              {_SOLO_PRIMERA}
            ORDER BY rp.created_at DESC""",
        (session["user_id"],))
    return jsonify([_post_de_fila(f) for f in filas])

@app.route("/api/usuario/likes")
@login_required
def mis_likes():
    """Publicaciones a las que he dado me gusta."""
    filas = query(
        f"""SELECT a.*, u.username AS subido_por
            FROM reacciones r
            JOIN archivos a ON a.id = r.archivo_id
            LEFT JOIN usuarios u ON u.id = a.usuario_id
            WHERE r.usuario_id=%s AND r.tipo='like'
              AND a.estado='aprobado' AND a.oculto=FALSE
              {_SOLO_PRIMERA}
            ORDER BY r.id DESC""",
        (session["user_id"],))
    return jsonify([_post_de_fila(f) for f in filas])

@app.route("/api/usuario/publicaciones")
@login_required
def mis_publicaciones():
    uid = session["user_id"]
    # De una galería entra sólo su primera pieza; las demás se adjuntan
    # como `imagenes`/`pistas`. Antes cada foto salía como una publicación
    # distinta y una galería de cuatro se veía cuatro veces.
    filas = query(
        """SELECT * FROM archivos
           WHERE usuario_id=%s
             AND (galeria_id IS NULL OR id = (
                   SELECT MIN(x.id) FROM archivos x
                   WHERE x.galeria_id = archivos.galeria_id AND x.usuario_id=%s))
           ORDER BY created_at DESC""",
        (uid, uid))
    return jsonify([{
        "id":        f["id"],
        "nombre":    f["nombre_original"],
        "tipo":      f["tipo"],
        "asunto":    f["asunto"],
        "descripcion": f["descripcion"],
        "categoria": f["categoria"],
        "estado":    f["estado"],
        "oculto":    f["oculto"],
        "aspecto":   f["aspecto"] or "",
        "encuadre":  f["encuadre"] or "",
        "fecha":     f["created_at"].strftime("%d/%m/%Y"),
        "url":       f"/api/archivo/{f['nombre_guardado']}" if f["estado"] == "aprobado" else f"/api/aduana/{f['nombre_guardado']}",
        "imagenes":  piezas_de_galeria(f["galeria_id"], False) if f["tipo"] == "imagen" else [],
        "pistas":    piezas_de_galeria(f["galeria_id"], False) if f["tipo"] == "audio"  else [],
    } for f in filas])

# ── Mi cuenta: perfil, avatar, editar/eliminar mis publicaciones ──
@app.route("/api/usuario/perfil", methods=["POST"])
@login_required
def editar_mi_perfil():
    data     = request.get_json() or {}
    nombre   = (data.get("nombre") or "").strip()
    username = (data.get("username") or "").strip().lower()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not nombre or not username or not email:
        return jsonify({"error": "Nombre, usuario y correo son obligatorios"}), 400
    if not username_valido(username):
        return jsonify({"error": "Nombre de usuario inválido (3-30, letras/números/._)"}), 400
    if password and len(password) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400
    uid = session["user_id"]
    if query("SELECT id FROM usuarios WHERE email=%s AND id<>%s", (email, uid), fetchone=True):
        return jsonify({"error": "Ese correo ya está en uso"}), 409
    if query("SELECT id FROM usuarios WHERE username=%s AND id<>%s", (username, uid), fetchone=True):
        return jsonify({"error": "Ese nombre de usuario ya está en uso"}), 409
    query("UPDATE usuarios SET nombre=%s, username=%s, email=%s WHERE id=%s",
          (nombre, username, email, uid), commit=True)
    if password:
        query("UPDATE usuarios SET password=%s WHERE id=%s", (generate_password_hash(password), uid), commit=True)
    session["nombre"] = nombre; session["username"] = username; session["email"] = email
    return jsonify({"ok": True})

@app.route("/api/usuario/avatar", methods=["POST"])
@login_required
def subir_avatar():
    archivo = request.files.get("file")
    if not archivo or archivo.filename == "":
        return jsonify({"error": "No se recibió ninguna imagen"}), 400
    ext = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else ""
    if ext not in EXT_IMAGEN:
        return jsonify({"error": "El avatar debe ser una imagen (jpg, png, webp, gif...)"}), 400
    nombre = f"{uuid.uuid4().hex}.{ext}"
    st_guardar(archivo, f"avatares/{nombre}")
    uid = session["user_id"]
    anterior = query("SELECT avatar FROM usuarios WHERE id=%s", (uid,), fetchone=True)
    query("UPDATE usuarios SET avatar=%s WHERE id=%s", (nombre, uid), commit=True)
    session["avatar"] = nombre
    if anterior and anterior["avatar"]:
        borrar_archivo(f"avatares/{anterior['avatar']}")
    return jsonify({"ok": True, "avatar": f"/api/avatar/{nombre}"})

@app.route("/api/avatar/<nombre>")
def servir_avatar(nombre):
    return servir_archivo_st(f"avatares/{secure_filename(nombre)}")

@app.route("/api/usuario/publicaciones/<int:archivo_id>", methods=["POST"])
@login_required
def editar_mi_publicacion(archivo_id):
    data = request.get_json() or {}
    asunto      = (data.get("asunto") or "").strip()
    descripcion = (data.get("descripcion") or "").strip()
    if not asunto:
        return jsonify({"error": "El asunto es obligatorio"}), 400
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Publicación no encontrada"}), 404
    if fila["usuario_id"] != session["user_id"]:
        return jsonify({"error": "No es tu publicación"}), 403
    # Asunto y descripción son de la publicación, no de cada foto suelta.
    for f in filas_del_lote(fila):
        if f["usuario_id"] != session["user_id"]:
            continue
        query("UPDATE archivos SET asunto=%s, descripcion=%s WHERE id=%s",
              (asunto, descripcion, f["id"]), commit=True)
    return jsonify({"ok": True})

@app.route("/api/usuario/publicaciones/<int:archivo_id>", methods=["DELETE"])
@login_required
def eliminar_mi_publicacion(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Publicación no encontrada"}), 404
    if fila["usuario_id"] != session["user_id"]:
        return jsonify({"error": "No es tu publicación"}), 403
    lote = filas_del_lote(fila)
    for f in lote:
        # Sólo lo propio, aunque la galería tuviera piezas de otro dueño.
        if f["usuario_id"] != session["user_id"]:
            continue
        borrar_archivo(key_de_archivo(f))
        borrar_archivo(f"thumbs/{f['nombre_guardado']}")
        query("DELETE FROM archivos WHERE id=%s", (f["id"],), commit=True)
    return jsonify({"ok": True, "archivos": len(lote)})

# ── Perfil público de un usuario ──────────────────────────
@app.route("/api/usuario/<username>/perfil")
def perfil_publico(username):
    u = query("SELECT id, nombre, username, avatar FROM usuarios WHERE username=%s",
              (username.strip().lower(),), fetchone=True)
    if not u:
        return jsonify({"error": "Usuario no encontrado"}), 404
    uid_visor = session.get("user_id")
    seguidores = query("SELECT COUNT(*) AS n FROM seguidores WHERE seguido_id=%s", (u["id"],), fetchone=True)["n"]
    siguiendo  = query("SELECT COUNT(*) AS n FROM seguidores WHERE seguidor_id=%s", (u["id"],), fetchone=True)["n"]
    sigo = bool(uid_visor and query(
        "SELECT 1 FROM seguidores WHERE seguidor_id=%s AND seguido_id=%s",
        (uid_visor, u["id"]), fetchone=True))
    # Publicaciones públicas (aprobadas, visibles, sin incluir Modo Incognito para no revelar identidad)
    filas = query(
        """SELECT id, nombre_original, nombre_guardado, tipo, asunto, descripcion,
                  categoria, created_at, visitas_count
           FROM archivos
           WHERE usuario_id=%s AND estado='aprobado' AND oculto=FALSE AND categoria<>'Modo Incognito'
           ORDER BY created_at DESC""",
        (u["id"],))
    publicaciones = [{
        "id":          f["id"],
        "tipo":        f["tipo"],
        "url":         url_de(f),
        "asunto":      f["asunto"],
        "descripcion": f["descripcion"],
        "categoria":   f["categoria"],
        "fecha":       f["created_at"].strftime("%d/%m/%Y"),
        "visitas":     f["visitas_count"] or 0,
    } for f in filas]
    return jsonify({
        "username":      u["username"],
        "nombre":        u["nombre"],
        "avatar":        f"/api/avatar/{u['avatar']}" if u["avatar"] else None,
        "seguidores":    seguidores,
        "siguiendo":     siguiendo,
        "sigo":          sigo,
        "es_mio":        uid_visor == u["id"],
        "autenticado":   uid_visor is not None,
        "publicaciones": publicaciones,
    })

# ── Seguir / dejar de seguir a un usuario ─────────────────
@app.route("/api/usuario/<username>/seguir", methods=["POST"])
@login_required
def toggle_seguir(username):
    objetivo = query("SELECT id FROM usuarios WHERE username=%s", (username.strip().lower(),), fetchone=True)
    if not objetivo:
        return jsonify({"error": "Usuario no encontrado"}), 404
    uid = session["user_id"]
    if objetivo["id"] == uid:
        return jsonify({"error": "No puedes seguirte a ti mismo"}), 400
    existe = query("SELECT 1 FROM seguidores WHERE seguidor_id=%s AND seguido_id=%s",
                   (uid, objetivo["id"]), fetchone=True)
    if existe:
        query("DELETE FROM seguidores WHERE seguidor_id=%s AND seguido_id=%s", (uid, objetivo["id"]), commit=True)
        return jsonify({"ok": True, "siguiendo": False})
    query("INSERT INTO seguidores (seguidor_id, seguido_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",
          (uid, objetivo["id"]), commit=True)
    crear_notificacion(objetivo["id"], uid, "seguir")
    return jsonify({"ok": True, "siguiendo": True})

# ── Listas de seguidores / seguidos ───────────────────────
def _lista_usuarios(sql, params):
    filas = query(sql, params)
    return jsonify([{
        "username": f["username"],
        "nombre":   f["nombre"],
        "avatar":   f"/api/avatar/{f['avatar']}" if f["avatar"] else None,
    } for f in filas])

@app.route("/api/usuario/<username>/seguidores")
def lista_seguidores(username):
    u = query("SELECT id FROM usuarios WHERE username=%s", (username.strip().lower(),), fetchone=True)
    if not u:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return _lista_usuarios(
        """SELECT us.username, us.nombre, us.avatar
           FROM seguidores s JOIN usuarios us ON us.id = s.seguidor_id
           WHERE s.seguido_id=%s ORDER BY s.created_at DESC""", (u["id"],))

@app.route("/api/usuario/<username>/siguiendo")
def lista_siguiendo(username):
    u = query("SELECT id FROM usuarios WHERE username=%s", (username.strip().lower(),), fetchone=True)
    if not u:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return _lista_usuarios(
        """SELECT us.username, us.nombre, us.avatar
           FROM seguidores s JOIN usuarios us ON us.id = s.seguido_id
           WHERE s.seguidor_id=%s ORDER BY s.created_at DESC""", (u["id"],))

# ── Notificaciones ────────────────────────────────────────
@app.route("/api/notificaciones")
@login_required
def get_notificaciones():
    uid = session["user_id"]
    filas = query(
        """SELECT n.id, n.tipo, n.archivo_id, n.leida, n.created_at,
                  u.username AS actor, u.avatar AS actor_avatar,
                  a.categoria, a.asunto
           FROM notificaciones n
           LEFT JOIN usuarios u ON u.id = n.actor_id
           LEFT JOIN archivos a ON a.id = n.archivo_id
           WHERE n.usuario_id=%s
           ORDER BY n.created_at DESC
           LIMIT 40""", (uid,))
    def texto(f):
        act = '@' + (f["actor"] or 'alguien')
        if f["tipo"] == "seguir":     return f"{act} empezó a seguirte"
        if f["tipo"] == "comentario": return f"{act} comentó tu publicación"
        if f["tipo"] == "like":       return f"a {act} le gustó tu publicación"
        if f["tipo"] == "repost":     return f"{act} reposteó tu publicación"
        return f"{act}"
    def enlace(f):
        if f["archivo_id"] and f["categoria"]:
            return f"/carpeta.html?cat={f['categoria']}&archivo={f['archivo_id']}"
        if f["tipo"] == "seguir" and f["actor"]:
            return f"/perfil.html?u={f['actor']}"
        return None
    no_leidas = query("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=%s AND leida=FALSE",
                      (uid,), fetchone=True)["n"]
    return jsonify({
        "no_leidas": no_leidas,
        "items": [{
            "id":     f["id"],
            "tipo":   f["tipo"],
            "texto":  texto(f),
            "enlace": enlace(f),
            "avatar": f"/api/avatar/{f['actor_avatar']}" if f["actor_avatar"] else None,
            "leida":  f["leida"],
            "fecha":  f["created_at"].strftime("%d/%m/%Y %H:%M"),
        } for f in filas],
    })

@app.route("/api/notificaciones/count")
@login_required
def contar_notificaciones():
    uid = session["user_id"]
    n = query("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=%s AND leida=FALSE",
              (uid,), fetchone=True)["n"]
    return jsonify({"no_leidas": n})

@app.route("/api/notificaciones/leer", methods=["POST"])
@login_required
def marcar_leidas():
    query("UPDATE notificaciones SET leida=TRUE WHERE usuario_id=%s AND leida=FALSE",
          (session["user_id"],), commit=True)
    return jsonify({"ok": True})

# ── Admin — archivos publicados (gestión) ─────────────────
@app.route("/api/admin/almacenamiento")
@login_required
@admin_required
def admin_almacenamiento():
    """Cuánto ocupa el sitio, desglosado por categoría y por zona."""
    por_categoria = []
    for c in get_categorias():
        b_, n_ = st_uso(f"aprobados/{c}")
        por_categoria.append({"nombre": c, "bytes": b_, "archivos": n_})
    por_categoria.sort(key=lambda x: -x["bytes"])

    aduana_b,  aduana_n  = st_uso("aduana")
    thumbs_b,  thumbs_n  = st_uso("thumbs")
    avat_b,    avat_n    = st_uso("avatares")
    publicados_b = sum(c["bytes"] for c in por_categoria)
    publicados_n = sum(c["archivos"] for c in por_categoria)

    pendientes = query("SELECT COUNT(*) n FROM archivos WHERE estado='pendiente'",
                       fetchone=True)["n"]
    # Una galería guarda una fila por foto, así que filas y ficheros deberían
    # cuadrar uno a uno. La diferencia son restos sin dueño.
    aprobados_bd = query("SELECT COUNT(*) n FROM archivos WHERE estado='aprobado'",
                         fetchone=True)["n"]

    return jsonify({
        "total_bytes": publicados_b + aduana_b + thumbs_b + avat_b,
        "por_categoria": por_categoria,
        "zonas": [
            {"clave": "publicados", "nombre": "Publicado",   "bytes": publicados_b, "archivos": publicados_n},
            {"clave": "aduana",     "nombre": "En aduana",   "bytes": aduana_b,     "archivos": aduana_n},
            {"clave": "thumbs",     "nombre": "Miniaturas",  "bytes": thumbs_b,     "archivos": thumbs_n},
            {"clave": "avatares",   "nombre": "Avatares",    "bytes": avat_b,       "archivos": avat_n},
        ],
        # La aduana debería tener un fichero por archivo pendiente. Lo que
        # sobra son restos de publicaciones rechazadas o borradas: espacio
        # recuperable, y conviene que se vea.
        "aduana_pendientes":     pendientes,
        "aduana_huerfanos":      max(0, aduana_n - pendientes),
        "publicados_en_bd":      aprobados_bd,
        "publicados_huerfanos":  max(0, publicados_n - aprobados_bd),
    })

@app.route("/api/admin/publicados")
@login_required
@admin_required
def admin_publicados():
    filas = query(
        """SELECT a.*, u.username AS subido_por, u.nombre AS u_nombre,
                  r.username AS rev_username, r.nombre AS rev_nombre
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           LEFT JOIN usuarios r ON r.id = a.revisado_por
           WHERE a.estado='aprobado'
             AND (a.galeria_id IS NULL OR a.id = (
                   SELECT MIN(x.id) FROM archivos x
                   WHERE x.galeria_id = a.galeria_id AND x.estado='aprobado'))
           ORDER BY a.created_at DESC""")
    return jsonify([{
        "id":        f["id"],
        "nombre":    f["nombre_original"],
        "tipo":      f["tipo"],
        "asunto":      f["asunto"],
        "descripcion": f["descripcion"] or "",
        "categoria": f["categoria"],
        "oculto":    f["oculto"],
        "usuario":   f["subido_por"] or f["u_nombre"] or "–",
        "fecha":     f["created_at"].strftime("%d/%m/%Y"),
        # Trazabilidad de la aprobación. Los archivos aprobados antes de
        # existir `revisado_por` conservan la fecha pero no el autor.
        "aprobado_por": f["rev_username"] or f["rev_nombre"] or "",
        "aprobado_en":  f["revisado_at"].strftime("%d/%m/%Y %H:%M") if f["revisado_at"] else "",
        "url":       url_de(f),
        "galeria_id": f["galeria_id"] or "",
        "piezas":     piezas_de_galeria(f["galeria_id"], False),
    } for f in filas])

@app.route("/api/admin/archivos/<int:archivo_id>/ocultar", methods=["POST"])
@login_required
@permiso_required("eliminar_publicaciones")
def ocultar_archivo(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "No encontrado"}), 404
    nuevo = not fila["oculto"]
    # Ocultar sólo la primera foto dejaba el resto de la galería a la vista.
    for f in filas_del_lote(fila):
        query("UPDATE archivos SET oculto=%s WHERE id=%s", (nuevo, f["id"]), commit=True)
    return jsonify({"ok": True, "oculto": nuevo})

@app.route("/api/admin/archivos/<int:archivo_id>", methods=["DELETE"])
@login_required
@permiso_required("eliminar_publicaciones")
def eliminar_archivo_admin(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "No encontrado"}), 404
    # Se borra la publicación entera: una galería es una sola publicación
    # en el panel, y borrar sólo una foto dejaba el resto suelto.
    lote = filas_del_lote(fila)
    for f in lote:
        borrar_archivo(key_de_archivo(f))
        borrar_archivo(f"thumbs/{f['nombre_guardado']}")
        query("DELETE FROM archivos WHERE id=%s", (f["id"],), commit=True)
    return jsonify({"ok": True, "archivos": len(lote)})

@app.route("/api/admin/archivos/<int:archivo_id>/asunto", methods=["POST"])
@login_required
@admin_required
def editar_asunto(archivo_id):
    data   = request.get_json()
    asunto = (data.get("asunto") or "").strip()
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "No encontrado"}), 404
    # El asunto es de la publicación: se aplica a todas sus piezas.
    for f in filas_del_lote(fila):
        query("UPDATE archivos SET asunto=%s WHERE id=%s", (asunto, f["id"]), commit=True)
    return jsonify({"ok": True})

# ══════════════════════════════════════════════════════════
#  CONFIGURACIÓN PÚBLICA
# ══════════════════════════════════════════════════════════
@app.route("/api/config")
def config_publica():
    return jsonify({"max_content_mb": int(get_config("max_content_mb", 50))})

# ══════════════════════════════════════════════════════════
#  SOPORTE (tickets)
# ══════════════════════════════════════════════════════════
@app.route("/api/soporte", methods=["POST"])
def crear_ticket():
    data       = request.get_json() or {}
    asunto     = (data.get("asunto") or "").strip()
    comentario = (data.get("comentario") or "").strip()

    # Solo usuarios registrados pueden crear tickets.
    if session.get("user_id"):
        usuario_id = session["user_id"]
        email      = session["email"]
    else:
        email = (data.get("email") or "").strip().lower()
        if not email:
            return jsonify({"error": "Debes indicar tu correo registrado"}), 400
        user = query("SELECT id FROM usuarios WHERE email=%s", (email,), fetchone=True)
        if not user:
            return jsonify({"error": "Ese correo no está registrado. Solo usuarios registrados pueden solicitar soporte."}), 403
        usuario_id = user["id"]

    if not asunto or not comentario:
        return jsonify({"error": "El asunto y el comentario son obligatorios"}), 400
    if len(asunto) > 200:
        return jsonify({"error": "El asunto no puede superar los 200 caracteres"}), 400

    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tickets (usuario_id, email, asunto, comentario) VALUES (%s,%s,%s,%s) RETURNING id",
            (usuario_id, email, asunto, comentario))
        tid = cur.fetchone()["id"]
        numero = f"Ticket-{tid:06d}"
        cur.execute("UPDATE tickets SET numero=%s WHERE id=%s", (numero, tid))
        conn.commit()
    finally:
        conn.close()

    return jsonify({
        "ok": True,
        "numero": numero,
        "mensaje": "Favor guarda el número de solicitud para hacer la consulta",
    })

@app.route("/api/soporte/consultar")
def consultar_ticket():
    numero = (request.args.get("numero") or "").strip()
    if not numero:
        return jsonify({"error": "Indica el número de solicitud"}), 400
    t = query("SELECT numero, asunto, comentario, estado, respuesta, created_at, updated_at "
              "FROM tickets WHERE numero=%s", (numero,), fetchone=True)
    if not t:
        return jsonify({"error": "No se encontró ninguna solicitud con ese número"}), 404
    return jsonify({
        "numero":     t["numero"],
        "asunto":     t["asunto"],
        "comentario": t["comentario"],
        "estado":     t["estado"],
        "respuesta":  t["respuesta"],
        "fecha":      t["created_at"].strftime("%d/%m/%Y %H:%M"),
        "actualizado": t["updated_at"].strftime("%d/%m/%Y %H:%M"),
    })

@app.route("/api/admin/soporte")
@login_required
@admin_required
def admin_tickets():
    filas = query(
        """SELECT t.*, u.username, u.nombre AS u_nombre
           FROM tickets t
           LEFT JOIN usuarios u ON u.id = t.usuario_id
           ORDER BY (t.estado='abierto') DESC, t.created_at DESC""")
    return jsonify([{
        "id":         t["id"],
        "numero":     t["numero"],
        "asunto":     t["asunto"],
        "comentario": t["comentario"],
        "estado":     t["estado"],
        "respuesta":  t["respuesta"],
        "usuario":    t["username"] or t["u_nombre"] or "–",
        "email":      t["email"],
        "fecha":      t["created_at"].strftime("%d/%m/%Y %H:%M"),
    } for t in filas])

@app.route("/api/admin/soporte/<int:tid>/responder", methods=["POST"])
@login_required
@permiso_required("responder_soporte")
def responder_ticket(tid):
    data      = request.get_json() or {}
    respuesta = (data.get("respuesta") or "").strip()
    estado    = data.get("estado") or "respondido"
    if estado not in ("abierto", "respondido", "cerrado"):
        return jsonify({"error": "Estado inválido"}), 400
    if not respuesta and estado == "respondido":
        return jsonify({"error": "Escribe una respuesta"}), 400
    n = query("UPDATE tickets SET respuesta=%s, estado=%s, respondido_por=%s, updated_at=NOW() WHERE id=%s",
              (respuesta, estado, session["user_id"], tid), commit=True)
    if not n:
        return jsonify({"error": "Ticket no encontrado"}), 404
    return jsonify({"ok": True})

# ══════════════════════════════════════════════════════════
#  SUPER ADMIN — permisos delegables y configuración
# ══════════════════════════════════════════════════════════
@app.route("/api/superadmin/config")
@login_required
@super_admin_required
def superadmin_config():
    permisos = {k: get_config(clave, "false") == "true"
                for k, clave in PERMISOS_DELEGABLES.items()}
    return jsonify({
        "permisos": permisos,
        "max_content_mb": int(get_config("max_content_mb", 50)),
    })

@app.route("/api/superadmin/permisos", methods=["POST"])
@login_required
@super_admin_required
def superadmin_set_permiso():
    data  = request.get_json() or {}
    clave = data.get("clave")
    valor = bool(data.get("valor"))
    if clave not in PERMISOS_DELEGABLES:
        return jsonify({"error": "Permiso inválido"}), 400
    set_config(PERMISOS_DELEGABLES[clave], "true" if valor else "false")
    return jsonify({"ok": True})

# ── Editar peso máximo de subida (permiso delegable) ──────
@app.route("/api/admin/config/peso-max", methods=["POST"])
@login_required
@permiso_required("editar_peso")
def editar_peso_max():
    mb = request.get_json().get("mb")
    try:
        mb = int(mb)
    except (TypeError, ValueError):
        return jsonify({"error": "Valor inválido"}), 400
    if mb < 1 or mb > 2000:
        return jsonify({"error": "El peso debe estar entre 1 y 2000 MB"}), 400
    set_config("max_content_mb", mb)
    aplicar_peso_maximo()
    return jsonify({"ok": True, "max_content_mb": mb})

@app.route("/api/admin/config/pesos", methods=["GET", "POST"])
@login_required
@permiso_required("editar_peso")
def config_pesos():
    """Peso máximo por tipo de archivo, editable desde el panel."""
    ETIQUETAS = {
        "peso_imagen_mb":  "Imagen suelta",
        "peso_galeria_mb": "Cada foto de una galería",
        "peso_video_mb":   "Vídeo",
        "peso_audio_mb":   "Pista de audio",
    }
    if request.method == "GET":
        return jsonify({
            "pesos": [{"clave": k, "etiqueta": ETIQUETAS[k], "mb": peso_mb(k)}
                      for k in PESOS_TIPO],
            "max_content_mb": int(get_config("max_content_mb", 50)),
            "max_fotos": MAX_FOTOS_GALERIA,
            "max_pistas": MAX_PISTAS_LISTA,
        })

    datos = request.get_json() or {}
    nuevos = {}
    for clave in PESOS_TIPO:
        if clave not in datos:
            continue
        try:
            mb = int(datos[clave])
        except (TypeError, ValueError):
            return jsonify({"error": f"Valor inválido en «{ETIQUETAS[clave]}»"}), 400
        if mb < 1 or mb > 2000:
            return jsonify({"error": f"«{ETIQUETAS[clave]}» debe estar entre 1 y 2000 MB"}), 400
        nuevos[clave] = mb

    if not nuevos:
        return jsonify({"error": "No se recibió ningún valor"}), 400

    for clave, mb in nuevos.items():
        set_config(clave, mb)

    # El tope global de Flask se aplica al CUERPO ENTERO de la petición, no a
    # cada archivo. Una galería viaja en un solo envío, así que hay que
    # cubrir el lote completo: 10 fotos de 10 MB son 100 MB de petición.
    global_mb = calcular_tope_global()
    set_config("max_content_mb", global_mb)
    aplicar_peso_maximo()

    return jsonify({"ok": True, "pesos": {k: peso_mb(k) for k in PESOS_TIPO},
                    "max_content_mb": global_mb})

# ── Renombrar categoría/carpeta (permiso delegable) ───────
@app.route("/api/admin/categorias/<int:cid>/renombrar", methods=["POST"])
@login_required
@permiso_required("renombrar_carpetas")
def renombrar_categoria(cid):
    nuevo = (request.get_json().get("nombre") or "").strip()
    if not nuevo:
        return jsonify({"error": "El nombre es obligatorio"}), 400
    if len(nuevo) > 100 or "/" in nuevo or "\\" in nuevo or nuevo in (".", ".."):
        return jsonify({"error": "Nombre inválido"}), 400
    cat = query("SELECT nombre FROM categorias WHERE id=%s", (cid,), fetchone=True)
    if not cat:
        return jsonify({"error": "Categoría no encontrada"}), 404
    viejo = cat["nombre"]
    if nuevo == viejo:
        return jsonify({"ok": True})
    if query("SELECT id FROM categorias WHERE LOWER(nombre)=LOWER(%s) AND id<>%s", (nuevo, cid), fetchone=True):
        return jsonify({"error": "Ya existe una categoría con ese nombre"}), 409
    # Mover los archivos aprobados de la categoría (disco u objeto)
    for key in listar_prefijo(f"aprobados/{viejo}"):
        nombre_obj = key.rsplit("/", 1)[-1]
        st_mover(key, f"aprobados/{nuevo}/{nombre_obj}")
    if not USAR_S3:
        try: os.rmdir(os.path.join(APROBADOS, viejo))
        except OSError: pass
    query("UPDATE categorias SET nombre=%s WHERE id=%s", (nuevo, cid), commit=True)
    query("UPDATE archivos SET categoria=%s WHERE categoria=%s", (nuevo, viejo), commit=True)
    return jsonify({"ok": True})

# ── Mover un archivo a otra categoría (permiso delegable) ──
@app.route("/api/admin/archivos/<int:archivo_id>/mover", methods=["POST"])
@login_required
@permiso_required("mover_archivos")
def mover_archivo(archivo_id):
    nueva = (request.get_json().get("categoria") or "").strip()
    if nueva not in get_categorias():
        return jsonify({"error": "Categoría destino inválida"}), 400
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Archivo no encontrado"}), 404
    if fila["categoria"] == nueva:
        return jsonify({"ok": True})
    # La galería se mueve entera: repartir sus fotos entre dos categorías
    # partiría la publicación en dos.
    lote = filas_del_lote(fila)
    for f in lote:
        # Los archivos aprobados viven bajo su categoría; moverlos también en el storage.
        if f["estado"] == "aprobado":
            st_mover(f"aprobados/{f['categoria']}/{f['nombre_guardado']}",
                     f"aprobados/{nueva}/{f['nombre_guardado']}")
        query("UPDATE archivos SET categoria=%s WHERE id=%s", (nueva, f["id"]), commit=True)
    return jsonify({"ok": True, "archivos": len(lote)})

# ── Editar datos de un usuario (permiso delegable) ────────
@app.route("/api/admin/usuarios/<int:uid>/datos", methods=["POST"])
@login_required
@permiso_required("editar_usuarios")
def editar_datos_usuario(uid):
    data     = request.get_json() or {}
    nombre   = (data.get("nombre") or "").strip()
    username = (data.get("username") or "").strip().lower()
    email    = (data.get("email") or "").strip().lower()
    if not nombre or not username or not email:
        return jsonify({"error": "Todos los campos son obligatorios"}), 400
    if not username_valido(username):
        return jsonify({"error": "Nombre de usuario inválido (3-30, letras/números/._)"}), 400
    objetivo = query("SELECT perfil FROM usuarios WHERE id=%s", (uid,), fetchone=True)
    if not objetivo:
        return jsonify({"error": "Usuario no encontrado"}), 404
    if objetivo["perfil"] == 0 and not es_super_admin():
        return jsonify({"error": "No puedes editar a un Super Administrador"}), 403
    if query("SELECT id FROM usuarios WHERE email=%s AND id<>%s", (email, uid), fetchone=True):
        return jsonify({"error": "Ese correo ya está en uso"}), 409
    if query("SELECT id FROM usuarios WHERE username=%s AND id<>%s", (username, uid), fetchone=True):
        return jsonify({"error": "Ese nombre de usuario ya está en uso"}), 409
    query("UPDATE usuarios SET nombre=%s, username=%s, email=%s WHERE id=%s",
          (nombre, username, email, uid), commit=True)
    return jsonify({"ok": True})

# ── Archivos aprobados: incluir likes y oculto ────────────
# (parcheamos la ruta existente vía middleware no es posible,
#  se deja nota: la ruta /api/archivos/<categoria> ya filtra oculto=FALSE)

if __name__ == '__main__':
    # Solo para desarrollo local. En Railway sirve waitress vía Procfile.
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    app.run(debug=debug, host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
