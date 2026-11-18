import { z } from 'zod'
import { TIPOS_ENTREGA, ESTADOS_PRESTAMO, ESTADOS_FISICOS } from '../models/Prestamo.js'
import {
    vacioSiFalta, vacioAUndefined, textoOpcional, opcion, opcionObligatoria, idOpcional, paginacion,
} from './comunes.js'

const ID = /^[a-f0-9]{24}$/i

// "2026-11-18" -> Date a medianoche UTC (se rechazan días que no existen, como 2026-02-31)
const aFecha = (texto) => {
    const fecha = new Date(`${texto}T00:00:00.000Z`)
    return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto ? null : fecha
}

const fechaObligatoria = (mensaje) =>
    z.preprocess(
        vacioSiFalta,
        z.string().trim()
            .min(1, mensaje)
            .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && aFecha(v), 'La fecha debe tener el formato AAAA-MM-DD y existir')
            .transform((v) => aFecha(v))
    )

const fechaOpcional = z.preprocess(
    vacioAUndefined,
    z.string().trim()
        .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && aFecha(v), 'La fecha debe tener el formato AAAA-MM-DD y existir')
        .transform((v) => aFecha(v))
        .optional()
)

const requerido = (mensaje, max) =>
    z.preprocess(vacioSiFalta, z.string().trim().min(1, mensaje).max(max, `No puede superar ${max} caracteres`))

const datosEditables = {
    fechaSolicitud: fechaObligatoria('La fecha de solicitud es obligatoria'),
    solicitante: requerido('El solicitante es obligatorio', 150),
    institucion: textoOpcional(150),
    personaQueRecibe: requerido('La persona que recibe es obligatoria', 150),
    fechaEntrega: fechaObligatoria('La fecha de entrega es obligatoria'),
    observaciones: textoOpcional(1000),
}

export const prestamoSchema = z.object({
    ...datosEditables,
    obra: z.preprocess(vacioSiFalta, z.string().regex(ID, 'La obra es obligatoria')),
    tipoEntrega: opcionObligatoria(TIPOS_ENTREGA, 'El tipo de entrega no es válido'),
})

// La obra y el tipo de entrega no se corrigen: cambian la disponibilidad
export const editarPrestamoSchema = z.object(datosEditables)

const datosDevolucion = {
    fechaDevolucion: fechaObligatoria('La fecha de devolución es obligatoria'),
    personaQueDevuelve: requerido('La persona que devuelve es obligatoria', 150),
    estadoFisico: opcionObligatoria(ESTADOS_FISICOS, 'El estado físico no es válido'),
    observaciones: textoOpcional(500),
}

export const devolucionSchema = z.object(datosDevolucion)

export const listarPrestamosSchema = z.object({
    q: z.string().trim().max(100).optional(),
    obra: idOpcional,
    tipoEntrega: opcion(TIPOS_ENTREGA, 'El tipo de entrega no es válido'),
    estado: opcion(ESTADOS_PRESTAMO, 'El estado no es válido'),
    desde: fechaOpcional,
    hasta: fechaOpcional,
    ...paginacion,
})
