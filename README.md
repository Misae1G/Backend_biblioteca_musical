# Backend: Sistema de Gestión de la Biblioteca Musical

API REST para administrar la biblioteca musical de una orquesta: obras, carpetas físicas, inventario, préstamos, devoluciones, interpretaciones y documentos digitales.

## Tecnologías

- Node.js (LTS) con ES Modules
- Express 5
- MongoDB Atlas con Mongoose
- Autenticación con JWT y bcryptjs
- Nodemailer para correos

## Requisitos

- Node.js LTS
- Git
- Una cuenta de MongoDB Atlas con un clúster y un usuario de base de datos

## Instalación

```bash
git clone <URL-del-repositorio>
cd backend
npm install
```

## Configuración

Copia `.env.example` como `.env` y completa los valores:

```
PORT=3000
MONGODB_URI_PRODUCTION=
```

Nunca subas el archivo `.env` a Git. Se irán agregando más variables (por ejemplo, la clave JWT y el correo) conforme se desarrollen los módulos.

## Ejecución

```bash
npm run dev     # desarrollo, con reinicio automático
npm start       # producción
```

El servidor queda en `http://localhost:3000`. Las rutas de la API colgarán de `/api`.

## Estructura

```
src/
├── config/        # conexión a la base de datos y configuración
├── models/        # modelos de Mongoose
├── routes/        # rutas de la API
├── controllers/   # reciben la petición y responden
├── services/      # reglas de negocio
├── middlewares/   # autenticación, roles, validación, errores
├── validators/    # esquemas de validación
├── utils/         # utilidades (correo, códigos, fechas)
├── scripts/       # scripts de uso puntual (crear administrador)
├── server.js
└── index.js
```

## Estado del proyecto

En desarrollo. Fase actual: planificación y preparación.