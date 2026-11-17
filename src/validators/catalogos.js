import { z } from 'zod'
import { TIPOS_CATALOGO } from '../models/Catalogo.js'
import {
    vacioSiFalta, opcion, opcionObligatoria, idOpcional, estadoBooleano,
} from './comunes.js'

const nombreSchema = z.preprocess(
    vacioSiFalta,
    z.string().trim()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(80, 'El nombre no puede superar 80 caracteres')
)

export const crearCatalogoSchema = z.object({
    tipo: opcionObligatoria(TIPOS_CATALOGO, 'El tipo de catálogo no es válido'),
    nombre: nombreSchema,
    familia: idOpcional,
})

export const renombrarCatalogoSchema = z.object({ nombre: nombreSchema })

export const estadoCatalogoSchema = z.object({
    activo: estadoBooleano('Indica si el valor debe estar activo (true o false)'),
})

export const listarCatalogosSchema = z.object({
    tipo: opcion(TIPOS_CATALOGO, 'El tipo de catálogo no es válido'),
    familia: idOpcional,
    activo: opcion(['true', 'false'], 'El estado no es válido'),
})