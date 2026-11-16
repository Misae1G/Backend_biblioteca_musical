import 'dotenv/config'

const requeridas = ['MONGODB_URI', 'JWT_SECRET']
const faltantes = requeridas.filter((nombre) => !process.env[nombre])

if (faltantes.length) {
    console.error(`Faltan variables en el archivo .env: ${faltantes.join(', ')}`)
    process.exit(1)
}

if (process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET debe tener al menos 32 caracteres')
    process.exit(1)
}

const config = {
    entorno: process.env.NODE_ENV || 'development',
    puerto: Number(process.env.PORT) || 3000,
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpira: process.env.JWT_EXPIRES_IN || '8h',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
}

export default config