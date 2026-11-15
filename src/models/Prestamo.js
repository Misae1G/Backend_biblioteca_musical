import mongoose from 'mongoose'
import Obra from './Obra.js'
import { generarCodigo } from './Contador.js'
import { normalizarTexto } from '../utils/texto.js'

export const TIPOS_ENTREGA = ['fisico', 'digital']
export const ESTADOS_PRESTAMO = ['pendiente', 'devuelto', 'finalizado']
export const ESTADOS_FISICOS = ['buen_estado', 'deteriorado', 'danado']

const texto = (max) => ({
    type: String,
    trim: true,
    maxlength: [max, `No puede superar ${max} caracteres`],
})

// Datos de la devolución (solo préstamos físicos)
const devolucionSchema = new mongoose.Schema(
    {
        fechaDevolucion: { type: Date, required: [true, 'La fecha de devolución es obligatoria'] },
        personaQueDevuelve: { ...texto(150), required: [true, 'La persona que devuelve es obligatoria'] },
        recibidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: [true, 'Falta el usuario que recibe'] },
        estadoFisico: {
            type: String,
            enum: { values: ESTADOS_FISICOS, message: 'El estado físico no es válido' },
            required: [true, 'El estado físico es obligatorio'],
        },
        observaciones: texto(500),
    },
    { _id: false }
)

const prestamoSchema = new mongoose.Schema(
    {
        codigo: { type: String, unique: true, immutable: true }, // PRE-0001, se asigna al guardar
        fechaSolicitud: { type: Date, required: [true, 'La fecha de solicitud es obligatoria'] },
        solicitante: { ...texto(150), required: [true, 'El solicitante es obligatorio'] },
        institucion: texto(150),
        personaQueRecibe: { ...texto(150), required: [true, 'La persona que recibe es obligatoria'] },
        obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: [true, 'La obra es obligatoria'] },
        tipoEntrega: {
            type: String,
            enum: { values: TIPOS_ENTREGA, message: 'El tipo de entrega no es válido' },
            required: [true, 'El tipo de entrega es obligatorio'],
        },
        fechaEntrega: { type: Date, required: [true, 'La fecha de entrega es obligatoria'] },
        observaciones: texto(1000),
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: [true, 'Falta el usuario que registra'] },

        // Se calcula solo: físico sin devolución = pendiente, con devolución = devuelto, digital = finalizado
        estado: { type: String, enum: ESTADOS_PRESTAMO },
        devolucion: { type: devolucionSchema },

        // Para historiales y reportes sin variantes de escritura
        solicitanteNormalizado: { type: String },
        institucionNormalizada: { type: String },
    },
    { timestamps: true }
)

prestamoSchema.index({ obra: 1, fechaEntrega: -1 })
prestamoSchema.index({ estado: 1 })
prestamoSchema.index({ solicitanteNormalizado: 1 })
prestamoSchema.index({ institucionNormalizada: 1 })

// Una obra solo puede tener UN préstamo físico pendiente a la vez
prestamoSchema.index(
    { obra: 1 },
    { unique: true, partialFilterExpression: { tipoEntrega: 'fisico', estado: 'pendiente' } }
)

prestamoSchema.pre('validate', async function () {
    // Estado derivado
    if (TIPOS_ENTREGA.includes(this.tipoEntrega)) {
        if (this.tipoEntrega === 'digital') {
            this.estado = 'finalizado'
            if (this.devolucion) this.invalidate('devolucion', 'Un préstamo digital no tiene devolución')
        } else {
            this.estado = this.devolucion ? 'devuelto' : 'pendiente'
        }
    }

    // Solo se prestan obras existentes y activas
    if (this.isNew && this.obra) {
        const obra = await Obra.findById(this.obra).select('activa')
        if (!obra || !obra.activa) this.invalidate('obra', 'La obra no existe o está inactiva')
    }

    // La devolución no puede ser anterior a la entrega
    if (this.devolucion?.fechaDevolucion && this.fechaEntrega &&
        this.devolucion.fechaDevolucion < this.fechaEntrega) {
        this.invalidate('devolucion.fechaDevolucion', 'La devolución no puede ser anterior a la entrega')
    }

    this.solicitanteNormalizado = this.solicitante ? normalizarTexto(this.solicitante) : undefined
    this.institucionNormalizada = this.institucion ? normalizarTexto(this.institucion) : undefined
})

// El código se pide después de validar, para no gastar números en registros inválidos
prestamoSchema.pre('save', async function () {
    if (this.isNew && !this.codigo) {
        this.codigo = await generarCodigo('prestamo', 'PRE')
    }
})

prestamoSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v
        return ret
    },
})

export default mongoose.model('Prestamo', prestamoSchema)