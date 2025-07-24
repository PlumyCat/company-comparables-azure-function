const fetch = require('node-fetch');
const logger = require('../utils/logger');

class SearchService {
    constructor() {
        this.searxngUrl = process.env.SEARXNG_URL;
        this.clientId = process.env.CLIENT_ID;
        this.clientSecret = process.env.CLIENT_SECRET;
        this.tenantId = process.env.TENANT_ID;
        this.tokenUrl = process.env.TOKEN_URL;
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            cachedRequests: 0,
            errors: []
        };
        
        this.configurationError = null;
        if (!this.searxngUrl || !this.clientId || !this.clientSecret || !this.tenantId || !this.tokenUrl) {
            this.configurationError = 'Variables d\'environnement Azure AD manquantes';
        }

        this.focusModes = {
            'financialSearch': {
                engines: 'google,duckduckgo,yahoo',
                categories: 'general',
                keywords: ['finance', 'financial', 'revenue', 'earnings', 'profit', 'valuation'],
                description: 'Recherche optimisée pour informations financières'
            },
            'companyResearch': {
                engines: 'google,duckduckgo',
                categories: 'general',
                keywords: ['company', 'entreprise', 'société', 'business', 'profile'],
                description: 'Profil et informations d\'entreprise'
            },
            'marketAnalysis': {
                engines: 'google,yahoo',
                categories: 'general',
                keywords: ['market', 'marché', 'sector', 'secteur', 'industry', 'industrie'],
                description: 'Analyse de marché et secteur'
            },
            'competitorAnalysis': {
                engines: 'google,duckduckgo',
                categories: 'general',
                keywords: ['competitor', 'concurrence', 'competitive', 'comparison', 'comparaison'],
                description: 'Analyse concurrentielle et comparaisons'
            }
        };
    }

    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        try {
            const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
            const params = new URLSearchParams();
            params.append('client_id', this.clientId);
            params.append('client_secret', this.clientSecret);
            params.append('grant_type', 'client_credentials');
            
            let scope = this.tokenUrl;
            if (!scope.endsWith('/.default')) {
                scope = `${scope}/.default`;
            }
            params.append('scope', scope);

            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur d'authentification Azure AD: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            this.accessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

            return this.accessToken;
        } catch (error) {
            throw new Error(`Erreur obtention token Azure AD: ${error.message}`);
        }
    }

    async searchWeb(query, options = {}, focusMode = null) {
        this.stats.totalRequests++;

        if (this.configurationError) {
            this.stats.errors.push({
                timestamp: new Date().toISOString(),
                error: 'Configuration Azure AD incorrecte',
                query: query,
                details: this.configurationError
            });
            return {
                success: false,
                error: `Service de recherche web non configuré - ${this.configurationError}`,
                results: [],
                query: query,
                configured: false
            };
        }

        if (!focusMode) {
            focusMode = this.detectOptimalFocus(query);
        }

        const searchParams = { query, ...options };
        const optimizedParams = this.applySearchFocus(searchParams, focusMode);

        const cacheKey = `web_${optimizedParams.query}_${JSON.stringify(optimizedParams)}_${focusMode}`;
        const cached = this.cache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            this.stats.cachedRequests++;
            return {
                ...cached.data,
                focusMode: focusMode,
                focusDescription: this.focusModes[focusMode]?.description || 'Mode général'
            };
        }

        try {
            const token = await this.getAccessToken();
            const baseUrl = this.searxngUrl.replace(/\/$/, "");
            const urlParams = new URLSearchParams({
                q: optimizedParams.query,
                format: 'json',
                categories: optimizedParams.categories || 'general',
                engines: optimizedParams.engines || '',
                lang: optimizedParams.language || 'fr',
                pageno: optimizedParams.page || 1,
                ...optimizedParams.additionalParams
            });
            const searchUrl = `${baseUrl}/search?${urlParams}`;

            logger.info("🔎 Appel SearXNG");
            logger.info("URL :", searchUrl);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            try {
                const response = await fetch(searchUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                logger.info("📡 Appel fetch terminé");
                logger.info("Status HTTP :", response.status);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Erreur de recherche SearXNG: ${response.status} ${response.statusText} - ${errorText}`);
                }

                logger.info("🔍 Début lecture du body...");
                const text = await response.text();
                logger.info("✅ Body lu complètement");
                logger.info("📏 Taille totale:", text.length);

                let data;
                try {
                    const trimmedText = text.trim();
                    if (trimmedText.length === 0) {
                        throw new Error("Réponse vide reçue du serveur SearXNG");
                    }

                    data = JSON.parse(trimmedText);
                    logger.info("✅ JSON parsé avec succès");
                    logger.info("📊 Nombre de résultats:", data.results?.length || 0);
                    
                } catch (parseError) {
                    logger.error("❌ Erreur parsing JSON:", parseError.message);
                    
                    if (text.includes('"results":') && !text.trim().endsWith('}')) {
                        logger.info("🔧 Tentative de réparation JSON tronqué...");
                        try {
                            let fixedJson = text.trim();
                            if (!fixedJson.endsWith('}')) {
                                const openBraces = (fixedJson.match(/\{/g) || []).length;
                                const closeBraces = (fixedJson.match(/\}/g) || []).length;
                                const missingBraces = openBraces - closeBraces;
                                
                                for (let i = 0; i < missingBraces; i++) {
                                    fixedJson += '}';
                                }
                            }
                            
                            data = JSON.parse(fixedJson);
                            logger.info("✅ JSON réparé avec succès !");
                        } catch (repairError) {
                            throw new Error(`Réponse JSON tronquée et non réparable: ${parseError.message}`);
                        }
                    } else {
                        throw new Error(`Réponse non JSON reçue du serveur SearXNG: ${parseError.message}`);
                    }
                }

                const formattedResults = this.formatSearchResults(data, query);
                formattedResults.focusMode = focusMode;
                formattedResults.focusDescription = this.focusModes[focusMode]?.description || 'Mode général';
                formattedResults.optimizedQuery = optimizedParams.query;
                formattedResults.originalQuery = query;

                this.cache.set(cacheKey, {
                    data: formattedResults,
                    timestamp: Date.now()
                });

                this.stats.successfulRequests++;
                logger.info("🎯 AVANT RETURN - formattedResults:", !!formattedResults);
                logger.info("🎯 AVANT RETURN - success:", formattedResults?.success);
                return formattedResults;

            } catch (fetchError) {
                clearTimeout(timeoutId);
                
                if (fetchError.name === 'AbortError') {
                    const timeoutError = new Error('Timeout de 30 secondes dépassé pour la recherche SearXNG');
                    this.stats.errors.push({
                        timestamp: new Date().toISOString(),
                        error: timeoutError.message,
                        query: query,
                        focusMode: focusMode
                    });
                    throw timeoutError;
                }
                
                this.stats.errors.push({
                    timestamp: new Date().toISOString(),
                    error: fetchError.message,
                    query: query,
                    focusMode: focusMode
                });
                throw fetchError;
            }
        } catch (error) {
            this.stats.errors.push({
                timestamp: new Date().toISOString(),
                error: error.message,
                query: query,
                focusMode: focusMode
            });
            throw error;
        }
    }

    async searchCompanyInfo(companyName, options = {}) {
        if (this.configurationError) {
            return {
                success: false,
                error: `Service de recherche web non configuré - ${this.configurationError}`,
                results: [],
                query: companyName,
                configured: false
            };
        }

        try {
            const geoContext = this.detectCompanyGeography(companyName);

            const searchQueries = [
                {
                    query: `"${companyName}" ${geoContext.companyTerm} ${geoContext.region}`,
                    focusMode: 'companyResearch'
                },
                {
                    query: `${companyName} ${geoContext.financialTerm} information`,
                    focusMode: 'financialSearch'
                },
                {
                    query: `${companyName} company profile business ${geoContext.language}`,
                    focusMode: 'companyResearch'
                }
            ];

            const searchResults = [];
            for (const searchQuery of searchQueries) {
                const result = await this.searchWeb(
                    searchQuery.query,
                    {
                        ...options,
                        language: options.language || geoContext.defaultLanguage
                    },
                    searchQuery.focusMode
                );

                if (result && result.results) {
                    searchResults.push({
                        query: searchQuery.query,
                        focusMode: searchQuery.focusMode,
                        focusDescription: result.focusDescription,
                        results: result.results,
                        geoContext: geoContext
                    });
                }
            }

            return {
                success: searchResults.length > 0,
                searchResults: searchResults,
                totalQueries: searchQueries.length,
                successfulQueries: searchResults.length,
                companyName: companyName,
                detectedGeography: geoContext,
                enhancedWithFocus: true
            };
        } catch (error) {
            return {
                success: false,
                error: `Erreur recherche entreprise: ${error.message}`,
                results: [],
                query: companyName
            };
        }
    }

    detectOptimalFocus(query) {
        const queryLower = query.toLowerCase();
        
        const patterns = {
            'financialSearch': ['finance', 'financial', 'revenue', 'chiffre d\'affaires', 'profit', 'valuation'],
            'marketAnalysis': ['market', 'marché', 'sector', 'secteur', 'industry', 'industrie'],
            'competitorAnalysis': ['competitor', 'concurrence', 'competitive', 'comparison', 'comparable']
        };

        let bestMatch = 'companyResearch';
        let maxScore = 0;

        for (const [focusMode, keywords] of Object.entries(patterns)) {
            const score = keywords.reduce((acc, keyword) => {
                return acc + (queryLower.includes(keyword) ? 1 : 0);
            }, 0);

            if (score > maxScore) {
                maxScore = score;
                bestMatch = focusMode;
            }
        }

        return bestMatch;
    }

    applySearchFocus(params, focusMode) {
        if (!this.focusModes[focusMode]) {
            return params;
        }

        const focus = this.focusModes[focusMode];
        const optimizedParams = { ...params };

        optimizedParams.engines = focus.engines;
        optimizedParams.categories = focus.categories;

        if (focus.keywords && focus.keywords.length > 0) {
            const contextualKeywords = focus.keywords.slice(0, 2).join(' ');
            optimizedParams.query = `${optimizedParams.query} ${contextualKeywords}`;
        }

        return optimizedParams;
    }

    detectCompanyGeography(companyName) {
        const name = companyName.toLowerCase();

        if (name.includes('.pa') || name.includes(' sa') || name.includes(' sas') ||
            name.includes(' sarl') || name.includes(' sasu') || name.includes('france') ||
            name.includes('français') || name.includes('société')) {
            return {
                country: 'France',
                region: 'Europe',
                companyTerm: 'entreprise',
                financialTerm: 'société information financière',
                language: 'french',
                defaultLanguage: 'fr'
            };
        }

        if (name.includes('ltd') || name.includes('plc') || name.includes('british') ||
            name.includes('uk') || name.includes('.co.uk')) {
            return {
                country: 'United Kingdom',
                region: 'Europe',
                companyTerm: 'company',
                financialTerm: 'corporation financial information',
                language: 'english',
                defaultLanguage: 'en'
            };
        }

        if (name.includes(' inc') || name.includes(' corp') || name.includes(' llc') ||
            name.includes('corporation') || name.includes('usa') || name.includes('america')) {
            return {
                country: 'United States',
                region: 'North America',
                companyTerm: 'company',
                financialTerm: 'corporation financial information',
                language: 'english',
                defaultLanguage: 'en'
            };
        }

        return {
            country: 'International',
            region: 'Global',
            companyTerm: 'company',
            financialTerm: 'corporation financial information',
            language: 'english',
            defaultLanguage: 'en'
        };
    }

    formatSearchResults(rawData, originalQuery) {
        logger.info("🏗️ DEBUT formatSearchResults");
        logger.info("- originalQuery:", originalQuery);
        logger.info("- rawData keys:", Object.keys(rawData));
        
        const results = rawData.results || [];
        logger.info("- results.length:", results.length);

        logger.info("🔄 Mapping des résultats...");
        const mappedResults = results.map(result => ({
            title: result.title || 'Sans titre',
            url: result.url,
            content: result.content || result.snippet || '',
            engine: result.engine || 'unknown',
            score: result.score || 0,
            publishedDate: result.publishedDate || null,
            category: result.category || 'general'
        }));
        logger.info("✅ Mapping terminé, nombre mappé:", mappedResults.length);

        logger.info("🏗️ Construction objet final...");
        const finalResult = {
            query: originalQuery,
            totalResults: results.length,
            success: true,
            results: mappedResults,
            searchInfo: {
                engines: rawData.engines || [],
                searchTime: rawData.search_time || null,
                suggestions: rawData.suggestions || [],
                timestamp: new Date().toISOString()
            }
        };
        
        logger.info("✅ FIN formatSearchResults, success:", finalResult.success);
        return finalResult;
    }
    async testConnection() {
        try {
            logger.info("🧪 Début du test de connexion");
            
            if (this.configurationError) {
                logger.info("❌ Erreur de configuration:", this.configurationError);
                return false;
            }
            
            const token = await this.getAccessToken();
            if (!token) {
                logger.info("❌ Impossible d'obtenir le token");
                return false;
            }
            logger.info("✅ Token obtenu");
            
            logger.info("🔍 Test de recherche simple...");
            const testResult = await this.searchWeb('test', {
                categories: 'general',
                page: 1,
                engines: 'duckduckgo'
            });
            
            logger.info("🧪 Résultat du test:", {
                success: testResult.success,
                totalResults: testResult.totalResults || 0,
                hasResults: testResult.results && testResult.results.length > 0
            });
            
            return testResult.success === true;
            
        } catch (error) {
            logger.error("❌ Erreur dans testConnection:", error.message);
            return false;
        }
    }

    getServiceStats() {
        const isConfigured = !!(this.searxngUrl && this.clientId && this.clientSecret && this.tenantId && this.tokenUrl);
        return {
            configured: isConfigured,
            searxngUrl: this.searxngUrl ? 'Configuré' : 'Non configuré',
            azureAdAuth: (this.clientId && this.clientSecret && this.tenantId && this.tokenUrl) ? 'Configuré' : 'Non configuré',
            tokenStatus: this.accessToken ? 'Token actif' : 'Pas de token',
            configurationError: this.configurationError,
            ...this.stats
        };
    }
}

module.exports = { SearchService };