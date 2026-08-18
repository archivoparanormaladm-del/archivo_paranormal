-- ============================================================
-- ARCHIVO PARANORMAL — Schema PostgreSQL
-- Copia fiel de la base local en uso (extraída del catálogo real).
-- Ejecutar en local:   psql -U postgres -d paranormal_db -f schema.sql
-- Ejecutar en Railway: psql "$DATABASE_URL" -f schema.sql
-- ============================================================

-- ── Usuarios ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(120) NOT NULL,
    username    VARCHAR(50)  NOT NULL,
    email       VARCHAR(255) NOT NULL,
    password    VARCHAR(255) NOT NULL,          -- hash werkzeug
    perfil      SMALLINT NOT NULL DEFAULT 2,
                -- 1 = Administrador
                -- 2 = Usuario Estándar (puede subir archivos)
                -- 3 = Usuario Restringido (solo consumir contenido)
    puede_subir BOOLEAN NOT NULL DEFAULT TRUE,
    bloqueado   BOOLEAN NOT NULL DEFAULT FALSE,
    avatar      VARCHAR(255),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT usuarios_email_key       UNIQUE (email),
    CONSTRAINT usuarios_username_unique  UNIQUE (username)
);

-- ── Archivos (media subida y su estado de moderación) ──────
CREATE TABLE IF NOT EXISTS archivos (
    id               SERIAL PRIMARY KEY,
    nombre_original  VARCHAR(500) NOT NULL,
    nombre_guardado  VARCHAR(500) NOT NULL,          -- UUID.<ext> en disco
    categoria        VARCHAR(100) NOT NULL,
    tipo             VARCHAR(20)  NOT NULL,          -- imagen / video / audio / otro
    descripcion      TEXT,
    estado           VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
                     -- pendiente | aprobado | rechazado
    usuario_id       INT REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    revisado_at      TIMESTAMP,
    asunto           VARCHAR(200),
    oculto           BOOLEAN NOT NULL DEFAULT FALSE,
    visitas_count    INTEGER DEFAULT 0
);

-- ── Categorías (carpetas temáticas; gestionables desde el admin) ──
CREATE TABLE IF NOT EXISTS categorias (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    orden       INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT categorias_nombre_key UNIQUE (nombre)
);

-- ── Etiquetas y su relación N:M con archivos ───────────────
CREATE TABLE IF NOT EXISTS etiquetas (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(50) NOT NULL,
    CONSTRAINT etiquetas_nombre_key UNIQUE (nombre)
);

CREATE TABLE IF NOT EXISTS archivo_etiquetas (
    archivo_id   INT NOT NULL REFERENCES archivos(id)  ON DELETE CASCADE,
    etiqueta_id  INT NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
    PRIMARY KEY (archivo_id, etiqueta_id)
);

-- ── Reacciones (like / dislike; usuario logueado o anónimo por IP) ──
CREATE TABLE IF NOT EXISTS reacciones (
    id          SERIAL PRIMARY KEY,
    archivo_id  INT NOT NULL REFERENCES archivos(id) ON DELETE CASCADE,
    usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
    ip          VARCHAR(60),
    tipo        VARCHAR(10) NOT NULL,   -- like | dislike
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Una reacción por usuario y una por IP anónima, por archivo
    CONSTRAINT reacciones_archivo_id_usuario_id_key UNIQUE (archivo_id, usuario_id),
    CONSTRAINT reacciones_archivo_id_ip_key         UNIQUE (archivo_id, ip)
);

-- ── Comentarios (logueado o anónimo con nombre_anon) ───────
CREATE TABLE IF NOT EXISTS comentarios (
    id           SERIAL PRIMARY KEY,
    archivo_id   INT NOT NULL REFERENCES archivos(id) ON DELETE CASCADE,
    usuario_id   INT REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre_anon  VARCHAR(80),
    texto        TEXT NOT NULL,
    oculto       BOOLEAN NOT NULL DEFAULT FALSE,  -- borrado lógico por admin
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Guardados (favoritos por usuario) ──────────────────────
CREATE TABLE IF NOT EXISTS guardados (
    id          SERIAL PRIMARY KEY,
    archivo_id  INT NOT NULL REFERENCES archivos(id) ON DELETE CASCADE,
    usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT guardados_archivo_id_usuario_id_key UNIQUE (archivo_id, usuario_id)
);

-- ── Visitas (log de vistas por archivo) ────────────────────
CREATE TABLE IF NOT EXISTS visitas (
    id          SERIAL PRIMARY KEY,
    archivo_id  INT NOT NULL REFERENCES archivos(id) ON DELETE CASCADE,
    ip          VARCHAR(60),
    usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Reportes (denuncias de archivos o comentarios) ─────────
CREATE TABLE IF NOT EXISTS reportes (
    id          SERIAL PRIMARY KEY,
    tipo        VARCHAR(20) NOT NULL,    -- 'archivo' | 'comentario'
    objeto_id   INT NOT NULL,            -- id del archivo o comentario reportado
    usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
    ip          VARCHAR(60),
    motivo      TEXT,
    resuelto    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Registro de actividad (auditoría) ──────────────────────
CREATE TABLE IF NOT EXISTS actividad_log (
    id          SERIAL PRIMARY KEY,
    usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
    accion      VARCHAR(100) NOT NULL,
    detalle     TEXT,
    ip          VARCHAR(60),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Seguidores (una fila = seguidor sigue a seguido) ──────
CREATE TABLE IF NOT EXISTS seguidores (
    seguidor_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    seguido_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (seguidor_id, seguido_id)
);

-- ── Intentos de login (rate limiting por email+IP) ─────────
CREATE TABLE IF NOT EXISTS login_intentos (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255),
    ip          VARCHAR(60),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Tickets de soporte ─────────────────────────────────────
-- Solo usuarios registrados pueden crear tickets. El número visible
-- (Ticket-000001) se deriva del id al crear la fila.
CREATE TABLE IF NOT EXISTS tickets (
    id              SERIAL PRIMARY KEY,
    numero          VARCHAR(20) UNIQUE,
    usuario_id      INT REFERENCES usuarios(id) ON DELETE SET NULL,
    email           VARCHAR(255) NOT NULL,
    asunto          VARCHAR(200) NOT NULL,
    comentario      TEXT NOT NULL,
    estado          VARCHAR(20) NOT NULL DEFAULT 'abierto',  -- abierto | respondido | cerrado
    respuesta       TEXT,
    respondido_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Configuración clave/valor ──────────────────────────────
-- Guarda el peso máximo de subida y qué permisos delegables tiene
-- activados el perfil Administrador (el Super Admin siempre los tiene).
CREATE TABLE IF NOT EXISTS configuracion (
    clave   VARCHAR(60) PRIMARY KEY,
    valor   TEXT NOT NULL
);
INSERT INTO configuracion (clave, valor) VALUES
    ('max_content_mb', '50'),
    ('admin_perm_renombrar_carpetas', 'false'),
    ('admin_perm_mover_archivos', 'false'),
    ('admin_perm_editar_usuarios', 'false'),
    ('admin_perm_editar_peso', 'false'),
    -- Permisos delegables nuevos (activos por defecto; el Super Admin los revoca)
    ('admin_perm_moderar_archivos', 'true'),
    ('admin_perm_gestionar_usuarios', 'true'),
    ('admin_perm_gestionar_categorias', 'true'),
    ('admin_perm_responder_soporte', 'true'),
    ('admin_perm_gestionar_reportes', 'true'),
    ('admin_perm_eliminar_publicaciones', 'true')
ON CONFLICT (clave) DO NOTHING;

-- ── Índices útiles ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_archivos_estado      ON archivos(estado);
CREATE INDEX IF NOT EXISTS idx_archivos_categoria   ON archivos(categoria);
CREATE INDEX IF NOT EXISTS idx_usuarios_email       ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_reacciones_archivo   ON reacciones(archivo_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_archivo  ON comentarios(archivo_id);
CREATE INDEX IF NOT EXISTS idx_guardados_usuario    ON guardados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_visitas_archivo      ON visitas(archivo_id);
CREATE INDEX IF NOT EXISTS idx_login_intentos_email ON login_intentos(email);
CREATE INDEX IF NOT EXISTS idx_login_intentos_ip    ON login_intentos(ip);
CREATE INDEX IF NOT EXISTS idx_tickets_estado       ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_usuario      ON tickets(usuario_id);

-- ============================================================
-- Categorías por defecto (la app también las siembra al arrancar
-- si la tabla está vacía).
-- ============================================================
INSERT INTO categorias (nombre, orden) VALUES
    ('Fantasmas', 0), ('Duendes', 1), ('Exorcismo', 2), ('Poltergeist', 3),
    ('Psicofonias', 4), ('Ouija', 5), ('Animales', 6), ('Brujeria', 7),
    ('Modo Incognito', 8)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- Super Administrador por defecto (solo para una base nueva/vacía,
-- p. ej. la de Railway). En tu base local ya existe tu admin real.
-- perfil 0 = Super Administrador (todo lo del Admin + gestión de permisos).
-- Login: admin@paranormal.cl  ·  Contraseña: Admin1234!
-- CAMBIAR la contraseña inmediatamente tras el primer acceso.
-- ============================================================
INSERT INTO usuarios (nombre, username, email, password, perfil, puede_subir)
VALUES (
    'Super Administrador',
    'admin',
    'admin@paranormal.cl',
    'scrypt:32768:8:1$ssrSfZVCtnjpzJQy$14155a1e3d1809ba82fdeddb30a2c0b7d5c5d771edf8c03f41b9b51523d374acf59d520a999fb1e1ca3ed48f99064fd33d48c5b431f0c111f5cd6d298e9e44ac',
    0,
    TRUE
)
ON CONFLICT (email) DO NOTHING;
