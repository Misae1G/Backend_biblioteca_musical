import { Router } from 'express'
import { protegido } from '../middlewares/auth.js'
import * as reportes from '../controllers/reportes.controller.js'

const router = Router()

router.use(...protegido('usuario'))

// tipo: obras | inventario | prestamos | interpretaciones | copia
// ?formato=json|xlsx|pdf  &desde=AAAA-MM-DD  &hasta=AAAA-MM-DD
router.get('/:tipo', reportes.generar)

export default router
