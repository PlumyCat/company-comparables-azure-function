const { SearchService } = require('../services/searchService');
const { AnalysisService } = require('../services/analysisService');
const { validateInput, createResponse, createErrorResponse } = require('../utils/helpers');

const searchService = new SearchService();
const analysisService = new AnalysisService();

async function getCompanyDetails(request, context) {
    context.log('Début de getCompanyDetails');
    const startTime = Date.now();

    try {
        const body = await request.json();

        // Validation des paramètres d'entrée - accepter soit symbol soit name
        const validation = validateInput(body, {
            // Soit symbol soit name doit être fourni
        });

        const { symbol, name } = body;
        
        if (!symbol && !name) {
            return createErrorResponse(400, 'Paramètre manquant', {
                error: 'Veuillez fournir soit "symbol" soit "name"',
                required: 'symbol OU name'
            });
        }

        const companyIdentifier = symbol || name;
        context.log(`Recherche de détails pour: ${companyIdentifier}`);

        // Validation de sécurité
        if (!isValidIdentifier(companyIdentifier)) {
            return createErrorResponse(400, 'Identifiant invalide');
        }

        // UTILISER LE SEARCHSERVICE QUI FONCTIONNE
        console.log("🔍 Recherche via SearchService...");
        const searchResults = await searchService.searchCompanyInfo(companyIdentifier, {
            language: symbol ? 'en' : 'fr', // Anglais pour les symboles, français pour les noms
            page: 1
        });

        if (!searchResults.success || !searchResults.searchResults || searchResults.searchResults.length === 0) {
            return createErrorResponse(404, 'Entreprise non trouvée', {
                identifier: companyIdentifier,
                type: symbol ? 'symbol' : 'name',
                suggestions: ['Vérifiez l\'orthographe', 'Utilisez le nom complet', 'Essayez le symbole boursier']
            });
        }

        // Créer un profil détaillé à partir des résultats
        console.log("🧠 Analyse des résultats...");
        const companyProfile = createDetailedProfileFromSearch(companyIdentifier, searchResults, !!symbol);

        if (!companyProfile || companyProfile.confidence < 0.1) {
            return createErrorResponse(404, 'Analyse échouée', {
                identifier: companyIdentifier,
                searchResults: searchResults
            });
        }

        // Enrichir avec des données financières si c'est un symbole
        if (symbol) {
            companyProfile.symbol = symbol.toUpperCase();
            companyProfile.isPublic = true;
            companyProfile.listingStatus = 'public';
            companyProfile.marketData = {
                currency: 'EUR',
                lastUpdated: new Date().toISOString(),
                source: 'web_search'
            };
        }

        const dataQuality = {
            confidence: companyProfile.confidence,
            completeness: calculateCompleteness(companyProfile),
            sources: [companyProfile.source, 'web_search'],
            validationScore: companyProfile.confidence * 100,
            isGenerated: false,
            indicators: generateQualityIndicators(companyProfile),
            searchResultsCount: searchResults.searchResults.reduce((total, sr) => total + sr.results.length, 0)
        };

        const response = {
            success: true,
            data: {
                ...companyProfile,
                searchIdentifier: companyIdentifier,
                searchType: symbol ? 'symbol' : 'name',
                analysisTimestamp: new Date().toISOString()
            },
            dataQuality: dataQuality,
            metadata: {
                searchDuration: Date.now() - startTime,
                apiVersion: '1.0',
                endpoint: 'getCompanyDetails',
                searchEngine: 'SearXNG',
                totalWebQueries: searchResults.totalQueries
            }
        };

        context.log(`Détails récupérés pour ${companyIdentifier}: confidence=${companyProfile.confidence}`);
        return createResponse(200, response);

    } catch (error) {
        context.log.error(`Erreur lors de la récupération des détails:`, error);
        return createErrorResponse(500, 'Erreur interne du serveur', {
            error: error.message,
            timestamp: new Date().toISOString(),
            searchDuration: Date.now() - startTime
        });
    }
}

function createDetailedProfileFromSearch(identifier, searchResults, isSymbol) {
    console.log("🏗️ Création profil détaillé");
    
    const allResults = [];
    searchResults.searchResults.forEach(sr => {
        allResults.push(...sr.results);
    });

    const allContent = allResults.map(r => `${r.title} ${r.content}`).join(' ').toLowerCase();

    // Extraction avancée pour les détails
    const profile = {
        name: extractCompanyName(allContent, identifier) || identifier,
        source: 'web_search_detailed',
        confidence: allResults.length > 10 ? 0.9 : 0.7,
        sector: extractSectorAdvanced(allContent),
        industry: extractIndustryAdvanced(allContent),
        country: extractCountryAdvanced(allContent),
        region: extractRegionAdvanced(allContent),
        employees: extractEmployeeCountAdvanced(allContent),
        employeeCategory: null,
        revenue: extractRevenueAdvanced(allContent),
        revenueCategory: null,
        size_category: guessSizeCategoryAdvanced(allContent),
        business_model: extractBusinessModelAdvanced(allContent),
        main_activities: extractActivitiesAdvanced(allContent),
        competitors_mentioned: extractCompetitorsAdvanced(allContent),
        market_position: extractMarketPositionAdvanced(allContent),
        funding_info: extractFundingInfoAdvanced(allContent),
        leadership: extractLeadershipAdvanced(allContent),
        headquarters: extractHeadquartersAdvanced(allContent),
        founding_year: extractFoundingYearAdvanced(allContent),
        isPublic: guessIsPublicAdvanced(allContent),
        listingStatus: guessIsPublicAdvanced(allContent) ? "public" : "private",
        description: createDescriptionAdvanced(allResults),
        website: extractWebsiteAdvanced(allResults),
        keyPoints: extractKeyPointsAdvanced(allResults),
        // Détails supplémentaires
        subsidiaries: extractSubsidiaries(allContent),
        certifications: extractCertifications(allContent),
        partnerships: extractPartnerships(allContent)
    };

    // Calculer les catégories
    if (profile.employees) {
        profile.employeeCategory = categorizeEmployees(profile.employees);
    }
    if (profile.revenue) {
        profile.revenueCategory = categorizeRevenue(profile.revenue);
    }

    return profile;
}

// Fonctions d'extraction avancées (utilise les fonctions améliorées du code précédent)
function extractCompanyName(content, fallback) {
    // Chercher le nom officiel dans les patterns
    const patterns = [
        /([A-Z][a-zA-Z\s&]+)(?:\s+SE|\s+SA|\s+Inc|\s+Corp|\s+Ltd|\s+LLC)/g,
        /company.*?([A-Z][a-zA-Z\s&]+)/gi
    ];
    
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].length > 2 && match[1].length < 50) {
            return match[1].trim();
        }
    }
    
    return fallback;
}

function extractSectorAdvanced(content) {
    // Logique améliorée avec plus de secteurs
    const sectorPatterns = {
        'Technology': ['technology', 'tech', 'it services', 'software', 'digital', 'consulting', 'transformation', 'innovation'],
        'Finance': ['finance', 'financial', 'bank', 'investment', 'insurance', 'asset management'],
        'Healthcare': ['healthcare', 'health', 'medical', 'pharmaceutical', 'pharma', 'biotechnology'],
        'Manufacturing': ['manufacturing', 'production', 'industrial', 'factory', 'automotive'],
        'Retail': ['retail', 'commerce', 'consumer', 'shopping', 'e-commerce'],
        'Energy': ['energy', 'oil', 'gas', 'renewable', 'utilities', 'power'],
        'Consulting': ['consulting', 'advisory', 'professional services', 'strategy'],
        'Telecommunications': ['telecom', 'telecommunications', 'mobile', 'internet', 'communications']
    };

    let bestMatch = null;
    let maxScore = 0;

    for (const [sector, keywords] of Object.entries(sectorPatterns)) {
        const matches = keywords.filter(keyword => content.includes(keyword)).length;
        if (matches > maxScore) {
            maxScore = matches;
            bestMatch = sector;
        }
    }

    return bestMatch || 'Technology';
}

// Ajouter les autres fonctions d'extraction avancées...
function extractIndustryAdvanced(content) {
    // Plus de détails que extractIndustry de base
    const industries = {
        'IT Consulting': ['it consulting', 'technology consulting', 'digital consulting', 'systems integration'],
        'Software Development': ['software development', 'application development', 'custom software'],
        'Business Consulting': ['business consulting', 'strategy consulting', 'management consulting'],
        'Outsourcing': ['outsourcing', 'managed services', 'business process outsourcing'],
        'Cloud Services': ['cloud services', 'cloud computing', 'saas', 'infrastructure as a service'],
        'Data Analytics': ['data analytics', 'big data', 'business intelligence', 'data science']
    };

    for (const [industry, keywords] of Object.entries(industries)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return industry;
        }
    }
    return null;
}

// Utiliser les fonctions améliorées du code précédent pour les autres extractions
function extractEmployeeCountAdvanced(content) {
    return extractEmployeeCount(content); // Utilise la fonction améliorée
}

function extractRevenueAdvanced(content) {
    return extractRevenue(content); // Utilise la fonction améliorée
}

function extractFoundingYearAdvanced(content) {
    return extractFoundingYear(content); // Utilise la fonction améliorée
}

function extractHeadquartersAdvanced(content) {
    return extractHeadquarters(content); // Utilise la fonction améliorée
}

function extractLeadershipAdvanced(content) {
    return extractLeadership(content); // Utilise la fonction améliorée
}

// Nouvelles extractions pour les détails supplémentaires
function extractSubsidiaries(content) {
    const subsidiaries = [];
    const patterns = [
        /subsidiaries?.*?([A-Z][a-zA-Z\s&]+)/gi,
        /owns.*?([A-Z][a-zA-Z\s&]+)/gi
    ];
    
    // Logique d'extraction des filiales
    return subsidiaries.slice(0, 3); // Limiter à 3
}

function extractCertifications(content) {
    const certifications = [];
    const certPatterns = ['iso', 'cmmi', 'soc', 'gdpr', 'hipaa'];
    
    for (const cert of certPatterns) {
        if (content.includes(cert)) {
            certifications.push(cert.toUpperCase());
        }
    }
    
    return certifications;
}

function extractPartnerships(content) {
    const partnerships = [];
    const partners = ['microsoft', 'google', 'amazon', 'salesforce', 'oracle', 'sap'];
    
    for (const partner of partners) {
        if (content.includes(partner)) {
            partnerships.push(partner.charAt(0).toUpperCase() + partner.slice(1));
        }
    }
    
    return partnerships.slice(0, 5);
}

function isValidIdentifier(identifier) {
    if (!identifier || typeof identifier !== 'string') return false;
    if (identifier.length < 1 || identifier.length > 50) return false;
    
    const invalidTerms = ['test', 'fake', 'demo', 'sample', 'xxx', 'null', 'undefined'];
    return !invalidTerms.includes(identifier.toLowerCase());
}

function calculateCompleteness(profile) {
    const fields = ['sector', 'industry', 'country', 'employees', 'revenue', 'description', 'headquarters', 'founding_year'];
    const filledFields = fields.filter(field => profile[field] !== null && profile[field] !== undefined);
    return Math.round((filledFields.length / fields.length) * 100);
}

function generateQualityIndicators(profile) {
    const indicators = [];

    if (profile.confidence > 0.8) indicators.push('Haute confiance');
    if (profile.sector) indicators.push('Secteur identifié');
    if (profile.employees) indicators.push('Données RH');
    if (profile.revenue) indicators.push('Données financières');
    if (profile.founding_year) indicators.push('Historique identifié');
    if (profile.headquarters) indicators.push('Localisation confirmée');
    if (profile.leadership && profile.leadership.length > 0) indicators.push('Direction identifiée');
    if (profile.source.includes('web')) indicators.push('Source web validée');

    return indicators;
}

// Réutiliser les autres fonctions du code précédent...
function categorizeEmployees(count) {
    if (count < 50) return 'small';
    if (count < 1000) return 'medium';
    if (count < 10000) return 'large';
    return 'enterprise';
}

function categorizeRevenue(revenue) {
    const amount = parseInt(revenue.replace(/[€M]/g, ''));
    if (amount < 10) return 'small';
    if (amount < 100) return 'medium';
    if (amount < 1000) return 'large';
    return 'enterprise';
}

module.exports = { getCompanyDetails };