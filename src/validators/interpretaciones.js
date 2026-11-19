import { z } from 'zod'
import { ESTADOS_INTERPRETACION } from '../models/Interpretacion.js'
import { vacioSiFalta, textoOpcional, opcion, opcionObligatoria, idOpcional, paginacion } from './comunes.js'
import { fechaObligatoria, fechaOpcional } from './fechas.js'

const requerido = (mensaje, max) =>
    z.preprocess(vacioSiFalta, z.string().trim().min(1, mensaje).max(max, `No puede superar ${max} caracteres`))

const datosEditables = {
    fechaPrevista: fechaObligatoria('La fecha prevista es obligatoria'),
    programa: requerido('El programa o concierto es obligatorio', 200),
    director: requerido('El director es obligatorio', 150),
    solista: textoOpcional(150),
    observaciones: textoOpcional(1000),
}

export const interpretacionSchema = z.object({
    ...datosEditables,
    obra: z.preprocess(vacioSiFalta, z.string().regex(/^[a-f0-9]{24}$/i, 'La obra es obligatoria')),
})

// La obra no se corrige: cambia la disponibilidad de dos obras
export const editarInterpretacionSchema = z.object(datosEditables)

export const estadoInterpretacionSchema = z.object({
    estado: opcionObligatoria(ESTADOS_INTERPRETACION, 'El estado no es válido'),
})

export const listarInterpretacionesSchema = z.object({
    q: z.string().trim().max(100).optional(),
    obra: idOpcional,
    estado: opcion(ESTADOS_INTERPRETACION, 'El estado no es válido'),
    desde: fechaOpcional,
    hasta: fechaOpcional,
    ...paginacion,
})

export const semanaSchema = z.object({ fecha: fechaOpcional })
