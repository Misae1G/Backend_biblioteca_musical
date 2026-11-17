import { z } from 'zod'

export const vacioSiFalta = (v) => (v === undefined || v === null ? '' : v)

export const vacioAUndefined = (v) =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v

export const textoOpcional = (max) =>
    z.preprocess(vacioAUndefined, z.string().trim().max(max, `No puede superar ${max} caracteres`).optional())

// Valor opcional que debe ser uno de la lista (para filtros de consulta)
export const opcion = (valores, mensaje) =>
    z.preprocess(vacioAUndefined, z.string().refine((v) => valores.includes(v), mensaje).optional())

// Valor obligatorio que debe ser uno de la lista
export const opcionObligatoria = (valores, mensaje) =>
    z.preprocess(vacioSiFalta, z.string().refine((v) => valores.includes(v), mensaje))

export const idSchema = z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'El identificador no es válido')

export const idOpcional = z.preprocess(vacioAUndefined, idSchema.optional())

export const estadoBooleano = (mensaje) => z.any().refine((v) => typeof v === 'boolean', mensaje)

export const paginacion = {
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce.number().int().min(1).max(100).default(20),
}