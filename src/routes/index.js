import { Router } from 'express'
import authRoutes from './auth.routes.js'

const router = Router()

router.get('/salud', (req, res) => res.json({ ok: true }))
router.use('/auth', authRoutes)

export default router