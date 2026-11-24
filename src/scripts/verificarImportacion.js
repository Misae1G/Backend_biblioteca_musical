import 'dotenv/config'
import fs from 'fs'
import mongoose from 'mongoose'
import Carpeta from '../models/Carpeta.js'
import Obra from '../models/Obra.js'
import Catalogo from '../models/Catalogo.js'
import { normalizarTexto } from '../utils/texto.js'
import { leerRevision, planRevision, resumenPlan } from './importacion/planRevision.js'

// Uso: node src/scripts/verificarImportacion.js ruta/al/excel_completo.md
// Solo lee: compara lo guardado con lo que dice el archivo y revisa las relaciones.
const archivo = process.argv[2]
if (!archivo || !fs.existsSync(archivo)) {
    console.error('Indica la ruta del archivo .md')
    process.exit(1)
}
const plan = planRevision(leerRevision(fs.readFileSync(archivo, 'utf8')))
const esperado = resumenPlan(plan)

await mongoose.connect(process.env.MONGODB_URI)
console.log(`Base de datos: ${mongoose.connection.name}\n`)

let fallos = 0
const verificar = (nombre, ok, detalle = '') => {
    if (!ok) fallos += 1
    console.log(`${ok ? 'OK    ' : 'FALLÓ '} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

const numeros = plan.carpetas.map((c) => c.numero)
const carpetas = await Carpeta.find({ numero: { $in: numeros } })
verificar('Todas las carpetas del archivo existen', carpetas.length === esperado.carpetas, `${carpetas.length} de ${esperado.carpetas}`)
verificar('Carpetas con última revisión', carpetas.filter((c) => c.ultimaRevision).length === esperado.carpetasConRevision)

const ids = carpetas.map((c) => c._id)
const obras = await Obra.find({ carpeta: { $in: ids } }).select('+busqueda')
verificar('Cantidad de obras', obras.length === esperado.obras, `${obras.length} de ${esperado.obras}`)
for (const tipo of ['original', 'adaptacion', 'mosaico']) {
    verificar(`Obras de tipo ${tipo}`, obras.filter((o) => o.tipoRegistro === tipo).length === (esperado.porTipo[tipo] ?? 0),
        `${obras.filter((o) => o.tipoRegistro === tipo).length} de ${esperado.porTipo[tipo] ?? 0}`)
}
const canciones = obras.reduce((s, o) => s + o.canciones.length, 0)
verificar('Canciones dentro de mosaicos', canciones === esperado.canciones, `${canciones} de ${esperado.canciones}`)
verificar('Obras con arreglista', obras.filter((o) => o.arreglista).length === esperado.conArreglista)
verificar('Obras que requieren revisión', obras.filter((o) => o.requiereRevision).length === esperado.requierenRevision)
verificar('Obras con duración', obras.filter((o) => o.duracion !== undefined && o.duracion !== null).length === esperado.conDuracion)

// Relaciones
const porId = new Map(obras.map((o) => [String(o._id), o]))
const idsCarpeta = new Set(ids.map(String))
verificar('Toda obra apunta a una carpeta existente', obras.every((o) => idsCarpeta.has(String(o.carpeta))))
const vinculadas = obras.filter((o) => o.obraOriginal)
verificar('Adaptaciones vinculadas a su obra original', vinculadas.length === esperado.adaptacionesVinculadas, `${vinculadas.length} de ${esperado.adaptacionesVinculadas}`)
verificar('Cada obra original vinculada existe, es de la misma carpeta y es de tipo original',
    vinculadas.every((o) => { const p = porId.get(String(o.obraOriginal)); return p && String(p.carpeta) === String(o.carpeta) && p.tipoRegistro === 'original' }))
verificar('Solo los mosaicos tienen canciones', obras.every((o) => o.tipoRegistro === 'mosaico' || o.canciones.length === 0))
verificar('Las canciones tienen orden consecutivo', obras.every((o) => o.canciones.every((c, i) => c.orden === i + 1)))
verificar('Ninguna obra está disponible de forma incorrecta (sin préstamos ni interpretaciones)', obras.every((o) => !o.prestadaFisicamente && !o.enInterpretacion))

const agrupaciones = await Catalogo.find({ tipo: 'agrupacion', nombre: { $in: Object.keys(esperado.agrupaciones) } })
verificar('Agrupaciones creadas en el catálogo', agrupaciones.length === Object.keys(esperado.agrupaciones).length)
for (const a of agrupaciones) {
    const n = obras.filter((o) => String(o.agrupacion) === String(a._id)).length
    verificar(`Obras con agrupación «${a.nombre}»`, n === esperado.agrupaciones[a.nombre], `${n} de ${esperado.agrupaciones[a.nombre]}`)
}

// Duplicados: misma carpeta, título, tipo, arreglista y formato
const vistos = new Map()
for (const o of obras) {
    const k = [o.carpeta, normalizarTexto(o.titulo), o.tipoRegistro, normalizarTexto(o.arreglista ?? ''), normalizarTexto(o.formato ?? ''), normalizarTexto(o.detalleMaterial ?? ''), normalizarTexto(o.edicion ?? '')].join('|')
    vistos.set(k, (vistos.get(k) ?? 0) + 1)
}
verificar('No hay obras duplicadas', [...vistos.values()].every((v) => v === 1), `${[...vistos.values()].filter((v) => v > 1).length} grupos repetidos`)

// Ejemplos para revisar a mano
const ver = async (numero) => {
    const c = carpetas.find((x) => x.numero === numero)
    if (!c) return console.log(`\nCarpeta ${numero}: no existe`)
    console.log(`\nCarpeta ${numero} (revisión ${c.ultimaRevision?.toISOString().slice(0, 10) ?? '—'}, por ${c.revisadaPor ?? '—'})`)
    for (const o of obras.filter((x) => String(x.carpeta) === String(c._id))) {
        console.log(`  [${o.tipoRegistro}] ${o.titulo} | autor: ${o.autor ?? '—'} | arreglista: ${o.arreglista ?? '—'} | canciones: ${o.canciones.length}${o.obraOriginal ? ' | vinculada a original' : ''}`)
    }
}
for (const n of ['162', '2626', '1919', '2539']) await ver(n)

console.log(fallos === 0 ? '\nTodas las verificaciones pasaron.' : `\n${fallos} verificación(es) fallaron.`)
await mongoose.disconnect()
process.exit(fallos === 0 ? 0 : 1)