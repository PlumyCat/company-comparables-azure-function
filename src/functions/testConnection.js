const { SearchService } = require('../services/searchService');
const { createResponse, createErrorResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const searchService = new SearchService();

async function testConnection(request, context) {
    context.log('Test de connectivité SearXNG avec Azure AD');

    let isConnected = false;
    let connectionError = null;
    let testDetails = null;

    try {
        logger.info("🎯 DEBUT DU TEST DE CONNEXION");
        
        // Connectivity test with detailed logs
        try {
            logger.info("📞 Appel de searchService.testConnection()...");
            isConnected = await searchService.testConnection();
            logger.info("✅ searchService.testConnection() terminé, résultat:", isConnected);
            testDetails = isConnected ? "Test de recherche réussi" : "Test de recherche échoué";
        } catch (err) {
            logger.error("❌ Exception dans searchService.testConnection():", err);
            isConnected = false;
            connectionError = err.message || String(err);
            testDetails = `Exception lors du test: ${connectionError}`;
            context.log.error('Erreur de connexion détaillée:', connectionError);
        }

        logger.info("📊 État après test:");
        logger.info("- isConnected:", isConnected);
        logger.info("- connectionError:", connectionError);
        logger.info("- testDetails:", testDetails);

        // Retrieve detailed statistics
        const stats = searchService.getServiceStats();
        logger.info("📈 Stats du service:", stats);

        // Separate Azure AD authentication test
        let authTest = {
            success: false,
            error: null,
            token: null
        };

        try {
            logger.info("🔐 Test authentification Azure AD...");
            const token = await searchService.getAccessToken();
            authTest = {
                success: true,
                error: null,
                token: token ? 'Token obtenu avec succès' : 'Pas de token'
            };
            logger.info("✅ Auth test réussi");
        } catch (error) {
            logger.error("❌ Auth test échoué:", error);
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

        logger.info("🏁 REPONSE FINALE:");
        logger.info("- statusCode:", statusCode);
        logger.info("- response.success:", response.success);
        logger.info("- response.message:", response.message);

        context.log(`Test de connectivité terminé: ${isConnected ? 'SUCCÈS' : 'ÉCHEC'}`);
        if (!isConnected) {
            context.log("⚠️ Détail de l'échec :", testDetails);
        }

        logger.info("📤 Envoi de la réponse...");
        return createResponse(statusCode, response);

    } catch (error) {
        logger.error('❌ ERREUR GENERALE dans testConnection:', error);
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