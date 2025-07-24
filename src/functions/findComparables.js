const { SearchService } = require('../services/searchService');
const { AnalysisService } = require('../services/analysisService');
const { validateInput, createResponse, createErrorResponse } = require('../utils/helpers');

const searchService = new SearchService();
const analysisService = new AnalysisService();

async function findComparables(request, context) {
    context.log('Début de findComparables');
    const startTime = Date.now();

    try {
        const body = await request.json();

        // VALIDATION SIMPLIFIÉE - juste le nom de l'entreprise
        const validation = validateInput(body, {
            companyName: { required: true, type: 'string', minLength: 2, maxLength: 100 }
        });

        if (!validation.isValid) {
            return createErrorResponse(400, 'Paramètres invalides', validation.errors);
        }

        const { 
            companyName, 
            maxResults = 10,           // Optionnel avec défaut
            minSimilarity = 50,        // Optionnel avec défaut
            preferSameCountry = true   // Optionnel avec défaut
        } = body;

        context.log(`Recherche de comparables pour: ${companyName}`);

        // Validation de sécurité
        if (containsSuspiciousContent(companyName)) {
            return createErrorResponse(400, "Nom d'entreprise non autorisé");
        }

        // ÉTAPE 1: Analyser l'entreprise de référence avec SearchService
        console.log("🔍 Analyse de l'entreprise de référence...");
        const referenceSearchResults = await searchService.searchCompanyInfo(companyName, {
            language: 'fr',
            page: 1
        });

        if (!referenceSearchResults.success) {
            return createErrorResponse(404, 'Entreprise de référence non trouvée', {
                companyName: companyName,
                suggestions: ['Vérifiez l\'orthographe', 'Utilisez le nom complet']
            });
        }

        // Créer le profil de référence
        const referenceProfile = createProfileFromSearch(companyName, referenceSearchResults);
        console.log("📋 Profil de référence:", {
            name: referenceProfile.name,
            sector: referenceProfile.sector,
            country: referenceProfile.country,
            size: referenceProfile.size_category
        });

        // ÉTAPE 2: Générer automatiquement les requêtes de recherche pour les comparables
        const searchQueries = generateComparableSearchQueries(referenceProfile, preferSameCountry);
        console.log(`🔎 Génération de ${searchQueries.length} requêtes de recherche automatiques`);

        // ÉTAPE 3: Rechercher les entreprises comparables
        const allComparables = [];
        
        for (const query of searchQueries) {
            try {
                console.log(`🔍 Recherche: "${query.search}"`);
                const searchResults = await searchService.searchWeb(query.search, {
                    language: 'fr',
                    page: 1,
                    engines: 'google,duckduckgo'
                }, query.focusMode);

                if (searchResults.success && searchResults.results) {
                    // Extraire les entreprises des résultats
                    const foundCompanies = extractCompaniesFromResults(searchResults.results, referenceProfile);
                    allComparables.push(...foundCompanies);
                }
            } catch (error) {
                console.log(`⚠️ Erreur recherche "${query.search}":`, error.message);
            }
        }

        // ÉTAPE 4: Déduplication et scoring
        const uniqueComparables = deduplicateComparables(allComparables);
        const scoredComparables = uniqueComparables.map(comp => ({
            ...comp,
            similarityScore: calculateSimilarityScore(referenceProfile, comp),
            matchReasons: generateMatchReasons(referenceProfile, comp),
            riskFactors: generateRiskFactors(comp)
        }));

        // ÉTAPE 5: Filtrage et tri
        const filteredComparables = scoredComparables
            .filter(comp => comp.similarityScore >= minSimilarity)
            .sort((a, b) => b.similarityScore - a.similarityScore)
            .slice(0, Math.min(maxResults, 50)); // Max 50 résultats

        if (filteredComparables.length === 0) {
            return createErrorResponse(404, 'Aucune entreprise comparable trouvée', {
                referenceCompany: companyName,
                searchedQueries: searchQueries.length,
                suggestions: [
                    "Réduisez le score de similarité minimum",
                    "Élargissez la recherche géographique",
                    "Vérifiez le secteur d'activité"
                ]
            });
        }

        // ÉTAPE 6: Statistiques et qualité
        const breakdown = {
            total: filteredComparables.length,
            private: filteredComparables.filter(c => !c.isPublic).length,
            public: filteredComparables.filter(c => c.isPublic).length,
            sameCountry: filteredComparables.filter(c => c.country === referenceProfile.country).length,
            averageSimilarity: Math.round(
                filteredComparables.reduce((sum, c) => sum + c.similarityScore, 0) / filteredComparables.length
            )
        };

        const resultsQuality = {
            overallConfidence: Math.round(
                filteredComparables.reduce((sum, c) => sum + (c.confidence || 0.5), 0) / filteredComparables.length * 100
            ),
            dataCompleteness: calculateAverageCompleteness(filteredComparables),
            diversityScore: calculateDiversityScore(filteredComparables),
            searchEfficiency: `${filteredComparables.length}/${allComparables.length} entreprises retenues`
        };

        const response = {
            success: true,
            referenceCompany: {
                name: referenceProfile.name,
                sector: referenceProfile.sector,
                country: referenceProfile.country,
                size_category: referenceProfile.size_category,
                employees: referenceProfile.employees,
                revenue: referenceProfile.revenue
            },
            comparables: filteredComparables.map(comp => ({
                ...comp,
                analysisTimestamp: new Date().toISOString()
            })),
            totalFound: filteredComparables.length,
            breakdown: breakdown,
            searchCriteria: {
                companyName: companyName,
                maxResults: maxResults,
                minSimilarity: minSimilarity,
                preferSameCountry: preferSameCountry,
                autoGeneratedQueries: searchQueries.length
            },
            resultsQuality: resultsQuality,
            metadata: {
                searchDuration: Date.now() - startTime,
                apiVersion: '1.0',
                endpoint: 'findComparables',
                searchEngine: 'SearXNG',
                totalSearchQueries: searchQueries.length,
                searchTimestamp: new Date().toISOString()
            }
        };

        context.log(`Recherche terminée: ${filteredComparables.length} comparables trouvés (${breakdown.averageSimilarity}% similarité moyenne)`);
        return createResponse(200, response);

    } catch (error) {
        context.log.error(`Erreur lors de la recherche de comparables:`, error);
        return createErrorResponse(500, 'Erreur interne du serveur', {
            error: error.message,
            timestamp: new Date().toISOString(),
            searchDuration: Date.now() - startTime
        });
    }
}

// FONCTIONS UTILITAIRES

function createProfileFromSearch(companyName, searchResults) {
    // Réutiliser la logique de createBasicProfileFromSearch de searchCompany.js
    const allResults = [];
    searchResults.searchResults.forEach(sr => {
        allResults.push(...sr.results);
    });

    const allContent = allResults.map(r => `${r.title} ${r.content}`).join(' ').toLowerCase();

    return {
        name: companyName,
        sector: extractSector(allContent),
        country: extractCountry(allContent),
        region: extractRegion(allContent),
        size_category: guessSizeCategory(allContent),
        employees: extractEmployeeCount(allContent),
        revenue: extractRevenue(allContent),
        confidence: allResults.length > 5 ? 0.8 : 0.6
    };
}

function generateComparableSearchQueries(referenceProfile, preferSameCountry) {
    const queries = [];
    const sector = referenceProfile.sector || 'Technology';
    const country = referenceProfile.country || 'France';
    const size = referenceProfile.size_category || 'medium';

    // Requête 1: Même secteur, même pays
    if (preferSameCountry && country) {
        queries.push({
            search: `entreprises ${sector.toLowerCase()} ${country}`,
            focusMode: 'companyResearch',
            priority: 'high'
        });
    }

    // Requête 2: Même secteur, concurrents
    queries.push({
        search: `concurrents ${sector.toLowerCase()} entreprises similaires`,
        focusMode: 'competitorAnalysis',
        priority: 'high'
    });

    // Requête 3: Même secteur, même taille
    queries.push({
        search: `entreprises ${sector.toLowerCase()} ${size} taille`,
        focusMode: 'companyResearch',
        priority: 'medium'
    });

    // Requête 4: Leader du secteur
    queries.push({
        search: `leaders ${sector.toLowerCase()} top entreprises`,
        focusMode: 'marketAnalysis',
        priority: 'medium'
    });

    // Requête 5: Secteur international si pas de préférence pays
    if (!preferSameCountry) {
        queries.push({
            search: `international ${sector.toLowerCase()} companies`,
            focusMode: 'companyResearch',
            priority: 'low'
        });
    }

    // Requête 6: Spécifique aux services/consulting si applicable
    if (sector.toLowerCase().includes('technology') || sector.toLowerCase().includes('consulting')) {
        queries.push({
            search: `sociétés conseil technologie consulting`,
            focusMode: 'companyResearch',
            priority: 'medium'
        });
    }

    return queries;
}

function extractCompaniesFromResults(searchResults, referenceProfile) {
    const companies = [];
    const companyPatterns = [
        // Patterns pour identifier les noms d'entreprises dans les résultats
        /([A-Z][a-zA-Z\s&]+)(?:\s+(?:SE|SA|Inc|Corp|Ltd|LLC|SAS|SARL))/g,
        /entreprise\s+([A-Z][a-zA-Z\s&]+)/gi,
        /société\s+([A-Z][a-zA-Z\s&]+)/gi,
        /company\s+([A-Z][a-zA-Z\s&]+)/gi
    ];

    for (const result of searchResults) {
        const content = `${result.title} ${result.content}`;
        
        // Extraire les noms d'entreprises potentiels
        for (const pattern of companyPatterns) {
            const matches = [...content.matchAll(pattern)];
            for (const match of matches) {
                const companyName = match[1].trim();
                
                // Validation du nom d'entreprise
                if (isValidCompanyName(companyName, referenceProfile.name)) {
                    companies.push({
                        name: companyName,
                        source: 'web_search_extraction',
                        url: result.url,
                        description: result.content.substring(0, 200) + '...',
                        sector: extractSectorFromText(content),
                        country: extractCountryFromText(content),
                        confidence: 0.6,
                        extractedFrom: result.title
                    });
                }
            }
        }
    }

    return companies;
}

function isValidCompanyName(name, referenceName) {
    // Filtrer les noms invalides
    if (!name || name.length < 3 || name.length > 100) return false;
    if (name.toLowerCase() === referenceName.toLowerCase()) return false; // Exclure l'entreprise de référence
    
    const invalidPatterns = [
        /^(the|a|an|le|la|les|un|une|des)\s/i,
        /^(page|article|news|info|site)\s/i,
        /\d{4}/, // Années
        /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(name));
}

function deduplicateComparables(comparables) {
    const seen = new Map();
    const unique = [];

    for (const comp of comparables) {
        const key = comp.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!seen.has(key)) {
            seen.set(key, true);
            unique.push(comp);
        }
    }

    return unique;
}

function calculateSimilarityScore(reference, comparable) {
    let score = 0;
    let factors = 0;

    // Secteur (40% du score)
    if (reference.sector && comparable.sector) {
        if (reference.sector.toLowerCase() === comparable.sector.toLowerCase()) {
            score += 40;
        } else if (areSimilarSectors(reference.sector, comparable.sector)) {
            score += 25;
        }
        factors++;
    }

    // Pays (30% du score)
    if (reference.country && comparable.country) {
        if (reference.country === comparable.country) {
            score += 30;
        } else if (areSimilarRegions(reference.country, comparable.country)) {
            score += 15;
        }
        factors++;
    }

    // Taille (20% du score)
    if (reference.size_category && comparable.size_category) {
        if (reference.size_category === comparable.size_category) {
            score += 20;
        } else if (areSimilarSizes(reference.size_category, comparable.size_category)) {
            score += 10;
        }
        factors++;
    }

    // Confiance (10% du score)
    score += (comparable.confidence || 0.5) * 10;

    // Si peu de facteurs de comparaison, score par défaut
    if (factors < 2) {
        return Math.max(score, 40);
    }

    return Math.min(Math.round(score), 100);
}

function areSimilarSectors(sector1, sector2) {
    const similarGroups = [
        ['Technology', 'Consulting', 'IT Services'],
        ['Finance', 'Banking', 'Insurance'],
        ['Healthcare', 'Pharmaceutical', 'Biotechnology']
    ];
    
    return similarGroups.some(group => 
        group.includes(sector1) && group.includes(sector2)
    );
}

function areSimilarRegions(country1, country2) {
    const regions = {
        'Europe': ['France', 'Germany', 'United Kingdom', 'Spain', 'Italy'],
        'North America': ['United States', 'Canada'],
        'Asia': ['China', 'Japan', 'India', 'Singapore']
    };
    
    for (const countries of Object.values(regions)) {
        if (countries.includes(country1) && countries.includes(country2)) {
            return true;
        }
    }
    return false;
}

function areSimilarSizes(size1, size2) {
    const sizeOrder = ['micro', 'small', 'medium', 'large', 'enterprise'];
    const index1 = sizeOrder.indexOf(size1);
    const index2 = sizeOrder.indexOf(size2);
    
    return index1 !== -1 && index2 !== -1 && Math.abs(index1 - index2) <= 1;
}

function generateMatchReasons(reference, comparable) {
    const reasons = [];

    if (reference.sector && comparable.sector && 
        reference.sector.toLowerCase() === comparable.sector.toLowerCase()) {
        reasons.push(`Même secteur: ${comparable.sector}`);
    }

    if (reference.country && comparable.country && 
        reference.country === comparable.country) {
        reasons.push(`Même pays: ${comparable.country}`);
    }

    if (reference.size_category && comparable.size_category && 
        reference.size_category === comparable.size_category) {
        reasons.push(`Même catégorie de taille: ${comparable.size_category}`);
    }

    if (comparable.similarityScore && comparable.similarityScore > 80) {
        reasons.push('Très forte similarité globale');
    } else if (comparable.similarityScore && comparable.similarityScore > 60) {
        reasons.push('Bonne similarité globale');
    }

    return reasons;
}

function generateRiskFactors(comparable) {
    const risks = [];

    if (comparable.confidence < 0.5) {
        risks.push('Données de confiance limitée');
    }

    if (comparable.source === 'web_search_extraction') {
        risks.push('Données extraites automatiquement');
    }

    if (!comparable.sector) {
        risks.push('Secteur non identifié');
    }

    if (!comparable.country) {
        risks.push('Pays non identifié');
    }

    return risks;
}

function calculateAverageCompleteness(comparables) {
    if (!comparables.length) return 0;

    const fields = ['sector', 'country', 'description', 'url'];
    const totalCompleteness = comparables.reduce((sum, comp) => {
        const filledFields = fields.filter(field => comp[field] !== null && comp[field] !== undefined);
        return sum + (filledFields.length / fields.length);
    }, 0);

    return Math.round((totalCompleteness / comparables.length) * 100);
}

function calculateDiversityScore(comparables) {
    if (!comparables.length) return 0;

    const sectors = new Set(comparables.map(c => c.sector).filter(Boolean));
    const countries = new Set(comparables.map(c => c.country).filter(Boolean));

    const diversityFactors = [sectors.size, countries.size];
    const maxDiversity = Math.min(comparables.length, 5);

    const avgDiversity = diversityFactors.reduce((sum, factor) => sum + factor, 0) / diversityFactors.length;
    return Math.round((avgDiversity / maxDiversity) * 100);
}

function containsSuspiciousContent(text) {
    const suspiciousTerms = ['test', 'exemple', 'sample', 'demo', 'fake', 'null', 'undefined'];
    return suspiciousTerms.some(term => text.toLowerCase().includes(term));
}

// Réutiliser les fonctions d'extraction du code précédent
function extractSector(content) {
    const sectorPatterns = {
        'Technology': ['technology', 'tech', 'it services', 'software', 'digital', 'consulting'],
        'Finance': ['finance', 'financial', 'bank', 'investment', 'insurance'],
        'Healthcare': ['healthcare', 'health', 'medical', 'pharmaceutical'],
        'Manufacturing': ['manufacturing', 'production', 'industrial'],
        'Retail': ['retail', 'commerce', 'consumer'],
        'Energy': ['energy', 'oil', 'gas', 'renewable'],
        'Consulting': ['consulting', 'advisory', 'professional services']
    };

    for (const [sector, keywords] of Object.entries(sectorPatterns)) {
        const matches = keywords.filter(keyword => content.includes(keyword)).length;
        if (matches >= 1) {
            return sector;
        }
    }
    return 'Technology';
}

function extractCountry(content) {
    const countries = {
        'France': ['france', 'french', 'paris'],
        'United States': ['usa', 'united states', 'america'],
        'United Kingdom': ['uk', 'united kingdom', 'britain'],
        'Germany': ['germany', 'german'],
        'China': ['china', 'chinese'],
        'Japan': ['japan', 'japanese']
    };

    for (const [country, keywords] of Object.entries(countries)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return country;
        }
    }
    return null;
}

function extractRegion(content) {
    const country = extractCountry(content);
    const countryToRegion = {
        'France': 'Europe',
        'United Kingdom': 'Europe',
        'Germany': 'Europe',
        'United States': 'North America',
        'China': 'Asia',
        'Japan': 'Asia'
    };
    return countryToRegion[country] || 'Global';
}

function guessSizeCategory(content) {
    if (content.includes('multinational') || content.includes('global') || content.includes('fortune')) {
        return 'large';
    }
    if (content.includes('startup') || content.includes('small')) {
        return 'small';
    }
    return 'medium';
}

function extractEmployeeCount(content) {
    // Réutiliser la fonction améliorée du code précédent
    const patterns = [
        /(\d{1,3}(?:,\d{3})*)\s*(?:employees|employés|people|staff)/gi,
        /(\d{1,3})k?\s*(?:employees|employés|people|staff)/gi
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            let number = parseInt(match[1].replace(/,/g, ''));
            if (match[0].toLowerCase().includes('k')) {
                number *= 1000;
            }
            if (number >= 1 && number <= 5000000) {
                return number;
            }
        }
    }
    return null;
}

function extractRevenue(content) {
    // Réutiliser la fonction améliorée du code précédent
    const patterns = [
        /revenue.*?€(\d{1,3}(?:,\d{3})*)\s*(?:million|billion)/gi,
        /€(\d{1,3}(?:,\d{3})*)\s*(?:million|billion)/gi
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            let amount = parseInt(match[1].replace(/,/g, ''));
            if (match[0].includes('billion')) {
                amount *= 1000;
            }
            return `€${amount}M`;
        }
    }
    return null;
}

function extractSectorFromText(text) {
    return extractSector(text.toLowerCase());
}

function extractCountryFromText(text) {
    return extractCountry(text.toLowerCase());
}

module.exports = { findComparables };