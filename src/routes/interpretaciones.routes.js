import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import { validar } from '../middlewares/validar.js'
import {
    interpretacionSchema, editarInterpretacionSchema, estadoInterpretacionSchema,
} from '../validators/interpretaciones.js'
import * as interpretaciones from '../controllers/interpretaciones.controller.js'

const router = Router()

router.use(...protegido('usuario'))

router.get('/', interpretaciones.listar)
router.get('/semana', interpretaciones.semana) // antes de /:id
router.post('/', validar(interpretacionSchema), interpretaciones.crear)
router.get('/:id', interpretaciones.obtener)
router.put('/:id', validar(editarInterpretacionSchema), interpretaciones.editar)
router.patch('/:id/estado', validar(estadoInterpretacionSchema), interpretaciones.cambiarEstado)

export default router
