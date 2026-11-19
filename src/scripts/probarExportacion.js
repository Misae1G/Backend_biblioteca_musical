// Prueba sin base de datos: construye reportes con datos de ejemplo y verifica el Excel y el PDF generados
import ExcelJS from 'exceljs'
import { crearVerificador } from './_ayuda.js'
import { construirObras, construirInventario, construirPrestamos, construirInterpretaciones, construirCopia } from '../services/reportes.builders.js'
import { aExcel, aPdf } from '../services/exportacion.service.js'

const { verificar, terminar } = crearVerificador()

const carpetas = [
    { _id: 'c1', numero: '10', ubicacionFisica: 'Estante A', activa: true },
    { _id: 'c2', numero: '2', activa: true },
    { _id: 'c3', numero: '1', activa: true },
]
const obras = Array.from({ length: 300 }, (_, i) => ({
    _id: `o${i}`,
    titulo: i === 0 ? '=SUMA(1+1) Ñandú «Pasillo»' : `Obra ${i}`,
    autor: i % 3 === 0 ? 'José Ñandú' : i % 3 === 1 ? 'jose nandu' : undefined,
    tipoRegistro: ['original', 'adaptacion', 'mosaico'][i % 3],
    tipoObra: { nombre: i % 2 ? 'Pasillo' : 'Sinfonía' },
    agrupacion: { nombre: 'Orquesta' },
    procedencia: i % 2 ? 'ecuatoriana' : 'universal',
    carpeta: { _id: carpetas[i % 3]._id, numero: carpetas[i % 3].numero },
    prestadaFisicamente: i === 1 || i === 4,
    enInterpretacion: i === 4 || i === 5,
    pendienteDeCompletar: i === 7,
    activa: true,
    instrumentacion: i === 0 ? [{ familia: { nombre: 'Cuerdas' }, instrumento: { nombre: 'Violín' }, cantidad: 8 }] : [],
    canciones: i === 2 ? [{ orden: 1, titulo: 'Noche Vieja', compositor: 'X' }] : [],
    documentos: i === 0 ? [{ nombre: 'Partitura', enlace: 'https://ejemplo.com/a' }] : [],
    duracion: i === 0 ? 245 : undefined,
}))
const prestamos = [
    { codigo: 'PRE-0001', obra: { _id: 'o1', titulo: 'Obra 1' }, solicitante: 'Juan Pérez', institucion: 'Orquesta Juvenil', personaQueRecibe: 'Ana', tipoEntrega: 'fisico', estado: 'pendiente', fechaSolicitud: new Date('2026-11-01'), fechaEntrega: new Date('2026-11-02') },
    { codigo: 'PRE-0002', obra: { _id: 'o2', titulo: 'Obra 2' }, solicitante: 'JUAN PEREZ', personaQueRecibe: 'Ana', tipoEntrega: 'fisico', estado: 'devuelto', fechaSolicitud: new Date('2026-10-01'), fechaEntrega: new Date('2026-10-02'), devolucion: { fechaDevolucion: new Date('2026-10-10'), personaQueDevuelve: 'Ana', estadoFisico: 'danado' } },
    { codigo: 'PRE-0003', obra: { _id: 'o3', titulo: 'Obra 3' }, solicitante: 'Luis', personaQueRecibe: 'Ana', tipoEntrega: 'digital', estado: 'finalizado', fechaSolicitud: new Date('2026-10-01'), fechaEntrega: new Date('2026-10-05') },
]
const interpretaciones = [
    { codigo: 'INT-0001', obra: { _id: 'o1', titulo: 'Obra 1', carpeta: { numero: '2' } }, fechaPrevista: new Date('2026-11-20'), programa: 'Concierto de Navidad', director: 'María López', estado: 'interpretada' },
    { codigo: 'INT-0002', obra: { _id: 'o1', titulo: 'Obra 1', carpeta: { numero: '2' } }, fechaPrevista: new Date('2026-12-05'), programa: 'concierto de navidad', director: 'Maria Lopez', estado: 'interpretada' },
    { codigo: 'INT-0003', obra: { _id: 'o2', titulo: 'Obra 2', carpeta: { numero: '10' } }, fechaPrevista: new Date('2026-12-06'), programa: 'Gala', director: 'José', estado: 'programada' },
    { codigo: 'INT-0004', obra: { _id: 'o3', titulo: 'Obra 3' }, fechaPrevista: new Date('2026-12-07'), programa: 'Gala', director: 'José', estado: 'cancelada' },
]

const resumen = (reporte, etiqueta) => reporte.resumen.find((r) => r.etiqueta === etiqueta)?.valor
const seccion = (reporte, titulo) => reporte.secciones.find((s) => s.titulo === titulo)

// ---------- Cálculos ----------
const rObras = construirObras({ obras, carpetas, totalInactivas: 5 })
verificar('Obras: total, originales, adaptaciones y mosaicos',
    resumen(rObras, 'Total de obras activas') === 300 && resumen(rObras, 'Originales') === 100 &&
    resumen(rObras, 'Adaptaciones') === 100 && resumen(rObras, 'Mosaicos') === 100)
verificar('Obras: pendientes e inactivas', resumen(rObras, 'Pendientes de completar') === 1 && resumen(rObras, 'Obras inactivas (no incluidas)') === 5)
const porAutor = seccion(rObras, 'Por autor').filas
verificar('Los autores se agrupan sin distinguir tildes ni mayúsculas',
    porAutor.length === 2 && porAutor[0].cantidad === 200 && porAutor[1].nombre === 'Sin autor registrado')
verificar('Las carpetas se ordenan como número (1, 2, 10)', seccion(rObras, 'Por carpeta').filas.map((f) => f.carpeta).join() === '1,2,10')
verificar('El listado trae todas las obras', seccion(rObras, 'Listado de obras').filas.length === 300)

const rInv = construirInventario({ obras, carpetas })
verificar('Inventario: cuenta cada estado',
    resumen(rInv, 'Disponible') === 297 && resumen(rInv, 'En interpretación') === 1 &&
    resumen(rInv, 'Prestada físicamente') === 1 && resumen(rInv, 'En interpretación y prestada físicamente') === 1)
verificar('Inventario: lista las obras no disponibles', seccion(rInv, 'Obras no disponibles').filas.length === 3)
verificar('Inventario: disponibles y no disponibles por carpeta suman las obras',
    seccion(rInv, 'Por carpeta').filas.every((f) => f.disponibles + f.noDisponibles === f.obras))

const rPre = construirPrestamos({ prestamos })
verificar('Préstamos: totales por tipo y estado',
    resumen(rPre, 'Total de préstamos') === 3 && resumen(rPre, 'Físicos') === 2 && resumen(rPre, 'Digitales') === 1 &&
    resumen(rPre, 'Pendientes de devolución') === 1 && resumen(rPre, 'Devueltos') === 1 && resumen(rPre, 'Digitales finalizados') === 1)
verificar('Préstamos: cuenta devueltos dañados', resumen(rPre, 'Devueltos dañados') === 1 && resumen(rPre, 'Devueltos deteriorados') === 0)
const porSolicitante = seccion(rPre, 'Por solicitante').filas
verificar('Préstamos: agrupa al solicitante sin importar tildes ni mayúsculas', porSolicitante[0].total === 2 && porSolicitante.length === 2)
verificar('Préstamos: agrupa por institución solo con las que existen', seccion(rPre, 'Por institución u orquesta').filas.length === 1)
verificar('Préstamos: lista los pendientes', seccion(rPre, 'Pendientes de devolución').filas.map((f) => f.codigo).join() === 'PRE-0001')
verificar('Préstamos: muestra el período', rPre.filtros[0].valor === 'Todo el historial')
verificar('Préstamos con rango muestra las fechas',
    construirPrestamos({ prestamos, desde: new Date('2026-10-01'), hasta: new Date('2026-10-31') }).filtros[0].valor === '2026-10-01')

const rInt = construirInterpretaciones({ interpretaciones })
verificar('Interpretaciones: totales por estado',
    resumen(rInt, 'Total de interpretaciones') === 4 && resumen(rInt, 'Interpretadas') === 2 &&
    resumen(rInt, 'Programadas') === 1 && resumen(rInt, 'Canceladas') === 1)
verificar('Interpretaciones: la obra más interpretada', seccion(rInt, 'Obras más interpretadas (máximo 20)').filas[0].veces === 2)
verificar('Interpretaciones: agrupa por programa y director sin importar tildes ni mayúsculas',
    seccion(rInt, 'Por concierto o programa').filas[0].total === 2 && seccion(rInt, 'Por director').filas[0].total === 2)
verificar('Interpretaciones: agrupa por mes', seccion(rInt, 'Por período (mes)').filas.map((f) => `${f.nombre}:${f.total}`).join() === '2026-11:1,2026-12:3')

const rCopia = construirCopia({ obras, carpetas, prestamos, interpretaciones })
verificar('Copia: incluye obras, instrumentación, canciones y documentos',
    seccion(rCopia, 'Obras').filas.length === 300 && seccion(rCopia, 'Instrumentación').filas.length === 1 &&
    seccion(rCopia, 'Canciones de mosaicos').filas.length === 1 && seccion(rCopia, 'Documentos digitales').filas.length === 1)
verificar('Copia: muestra la duración como mm:ss', seccion(rCopia, 'Obras').filas[0].duracion === '4:05')

// ---------- Excel ----------
for (const reporte of [rObras, rInv, rPre, rInt, rCopia]) {
    const buffer = await aExcel(reporte)
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.load(buffer)
    const nombres = libro.worksheets.map((h) => h.name)
    verificar(`Excel de ${reporte.tipo}: una hoja de resumen y una por sección`,
        nombres[0] === 'Resumen' && nombres.length === reporte.secciones.length + 1 && new Set(nombres.map((n) => n.toLowerCase())).size === nombres.length)
    const hojaResumen = libro.getWorksheet('Resumen')
    let valores = []
    hojaResumen.eachRow((fila) => valores.push(fila.values.slice(1).join('|')))
    verificar(`Excel de ${reporte.tipo}: el resumen trae los indicadores`,
        reporte.resumen.every((r) => valores.includes(`${r.etiqueta}|${r.valor}`)))
}
const libroObras = new ExcelJS.Workbook()
await libroObras.xlsx.load(await aExcel(rObras))
const hojaListado = libroObras.getWorksheet('Listado de obras')
verificar('Excel: el listado tiene encabezado y todas las filas', hojaListado.rowCount === 301)
verificar('Excel: un texto que empieza con = se guarda como texto, no como fórmula',
    typeof hojaListado.getCell('A2').value === 'string' && hojaListado.getCell('A2').value.startsWith('=SUMA'))
verificar('Excel: las cantidades se guardan como números', typeof libroObras.getWorksheet('Por tipo de obra').getCell('B2').value === 'number')

// ---------- PDF ----------
const pdfObras = await aPdf(rObras)
verificar('PDF de obras: es un PDF válido', pdfObras.subarray(0, 5).toString() === '%PDF-' && pdfObras.toString('latin1').trimEnd().endsWith('%%EOF'))
verificar('PDF de obras: con 300 filas genera varias páginas', (pdfObras.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length > 3)
for (const reporte of [rInv, rPre, rInt]) {
    const pdf = await aPdf(reporte)
    verificar(`PDF de ${reporte.tipo}: es un PDF válido`, pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 1500)
}
const pdfVacio = await aPdf(construirPrestamos({ prestamos: [] }))
verificar('PDF sin datos se genera igualmente', pdfVacio.subarray(0, 5).toString() === '%PDF-')
const xlsxVacio = await aExcel(construirInterpretaciones({ interpretaciones: [] }))
verificar('Excel sin datos se genera igualmente', xlsxVacio.subarray(0, 2).toString() === 'PK')

terminar()
