/**
 * Verifica si una cadena de texto es un objeto JSON válido.
 * @param str La cadena de texto a validar.
 * @returns true si la cadena es un JSON válido, de lo contrario, false.
 */
export const isJSON = (str: string): boolean => {
    if (typeof str !== 'string' || str.trim() === '') {
        return false; // Asegura que solo procesamos strings no vacíos
    }
    try {
        const parsed = JSON.parse(str);
        
        // Opcional: Verifica que el resultado parseado sea realmente un objeto (y no un número, boolean, o array)
        if (typeof parsed === 'object' && parsed !== null) {
            return true;
        }
        return false;
    } catch (e) {
        // Si JSON.parse() falla, el string no era un JSON válido.
        return false;
    }
}