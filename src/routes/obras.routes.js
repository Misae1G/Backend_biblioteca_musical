import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import { validar } from '../middlewares/validar.js'
import { obraSchema, documentoSchema, estadoObraSchema } from '../validators/obras.js'
import * as obras from '../controllers/obras.controller.js'

const router = Router()

router.use(...protegido('usuario'))

router.get('/', obras.listar)
router.post('/', validar(obraSchema), obras.crear)
router.get('/:id', obras.obtener)
router.put('/:id', validar(obraSchema), obras.editar)
router.patch('/:id/estado', validar(estadoObraSchema), obras.cambiarEstado)

router.post('/:id/documentos', validar(documentoSchema), obras.agregarDocumento)
router.put('/:id/documentos/:docId', validar(documentoSchema), obras.editarDocumento)
router.delete('/:id/documentos/:docId', obras.eliminarDocumento)

export default router