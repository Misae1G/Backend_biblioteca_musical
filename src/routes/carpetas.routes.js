import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import { validar } from '../middlewares/validar.js'
import { carpetaSchema, estadoCarpetaSchema } from '../validators/carpetas.js'
import * as carpetas from '../controllers/carpetas.controller.js'

const router = Router()

router.use(...protegido('usuario'))

router.get('/', carpetas.listar)
router.post('/', validar(carpetaSchema), carpetas.crear)
router.get('/:id', carpetas.obtener)
router.put('/:id', validar(carpetaSchema), carpetas.editar)
router.patch('/:id/estado', validar(estadoCarpetaSchema), carpetas.cambiarEstado)

export default router