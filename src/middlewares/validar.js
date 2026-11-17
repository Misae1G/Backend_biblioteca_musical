// Valida y limpia el cuerpo de la petición con un esquema Zod
export const validar = (esquema) => (req, res, next) => {
    req.body = esquema.parse(req.body ?? {})
    next()
}