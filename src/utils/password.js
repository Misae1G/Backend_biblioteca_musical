import crypto from 'node:crypto'

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I)
export const generarPasswordTemporal = (largo = 12) => {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    return Array.from({ length: largo }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join('')
}