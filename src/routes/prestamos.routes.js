import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import { validar } from '../middlewares/validar.js'
import { prestamoSchema, editarPrestamoSchema, devolucionSchema } from '../validators/prestamos.js'
import * as prestamos from '../controllers/prestamos.controller.js'

const router = Router()

router.use(...protegido('usuario'))

router.get('/', prestamos.listar)
router.post('/', validar(prestamoSchema), prestamos.crear)
router.get('/:id', prestamos.obtener)
router.put('/:id', validar(editarPrestamoSchema), prestamos.editar)
router.post('/:id/devolucion', validar(devolucionSchema), prestamos.devolver)
router.put('/:id/devolucion', validar(devolucionSchema), prestamos.editarDevolucion)

export default router
