import { listarObrasSchema } from '../validators/obras.js'
import * as servicio from '../services/obras.service.js'

export const listar = async (req, res) => {
    res.json(await servicio.listar(listarObrasSchema.parse(req.query)))
}

export const obtener = async (req, res) => {
    res.json(await servicio.obtener(req.params.id))
}

export const crear = async (req, res) => {
    const obra = await servicio.crear(req.body, req.usuario)
    res.status(201).json({ msg: 'Obra registrada', obra })
}

export const editar = async (req, res) => {
    const obra = await servicio.editar(req.params.id, req.body, req.usuario)
    res.json({
        msg: obra.pendienteDeCompletar ? 'Obra guardada. Aún faltan datos obligatorios' : 'Obra actualizada',
        obra,
    })
}

export const cambiarEstado = async (req, res) => {
    const obra = await servicio.cambiarEstado(req.params.id, req.body.activa, req.usuario)
    res.json({ msg: obra.activa ? 'Obra activada' : 'Obra inactivada', obra })
}

export const agregarDocumento = async (req, res) => {
    const resultado = await servicio.agregarDocumento(req.params.id, req.body, req.usuario)
    res.status(201).json({ msg: 'Documento agregado', ...resultado })
}

export const editarDocumento = async (req, res) => {
    const resultado = await servicio.editarDocumento(req.params.id, req.params.docId, req.body, req.usuario)
    res.json({ msg: 'Documento actualizado', ...resultado })
}

export const eliminarDocumento = async (req, res) => {
    const resultado = await servicio.eliminarDocumento(req.params.id, req.params.docId, req.usuario)
    res.json({ msg: 'Documento eliminado', ...resultado })
}