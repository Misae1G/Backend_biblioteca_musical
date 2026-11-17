import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import { validar } from '../middlewares/validar.js'
import { crearUsuarioSchema, editarUsuarioSchema, estadoUsuarioSchema } from '../validators/usuarios.js'
import * as usuarios from '../controllers/usuarios.controller.js'

const router = Router()

// Solo el administrador gestiona cuentas
router.use(...protegido('administrador'))

router.get('/', usuarios.listar)
router.post('/', validar(crearUsuarioSchema), usuarios.crear)
router.get('/:id', usuarios.obtener)
router.put('/:id', validar(editarUsuarioSchema), usuarios.editar)
router.patch('/:id/estado', validar(estadoUsuarioSchema), usuarios.cambiarEstado)
router.post('/:id/restablecer-password', usuarios.restablecerPassword)

export default router