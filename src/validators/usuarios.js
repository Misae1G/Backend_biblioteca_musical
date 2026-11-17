import { z } from 'zod'
import { vacioSiFalta, opcion, estadoBooleano, paginacion } from './comunes.js'

const nombreSchema = z.preprocess(
    vacioSiFalta,
    z.string().trim()
        .min(3, 'El nombre debe tener al menos 3 caracteres')
        .max(100, 'El nombre no puede superar 100 caracteres')
)

const nombreUsuarioSchema = z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : vacioSiFalta(v)),
    z.string()
        .min(1, 'El nombre de usuario es obligatorio')
        .regex(
            /^[a-z0-9._-]{3,30}$/,
            'El nombre de usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo'
        )
)

export const crearUsuarioSchema = z.object({ nombre: nombreSchema, nombreUsuario: nombreUsuarioSchema })
export const editarUsuarioSchema = crearUsuarioSchema

export const estadoUsuarioSchema = z.object({
    activo: estadoBooleano('Indica si la cuenta debe estar activa (true o false)'),
})

export const listarUsuariosSchema = z.object({
    rol: opcion(['administrador', 'usuario'], 'El rol no es válido'),
    activo: opcion(['true', 'false'], 'El estado no es válido'),
    q: z.string().trim().max(100).optional(),
    ...paginacion,
})