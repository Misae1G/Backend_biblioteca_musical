import { z } from 'zod'
import { TIPOS_REGISTRO, PROCEDENCIAS, FACTIBLE_SIN_VOZ } from '../models/Obra.js'
import {
    vacioSiFalta, vacioAUndefined, textoOpcional, opcion, opcionObligatoria,
    idOpcional, estadoBooleano, paginacion,
} from './comunes.js'

export const DISPONIBILIDADES = [
    'disponible', 'en_interpretacion', 'prestada_fisicamente', 'en_interpretacion_y_prestada',
]

const ID = /^[a-f0-9]{24}$/i
const idObligatorio = (mensaje) => z.preprocess(vacioSiFalta, z.string().regex(ID, mensaje))

// "1950" -> 1950; vacío -> undefined; texto no numérico -> NaN (se rechaza)
const aNumero = (v) => {
    const valor = vacioAUndefined(v)
    if (valor === undefined || typeof valor === 'number') return valor
    if (typeof valor === 'string' && /^\d+$/.test(valor.trim())) return Number(valor.trim())
    return NaN
}

const entero = (mensaje, min, max) =>
    z.preprocess(
        aNumero,
        z.any().refine((v) => v === undefined || (Number.isInteger(v) && v >= min && v <= max), mensaje)
    )

const anioActual = new Date().getFullYear()
const anio = () => entero(`El año debe estar entre 1000 y ${anioActual + 1}`, 1000, anioActual + 1)

const requerido = (mensaje, max) =>
    z.preprocess(
        vacioSiFalta,
        z.string().trim().min(1, mensaje).max(max, `No puede superar ${max} caracteres`)
    )

const instrumentoSchema = z.object({
    familia: idObligatorio('La familia de cada instrumento es obligatoria'),
    instrumento: idObligatorio('El instrumento es obligatorio'),
    cantidad: entero('La cantidad debe ser un número entero entre 1 y 500', 1, 500),
})

const cancionSchema = z.object({
    titulo: requerido('El título de cada canción es obligatorio', 200),
    compositor: textoOpcional(150),
    genero: textoOpcional(100),
    observacion: textoOpcional(300),
})

export const obraSchema = z.object({
    titulo: requerido('El título es obligatorio', 200),
    tipoRegistro: opcionObligatoria(TIPOS_REGISTRO, 'El tipo de registro no es válido'),
    autor: textoOpcional(150),
    arreglista: textoOpcional(150),
    orquestador: textoOpcional(150),
    opus: textoOpcional(50),
    anioComposicion: anio(),
    anioArreglo: anio(),
    tipoObra: idOpcional,
    procedencia: opcion(PROCEDENCIAS, 'La procedencia no es válida'),
    agrupacion: idOpcional,
    instrumentacion: z
        .array(instrumentoSchema)
        .max(60, 'Hay demasiados instrumentos')
        .refine(
            (filas) => new Set(filas.map((f) => f.instrumento)).size === filas.length,
            'Hay instrumentos repetidos en la instrumentación'
        )
        .default([]),
    tonalidad: textoOpcional(50),
    compas: textoOpcional(50),
    tiempo: textoOpcional(50),
    duracion: entero('La duración debe ser un número entero de segundos (0 a 86400)', 0, 86400),
    numeroMovimientos: entero('El número de movimientos debe ser un entero entre 1 y 50', 1, 50),
    edicion: textoOpcional(150),
    formato: textoOpcional(150),
    detalleMaterial: textoOpcional(200),
    estadoMaterial: textoOpcional(150),
    factibleSinVoz: opcion(FACTIBLE_SIN_VOZ, 'El valor de «factible sin voz» no es válido'),
    directorConcierto: textoOpcional(150),
    solistaConcierto: textoOpcional(150),
    requiereRevision: z.preprocess(vacioAUndefined, z.boolean('Indica si requiere revisión (true o false)').optional()),
    carpeta: idObligatorio('La carpeta es obligatoria'),
    observaciones: textoOpcional(1000),
    obraOriginal: idOpcional,
    canciones: z.array(cancionSchema).max(100, 'Hay demasiadas canciones').default([]),
})

export const documentoSchema = z.object({
    nombre: requerido('El nombre del documento es obligatorio', 150),
    tipoArchivo: textoOpcional(30),
    enlace: z.preprocess(
        vacioSiFalta,
        z.string().trim()
            .min(1, 'El enlace es obligatorio')
            .max(2000, 'El enlace es demasiado largo')
            .regex(/^https?:\/\/\S+$/i, 'El enlace debe empezar por http:// o https://')
    ),
    observaciones: textoOpcional(300),
})

export const estadoObraSchema = z.object({
    activa: estadoBooleano('Indica si la obra debe estar activa (true o false)'),
})

export const listarObrasSchema = z.object({
    q: z.string().trim().max(100).optional(),
    carpeta: z.string().trim().max(20).optional(),
    tipoObra: idOpcional,
    agrupacion: idOpcional,
    instrumento: idOpcional,
    familia: idOpcional,
    procedencia: opcion(PROCEDENCIAS, 'La procedencia no es válida'),
    tipoRegistro: opcion(TIPOS_REGISTRO, 'El tipo de registro no es válido'),
    disponibilidad: opcion(DISPONIBILIDADES, 'La disponibilidad no es válida'),
    activa: opcion(['true', 'false', 'todas'], 'El estado no es válido'),
    pendienteDeCompletar: opcion(['true', 'false'], 'El valor no es válido'),
    requiereRevision: opcion(['true', 'false'], 'El valor no es válido'),
    ...paginacion,
})
