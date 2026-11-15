import mongoose from 'mongoose'
import Obra from './Obra.js'
import { generarCodigo } from './Contador.js'
import { normalizarTexto } from '../utils/texto.js'

export const ESTADOS_INTERPRETACION = ['programada', 'interpretada', 'cancelada', 'no_interpretada']

const texto = (max) => ({
    type: String,
    trim: true,
    maxlength: [max, `No puede superar ${max} caracteres`],
})

const interpretacionSchema = new mongoose.Schema(
    {
        codigo: { type: String, unique: true, immutable: true }, // INT-0001, se asigna al guardar
        obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: [true, 'La obra es obligatoria'] },
        fechaPrevista: { type: Date, required: [true, 'La fecha prevista es obligatoria'] },
        programa: { ...texto(200), required: [true, 'El programa o concierto es obligatorio'] },
        director: { ...texto(150), required: [true, 'El director es obligatorio'] },
        solista: texto(150),
        observaciones: texto(1000),
        estado: {
            type: String,
            enum: { values: ESTADOS_INTERPRETACION, message: 'El estado no es válido' },
            default: 'programada',
        },
        registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: [true, 'Falta el usuario que registra'] },

        // Para reportes sin variantes de escritura
        programaNormalizado: { type: String },
        directorNormalizado: { type: String },
    },
    { timestamps: true }
)

interpretacionSchema.index({ obra: 1, fechaPrevista: -1 })
interpretacionSchema.index({ estado: 1, fechaPrevista: 1 })
interpretacionSchema.index({ fechaPrevista: 1 })
interpretacionSchema.index({ programaNormalizado: 1 })
interpretacionSchema.index({ directorNormalizado: 1 })

interpretacionSchema.pre('validate', async function () {
    if (this.isNew) {
        // Toda interpretación nace como "programada"
        if (this.estado !== 'programada') {
            this.invalidate('estado', 'Una interpretación nueva debe estar programada')
        }
        // Solo se programan obras existentes y activas
        if (this.obra) {
            const obra = await Obra.findById(this.obra).select('activa')
            if (!obra || !obra.activa) this.invalidate('obra', 'La obra no existe o está inactiva')
        }
    }

    this.programaNormalizado = this.programa ? normalizarTexto(this.programa) : undefined
    this.directorNormalizado = this.director ? normalizarTexto(this.director) : undefined
})

// El código se pide después de validar, para no gastar números en registros inválidos
interpretacionSchema.pre('save', async function () {
    if (this.isNew && !this.codigo) {
        this.codigo = await generarCodigo('interpretacion', 'INT')
    }
})

interpretacionSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v
        return ret
    },
})

export default mongoose.model('Interpretacion', interpretacionSchema)