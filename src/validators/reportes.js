import { z } from 'zod'
import { opcion, opcionObligatoria } from './comunes.js'
import { fechaOpcional } from './fechas.js'

export const TIPOS_REPORTE = ['obras', 'inventario', 'prestamos', 'interpretaciones', 'copia']
export const FORMATOS = ['json', 'xlsx', 'pdf']

export const paramsReporteSchema = z.object({
    tipo: opcionObligatoria(TIPOS_REPORTE, 'El tipo de reporte no es válido'),
})

export const consultaReporteSchema = z
    .object({
        formato: opcion(FORMATOS, 'El formato no es válido (json, xlsx o pdf)'),
        desde: fechaOpcional,
        hasta: fechaOpcional,
    })
    .refine((d) => !d.desde || !d.hasta || d.desde <= d.hasta, {
        message: 'La fecha "desde" no puede ser posterior a "hasta"',
        path: ['hasta'],
    })
