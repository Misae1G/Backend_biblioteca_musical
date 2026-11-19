import { listarInterpretacionesSchema, semanaSchema } from '../validators/interpretaciones.js'
import * as servicio from '../services/interpretaciones.service.js'

export const listar = async (req, res) => {
    res.json(await servicio.listar(listarInterpretacionesSchema.parse(req.query)))
}

export const semana = async (req, res) => {
    res.json(await servicio.semana(semanaSchema.parse(req.query)))
}

export const obtener = async (req, res) => {
    res.json({ interpretacion: await servicio.obtener(req.params.id) })
}

export const crear = async (req, res) => {
    const interpretacion = await servicio.crear(req.body, req.usuario)
    res.status(201).json({ msg: `Interpretación ${interpretacion.codigo} programada`, interpretacion })
}

export const editar = async (req, res) => {
    const interpretacion = await servicio.editar(req.params.id, req.body, req.usuario)
    res.json({ msg: 'Interpretación actualizada', interpretacion })
}

export const cambiarEstado = async (req, res) => {
    const interpretacion = await servicio.cambiarEstado(req.params.id, req.body.estado, req.usuario)
    res.json({ msg: 'Estado actualizado', interpretacion })
}
