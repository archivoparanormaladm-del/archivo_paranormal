# ☠ Archivo Paranormal — Instrucciones

## Estructura del proyecto

```
proyecto/
├── app.py                  ← Servidor Flask (backend)
├── requirements.txt        ← Dependencias Python
├── schema.sql              ← Estructura de la base de datos
├── .env.example            ← Variables de entorno (renombrar a .env)
├── uploads/
│   ├── aduana/             ← Archivos pendientes (antes de aprobar)
│   └── aprobados/          ← Archivos aprobados (por categoría)
│       ├── Fantasmas/
│       ├── Duendes/
│       └── ...
└── static/                 ← Todo el frontend
    ├── index.html          ← Login
    ├── register.html       ← Registro
    ├── dashboard.html      ← Carpetas categorizadas
    ├── carpeta.html        ← Contenido de cada carpeta
    ├── admin.html          ← Panel de administración
    └── ...
```

---

## PASO 1 — Instalar Python y dependencias

```bash
# Crear entorno virtual (recomendado)
python -m venv venv
source venv/bin/activate        # Mac/Linux
venv\Scripts\activate           # Windows

# Instalar dependencias
pip install -r requirements.txt
```

---

## PASO 2 — Configurar PostgreSQL

### 2.1 Crear la base de datos
```sql
-- En psql como superusuario:
CREATE DATABASE paranormal_db;
CREATE USER mi_usuario WITH PASSWORD 'mi_password';
GRANT ALL PRIVILEGES ON DATABASE paranormal_db TO mi_usuario;
```

### 2.2 Ejecutar el schema
```bash
psql -U mi_usuario -d paranormal_db -f schema.sql
```

Esto crea las tablas `usuarios` y `archivos`, más un usuario
administrador por defecto:

| Campo      | Valor                   |
|------------|-------------------------|
| Correo     | admin@paranormal.cl     |
| Contraseña | Admin1234!              |

> ⚠️ Cambia la contraseña del admin después del primer login
> (desde el panel → Gestión de Usuarios).

---

## PASO 3 — Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paranormal_db
DB_USER=mi_usuario
DB_PASSWORD=mi_password
SECRET_KEY=una_clave_larga_aleatoria_aqui
MAX_CONTENT_MB=50
```

---

## PASO 4 — Correr el servidor

```bash
python app.py
```

Abre tu navegador en: **http://localhost:5000**

---

## Roles de usuario

| Perfil | Nombre       | Puede hacer                                                                 |
|--------|--------------|-----------------------------------------------------------------------------|
| 1      | Administrador | Todo: aprobar/rechazar archivos, gestionar usuarios, cambiar contraseñas    |
| 2      | Estándar      | Subir archivos (máx 50 MB, 200 palabras), sujeto a aprobación del admin    |
| 3      | Restringido   | Solo ver imágenes, reproducir videos y audios                               |

---

## Flujo de subida de archivos

```
Usuario (perfil 2) sube archivo
        ↓
  uploads/aduana/         ← archivo guardado con nombre UUID
        ↓
  Admin revisa en panel → "Archivos Pendientes"
        ↓
  ┌─── Aprobar ──────────────────────────────────────────┐
  │    archivo se mueve a uploads/aprobados/<Categoria>/  │
  │    aparece en la carpeta categorizada                 │
  └───────────────────────────────────────────────────────┘
  ┌─── Rechazar ──────────────────────────────────────────┐
  │    archivo se elimina de uploads/aduana/              │
  │    estado queda como "rechazado" en la BD             │
  └───────────────────────────────────────────────────────┘
```

---

## Solución de problemas comunes

- **"Connection refused"**: Verifica que PostgreSQL esté corriendo y que los datos en `.env` sean correctos.
- **"CSRF / cookie"**: Asegúrate de acceder desde `http://localhost:5000`, no abriendo el HTML directo.
- **Archivo no aparece tras aprobar**: Verifica que la carpeta `uploads/aprobados/<Categoria>/` exista (se crea automáticamente al iniciar).
# archivo_paranormal
