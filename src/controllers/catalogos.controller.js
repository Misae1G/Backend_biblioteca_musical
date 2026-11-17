import { listarCatalogosSchema } from '../validators/catalogos.js'
import * as servicio from '../services/catalogos.service.js'

export const listar = async (req, res) => {
    const catalogos = await servicio.listar(listarCatalogosSchema.parse(req.query))
    res.json({ catalogos })
}

export const crear = async (req, res) => {
    const catalogo = await servicio.crear(req.body, req.usuario)
    res.status(201).json({ msg: 'Registro creado', catalogo })
}

export const renombrar = async (req, res) => {
    const catalogo = await servicio.renombrar(req.params.id, req.body.nombre)
    res.json({ msg: 'Registro actualizado', catalogo })
}

export const cambiarEstado = async (req, res) => {
    const catalogo = await servicio.cambiarEstado(req.params.id, req.body.activo)
    res.json({ msg: catalogo.activo ? 'Registro activado' : 'Registro inactivado', catalogo })
}