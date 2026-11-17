import Catalogo from '../models/Catalogo.js'
import { ErrorApp } from '../utils/ErrorApp.js'
import { conMensajeDuplicado } from '../utils/duplicados.js'
import { normalizarTexto } from '../utils/texto.js'

const buscar = async (id) => {
    const item = await Catalogo.findById(id)
    if (!item) throw new ErrorApp(404, 'Registro no encontrado')
    return item
}

export const listar = async ({ tipo, familia, activo }) => {
    const filtro = {}
    if (tipo) filtro.tipo = tipo
    if (familia) filtro.familia = familia
    if (activo) filtro.activo = activo === 'true'
    return Catalogo.find(filtro).collation({ locale: 'es' }).sort({ nombre: 1 })
}

export const crear = async ({ tipo, nombre, familia }, usuario) => {
    const existente = await Catalogo.findOne({ tipo, nombreNormalizado: normalizarTexto(nombre) })
    if (existente) {
        throw new ErrorApp(
            409,
            existente.activo
                ? `Ya existe "${existente.nombre}" en esta lista`
                : `"${existente.nombre}" ya existe pero está inactivo. Reactívalo en lugar de crearlo de nuevo`
        )
    }

    if (tipo === 'instrumento' && familia) {
        const padre = await Catalogo.findById(familia).select('tipo activo')
        if (padre?.tipo === 'familiaInstrumento' && !padre.activo) {
            throw new ErrorApp(409, 'La familia está inactiva. Reactívala antes de agregarle instrumentos')
        }
    }

    return conMensajeDuplicado('Ya existe ese valor en la lista', () =>
        Catalogo.create({ tipo, nombre, familia, creadoPor: usuario._id })
    )
}

export const renombrar = async (id, nombre) => {
    const item = await buscar(id)
    const choque = await Catalogo.findOne({
        tipo: item.tipo,
        nombreNormalizado: normalizarTexto(nombre),
        _id: { $ne: item._id },
    })
    if (choque) throw new ErrorApp(409, `Ya existe "${choque.nombre}" en esta lista`)

    item.nombre = nombre
    await conMensajeDuplicado('Ya existe ese valor en la lista', () => item.save())
    return item
}

export const cambiarEstado = async (id, activo) => {
    const item = await buscar(id)
    if (item.activo === activo) return item

    if (!activo && item.tipo === 'familiaInstrumento') {
        const n = await Catalogo.countDocuments({ tipo: 'instrumento', familia: item._id, activo: true })
        if (n > 0) throw new ErrorApp(409, `La familia tiene ${n} instrumento(s) activo(s). Inactívalos primero`)
    }
    if (activo && item.tipo === 'instrumento') {
        const familia = await Catalogo.findById(item.familia).select('activo')
        if (!familia?.activo) throw new ErrorApp(409, 'La familia de este instrumento está inactiva. Reactívala primero')
    }

    item.activo = activo
    await item.save()
    return item
}