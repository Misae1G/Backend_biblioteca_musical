import { z } from 'zod'
import { vacioSiFalta, vacioAUndefined } from './comunes.js'

// "2026-11-18" -> Date a medianoche UTC (se rechazan días que no existen, como 2026-02-31)
const aFecha = (texto) => {
    const fecha = new Date(`${texto}T00:00:00.000Z`)
    return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto ? null : fecha
}

const esFechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && aFecha(v)
const MENSAJE = 'La fecha debe tener el formato AAAA-MM-DD y existir'

export const fechaObligatoria = (mensaje) =>
    z.preprocess(
        vacioSiFalta,
        z.string().trim().min(1, mensaje).refine(esFechaValida, MENSAJE).transform((v) => aFecha(v))
    )

export const fechaOpcional = z.preprocess(
    vacioAUndefined,
    z.string().trim().refine(esFechaValida, MENSAJE).transform((v) => aFecha(v)).optional()
)
