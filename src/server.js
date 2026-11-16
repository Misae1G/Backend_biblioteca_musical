import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import config from './config/env.js'
import { rutaNoEncontrada, manejarErrores } from './middlewares/errores.js'

const app = express()

// Configuraciones
app.set('port', config.puerto)

// Middlewares
app.use(helmet())
app.use(cors({ origin: config.frontendUrl, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// Rutas
app.get('/api/salud', (req, res) => res.json({ ok: true }))

// Rutas no encontradas y errores (siempre al final)
app.use(rutaNoEncontrada)
app.use(manejarErrores)

export default app