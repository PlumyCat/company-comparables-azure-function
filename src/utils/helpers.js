/**\n * Utilitaires pour les Azure Functions\n */
/**
 *  * Valide les paramètres d'entrée selon un schéma
 *  * @param {Object} data - Données à valider
 *  * @param {Object} schema - Schéma de validation
 *  * @returns {Object} - Résultat de validation
 *  */
function validateInput(data, schema) {
    const errors = [];

    function validateField(value, fieldSchema, fieldName) {
        // Vérifier si le champ est requis
        if (fieldSchema.required && (value === undefined || value === null)) {
            errors.push(`Le champ '${fieldName}' est requis`);
            return;
        }

        // Si la valeur est undefined/null et pas requis, passer
        if (value === undefined || value === null) {
            return;
        }

        // Vérifier le type
        if (fieldSchema.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== fieldSchema.type) {
                errors.push(`Le champ '${fieldName}' doit être de type ${fieldSchema.type}`);
                return;
            }
        }

        // Validations spécifiques par type
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

        // Validation des champs d'objet
        if (fieldSchema.type === 'object' && fieldSchema.fields) {
            for (const [subFieldName, subFieldSchema] of Object.entries(fieldSchema.fields)) {
                validateField(value[subFieldName], subFieldSchema, `${fieldName}.${subFieldName}`);
            }
        }
    }

    // Valider chaque champ du schéma
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
 * Nettoie et sanitise une chaîne de caractères
 * @param {string} input - Chaîne d'entrée
 * @param {Object} options - Options de nettoyage
 * @returns {string} - Chaîne nettoyée
 */
function sanitizeString(input, options = {}) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    let cleaned = input.trim();

    // Supprimer les caractères de contrôle
    if (options.removeControlChars !== false) {
        cleaned = cleaned.replace(/[\r\n]+/g, ' ');
        cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    // Limiter la longueur
    if (options.maxLength) {
        cleaned = cleaned.substring(0, options.maxLength);
    }

    // Supprimer les espaces multiples
    if (options.normalizeSpaces !== false) {
        cleaned = cleaned.replace(/\s+/g, ' ');
    }

    return cleaned;
}

/**
 * Formate un montant en euros
 * @param {number} amount - Montant
 * @param {Object} options - Options de formatage
 * @returns {string} - Montant formaté
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
 * Formate un nombre avec des séparateurs de milliers
 * @param {number} number - Nombre
 * @returns {string} - Nombre formaté
 */
function formatNumber(number) {
    if (!number || typeof number !== 'number') {
        return '0';
    }

    return new Intl.NumberFormat('fr-FR').format(number).replace(/\u202F/g, '\u00A0');
}

/**
 * Génère un identifiant unique
 * @returns {string} - Identifiant unique
 */
function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Vérifie si une URL est valide
 * @param {string} url - URL à vérifier
 * @returns {boolean} - True si valide
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
 * Retourne une réponse CORS pour les requêtes OPTIONS
 * @returns {Object} - Réponse CORS
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
 * Calcule un hash simple pour une chaîne
 * @param {string} str - Chaîne à hasher
 * @returns {string} - Hash
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
 * Retry une opération avec backoff exponentiel
 * @param {Function} operation - Opération à retry
 * @param {number} maxRetries - Nombre max de tentatives
 * @param {number} baseDelay - Délai de base en ms
 * @returns {*} - Résultat de l'opération
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

            // Attendre avec backoff exponentiel
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