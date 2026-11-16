// Error con código HTTP, para responder al cliente con un mensaje claro
export class ErrorApp extends Error {
    constructor(estado, mensaje, detalles) {
        super(mensaje)
        this.estado = estado
        this.detalles = detalles
    }
}