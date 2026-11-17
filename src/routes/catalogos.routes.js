import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import { validar } from '../middlewares/validar.js'
import {
    crearCatalogoSchema, renombrarCatalogoSchema, estadoCatalogoSchema,
} from '../validators/catalogos.js'
import * as catalogos from '../controllers/catalogos.controller.js'

const router = Router()

router.use(...protegido('usuario'))

router.get('/', catalogos.listar)
router.post('/', validar(crearCatalogoSchema), catalogos.crear)
router.put('/:id', validar(renombrarCatalogoSchema), catalogos.renombrar)
router.patch('/:id/estado', validar(estadoCatalogoSchema), catalogos.cambiarEstado)

export default router