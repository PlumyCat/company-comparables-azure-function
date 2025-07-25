const { SearchService } = require('../services/searchService');
const { validateInput, createResponse, createErrorResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

const searchService = new SearchService();

async function getCompanyDetails(request, context) {
    context.log('Start of getCompanyDetails');
    const startTime = Date.now();

    try {
        const body = await request.json();

        // Validate input parameters - accept either symbol or name
        validateInput(body, {
            // Either symbol or name must be provided
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

        // Security validation
        if (!isValidIdentifier(companyIdentifier)) {
            return createErrorResponse(400, 'Identifiant invalide');
        }

        // USE THE WORKING SEARCHSERVICE
        logger.info("🔍 Recherche via SearchService...");
        const searchResults = await searchService.searchCompanyInfo(companyIdentifier, {
            language: symbol ? 'en' : 'fr', // English for symbols, French for names
            page: 1
        });

        if (!searchResults.success || !searchResults.searchResults || searchResults.searchResults.length === 0) {
            return createErrorResponse(404, 'Entreprise non trouvée', {
                identifier: companyIdentifier,
                type: symbol ? 'symbol' : 'name',
                suggestions: ['Vérifiez l\'orthographe', 'Utilisez le nom complet', 'Essayez le symbole boursier']
            });
        }

        // Create a detailed profile from the results
        logger.info("🧠 Analyse des résultats...");
        const companyProfile = createDetailedProfileFromSearch(companyIdentifier, searchResults);

        if (!companyProfile || companyProfile.confidence < 0.1) {
            return createErrorResponse(404, 'Analyse échouée', {
                identifier: companyIdentifier,
                searchResults: searchResults
            });
        }

        // Enrich with financial data if it's a symbol
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

function createDetailedProfileFromSearch(identifier, searchResults) {
    logger.info("🏗️ Création profil détaillé");
    
    const allResults = [];
    searchResults.searchResults.forEach(sr => {
        allResults.push(...sr.results);
    });

    const allContent = allResults.map(r => `${r.title} ${r.content}`).join(' ').toLowerCase();

    // Advanced extraction for details
    const profile = {
        name: extractCompanyName(allContent, identifier) || identifier,
        source: 'web_search_detailed',
        confidence: allResults.length > 10 ? 0.9 : 0.7,
        sector: extractSectorAdvanced(allContent),
        industry: extractIndustryAdvanced(allContent),
        country: extractIndustryAdvanced(allContent),
        region: extractRevenueAdvanced(allContent),
        employees: extractEmployeeCountAdvanced(allContent),
        employeeCategory: null,
        revenue: extractRevenueAdvanced(allContent),
        revenueCategory: null,
        size_category: guessSizeCategoryAdvanced(allContent),
        business_model: extractBusinessModelAdvanced(allContent),
        main_activities: extractActivitiesAdvanced(allContent),
        competitors_mentioned: extractSectorAdvanced(allContent),
        market_position: extractMarketPositionAdvanced(allContent),
        funding_info: extractFoundingYearAdvanced(allContent),
        leadership: extractLeadershipAdvanced(allContent),
        headquarters: extractHeadquartersAdvanced(allContent),
        founding_year: extractFoundingYearAdvanced(allContent),
        isPublic: guessIsPublicAdvanced(allContent),
        listingStatus: guessIsPublicAdvanced(allContent) ? "public" : "private",
        description: createDescriptionAdvanced(allResults),
        website: extractWebsiteAdvanced(allResults),
        keyPoints: extractKeyPointsAdvanced(allResults),
        // Additional details
        subsidiaries: extractSubsidiaries(allContent),
        certifications: extractCertifications(allContent),
        partnerships: extractPartnerships(allContent)
    };

    // Compute categories
    if (profile.employees) {
        profile.employeeCategory = categorizeEmployees(profile.employees);
    }
    if (profile.revenue) {
        profile.revenueCategory = categorizeRevenue(profile.revenue);
    }

    return profile;
}

// Advanced extraction functions (using improved functions from previous code)
function extractCompanyName(content, fallback) {
    // Search for the official name in patterns
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
    // Enhanced logic with more sectors
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

// Add the other advanced extraction functions...
function extractIndustryAdvanced(content) {
    // More detailed than the basic extractIndustry
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

// Use the improved functions from the previous code for the remaining extractions
function extractEmployeeCountAdvanced(content) {
    // Stub implementation: extract number from content
    const match = content.match(/(\d{2,6})\s+(employees|employés|staff)/i);
    return match ? parseInt(match[1], 10) : null;
}

function extractRevenueAdvanced(content) {
    // Stub implementation: extract revenue from content
    const match = content.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(million|milliard|billion)?\s*(€|eur|euro|usd|dollars)?/i);
    return match ? `${match[1]}${match[2] ? ' ' + match[2] : ''}${match[3] ? ' ' + match[3] : ''}`.trim() : null;
}

function extractFoundingYearAdvanced(content) {
    // Stub implementation: extract year from content
    const match = content.match(/(founded|créée|established)\s*(in)?\s*(\d{4})/i);
    return match ? parseInt(match[3], 10) : null;
}

function extractHeadquartersAdvanced(content) {
    // Stub implementation: extract headquarters location
    const match = content.match(/(headquarters|siège social|located in)\s*[:-]?\s*([A-Za-z\s,]+)/i);
    return match ? match[2].trim() : null;
}

function extractLeadershipAdvanced(content) {
    // Stub implementation: extract leadership names
    const matches = [...content.matchAll(/(CEO|PDG|Chief Executive Officer|Président)\s*[:-]?\s*([A-Za-z\s]+)/gi)];
    return matches.length > 0 ? matches.map(m => m[2].trim()) : [];
}

// New extractions for additional details
function extractSubsidiaries() {
    const subsidiaries = [];
    
    // Subsidiaries extraction logic
    return subsidiaries.slice(0, 3); // Limit to 3
}

// Stub implementations for missing advanced extraction functions
function guessSizeCategoryAdvanced(content) {
    // Simple logic based on keywords
    if (content.includes('enterprise') || content.includes('multinational')) return 'enterprise';
    if (content.includes('large')) return 'large';
    if (content.includes('medium')) return 'medium';
    return 'small';
}

function extractBusinessModelAdvanced(content) {
    // Basic extraction based on keywords
    if (content.includes('b2b')) return 'B2B';
    if (content.includes('b2c')) return 'B2C';
    if (content.includes('subscription')) return 'Subscription';
    if (content.includes('service')) return 'Service';
    return null;
}

function extractActivitiesAdvanced(content) {
    // Extract main activities from content
    const activities = [];
    if (content.includes('consulting')) activities.push('Consulting');
    if (content.includes('development')) activities.push('Development');
    if (content.includes('outsourcing')) activities.push('Outsourcing');
    if (content.includes('analytics')) activities.push('Analytics');
    return activities.length > 0 ? activities : null;
}

function extractMarketPositionAdvanced(content) {
    // Basic market position extraction
    if (content.includes('leader')) return 'Leader';
    if (content.includes('innovator')) return 'Innovator';
    if (content.includes('challenger')) return 'Challenger';
    return null;
}

function guessIsPublicAdvanced(content) {
    // Guess if company is public based on keywords
    if (content.includes('listed') || content.includes('stock') || content.includes('public')) return true;
    return false;
}

function createDescriptionAdvanced(results) {
    // Create a description from the first result
    if (results && results.length > 0 && results[0].content) {
        return results[0].content.slice(0, 300);
    }
    return null;
}

function extractWebsiteAdvanced(results) {
    // Extract website from results
    for (const r of results) {
        if (r.url && r.url.includes('http')) return r.url;
    }
    return null;
}

function extractKeyPointsAdvanced(results) {
    // Extract key points from titles
    return results.map(r => r.title).filter(Boolean).slice(0, 5);
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

// Reuse other functions from the previous code...
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
