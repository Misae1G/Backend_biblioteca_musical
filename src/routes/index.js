import { Router } from 'express'
import authRoutes from './auth.routes.js'
import usuariosRoutes from './usuarios.routes.js'
import carpetasRoutes from './carpetas.routes.js'
import catalogosRoutes from './catalogos.routes.js'

const router = Router()

router.get('/salud', (req, res) => res.json({ ok: true }))
router.use('/auth', authRoutes)
router.use('/usuarios', usuariosRoutes)
router.use('/carpetas', carpetasRoutes)
router.use('/catalogos', catalogosRoutes)

export default router