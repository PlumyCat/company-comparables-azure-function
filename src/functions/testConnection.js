const { SearchService } = require('../services/searchService');
const { createResponse, createErrorResponse } = require('../utils/helpers');
const searchService = new SearchService();

async function testConnection(request, context) {
    context.log('Test de connectivité SearXNG avec Azure AD');

    let isConnected = false;
    let connectionError = null;
    let testDetails = null;

    try {
        console.log("🎯 DEBUT DU TEST DE CONNEXION");
        
        // Connectivity test with detailed logs
        try {
            console.log("📞 Appel de searchService.testConnection()...");
            isConnected = await searchService.testConnection();
            console.log("✅ searchService.testConnection() terminé, résultat:", isConnected);
            testDetails = isConnected ? "Test de recherche réussi" : "Test de recherche échoué";
        } catch (err) {
            console.error("❌ Exception dans searchService.testConnection():", err);
            isConnected = false;
            connectionError = err.message || String(err);
            testDetails = `Exception lors du test: ${connectionError}`;
            context.log.error('Erreur de connexion détaillée:', connectionError);
        }

        console.log("📊 État après test:");
        console.log("- isConnected:", isConnected);
        console.log("- connectionError:", connectionError);
        console.log("- testDetails:", testDetails);

        // Retrieve detailed statistics
        const stats = searchService.getServiceStats();
        console.log("📈 Stats du service:", stats);

        // Separate Azure AD authentication test
        let authTest = {
            success: false,
            error: null,
            token: null
        };

        try {
            console.log("🔐 Test authentification Azure AD...");
            const token = await searchService.getAccessToken();
            authTest = {
                success: true,
                error: null,
                token: token ? 'Token obtenu avec succès' : 'Pas de token'
            };
            console.log("✅ Auth test réussi");
        } catch (error) {
            console.error("❌ Auth test échoué:", error);
            authTest = {
                success: false,
                error: error.message,
                token: null
            };
        }

        const response = {
            success: isConnected,
            message: isConnected ? 'Connectivité SearXNG opérationnelle' : 'Erreur de connectivité SearXNG',
            serviceConfiguration: {
                searxngUrl: process.env.SEARXNG_URL ? 'Configuré' : 'Manquant',
                clientId: process.env.CLIENT_ID ? 'Configuré' : 'Manquant',
                clientSecret: process.env.CLIENT_SECRET ? 'Configuré' : 'Manquant',
                tenantId: process.env.TENANT_ID ? 'Configuré' : 'Manquant',
                tokenUrl: process.env.TOKEN_URL ? 'Configuré' : 'Manquant'
            },
            azureAdAuth: authTest,
            serviceStats: stats,
            testTimestamp: new Date().toISOString(),
            recommendations: generateRecommendations(isConnected, authTest, stats, testDetails),
            testDetails: testDetails
        };

        const statusCode = isConnected ? 200 : 503;

        console.log("🏁 REPONSE FINALE:");
        console.log("- statusCode:", statusCode);
        console.log("- response.success:", response.success);
        console.log("- response.message:", response.message);

        context.log(`Test de connectivité terminé: ${isConnected ? 'SUCCÈS' : 'ÉCHEC'}`);
        if (!isConnected) {
            context.log("⚠️ Détail de l'échec :", testDetails);
        }

        console.log("📤 Envoi de la réponse...");
        return createResponse(statusCode, response);

    } catch (error) {
        console.error('❌ ERREUR GENERALE dans testConnection:', error);
        context.log.error('Erreur lors du test de connectivité (exception générale):', error);

        return createErrorResponse(500, 'Erreur lors du test de connectivité', {
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

function generateRecommendations(isConnected, authTest, stats, testDetails) {
    const recommendations = [];

    if (!isConnected) {
        recommendations.push({
            type: 'error',
            priority: 'high',
            message: `Service SearXNG non accessible - Vérifiez la configuration. Détail : ${testDetails || "N/A"}`
        });
    }

    if (!authTest.success) {
        recommendations.push({
            type: 'auth_error',
            priority: 'high',
            message: 'Authentification Azure AD échouée - Vérifiez les credentials'
        });
    }

    if (!stats.configured) {
        recommendations.push({
            type: 'configuration',
            priority: 'high',
            message: "Configuration incomplète - Variables d'environnement manquantes"
        });
    }

    if (stats.errors && stats.errors.length > 0) {
        recommendations.push({
            type: 'errors',
            priority: 'medium',
            message: `${stats.errors.length} erreur(s) récente(s) détectée(s)`
        });
    }

    if (isConnected && authTest.success) {
        recommendations.push({
            type: 'success',
            priority: 'info',
            message: 'Service opérationnel - Prêt pour la production'
        });
    }

    return recommendations;
}

module.exports = { testConnection };
