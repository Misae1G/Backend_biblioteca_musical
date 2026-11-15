// Quita tildes, pasa a minúsculas y colapsa espacios.
// "  Sinfónica  Juvenil " -> "sinfonica juvenil"
export const normalizarTexto = (texto = '') =>
    String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()