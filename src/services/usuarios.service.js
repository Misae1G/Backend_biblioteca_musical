import Usuario from '../models/Usuario.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { conMensajeDuplicado } from '../utils/duplicados.js'
import { generarPasswordTemporal } from '../utils/password.js'

const MSG_DUPLICADO = 'Ese nombre de usuario ya está en uso'

export const buscar = async (id) => {
    const cuenta = await Usuario.findById(id)
    if (!cuenta) throw new ErrorApp(404, 'Cuenta no encontrada')
    return cuenta
}

const exigirUsuario = (cuenta, mensaje) => {
    if (cuenta.rol !== 'usuario') throw new ErrorApp(403, mensaje)
}

export const crearUsuario = async ({ nombre, nombreUsuario }) => {
    const passwordTemporal = generarPasswordTemporal()
    const usuario = await conMensajeDuplicado(MSG_DUPLICADO, () =>
        Usuario.create({
            rol: 'usuario',
            nombre,
            nombreUsuario,
            password: passwordTemporal,
            debeCambiarPassword: true,
        })
    )
    return { usuario, passwordTemporal }
}

export const editarUsuario = async (id, { nombre, nombreUsuario }) => {
    const cuenta = await buscar(id)
    exigirUsuario(cuenta, 'Solo se pueden editar cuentas de usuario')
    cuenta.nombre = nombre
    cuenta.nombreUsuario = nombreUsuario
    await conMensajeDuplicado(MSG_DUPLICADO, () => cuenta.save())
    return cuenta
}

// Un administrador no puede desactivarse a sí mismo: así siempre queda al menos uno activo
export const cambiarEstado = async (id, activo, administrador) => {
    const cuenta = await buscar(id)
    if (cuenta.activo === activo) return cuenta
    if (!activo && cuenta._id.equals(administrador._id)) {
        throw new ErrorApp(409, 'No puedes desactivar tu propia cuenta')
    }
    cuenta.activo = activo
    await cuenta.save()
    return cuenta
}

export const restablecerPassword = async (id) => {
    const cuenta = await buscar(id)
    exigirUsuario(cuenta, 'Solo se puede restablecer la contraseña de cuentas de usuario')
    const passwordTemporal = generarPasswordTemporal()
    cuenta.password = passwordTemporal
    cuenta.debeCambiarPassword = true
    await cuenta.save() // también invalida las sesiones anteriores
    return { usuario: cuenta, passwordTemporal }
}