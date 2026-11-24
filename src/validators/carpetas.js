import { z } from 'zod'
import { vacioSiFalta, textoOpcional, opcion, estadoBooleano, paginacion } from './comunes.js'
import { fechaOpcional } from './fechas.js'

export const carpetaSchema = z.object({
    numero: z.preprocess(
        vacioSiFalta,
        z.string().trim()
            .min(1, 'El número de carpeta es obligatorio')
            .max(20, 'El número de carpeta no puede superar 20 caracteres')
            .regex(/^[A-Za-z0-9-]+$/, 'El número de carpeta solo admite letras, números y guion')
    ),
    ubicacionFisica: textoOpcional(150),
    ultimaRevision: fechaOpcional,
    revisadaPor: textoOpcional(100),
    observaciones: textoOpcional(500),
})

export const estadoCarpetaSchema = z.object({
    activa: estadoBooleano('Indica si la carpeta debe estar activa (true o false)'),
})

export const listarCarpetasSchema = z.object({
    q: z.string().trim().max(50).optional(),
    activa: opcion(['true', 'false'], 'El estado no es válido'),
    ...paginacion,
})
