/**
 * Utilities for Azure Functions
 */
/**
 *  * Validate input parameters according to a schema
 *  * @param {Object} data - Data to validate
 *  * @param {Object} schema - Validation schema
 *  * @returns {Object} - Validation result
 *  */
function validateInput(data, schema) {
    const errors = [];

    function validateField(value, fieldSchema, fieldName) {
        // Check if the field is required
        if (fieldSchema.required && (value === undefined || value === null)) {
            errors.push(`Le champ '${fieldName}' est requis`);
            return;
        }

        // If the value is undefined/null and not required, skip
        if (value === undefined || value === null) {
            return;
        }

        // Check the type
        if (fieldSchema.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== fieldSchema.type) {
                errors.push(`Le champ '${fieldName}' doit être de type ${fieldSchema.type}`);
                return;
            }
        }

        // Specific validations per type
        if (fieldSchema.type === 'string') {
            if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
                errors.push(`Le champ '${fieldName}' doit contenir au moins ${fieldSchema.minLength} caractères`);
            }
            if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
                errors.push(`Le champ '${fieldName}' ne peut pas contenir plus de ${fieldSchema.maxLength} caractères`);
            }
        }

        if (fieldSchema.type === 'array') {
            if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
                errors.push(`Le champ '${fieldName}' doit contenir au moins ${fieldSchema.minLength} éléments`);
            }
            if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
                errors.push(`Le champ '${fieldName}' ne peut pas contenir plus de ${fieldSchema.maxLength} éléments`);
            }
        }

        if (fieldSchema.type === 'number') {
            if (fieldSchema.min && value < fieldSchema.min) {
                errors.push(`Le champ '${fieldName}' doit être supérieur ou égal à ${fieldSchema.min}`);
            }
            if (fieldSchema.max && value > fieldSchema.max) {
                errors.push(`Le champ '${fieldName}' doit être inférieur ou égal à ${fieldSchema.max}`);
            }
        }

        // Validate object fields
        if (fieldSchema.type === 'object' && fieldSchema.fields) {
            for (const [subFieldName, subFieldSchema] of Object.entries(fieldSchema.fields)) {
                validateField(value[subFieldName], subFieldSchema, `${fieldName}.${subFieldName}`);
            }
        }
    }

    // Validate each field of the schema
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
        validateField(data[fieldName], fieldSchema, fieldName);
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Crée une réponse HTTP standardisée pour le succès
 * @param {number} statusCode - Code de statut HTTP
 * @param {Object} data - Données de réponse
 * @returns {Object} - Réponse Azure Functions
 */
function createResponse(statusCode, data) {
    return {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify(data)
    };
}

/**
 * Crée une réponse d'erreur HTTP standardisée
 * @param {number} statusCode - Code de statut HTTP
 * @param {string} message - Message d'erreur
 * @param {Object} details - Détails supplémentaires (optionnel)
 * @returns {Object} - Réponse Azure Functions
 */
function createErrorResponse(statusCode, message, details = null) {
    const errorResponse = {
        success: false,
        error: {
            code: statusCode,
            message: message,
            timestamp: new Date().toISOString()
        }
    };

    if (details) {
        errorResponse.error.details = details;
    }

    return {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        body: JSON.stringify(errorResponse)
    };
}

/**
 * Logs une erreur de manière standardisée
 * @param {Object} context - Contexte Azure Functions
 * @param {string} operation - Nom de l'opération
 * @param {Error} error - Erreur
 * @param {Object} additionalData - Données supplémentaires
 */
function logError(context, operation, error, additionalData = {}) {
    context.log.error(`[${operation}] Erreur:`, {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        ...additionalData
    });
}

/**
 * Logs une information de manière standardisée
 * @param {Object} context - Contexte Azure Functions
 * @param {string} operation - Nom de l'opération
 * @param {string} message - Message
 * @param {Object} data - Données supplémentaires
 */
function logInfo(context, operation, message, data = {}) {
    context.log.info(`[${operation}] ${message}`, {
        timestamp: new Date().toISOString(),
        ...data
    });
}

/**
 * Mesure le temps d'exécution d'une opération
 * @param {Function} operation - Fonction à mesurer
 * @returns {Object} - Résultat et durée
 */
async function measureExecutionTime(operation) {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;

    return {
        result,
        duration
    };
}

/**
 * Clean and sanitize a string
 * @param {string} input - Input string
 * @param {Object} options - Cleaning options
 * @returns {string} - Cleaned string
 */
function sanitizeString(input, options = {}) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    let cleaned = input.trim();

    // Remove control characters
    if (options.removeControlChars !== false) {
        cleaned = cleaned.replace(/[\r\n]+/g, ' ');
        cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    // Limit the length
    if (options.maxLength) {
        cleaned = cleaned.substring(0, options.maxLength);
    }

    // Remove multiple spaces
    if (options.normalizeSpaces !== false) {
        cleaned = cleaned.replace(/\s+/g, ' ');
    }

    return cleaned;
}

/**
 * Format an amount in euros
 * @param {number} amount - Amount
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted amount
 */
function formatCurrency(amount, options = {}) {
    if (!amount || typeof amount !== 'number') {
        return '0 €';
    }

    const formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: options.currency || 'EUR',
        minimumFractionDigits: options.decimals || 0,
        maximumFractionDigits: options.decimals || 0
    });

    return formatter.format(amount).replace(/\u202F/g, '\u00A0');
}

/**
 * Format a number with thousand separators
 * @param {number} number - Number
 * @returns {string} - Formatted number
 */
function formatNumber(number) {
    if (!number || typeof number !== 'number') {
        return '0';
    }

    return new Intl.NumberFormat('fr-FR').format(number).replace(/\u202F/g, '\u00A0');
}

/**
 * Generate a unique identifier
 * @returns {string} - Unique identifier
 */
function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Check if a URL is valid
 * @param {string} url - URL to check
 * @returns {boolean} - True if valid
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Return a CORS response for OPTIONS requests
 * @returns {Object} - CORS response
 */
function createCorsResponse() {
    return {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        },
        body: ''
    };
}

/**
 * Compute a simple hash for a string
 * @param {string} str - String to hash
 * @returns {string} - Hash value
 */
function simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
}

/**
 * Retry an operation with exponential backoff
 * @param {Function} operation - Operation to retry
 * @param {number} maxRetries - Maximum number of attempts
 * @param {number} baseDelay - Base delay in ms
 * @returns {*} - Operation result
 */
async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries) {
                throw lastError;
            }

            // Wait with exponential backoff
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

module.exports = {
    validateInput,
    createResponse,
    createErrorResponse,
    logError,
    logInfo,
    measureExecutionTime,
    sanitizeString,
    formatCurrency,
    formatNumber,
    generateId,
    isValidUrl,
    createCorsResponse,
    simpleHash,
    retryWithBackoff
};