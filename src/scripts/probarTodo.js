import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const carpeta = path.dirname(fileURLToPath(import.meta.url))

// Protección: nunca correr las pruebas contra la base de producción
let nombreBase = ''
try {
    nombreBase = new URL(process.env.MONGODB_URI).pathname.replace('/', '')
} catch {
    console.error('No se pudo leer el nombre de la base desde MONGODB_URI. Revisa tu archivo .env.')
    process.exit(1)
}
if (!nombreBase || /prod/i.test(nombreBase)) {
    console.error(`Base "${nombreBase || '(sin nombre)'}" no permitida para pruebas. Usa biblioteca_dev.`)
    process.exit(1)
}
console.log(`Base de datos de pruebas: ${nombreBase}\n`)

const scripts = [
    'probarUsuario', 'probarCarpeta', 'probarCatalogo', 'probarObra',
    'probarObraMosaico', 'probarPrestamo', 'probarInterpretacion', 'probarAuditoria',
]

const resumen = []
for (const nombre of scripts) {
    const r = spawnSync('node', [path.join(carpeta, `${nombre}.js`)], { encoding: 'utf8' })
    const ok = r.status === 0
    resumen.push({ nombre, ok })
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}`)
    if (!ok) console.log(r.stdout + r.stderr)
}

const fallidos = resumen.filter((r) => !r.ok).length
console.log(fallidos === 0
    ? `\n${scripts.length} de ${scripts.length} grupos de pruebas pasaron.`
    : `\n${fallidos} grupo(s) fallaron.`)
process.exit(fallidos === 0 ? 0 : 1)