import { listarPrestamosSchema } from '../validators/prestamos.js'
import * as servicio from '../services/prestamos.service.js'

export const listar = async (req, res) => {
    res.json(await servicio.listar(listarPrestamosSchema.parse(req.query)))
}

export const obtener = async (req, res) => {
    res.json({ prestamo: await servicio.obtener(req.params.id) })
}

export const crear = async (req, res) => {
    const prestamo = await servicio.crear(req.body, req.usuario)
    res.status(201).json({ msg: `Préstamo ${prestamo.codigo} registrado`, prestamo })
}

export const editar = async (req, res) => {
    const prestamo = await servicio.editar(req.params.id, req.body, req.usuario)
    res.json({ msg: 'Préstamo actualizado', prestamo })
}

export const devolver = async (req, res) => {
    const prestamo = await servicio.devolver(req.params.id, req.body, req.usuario)
    res.json({ msg: `Devolución del préstamo ${prestamo.codigo} registrada`, prestamo })
}

export const editarDevolucion = async (req, res) => {
    const prestamo = await servicio.editarDevolucion(req.params.id, req.body, req.usuario)
    res.json({ msg: 'Devolución actualizada', prestamo })
}
