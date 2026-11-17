import Usuario from '../models/Usuario.js'
import { escaparRegex } from '../utils/texto.js'
import { listarUsuariosSchema } from '../validators/usuarios.js'
import * as servicio from '../services/usuarios.service.js'

export const listar = async (req, res) => {
    const { rol, activo, q, pagina, limite } = listarUsuariosSchema.parse(req.query)

    const filtro = {}
    if (rol) filtro.rol = rol
    if (activo) filtro.activo = activo === 'true'
    if (q) {
        const re = new RegExp(escaparRegex(q), 'i')
        filtro.$or = [{ nombre: re }, { nombreUsuario: re }, { correo: re }]
    }

    const [usuarios, total] = await Promise.all([
        Usuario.find(filtro)
            .collation({ locale: 'es' })
            .sort({ rol: 1, nombre: 1 })
            .skip((pagina - 1) * limite)
            .limit(limite),
        Usuario.countDocuments(filtro),
    ])

    res.json({ usuarios, total, pagina, paginas: Math.ceil(total / limite) })
}

export const obtener = async (req, res) => {
    res.json({ usuario: await servicio.buscar(req.params.id) })
}

export const crear = async (req, res) => {
    const { usuario, passwordTemporal } = await servicio.crearUsuario(req.body)
    res.set('Cache-Control', 'no-store')
    res.status(201).json({
        msg: 'Usuario creado. Entrega la contraseña temporal: no se volverá a mostrar',
        usuario,
        passwordTemporal,
    })
}

export const editar = async (req, res) => {
    const usuario = await servicio.editarUsuario(req.params.id, req.body)
    res.json({ msg: 'Usuario actualizado', usuario })
}

export const cambiarEstado = async (req, res) => {
    const usuario = await servicio.cambiarEstado(req.params.id, req.body.activo, req.usuario)
    res.json({ msg: usuario.activo ? 'Cuenta activada' : 'Cuenta desactivada', usuario })
}

export const restablecerPassword = async (req, res) => {
    const { usuario, passwordTemporal } = await servicio.restablecerPassword(req.params.id)
    res.set('Cache-Control', 'no-store')
    res.json({
        msg: 'Contraseña restablecida. Entrega la contraseña temporal: no se volverá a mostrar',
        usuario,
        passwordTemporal,
    })
}