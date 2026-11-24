import { normalizarTexto } from '../../utils/texto.js'

// Lee el .md definitivo (pestaña "Revisión") y arma, SIN tocar la base de datos, lo que se va a importar.

export const LIMITES = {
    carpetaNumero: 20, carpetaObs: 500, revisadaPor: 100, titulo: 200, autor: 150, arreglista: 150, orquestador: 150,
    edicion: 150, formato: 150, detalleMaterial: 200, estadoMaterial: 150, concierto: 150, observaciones: 1000,
    cancion: 200, compositor: 150, generoCancion: 100, obsCancion: 300, agrupacion: 80,
}
export const UMBRAL_AGRUPACION = 10

// Carpetas donde cada número musical (aria, dueto, etc.) es una obra independiente dentro de la misma carpeta.
// El resto de carpetas con números dentro (mosaicos) los guarda como canciones.
export const CARPETAS_CON_NUMEROS_INDEPENDIENTES = new Set([
    '162', '663', '2377', '1103', '2333', '2613', '427', '428', '2167', '1055', '2476', '2354',
    '377', '1167', '1558', '2250', '1217', '1060', '1046', '2430', '2431', '2088', '236', '2193',
])

// «Ver Detalle …» era un hipervínculo del Excel, no un dato: se quita solo el texto del vínculo
const RE_VINCULO = /\(?\s*\bver\s+detalles?\b(?:\s+(?:de\s+)?(?:arreglos?|arias\s+de\s+opera(?:\s+canto)?|m[uú]sica\s+de\s+c[aá]mara|arias))?\s*\)?/gi
export const quitarVinculo = (t) => !/\bver\s+detalles?\b/i.test(t) ? t : t.replace(RE_VINCULO, ' ').replace(/\s+/g, ' ').replace(/\s+([,;)])/g, '$1').trim()

const COL = {
    carpeta: 'Carpeta', tipoFila: 'Tipo de fila', autor: 'Autor', titulo: 'Título general', numero: 'Número musical / contenido',
    generoPieza: 'Género de la pieza', arreglista: 'Arreglista', orquestador: 'Orquestador', formato: 'Formato / instrumentación',
    edicion: 'Edición', detalle: 'Detalle del material', completo: '¿Detalle completo?', sinVoz: '¿Factible sin voz?',
    generoHoja: 'Género / formato (hoja principal)', duracion: 'Duración', director: 'Director - fecha de concierto',
    solista: 'Solista - fecha de concierto', obs: 'Observaciones', revision: 'Última revisión', realizado: 'Realizado por',
    tipoRegistro: 'Tipo de registro sugerido (backend)', marcas: 'Marcas de revisión',
}

const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

export const leerRevision = (texto) => {
    const lineas = texto.split(/\r?\n/)
    const iCab = lineas.findIndex((l) => l.startsWith('|') && l.includes('Tipo de fila'))
    if (iCab < 0) throw new Error('No se encontró la tabla «Revisión» (falta la columna «Tipo de fila»)')
    const celdas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    const cab = celdas(lineas[iCab])
    for (const nombre of Object.values(COL)) {
        if (!cab.includes(nombre)) throw new Error(`Falta la columna «${nombre}» en el archivo`)
    }
    const filas = []
    for (let i = iCab + 2; i < lineas.length; i += 1) {
        if (!lineas[i].startsWith('|')) continue
        const c = celdas(lineas[i])
        if (c.length !== cab.length) throw new Error(`Línea ${i + 1}: ${c.length} celdas, se esperaban ${cab.length}`)
        const fila = { linea: i + 1 }
        cab.forEach((n, k) => { fila[n] = c[k] === 'nan' ? '' : limpio(c[k]) })
        filas.push(fila)
    }
    return filas
}

// ---------- Duración y formato ----------
export const parsearDuracion = (texto) => {
    const t = texto.trim().toLowerCase()
    if (!t) return {}
    let m = t.match(/^(\d{1,3})\s*(?:mins?|minutos?)\.?(?:\s*aprox\.?)?$/)
    if (m) return { segundos: Number(m[1]) * 60 }
    m = t.match(/^(\d{1,3}):(\d{2})\s*(?:mins?|minutos?)?(?:\s*aprox\.?)?$/)
    if (m) return { segundos: Number(m[1]) * 60 + Number(m[2]) }
    m = t.match(/^(\d{1,3})'\s*(\d{1,2})"?$/)
    if (m) return { segundos: Number(m[1]) * 60 + Number(m[2]) }
    return { textoOriginal: texto.trim() }
}

// "SINFONIA - OBRA GRAN ORQUESTA" -> "Obra gran orquesta"; lo demás no se interpreta
export const formatoDeAgrupacion = (texto) => {
    const t = limpio(texto)
    if (!t) return ''
    const m = t.match(/^[^-]*-\s*(OBRA .+|GRAN ORQUESTA|ORQUESTA DE CAMARA)$/i)
    const formato = m ? m[1] : /^(obra |gran orquesta|orquesta)/i.test(t) ? t : ''
    if (!formato) return ''
    const bajo = formato.replace(/\s+/g, ' ').trim().toLowerCase()
    const f = bajo.charAt(0).toUpperCase() + bajo.slice(1)
    return f === 'Obra para orquesta de cuerdas' ? 'Obra orquesta de cuerdas' : f
}

const marcasDe = (fila) => fila[COL.marcas].split(';').map((m) => m.trim()).filter(Boolean)
const pideRevisar = (fila) => marcasDe(fila).some((m) => m === 'revisar' || m.endsWith(' revisar') || m.endsWith(', revisar'))
const textoSinVoz = (v) => (/^si$|^sí$/i.test(v) ? 'si' : /^no$/i.test(v) ? 'no' : '')

export const planRevision = (filas) => {
    const dudosos = []
    const dudoso = (categoria, fila, original, propuesta) =>
        dudosos.push({ categoria, linea: fila?.linea ?? '', carpeta: fila?.[COL.carpeta] ?? '', original, propuesta })
    const recortar = (valor, max, etiqueta, fila) => {
        if (valor && valor.length > max) {
            dudoso('CAMPO_MAS_LARGO_QUE_EL_LIMITE', fila, `${etiqueta}: ${valor}`, `Se recorta a ${max}`)
            return `${valor.slice(0, max - 1)}…`
        }
        return valor
    }

    const carpetas = new Map() // numero -> { numero, revisiones:[], notas:[], filas:[] }
    const obras = []
    let ultimaPrincipal = null // obra creada desde la última fila principal con título
    const ultimaPorCarpeta = new Map()
    const conjuntos = new Map() // carpetas con números independientes: datos de su título general

    const carpeta = (fila) => {
        const numero = fila[COL.carpeta].toUpperCase()
        if (!/^[A-Z0-9-]+$/.test(numero) || numero.length > LIMITES.carpetaNumero) {
            throw new Error(`Línea ${fila.linea}: número de carpeta no válido «${fila[COL.carpeta]}»`)
        }
        if (!carpetas.has(numero)) carpetas.set(numero, { numero, revisiones: [], notas: [], lineas: [] })
        const c = carpetas.get(numero)
        c.lineas.push(fila.linea)
        const fecha = fila[COL.revision], quien = fila[COL.realizado]
        if (fecha || quien) c.revisiones.push({ fecha, quien, linea: fila.linea })
        return c
    }

    const datosComunes = (fila) => {
        const obs = []
        const d = parsearDuracion(fila[COL.duracion])
        if (d.textoOriginal) {
            obs.push(`Duración (texto original): ${d.textoOriginal}`)
            dudoso('DURACION_NO_INTERPRETABLE', fila, fila[COL.duracion], 'No se carga duración; el texto queda en observaciones')
        }
        if (fila[COL.obs]) obs.unshift(fila[COL.obs])
        return {
            autor: recortar(fila[COL.autor], LIMITES.autor, 'Autor', fila),
            arreglista: recortar(fila[COL.arreglista], LIMITES.arreglista, 'Arreglista', fila),
            orquestador: recortar(fila[COL.orquestador], LIMITES.orquestador, 'Orquestador', fila),
            edicion: recortar(fila[COL.edicion], LIMITES.edicion, 'Edición', fila),
            formato: recortar(fila[COL.formato], LIMITES.formato, 'Formato', fila),
            detalleMaterial: recortar(fila[COL.detalle], LIMITES.detalleMaterial, 'Detalle del material', fila),
            estadoMaterial: recortar(fila[COL.completo], LIMITES.estadoMaterial, 'Detalle completo', fila),
            factibleSinVoz: textoSinVoz(fila[COL.sinVoz]),
            directorConcierto: recortar(fila[COL.director], LIMITES.concierto, 'Director', fila),
            solistaConcierto: recortar(fila[COL.solista], LIMITES.concierto, 'Solista', fila),
            duracion: d.segundos,
            obsPartes: obs,
            requiereRevision: pideRevisar(fila),
        }
    }

    for (const fila of filas) {
        for (const k of Object.values(COL)) {
            if (k === COL.marcas || !fila[k]) continue
            const limpia = quitarVinculo(fila[k])
            if (limpia !== fila[k]) {
                dudoso('VINCULO_VER_DETALLE', fila, `${k}: ${fila[k]}`, `Se quita el texto del vínculo → «${limpia}»`)
                fila[k] = limpia
            }
        }
        const tipoFila = fila[COL.tipoFila]
        const c = carpeta(fila)

        if (tipoFila === 'Registro principal' && CARPETAS_CON_NUMEROS_INDEPENDIENTES.has(c.numero) && fila[COL.titulo]) {
            // El título general solo encabeza la carpeta: cada número musical de abajo es una obra independiente.
            // Los datos de esta fila quedan como notas de la carpeta y se heredan en cada obra (edición, director, solista, formato).
            const partes = [
                `Título general: ${fila[COL.titulo]}`, fila[COL.obs] && `Observaciones: ${fila[COL.obs]}`,
                fila[COL.generoHoja] && `Género/formato: ${fila[COL.generoHoja]}`, fila[COL.duracion] && `Duración: ${fila[COL.duracion]}`,
            ].filter(Boolean)
            c.notas.push(partes.join(' · '))
            conjuntos.set(c.numero, { fila, titulo: fila[COL.titulo], autor: fila[COL.autor], k: datosComunes(fila), formatoAgrupacion: formatoDeAgrupacion(fila[COL.generoHoja]), generoHoja: fila[COL.generoHoja] })
            ultimaPrincipal = null
            continue
        }

        if (tipoFila === 'Registro principal') {
            if (!fila[COL.titulo]) {
                // Sin título no se puede crear una obra: la carpeta queda sin obra y lo que traiga se guarda como nota
                const partes = [
                    fila[COL.autor] && `Autor: ${fila[COL.autor]}`, fila[COL.generoHoja] && `Formato: ${fila[COL.generoHoja]}`,
                    fila[COL.edicion] && `Edición: ${fila[COL.edicion]}`, fila[COL.obs] && `Observaciones: ${fila[COL.obs]}`,
                    fila[COL.director] && `Director: ${fila[COL.director]}`, fila[COL.duracion] && `Duración: ${fila[COL.duracion]}`,
                ].filter(Boolean)
                if (fila[COL.realizado] && !fila[COL.revision]) partes.push(`Realizado por: ${fila[COL.realizado]}`)
                if (partes.length) c.notas.push(`Sin título en el catálogo. ${partes.join(' · ')}`)
                if (fila[COL.autor] || fila[COL.edicion]) {
                    dudoso('REGISTRO_SIN_TITULO', fila, partes.join(' · '), 'No se crea la obra (el título es obligatorio); los datos quedan como nota de la carpeta')
                }
                ultimaPrincipal = null
                continue
            }
            const k = datosComunes(fila)
            const formatoAgr = formatoDeAgrupacion(fila[COL.generoHoja])
            const obra = {
                clave: obras.length, linea: fila.linea, carpeta: c.numero,
                titulo: recortar(fila[COL.titulo], LIMITES.titulo, 'Título', fila),
                tipoRegistro: fila[COL.tipoRegistro], ...k, formatoAgrupacion: formatoAgr, generoHoja: fila[COL.generoHoja],
                canciones: [], obraOriginalClave: null, esArreglo: false,
            }
            if (!['original', 'adaptacion', 'mosaico'].includes(obra.tipoRegistro)) {
                dudoso('TIPO_DE_REGISTRO_NO_VALIDO', fila, obra.tipoRegistro, 'Se importa como «original»'); obra.tipoRegistro = 'original'
            }
            if (fila[COL.revision] && !/^\d{4}-\d{2}-\d{2}$/.test(fila[COL.revision])) {
                obra.obsPartes.push(`Última revisión (texto original): ${fila[COL.revision]}`)
                dudoso('ULTIMA_REVISION_NO_ES_FECHA', fila, fila[COL.revision], 'No se carga como fecha; queda en observaciones de la obra')
            }
            obras.push(obra)
            ultimaPrincipal = obra
            ultimaPorCarpeta.set(c.numero, obra)
            continue
        }

        if (tipoFila === 'Arreglo') {
            const principal = ultimaPorCarpeta.get(c.numero) ?? null
            const k = datosComunes(fila)
            const marcas = marcasDe(fila).join('; ')
            const noCoincide = /No coincide con la principal|Mismo autor pero obra distinta/.test(marcas)
            const obra = {
                clave: obras.length, linea: fila.linea, carpeta: c.numero,
                titulo: recortar(fila[COL.titulo] || principal?.titulo || '', LIMITES.titulo, 'Título', fila),
                tipoRegistro: 'adaptacion', ...k, formatoAgrupacion: '', generoHoja: '', canciones: [], esArreglo: true,
                obraOriginalClave: principal && !noCoincide && principal.tipoRegistro === 'original' ? principal.clave : null,
            }
            if (!obra.titulo) { dudoso('ARREGLO_SIN_TITULO', fila, '', 'No se importa'); continue }
            if (!obra.obraOriginalClave) {
                dudoso('ARREGLO_SIN_OBRA_ORIGINAL', fila, `${fila[COL.autor]} — ${fila[COL.titulo]}`,
                    principal ? `Sin vínculo a la obra principal de la carpeta («${principal.titulo}»): ${noCoincide ? 'no coincide con ella' : 'la principal no es una obra original'}` : 'La carpeta no tiene obra principal antes de esta fila')
            }
            if (!obra.arreglista) dudoso('ARREGLO_SIN_ARREGLISTA', fila, `${fila[COL.autor]} — ${fila[COL.titulo]} (${fila[COL.formato]})`, 'Se importa como adaptación sin arreglista')
            obras.push(obra)
            continue
        }

        if (tipoFila === 'Número musical / contenido' && conjuntos.has(c.numero)) {
            const g = conjuntos.get(c.numero)
            const titulo = recortar(fila[COL.numero], LIMITES.titulo, 'Número musical', fila)
            if (!titulo) { dudoso('NUMERO_SIN_TITULO', fila, '', 'No se importa'); continue }
            const obs = [fila[COL.generoPieza], `Título general: ${g.titulo}`, fila[COL.obs], fila[COL.detalle] && `Detalle: ${fila[COL.detalle]}`].filter(Boolean).join(' | ')
            obras.push({
                clave: obras.length, linea: fila.linea, carpeta: c.numero, titulo, tipoRegistro: 'original',
                autor: recortar(fila[COL.autor] || g.autor, LIMITES.autor, 'Autor', fila), arreglista: '', orquestador: '',
                edicion: g.k.edicion, formato: '', detalleMaterial: '', estadoMaterial: '', factibleSinVoz: '',
                directorConcierto: g.k.directorConcierto, solistaConcierto: g.k.solistaConcierto, duracion: undefined,
                obsPartes: [obs], requiereRevision: pideRevisar(fila) || g.k.requiereRevision,
                formatoAgrupacion: g.formatoAgrupacion, generoHoja: '', canciones: [], obraOriginalClave: null, esArreglo: false,
            })
            continue
        }

        if (tipoFila === 'Número musical / contenido') {
            const mosaico = ultimaPorCarpeta.get(c.numero)
            if (!mosaico || mosaico.tipoRegistro === 'adaptacion') {
                dudoso('PIEZA_SIN_MOSAICO', fila, `${fila[COL.numero]}`, mosaico ? 'No se importa: la obra principal es una adaptación y un mosaico no puede serlo' : 'No se importa: la carpeta no tiene una obra principal antes de esta fila')
                continue
            }

            const titulo = recortar(fila[COL.numero], LIMITES.cancion, 'Canción', fila)
            if (!titulo) { dudoso('PIEZA_SIN_TITULO', fila, '', 'No se importa'); continue }
            const mismoAutor = normalizarTexto(fila[COL.autor]) === normalizarTexto(mosaico.autor)
            const obsCancion = [fila[COL.obs], fila[COL.detalle] && `Detalle: ${fila[COL.detalle]}`, fila[COL.edicion] && `Edición: ${fila[COL.edicion]}`].filter(Boolean).join('. ')
            if (mosaico.tipoRegistro !== 'mosaico') {
                dudoso('PIEZA_EN_OBRA_QUE_NO_ES_MOSAICO', fila, `${fila[COL.numero]}`, `La carpeta ${c.numero} no está en la lista de números independientes y su obra principal no es un mosaico: no se importa`)
                continue
            }
            mosaico.canciones.push({
                titulo,
                ...(fila[COL.autor] && !mismoAutor && { compositor: recortar(fila[COL.autor], LIMITES.compositor, 'Compositor', fila) }),
                ...(fila[COL.generoPieza] && { genero: recortar(fila[COL.generoPieza], LIMITES.generoCancion, 'Género de la pieza', fila) }),
                ...(obsCancion && { observacion: recortar(obsCancion, LIMITES.obsCancion, 'Observación de canción', fila) }),
            })
            continue
        }

        throw new Error(`Línea ${fila.linea}: tipo de fila desconocido «${tipoFila}»`)
    }

    // Mosaicos sin canciones no se pueden crear
    for (const o of obras) {
        if (o.tipoRegistro === 'mosaico' && !o.canciones.length) {
            dudoso('MOSAICO_SIN_CANCIONES', { linea: o.linea, [COL.carpeta]: o.carpeta }, o.titulo, 'Se importa como mosaico pendiente de completar: el archivo no lista sus canciones')
        }
    }

    // Agrupaciones: solo los formatos que se repiten pasan al catálogo; el resto queda como texto en observaciones
    const conteo = new Map()
    for (const o of obras) if (o.formatoAgrupacion) conteo.set(o.formatoAgrupacion, (conteo.get(o.formatoAgrupacion) ?? 0) + 1)
    const agrupaciones = new Map([...conteo].filter(([, n]) => n >= UMBRAL_AGRUPACION))

    for (const o of obras) {
        o.agrupacion = agrupaciones.has(o.formatoAgrupacion) ? o.formatoAgrupacion : ''
        const partes = [...o.obsPartes]
        if (!o.agrupacion && o.generoHoja && !/^[^-]*-\s*$/.test(o.generoHoja)) partes.push(`Género/formato (hoja principal): ${o.generoHoja}`)
        o.observaciones = recortar(partes.join(' | '), LIMITES.observaciones, 'Observaciones', { linea: o.linea, [COL.carpeta]: o.carpeta })
        delete o.obsPartes
    }

    // Carpetas: última revisión y quién revisó; las notas de filas sin título pasan a observaciones
    const listaCarpetas = [...carpetas.values()].map((c) => {
        const conFecha = c.revisiones.find((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fecha))
        const distintas = new Set(c.revisiones.map((r) => `${r.fecha}|${r.quien}`))
        if (distintas.size > 1) dudoso('REVISIONES_DISTINTAS_EN_LA_CARPETA', { linea: c.lineas[0], [COL.carpeta]: c.numero }, [...distintas].join(' ; '), 'Se usa la primera con fecha')
        const notas = [...c.notas]
        const sinFecha = c.revisiones.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && r.fecha)
        for (const r of sinFecha) if (!obras.some((o) => o.linea === r.linea)) notas.push(`Última revisión (texto original): ${r.fecha}`)
        const quien = (conFecha ?? c.revisiones.find((r) => r.quien))?.quien ?? ''
        return {
            numero: c.numero,
            ultimaRevision: conFecha?.fecha ?? '',
            revisadaPor: recortar(quien, LIMITES.revisadaPor, 'Realizado por', { linea: c.lineas[0], [COL.carpeta]: c.numero }),
            observaciones: recortar(notas.join(' | '), LIMITES.carpetaObs, 'Observaciones de carpeta', { linea: c.lineas[0], [COL.carpeta]: c.numero }),
            lineas: c.lineas,
        }
    })

    // Variantes de nombre de quien revisó (solo se informan)
    const variantes = new Map()
    for (const c of listaCarpetas) if (c.revisadaPor) {
        const k = normalizarTexto(c.revisadaPor)
        variantes.set(k, new Map([...(variantes.get(k) ?? []), [c.revisadaPor, ((variantes.get(k) ?? new Map()).get(c.revisadaPor) ?? 0) + 1]]))
    }
    for (const g of variantes.values()) if (g.size > 1) dudoso('NOMBRE_DE_REVISOR_CON_VARIANTES', null, [...g].map(([n, v]) => `${n} (${v})`).join(' / '), 'Se conservan tal cual; dime cuál es el nombre correcto si quieres unificarlos')

    return { carpetas: listaCarpetas, obras, agrupaciones, conteoFormatos: conteo, dudosos }
}

export const resumenPlan = (plan) => {
    const porTipo = {}
    for (const o of plan.obras) porTipo[o.tipoRegistro] = (porTipo[o.tipoRegistro] ?? 0) + 1
    const numeroObras = new Set(plan.obras.map((o) => o.carpeta))
    return {
        carpetas: plan.carpetas.length,
        carpetasSinObra: plan.carpetas.filter((c) => !numeroObras.has(c.numero)).length,
        carpetasConRevision: plan.carpetas.filter((c) => c.ultimaRevision).length,
        obras: plan.obras.length, porTipo,
        adaptacionesVinculadas: plan.obras.filter((o) => o.obraOriginalClave !== null).length,
        canciones: plan.obras.reduce((n, o) => n + o.canciones.length, 0),
        conArreglista: plan.obras.filter((o) => o.arreglista).length,
        requierenRevision: plan.obras.filter((o) => o.requiereRevision).length,
        agrupaciones: Object.fromEntries(plan.agrupaciones),
        conDuracion: plan.obras.filter((o) => o.duracion !== undefined).length,
        dudosos: plan.dudosos.length,
    }
}
