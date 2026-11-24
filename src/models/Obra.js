import mongoose from 'mongoose'
import Carpeta from './Carpeta.js'
import Catalogo from './Catalogo.js'
import { normalizarTexto } from '../utils/texto.js'

export const TIPOS_REGISTRO = ['original', 'adaptacion', 'mosaico']
export const PROCEDENCIAS = ['ecuatoriana', 'universal']
export const FACTIBLE_SIN_VOZ = ['si', 'no']

const anioMaximo = () => new Date().getFullYear() + 1

const validarAnio = {
    validator: (v) => Number.isInteger(v) && v >= 1000 && v <= anioMaximo(),
    message: 'El año no es válido',
}

const texto = (max) => ({
    type: String,
    trim: true,
    maxlength: [max, `No puede superar ${max} caracteres`],
})

const instrumentoSchema = new mongoose.Schema(
    {
        familia: { type: mongoose.Schema.Types.ObjectId, ref: 'Catalogo', required: [true, 'La familia es obligatoria'] },
        instrumento: { type: mongoose.Schema.Types.ObjectId, ref: 'Catalogo', required: [true, 'El instrumento es obligatorio'] },
        cantidad: {
            type: Number,
            default: 1,
            min: [1, 'La cantidad debe ser al menos 1'],
            validate: { validator: Number.isInteger, message: 'La cantidad debe ser un número entero' },
        },
    },
    { _id: false }
)

// Canciones que componen un mosaico (solo datos de texto, no son obras independientes)
const cancionSchema = new mongoose.Schema(
    {
        orden: { type: Number, min: 1 }, // se asigna automáticamente según la posición
        titulo: { ...texto(200), required: [true, 'El título de la canción es obligatorio'] },
        compositor: texto(150),
        genero: texto(100), // p. ej. "Aria de ópera - Soprano"
        observacion: texto(300),
    },
    { _id: false }
)

// Enlaces a documentos digitales (Drive, OneDrive, etc.)
const documentoSchema = new mongoose.Schema(
    {
        nombre: { ...texto(150), required: [true, 'El nombre del documento es obligatorio'] },
        tipoArchivo: texto(30),
        enlace: {
            type: String,
            trim: true,
            required: [true, 'El enlace es obligatorio'],
            maxlength: [2000, 'El enlace es demasiado largo'],
            match: [/^https?:\/\/\S+$/i, 'El enlace debe empezar por http:// o https://'],
        },
        observaciones: texto(300),
    },
    { timestamps: false }
)

const obraSchema = new mongoose.Schema(
    {
        // Datos principales
        titulo: { ...texto(200), required: [true, 'El título es obligatorio'] },
        tipoRegistro: {
            type: String,
            enum: { values: TIPOS_REGISTRO, message: 'El tipo de registro no es válido' },
            required: [true, 'El tipo de registro es obligatorio'],
        },
        autor: texto(150),
        arreglista: texto(150),
        orquestador: texto(150),
        opus: texto(50),
        anioComposicion: { type: Number, validate: validarAnio },
        anioArreglo: { type: Number, validate: validarAnio },

        // Clasificación
        tipoObra: { type: mongoose.Schema.Types.ObjectId, ref: 'Catalogo' },
        procedencia: {
            type: String,
            enum: { values: PROCEDENCIAS, message: 'La procedencia no es válida' },
        },
        agrupacion: { type: mongoose.Schema.Types.ObjectId, ref: 'Catalogo' },

        // Instrumentación
        instrumentacion: { type: [instrumentoSchema], default: [] },

        // Características musicales
        tonalidad: texto(50),
        compas: texto(50),
        tiempo: texto(50),
        duracion: { type: Number, min: [0, 'La duración no puede ser negativa'] }, // en segundos
        numeroMovimientos: {
            type: Number,
            min: [1, 'El número de movimientos debe ser al menos 1'],
            validate: { validator: Number.isInteger, message: 'Debe ser un número entero' },
        },

        // Edición y estado del material (datos del catálogo original)
        edicion: texto(150),
        formato: texto(150), // formato o instrumentación de esta versión (p. ej. "Orquesta de cuerdas")
        detalleMaterial: texto(200),
        estadoMaterial: texto(150), // p. ej. "Completo", "Falta parte de coro"
        factibleSinVoz: {
            type: String,
            enum: { values: FACTIBLE_SIN_VOZ, message: 'El valor de «factible sin voz» no es válido' },
        },

        // Datos históricos de conciertos (texto libre del catálogo original; las interpretaciones nuevas van en su módulo)
        directorConcierto: texto(150),
        solistaConcierto: texto(150),

        // Ubicación
        carpeta: { type: mongoose.Schema.Types.ObjectId, ref: 'Carpeta', required: [true, 'La carpeta es obligatoria'] },
        observaciones: texto(1000),

        // Adaptaciones: apunta a la obra original
        obraOriginal: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra' },

        // Mosaicos: canciones en orden
        canciones: { type: [cancionSchema], default: [] },

        // Documentos digitales
        documentos: { type: [documentoSchema], default: [] },

        // Disponibilidad física (se recalcula desde préstamos e interpretaciones)
        prestadaFisicamente: { type: Boolean, default: false },
        enInterpretacion: { type: Boolean, default: false },

        // Texto normalizado para búsquedas (se calcula solo)
        busqueda: { type: String, select: false },

        // Control
        activa: { type: Boolean, default: true },
        pendienteDeCompletar: { type: Boolean, default: false },
        requiereRevision: { type: Boolean, default: false }, // marcada «revisar» en el catálogo original
        creadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
        modificadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    },
    { timestamps: true, id: false }
)

obraSchema.index({ carpeta: 1 })
obraSchema.index({ obraOriginal: 1 })
obraSchema.index({ tipoRegistro: 1 })
obraSchema.index({ pendienteDeCompletar: 1 })
obraSchema.index({ requiereRevision: 1 })

// Los cuatro estados salen de combinar los dos indicadores
obraSchema.virtual('estadoDisponibilidad').get(function () {
    if (this.prestadaFisicamente && this.enInterpretacion) return 'en_interpretacion_y_prestada'
    if (this.prestadaFisicamente) return 'prestada_fisicamente'
    if (this.enInterpretacion) return 'en_interpretacion'
    return 'disponible'
})

obraSchema.pre('validate', async function () {
    const Obra = this.constructor

    // Carpeta existente
    if (this.carpeta && !(await Carpeta.exists({ _id: this.carpeta }))) {
        this.invalidate('carpeta', 'La carpeta indicada no existe')
    }

    // Tipo de obra y agrupación deben venir del catálogo correcto
    const verificarCatalogo = async (campo, tipo, mensaje) => {
        if (!this[campo]) return
        const item = await Catalogo.findById(this[campo]).select('tipo')
        if (!item || item.tipo !== tipo) this.invalidate(campo, mensaje)
    }
    await verificarCatalogo('tipoObra', 'tipoObra', 'El tipo de obra no es válido')
    await verificarCatalogo('agrupacion', 'agrupacion', 'La agrupación no es válida')

    // Obra original solo para adaptaciones
    if (this.obraOriginal) {
        if (this.tipoRegistro !== 'adaptacion') {
            this.invalidate('obraOriginal', 'Solo las adaptaciones pueden tener obra original')
        } else if (this.obraOriginal.equals(this._id)) {
            this.invalidate('obraOriginal', 'Una obra no puede ser adaptación de sí misma')
        } else if (!(await Obra.exists({ _id: this.obraOriginal }))) {
            this.invalidate('obraOriginal', 'La obra original indicada no existe')
        }
    }

    // Instrumentación: cada instrumento debe pertenecer a la familia indicada
    if (this.instrumentacion?.length) {
        const ids = this.instrumentacion.flatMap((i) => [i.familia, i.instrumento]).filter(Boolean)
        const items = await Catalogo.find({ _id: { $in: ids } }).select('tipo familia')
        const mapa = new Map(items.map((i) => [String(i._id), i]))

        this.instrumentacion.forEach((fila, n) => {
            const familia = mapa.get(String(fila.familia))
            const instrumento = mapa.get(String(fila.instrumento))
            if (!familia || familia.tipo !== 'familiaInstrumento') {
                this.invalidate(`instrumentacion.${n}.familia`, 'La familia no es válida')
            }
            if (
                !instrumento ||
                instrumento.tipo !== 'instrumento' ||
                String(instrumento.familia) !== String(fila.familia)
            ) {
                this.invalidate(`instrumentacion.${n}.instrumento`, 'El instrumento no pertenece a la familia indicada')
            }
        })
    }

    // Mosaico: debe tener canciones (salvo si está pendiente de completar, p. ej. al migrar el catálogo original);
    // las demás obras no pueden tenerlas
    if (this.tipoRegistro === 'mosaico') {
        if (!this.canciones?.length && !this.pendienteDeCompletar) {
            this.invalidate('canciones', 'Un mosaico debe tener al menos una canción')
        }
    } else if (this.canciones?.length) {
        this.invalidate('canciones', 'Solo los mosaicos pueden tener canciones')
    }

    // El orden de las canciones es siempre su posición en la lista
    this.canciones.forEach((cancion, n) => {
        cancion.orden = n + 1
    })

    // Campo de búsqueda: título, autor, arreglista, orquestador, opus y canciones del mosaico
    this.busqueda = normalizarTexto(
        [
            this.titulo,
            this.autor,
            this.arreglista,
            this.orquestador,
            this.opus,
            ...this.canciones.flatMap((c) => [c.titulo, c.compositor]),
        ]
            .filter(Boolean)
            .join(' ')
    )
})

obraSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret.__v
        delete ret.busqueda
        return ret
    },
})

export default mongoose.model('Obra', obraSchema)
