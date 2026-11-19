import { createRequire } from 'node:module'
import path from 'node:path'
import ExcelJS from 'exceljs'
import pdfmake from 'pdfmake'

const require = createRequire(import.meta.url)
const fuentes = require('pdfmake/fonts/Roboto.js')
const carpetaFuentes = path.dirname(require.resolve('pdfmake/fonts/Roboto.js'))

// El PDF solo puede leer sus fuentes: sin acceso a otros archivos ni a internet
pdfmake.setFonts(fuentes)
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy((ruta) => path.resolve(ruta).startsWith(carpetaFuentes))

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short',
})
export const fechaGeneracion = (fecha = new Date()) => formatoFecha.format(fecha)

const COLOR_ENCABEZADO = '1F3A5F'

// ---------- Excel ----------

const nombreHoja = (titulo, usados) => {
    const base = titulo.replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 28) || 'Hoja'
    let nombre = base
    for (let n = 2; usados.has(nombre.toLowerCase()); n += 1) nombre = `${base} ${n}`
    usados.add(nombre.toLowerCase())
    return nombre
}

const estilarEncabezado = (fila) => {
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    fila.alignment = { vertical: 'middle', wrapText: true }
    fila.eachCell((celda) => {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLOR_ENCABEZADO}` } }
    })
}

const ajustarAnchos = (hoja, columnas, filas) => {
    columnas.forEach((c, i) => {
        const mayor = filas.reduce((max, f) => Math.max(max, String(f[c.clave] ?? '').length), c.etiqueta.length)
        hoja.getColumn(i + 1).width = Math.min(Math.max(mayor + 2, 10), 60)
    })
}

export const aExcel = async (reporte, generado = new Date()) => {
    const libro = new ExcelJS.Workbook()
    libro.creator = 'Sistema de Gestión de la Biblioteca Musical'
    libro.created = generado
    const usados = new Set()

    const resumen = libro.addWorksheet(nombreHoja('Resumen', usados))
    resumen.addRow([reporte.titulo]).font = { bold: true, size: 16 }
    resumen.addRow([`Generado: ${fechaGeneracion(generado)}`])
    for (const f of reporte.filtros) resumen.addRow([f.etiqueta, f.valor])
    resumen.addRow([])
    estilarEncabezado(resumen.addRow(['Indicador', 'Valor']))
    for (const r of reporte.resumen) resumen.addRow([r.etiqueta, r.valor]).getCell(2).alignment = { horizontal: 'right' }
    resumen.getColumn(1).width = 46
    resumen.getColumn(2).width = 30

    for (const s of reporte.secciones) {
        const hoja = libro.addWorksheet(nombreHoja(s.titulo, usados))
        estilarEncabezado(hoja.addRow(s.columnas.map((c) => c.etiqueta)))
        for (const fila of s.filas) {
            hoja.addRow(s.columnas.map((c) => fila[c.clave] ?? ''))
        }
        s.columnas.forEach((c, i) => {
            if (c.numero) hoja.getColumn(i + 1).alignment = { horizontal: 'right' }
        })
        ajustarAnchos(hoja, s.columnas, s.filas)
        hoja.views = [{ state: 'frozen', ySplit: 1 }]
        if (s.filas.length) {
            hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columnas.length } }
        }
    }

    return Buffer.from(await libro.xlsx.writeBuffer())
}

// ---------- PDF ----------

const celdaEncabezado = (texto, numero) => ({
    text: texto, bold: true, color: '#FFFFFF', fillColor: `#${COLOR_ENCABEZADO}`, alignment: numero ? 'right' : 'left',
})

const tablaSeccion = (s) => {
    if (!s.filas.length) return { text: 'Sin datos para mostrar.', italics: true, color: '#666666', margin: [0, 0, 0, 8] }
    return {
        table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: s.columnas.map((c) => (c.numero ? 'auto' : '*')),
            body: [
                s.columnas.map((c) => celdaEncabezado(c.etiqueta, c.numero)),
                ...s.filas.map((f) => s.columnas.map((c) => ({ text: String(f[c.clave] ?? ''), alignment: c.numero ? 'right' : 'left' }))),
            ],
        },
        layout: 'lightHorizontalLines',
        fontSize: 8,
        margin: [0, 0, 0, 10],
    }
}

export const aPdf = async (reporte, generado = new Date()) => {
    const anchoMaximo = Math.max(...reporte.secciones.map((s) => s.columnas.length), 0)
    const definicion = {
        pageSize: 'A4',
        pageOrientation: anchoMaximo > 5 ? 'landscape' : 'portrait',
        pageMargins: [36, 40, 36, 48],
        defaultStyle: { font: 'Roboto', fontSize: 9 },
        info: { title: reporte.titulo, author: 'Sistema de Gestión de la Biblioteca Musical' },
        footer: (pagina, total) => ({
            columns: [
                { text: `Generado: ${fechaGeneracion(generado)}`, alignment: 'left', fontSize: 8, color: '#666666' },
                { text: `Página ${pagina} de ${total}`, alignment: 'right', fontSize: 8, color: '#666666' },
            ],
            margin: [36, 12, 36, 0],
        }),
        content: [
            { text: reporte.titulo, fontSize: 18, bold: true, color: `#${COLOR_ENCABEZADO}`, margin: [0, 0, 0, 4] },
            ...reporte.filtros.map((f) => ({ text: `${f.etiqueta}: ${f.valor}`, color: '#444444' })),
            { text: 'Resumen', fontSize: 13, bold: true, margin: [0, 12, 0, 4] },
            {
                table: {
                    widths: ['*', 'auto'],
                    body: reporte.resumen.map((r) => [{ text: r.etiqueta }, { text: String(r.valor), alignment: 'right', bold: true }]),
                },
                layout: 'lightHorizontalLines',
                margin: [0, 0, 0, 6],
            },
            ...reporte.secciones.flatMap((s) => [
                { text: s.titulo, fontSize: 13, bold: true, margin: [0, 10, 0, 4], keepWithNext: true },
                tablaSeccion(s),
            ]),
        ],
    }
    return Buffer.from(await pdfmake.createPdf(definicion).getBuffer())
}
