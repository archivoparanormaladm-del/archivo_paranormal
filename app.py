"""
ARCHIVO PARANORMAL — Backend Flask + PostgreSQL
"""

import os
import uuid
import re
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
    for c in nombres:
        os.makedirs(os.path.join(APROBADOS, c), exist_ok=True)

asegurar_categorias()

# ── Configuración y permisos ──────────────────────────────
# Permisos que el Super Admin (perfil 0) siempre tiene y que puede
# delegar al Admin (perfil 1). La clave interna mapea a la fila de `configuracion`.
PERMISOS_DELEGABLES = {
    "renombrar_carpetas": "admin_perm_renombrar_carpetas",
    "mover_archivos":     "admin_perm_mover_archivos",
    "editar_usuarios":    "admin_perm_editar_usuarios",
    "editar_peso":        "admin_perm_editar_peso",
}

CONFIG_DEFAULTS = {
    "max_content_mb": os.getenv("MAX_CONTENT_MB", "50"),
    "admin_perm_renombrar_carpetas": "false",
    "admin_perm_mover_archivos": "false",
    "admin_perm_editar_usuarios": "false",
    "admin_perm_editar_peso": "false",
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

    ruta_aduana = os.path.join(ADUANA, nombre_guardado)
    archivo.save(ruta_aduana)

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
    filas = query(
        """SELECT a.*, u.username AS subido_por, u.avatar AS autor_avatar,
                  (SELECT COUNT(*) FROM reacciones r WHERE r.archivo_id=a.id AND r.tipo='like') AS likes,
                  (SELECT COUNT(*) FROM comentarios c WHERE c.archivo_id=a.id AND c.oculto=FALSE) AS comentarios,
                  EXISTS(SELECT 1 FROM reacciones r WHERE r.archivo_id=a.id AND r.usuario_id=%s AND r.tipo='like') AS liked,
                  EXISTS(SELECT 1 FROM guardados g WHERE g.archivo_id=a.id AND g.usuario_id=%s) AS guardado,
                  EXISTS(SELECT 1 FROM seguidores s WHERE s.seguidor_id=%s AND s.seguido_id=a.usuario_id) AS siguiendo
           FROM archivos a
           LEFT JOIN usuarios u ON u.id = a.usuario_id
           WHERE a.estado='aprobado' AND a.oculto=FALSE
           ORDER BY a.created_at DESC
           LIMIT %s OFFSET %s""",
        (uid, uid, uid, limit, offset),
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
    return send_from_directory(os.path.join(APROBADOS, fila["categoria"]), nombre_guardado)

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
@admin_required
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
    os.makedirs(os.path.join(APROBADOS, nombre), exist_ok=True)
    return jsonify({"ok": True})

@app.route("/api/admin/categorias/<int:cid>", methods=["DELETE"])
@login_required
@admin_required
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
    return send_from_directory(ADUANA, nombre_guardado)

# ── Admin — aprobar ────────────────────────────────────────
@app.route("/api/admin/aprobar/<int:archivo_id>", methods=["POST"])
@login_required
@admin_required
def aprobar(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s AND estado='pendiente'", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Archivo no encontrado"}), 404
    origen  = os.path.join(ADUANA, fila["nombre_guardado"])
    destino = os.path.join(APROBADOS, fila["categoria"], fila["nombre_guardado"])
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    os.rename(origen, destino)
    query("UPDATE archivos SET estado='aprobado', revisado_at=NOW() WHERE id=%s", (archivo_id,), commit=True)
    return jsonify({"ok": True})

# ── Admin — rechazar ───────────────────────────────────────
@app.route("/api/admin/rechazar/<int:archivo_id>", methods=["POST"])
@login_required
@admin_required
def rechazar(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s AND estado='pendiente'", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "Archivo no encontrado"}), 404
    ruta = os.path.join(ADUANA, fila["nombre_guardado"])
    if os.path.exists(ruta):
        os.remove(ruta)
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
@admin_required
def bloquear(uid):
    query("UPDATE usuarios SET bloqueado=TRUE WHERE id=%s", (uid,), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/desbloquear", methods=["POST"])
@login_required
@admin_required
def desbloquear(uid):
    query("UPDATE usuarios SET bloqueado=FALSE WHERE id=%s", (uid,), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/perfil", methods=["POST"])
@login_required
@admin_required
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
@admin_required
def toggle_subida(uid):
    habilitado = request.get_json().get("habilitado", True)
    query("UPDATE usuarios SET puede_subir=%s WHERE id=%s", (habilitado, uid), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>/password", methods=["POST"])
@login_required
@admin_required
def cambiar_password(uid):
    nueva = request.get_json().get("password") or ""
    if len(nueva) < 8:
        return jsonify({"error": "La contraseña debe tener al menos 8 caracteres"}), 400
    query("UPDATE usuarios SET password=%s WHERE id=%s", (generate_password_hash(nueva), uid), commit=True)
    return jsonify({"ok": True})

@app.route("/api/admin/usuarios/<int:uid>", methods=["DELETE"])
@login_required
@admin_required
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
@admin_required
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
    os.makedirs(AVATARES, exist_ok=True)
    archivo.save(os.path.join(AVATARES, nombre))
    uid = session["user_id"]
    anterior = query("SELECT avatar FROM usuarios WHERE id=%s", (uid,), fetchone=True)
    query("UPDATE usuarios SET avatar=%s WHERE id=%s", (nombre, uid), commit=True)
    session["avatar"] = nombre
    if anterior and anterior["avatar"]:
        try: os.remove(os.path.join(AVATARES, anterior["avatar"]))
        except OSError: pass
    return jsonify({"ok": True, "avatar": f"/api/avatar/{nombre}"})

@app.route("/api/avatar/<nombre>")
def servir_avatar(nombre):
    return send_from_directory(AVATARES, secure_filename(nombre))

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
    # Borrar archivo físico según estado
    if fila["estado"] == "aprobado":
        ruta = os.path.join(APROBADOS, fila["categoria"], fila["nombre_guardado"])
    else:
        ruta = os.path.join(ADUANA, fila["nombre_guardado"])
    if os.path.exists(ruta):
        os.remove(ruta)
    query("DELETE FROM archivos WHERE id=%s", (archivo_id,), commit=True)
    return jsonify({"ok": True})

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
    return jsonify({"ok": True, "siguiendo": True})

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
@admin_required
def ocultar_archivo(archivo_id):
    fila = query("SELECT oculto FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    nuevo = not fila["oculto"]
    query("UPDATE archivos SET oculto=%s WHERE id=%s", (nuevo, archivo_id), commit=True)
    return jsonify({"ok": True, "oculto": nuevo})

@app.route("/api/admin/archivos/<int:archivo_id>", methods=["DELETE"])
@login_required
@admin_required
def eliminar_archivo_admin(archivo_id):
    fila = query("SELECT * FROM archivos WHERE id=%s", (archivo_id,), fetchone=True)
    if not fila:
        return jsonify({"error": "No encontrado"}), 404
    # Eliminar archivo físico
    if fila["estado"] == "aprobado":
        ruta = os.path.join(APROBADOS, fila["categoria"], fila["nombre_guardado"])
    else:
        ruta = os.path.join(ADUANA, fila["nombre_guardado"])
    if os.path.exists(ruta):
        os.remove(ruta)
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
@admin_required
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
    # Mover carpeta en disco
    origen  = os.path.join(APROBADOS, viejo)
    destino = os.path.join(APROBADOS, nuevo)
    os.makedirs(destino, exist_ok=True)
    if os.path.isdir(origen):
        for f in os.listdir(origen):
            os.rename(os.path.join(origen, f), os.path.join(destino, f))
        try:
            os.rmdir(origen)
        except OSError:
            pass
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
    # Los archivos aprobados viven en disco bajo su categoría; moverlos físicamente.
    if fila["estado"] == "aprobado":
        origen  = os.path.join(APROBADOS, fila["categoria"], fila["nombre_guardado"])
        destino_dir = os.path.join(APROBADOS, nueva)
        os.makedirs(destino_dir, exist_ok=True)
        if os.path.exists(origen):
            os.rename(origen, os.path.join(destino_dir, fila["nombre_guardado"]))
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
