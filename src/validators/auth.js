import { z } from 'zod'

const vacioSiFalta = (v) => (v === undefined || v === null ? '' : v)

export const passwordNuevaSchema = z.preprocess(
    vacioSiFalta,
    z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .refine((v) => Buffer.byteLength(v) <= 72, 'La contraseña es demasiado larga (máximo 72 caracteres)')
        .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'La contraseña debe incluir letras y números')
)

export const loginSchema = z.object({
    identificador: z.preprocess(
        vacioSiFalta,
        z.string().trim().min(1, 'Ingresa tu correo o usuario').max(150, 'El dato ingresado no es válido')
    ),
    password: z.preprocess(
        vacioSiFalta,
        z.string().min(1, 'Ingresa tu contraseña').max(200, 'La contraseña no es válida')
    ),
})

export const cambiarPasswordSchema = z
    .object({
        passwordActual: z.preprocess(
            vacioSiFalta,
            z.string().min(1, 'Ingresa tu contraseña actual').max(200, 'La contraseña no es válida')
        ),
        passwordNueva: passwordNuevaSchema,
    })
    .refine((d) => d.passwordActual !== d.passwordNueva, {
        message: 'La nueva contraseña debe ser distinta de la actual',
        path: ['passwordNueva'],
    })

export const recuperarSchema = z.object({
    correo: z.preprocess(
        vacioSiFalta,
        z
            .string()
            .trim()
            .min(1, 'Ingresa tu correo')
            .max(150, 'El correo no es válido')
            .regex(/^\S+@\S+\.\S+$/, 'El correo no es válido')
    ),
})

export const restablecerSchema = z.object({
    token: z.preprocess(
        vacioSiFalta,
        z.string().trim().regex(/^[a-f0-9]{64}$/, 'El enlace no es válido o ya venció')
    ),
    passwordNueva: passwordNuevaSchema,
})