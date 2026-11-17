import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const usuarioSchema = new mongoose.Schema(
    {
        rol: {
            type: String,
            enum: ['administrador', 'usuario'],
            required: [true, 'El rol es obligatorio'],
        },
        nombre: {
            type: String,
            required: [true, 'El nombre es obligatorio'],
            trim: true,
            minlength: [3, 'El nombre debe tener al menos 3 caracteres'],
            maxlength: [100, 'El nombre no puede superar 100 caracteres'],
        },
        // Solo administradores
        correo: {
            type: String,
            trim: true,
            lowercase: true,
            unique: true,
            sparse: true,
            match: [/^\S+@\S+\.\S+$/, 'El correo no es válido'],
        },
        // Solo usuarios
        nombreUsuario: {
            type: String,
            trim: true,
            lowercase: true,
            unique: true,
            sparse: true,
            match: [
                /^[a-z0-9._-]{3,30}$/,
                'El nombre de usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo',
            ],
        },
        password: {
            type: String,
            required: [true, 'La contraseña es obligatoria'],
            minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
            select: false,
        },
        activo: { type: Boolean, default: true },
        debeCambiarPassword: { type: Boolean, default: true },
        ultimoAcceso: { type: Date },
        passwordCambiadaEn: { type: Date },
        // Recuperación de contraseña (solo administradores)
        codigoRecuperacion: { type: String, select: false },
        codigoRecuperacionExpira: { type: Date, select: false },
    },
    { timestamps: true }
)

// Reglas según el rol
usuarioSchema.pre('validate', async function () {
    if (this.rol === 'administrador') {
        if (!this.correo) this.invalidate('correo', 'El administrador debe tener correo')
        if (this.nombreUsuario) this.invalidate('nombreUsuario', 'El administrador no usa nombre de usuario')
    }
    if (this.rol === 'usuario') {
        if (!this.nombreUsuario) this.invalidate('nombreUsuario', 'El usuario debe tener nombre de usuario')
        if (this.correo) this.invalidate('correo', 'El usuario no usa correo')
    }
})

// Cifrar la contraseña solo cuando cambia
usuarioSchema.pre('save', async function () {
    if (!this.isModified('password')) return
    this.password = await bcrypt.hash(this.password, 12)
    this.passwordCambiadaEn = new Date()
})

// Comparar contraseña (requiere haber cargado el campo con .select('+password'))
usuarioSchema.methods.compararPassword = function (passwordPlano) {
    return bcrypt.compare(passwordPlano, this.password)
}

// Nunca devolver datos sensibles en las respuestas JSON
usuarioSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password
        delete ret.codigoRecuperacion
        delete ret.codigoRecuperacionExpira
        delete ret.passwordCambiadaEn
        delete ret.__v
        return ret
    },
})

export default mongoose.model('Usuario', usuarioSchema)