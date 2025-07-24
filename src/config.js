const requiredVars = ['SEARXNG_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID', 'TOKEN_URL'];

function validateConfig() {
    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        const message = `Variables d'environnement manquantes: ${missing.join(', ')}`;
        throw new Error(message);
    }
    return {
        searxngUrl: process.env.SEARXNG_URL,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        tenantId: process.env.TENANT_ID,
        tokenUrl: process.env.TOKEN_URL
    };
}

module.exports = { validateConfig };
