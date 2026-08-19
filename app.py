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

def key_de_archivo(fila):
    """Devuelve la key de storage de una fila de `archivos` según su estado."""
    if fila["estado"] == "aprobado":
        return f"aprobados/{fila['categoria']}/{fila['nombre_guardado']}"
    return f"aduana/{fila['nombre_guardado']}"

# ── Optimización de imágenes (Pillow) ─────────────────────
try:
    from PIL import Image, ImageOps
    _PIL_OK = True
except Exception:
    _PIL_OK = False

MAX_LADO   = 2000   # px del lado mayor de la imagen principal
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
        if max(img.size) > MAX_LADO:
            img.thumbnail((MAX_LADO, MAX_LADO), Image.LANCZOS)
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

# ── Categorías ────────────────────────────────────────────
def get_categorias():
    """Nombres de categorías, en orden, desde la base de datos."""
    filas = query("SELECT nombre FROM categorias ORDER BY orden, id")
    return [f["nombre"] for f in filas]

def asegurar_categorias():
    """Al iniciar: siembra las categorías por defecto si la tabla está vacía
    y crea la carpeta en disco de cada categoría existente."""
    nombres = CATEGORIAS_SEED
    try:
        filas = query("SELECT nombre FROM categorias ORDER BY orden, id")
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

CONFIG_DEFAULTS = {
    "max_content_mb": os.getenv("MAX_CONTENT_MB", "50"),
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
    # Cada visitante tiene un token de sesión (se usa para validar formularios).
    if not session.get("csrf"):
        session["csrf"] = secrets.token_urlsafe(32)
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.path in CSRF_EXENTOS:
            return
        enviado = request.headers.get("X-CSRF-Token", "")
        if not enviado or enviado != session.get("csrf"):
            return jsonify({"error": "Token de seguridad inválido o expirado. Recarga la página."}), 403

@app.after_request
def set_csrf_cookie(resp):
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
    return send_from_directory("static", filename)

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

    archivo = request.files.get("file")
    if not archivo or archivo.filename == "":
        return jsonify({"error": "No se recibió ningún archivo"}), 400

    categoria   = request.form.get("categoria", "Fantasmas")
    tipo        = request.form.get("tipo", "auto")
    asunto      = (request.form.get("asunto")      or "").strip()
    descripcion = (request.form.get("descripcion") or "").strip()

    if categoria not in get_categorias():
        return jsonify({"error": "Categoría inválida"}), 400

    if session["perfil"] == 2:
        palabras = len(descripcion.split())
        if palabras > 200:
            return jsonify({"error": "La descripción no puede superar las 200 palabras"}), 400

    nombre_original = secure_filename(archivo.filename)
    ext = nombre_original.rsplit(".", 1)[-1].lower() if "." in nombre_original else ""
    nombre_guardado = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

    if tipo == "auto":
        tipo = tipo_por_extension(nombre_original)

    # Optimizar imágenes al subir (corrige orientación, reduce tamaño y comprime).
    optimizada = optimizar_imagen(archivo, ext) if tipo == "imagen" else None
    if optimizada is not None:
        st_guardar_bytes(optimizada, f"aduana/{nombre_guardado}", archivo.mimetype)
    else:
        st_guardar(archivo, f"aduana/{nombre_guardado}")

    query(
        """INSERT INTO archivos
             (nombre_original, nombre_guardado, categoria, tipo, asunto, descripcion, estado, usuario_id)
           VALUES (%s, %s, %s, %s, %s, %s, 'pendiente', %s)""",
        (nombre_original, nombre_guardado, categoria, tipo, asunto, descripcion, session["user_id"]),
        commit=True,
    )
    return jsonify({"ok": True, "mensaje": "Archivo enviado a revisión del administrador"})

# ── Archivos aprobados por categoría ──────────────────────
@app.route("/api/archivos/<categoria>")
def archivos_por_categoria(categoria):
    filas = query(
        """SELECT a.*, u.username AS subido_por, u.avatar AS autor_avatar
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.categoria=%s AND a.estado='aprobado'
           ORDER BY a.created_at DESC""",
        (categoria,),
    )
    incognito = categoria == "Modo Incognito"
    resultado = []
    for f in filas:
        resultado.append({
            "id":          f["id"],
            "nombre":      f["nombre_original"],
            "tipo":        f["tipo"],
            "asunto":      f["asunto"],
            "descripcion": f["descripcion"],
            "url":         f"/api/archivo/{f['nombre_guardado']}",
            "fecha":       f["created_at"].strftime("%d/%m/%Y"),
            "visitas":     f["visitas_count"] or 0,
            "subido_por":  "" if incognito else (f["subido_por"] or ""),
            "avatar":      "" if (incognito or not f["autor_avatar"]) else f"/api/avatar/{f['autor_avatar']}",
        })
    return jsonify(resultado)

# ── Feed global (home tipo Tumblr) ────────────────────────
@app.route("/api/feed")
def feed():
    try:
        offset = max(0, int(request.args.get("offset", 0)))
        limit  = min(30, max(1, int(request.args.get("limit", 6))))
    except (TypeError, ValueError):
        offset, limit = 0, 6
    uid = session.get("user_id")
    solo_siguiendo = request.args.get("filtro") == "siguiendo" and uid is not None
    filtro_sql = ("AND a.usuario_id IN (SELECT seguido_id FROM seguidores WHERE seguidor_id=%s) "
                  if solo_siguiendo else "")
    params = [uid, uid, uid]
    if solo_siguiendo:
        params.append(uid)
    params += [limit, offset]
    filas = query(
        f"""SELECT a.*, u.username AS subido_por, u.avatar AS autor_avatar,
                  (SELECT COUNT(*) FROM reacciones r WHERE r.archivo_id=a.id AND r.tipo='like') AS likes,
                  (SELECT COUNT(*) FROM comentarios c WHERE c.archivo_id=a.id AND c.oculto=FALSE) AS comentarios,
                  EXISTS(SELECT 1 FROM reacciones r WHERE r.archivo_id=a.id AND r.usuario_id=%s AND r.tipo='like') AS liked,
                  EXISTS(SELECT 1 FROM guardados g WHERE g.archivo_id=a.id AND g.usuario_id=%s) AS guardado,
                  EXISTS(SELECT 1 FROM seguidores s WHERE s.seguidor_id=%s AND s.seguido_id=a.usuario_id) AS siguiendo
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.estado='aprobado' AND a.oculto=FALSE {filtro_sql}
           ORDER BY a.created_at DESC
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
            "url":         f"/api/archivo/{f['nombre_guardado']}",
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
        })
    return jsonify(resultado)

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

# ── Categorías (público: listar) ──────────────────────────
@app.route("/api/categorias")
def listar_categorias():
    return jsonify(get_categorias())

# ── Categorías (admin: gestionar) ─────────────────────────
@app.route("/api/admin/categorias")
@login_required
@admin_required
def admin_listar_categorias():
    filas = query(
        """SELECT c.id, c.nombre,
                  (SELECT COUNT(*) FROM archivos a WHERE a.categoria = c.nombre) AS archivos
           FROM categorias c ORDER BY c.orden, c.id""")
    return jsonify([{"id": f["id"], "nombre": f["nombre"], "archivos": f["archivos"]} for f in filas])

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
    orden = query("SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM categorias", fetchone=True)["n"]
    query("INSERT INTO categorias (nombre, orden) VALUES (%s,%s)", (nombre, orden), commit=True)
    if not USAR_S3:
        os.makedirs(os.path.join(APROBADOS, nombre), exist_ok=True)
    return jsonify({"ok": True})

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
    filas = query(
        """SELECT a.*, u.nombre AS usuario_nombre, u.username AS usuario_username, u.email AS usuario_email
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.estado='pendiente'
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
    st_mover(f"aduana/{fila['nombre_guardado']}",
                  f"aprobados/{fila['categoria']}/{fila['nombre_guardado']}")
    query("UPDATE archivos SET estado='aprobado', revisado_at=NOW() WHERE id=%s", (archivo_id,), commit=True)
    return jsonify({"ok": True})

# ── Admin — rechazar ───────────────────────────────────────
@app.route("/api/admin/rechazar/<int:archivo_id>", methods=["POST"])
@login_required
@permiso_required("moderar_archivos")
def rechazar(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s AND estado='pendiente'", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Archivo no encontrado"}), 404
    borrar_archivo(f"aduana/{fila['nombre_guardado']}")
    query("UPDATE archivos SET estado='rechazado', revisado_at=NOW() WHERE id=%s", (archivo_id,), commit=True)
    return jsonify({"ok": True})

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
    query("UPDATE archivos SET descripcion=%s WHERE id=%s", (descripcion, archivo_id), commit=True)
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
    top_archivos = query(
        """SELECT a.id, a.asunto, a.nombre_original, a.categoria,
                  COUNT(r.id) likes
           FROM archivos a
           LEFT JOIN reacciones r ON r.archivo_id=a.id AND r.tipo='like'
           WHERE a.estado='aprobado'
           GROUP BY a.id ORDER BY likes DESC LIMIT 5""")
    return jsonify({
        "archivos":    total_archivos,
        "pendientes":  total_pendientes,
        "usuarios":    total_usuarios,
        "likes":       total_likes,
        "comentarios": total_comentarios,
        "guardados":   total_guardados,
        "top_archivos": [{"id":f["id"],"asunto":f["asunto"] or f["nombre_original"],"categoria":f["categoria"],"likes":f["likes"]} for f in top_archivos],
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
        "url":         f"/api/archivo/{f['nombre_guardado']}",
        "fecha":       f["created_at"].strftime("%d/%m/%Y"),
        "subido_por":  "" if f["categoria"] == "Modo Incognito" else (f["subido_por"] or ""),
        "categoria":   f["categoria"],
    } for f in filas])

@app.route("/api/usuario/publicaciones")
@login_required
def mis_publicaciones():
    uid = session["user_id"]
    filas = query(
        "SELECT * FROM archivos WHERE usuario_id=%s ORDER BY created_at DESC",
        (uid,))
    return jsonify([{
        "id":        f["id"],
        "nombre":    f["nombre_original"],
        "tipo":      f["tipo"],
        "asunto":    f["asunto"],
        "descripcion": f["descripcion"],
        "categoria": f["categoria"],
        "estado":    f["estado"],
        "oculto":    f["oculto"],
        "fecha":     f["created_at"].strftime("%d/%m/%Y"),
        "url":       f"/api/archivo/{f['nombre_guardado']}" if f["estado"] == "aprobado" else f"/api/aduana/{f['nombre_guardado']}",
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
    fila = query("SELECT usuario_id FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Publicación no encontrada"}), 404
    if fila["usuario_id"] != session["user_id"]:
        return jsonify({"error": "No es tu publicación"}), 403
    query("UPDATE archivos SET asunto=%s, descripcion=%s WHERE id=%s",
          (asunto, descripcion, archivo_id), commit=True)
    return jsonify({"ok": True})

@app.route("/api/usuario/publicaciones/<int:archivo_id>", methods=["DELETE"])
@login_required
def eliminar_mi_publicacion(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Publicación no encontrada"}), 404
    if fila["usuario_id"] != session["user_id"]:
        return jsonify({"error": "No es tu publicación"}), 403
    borrar_archivo(key_de_archivo(fila))
    borrar_archivo(f"thumbs/{fila['nombre_guardado']}")
    query("DELETE FROM archivos WHERE id=%s", (archivo_id,), commit=True)
    return jsonify({"ok": True})

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
        "url":         f"/api/archivo/{f['nombre_guardado']}",
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
@app.route("/api/admin/publicados")
@login_required
@admin_required
def admin_publicados():
    filas = query(
        """SELECT a.*, u.username AS subido_por, u.nombre AS u_nombre
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.estado='aprobado'
           ORDER BY a.created_at DESC""")
    return jsonify([{
        "id":        f["id"],
        "nombre":    f["nombre_original"],
        "tipo":      f["tipo"],
        "asunto":    f["asunto"],
        "categoria": f["categoria"],
        "oculto":    f["oculto"],
        "usuario":   f["subido_por"] or f["u_nombre"] or "–",
        "fecha":     f["created_at"].strftime("%d/%m/%Y"),
        "url":       f"/api/archivo/{f['nombre_guardado']}",
    } for f in filas])

@app.route("/api/admin/archivos/<int:archivo_id>/ocultar", methods=["POST"])
@login_required
@permiso_required("eliminar_publicaciones")
def ocultar_archivo(archivo_id):
    fila = query("SELECT oculto FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    nuevo = not fila["oculto"]
    query("UPDATE archivos SET oculto=%s WHERE id=%s", (nuevo, archivo_id), commit=True)
    return jsonify({"ok": True, "oculto": nuevo})

@app.route("/api/admin/archivos/<int:archivo_id>", methods=["DELETE"])
@login_required
@permiso_required("eliminar_publicaciones")
def eliminar_archivo_admin(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "No encontrado"}), 404
    borrar_archivo(key_de_archivo(fila))
    borrar_archivo(f"thumbs/{fila['nombre_guardado']}")
    query("DELETE FROM archivos WHERE id=%s", (archivo_id,), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/archivos/<int:archivo_id>/asunto", methods=["POST"])
@login_required
@admin_required
def editar_asunto(archivo_id):
    data   = request.get_json()
    asunto = (data.get("asunto") or "").strip()
    query("UPDATE archivos SET asunto=%s WHERE id=%s", (asunto, archivo_id), commit=True)
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
    # Los archivos aprobados viven bajo su categoría; moverlos también en el storage.
    if fila["estado"] == "aprobado":
        st_mover(f"aprobados/{fila['categoria']}/{fila['nombre_guardado']}",
                 f"aprobados/{nueva}/{fila['nombre_guardado']}")
    query("UPDATE archivos SET categoria=%s WHERE id=%s", (nueva, archivo_id), commit=True)
    return jsonify({"ok": True})

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
