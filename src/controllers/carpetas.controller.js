import { listarCarpetasSchema } from '../validators/carpetas.js'
import * as servicio from '../services/carpetas.service.js'

export const listar = async (req, res) => {
    res.json(await servicio.listar(listarCarpetasSchema.parse(req.query)))
}

export const obtener = async (req, res) => {
    res.json(await servicio.obtener(req.params.id))
}

export const crear = async (req, res) => {
    const carpeta = await servicio.crear(req.body)
    res.status(201).json({ msg: 'Carpeta creada', carpeta })
}

export const editar = async (req, res) => {
    const carpeta = await servicio.editar(req.params.id, req.body)
    res.json({ msg: 'Carpeta actualizada', carpeta })
}

export const cambiarEstado = async (req, res) => {
    const carpeta = await servicio.cambiarEstado(req.params.id, req.body.activa)
    res.json({ msg: carpeta.activa ? 'Carpeta activada' : 'Carpeta inactivada', carpeta })
}