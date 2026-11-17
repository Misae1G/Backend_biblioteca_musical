import { Router } from 'express'
import { validar } from '../middlewares/validar.js'
import { autenticar } from '../middlewares/auth.js'
import { limitadorLogin, limitadorRecuperacion } from '../middlewares/limitadores.js'
import {
    loginSchema,
    cambiarPasswordSchema,
    recuperarSchema,
    restablecerSchema,
} from '../validators/auth.js'
import * as auth from '../controllers/auth.controller.js'

const router = Router()

router.post('/login', limitadorLogin, validar(loginSchema), auth.login)
router.post('/logout', auth.logout)
router.get('/me', autenticar, auth.perfil)
router.post('/cambiar-password', autenticar, limitadorLogin, validar(cambiarPasswordSchema), auth.cambiarPassword)
router.post('/recuperar', limitadorRecuperacion, validar(recuperarSchema), auth.recuperarPassword)
router.post('/restablecer', limitadorRecuperacion, validar(restablecerSchema), auth.restablecerPassword)

export default router