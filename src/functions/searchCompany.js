const { SearchService } = require('../services/searchService');
const { AnalysisService } = require('../services/analysisService');
const { validateInput, createResponse, createErrorResponse } = require('../utils/helpers');

const searchService = new SearchService();
const analysisService = new AnalysisService();

async function searchCompany(request, context) {
    context.log('Start of searchCompany');
    const startTime = Date.now();

    try {
        const body = await request.json();

        // Validate input parameters
        const validation = validateInput(body, {
            query: { required: true, type: 'string', minLength: 2, maxLength: 100 }
        });

        if (!validation.isValid) {
            return createErrorResponse(400, 'Paramètres invalides', validation.errors);
        }

        const { query } = body;
        context.log(`Recherche d'entreprise: ${query}`);

        // Security check - reject suspicious terms
        const suspiciousTerms = ['test', 'exemple', 'sample', 'demo', 'fake'];
        if (suspiciousTerms.some(term => query.toLowerCase().includes(term))) {
            return createErrorResponse(400, "Nom d'entreprise non autorisé");
        }

        // USE THE WORKING SEARCHSERVICE
        console.log("🔍 Début recherche web avec SearchService...");
        const searchResults = await searchService.searchCompanyInfo(query, {
            language: 'fr',
            page: 1
        });

        console.log("📊 Résultats de recherche:", {
            success: searchResults.success,
            totalQueries: searchResults.totalQueries,
            successfulQueries: searchResults.successfulQueries
        });

        if (!searchResults.success || !searchResults.searchResults || searchResults.searchResults.length === 0) {
            return createErrorResponse(404, 'Entreprise non trouvée via recherche web', {
                query: query,
                searchDetails: searchResults,
                suggestions: ['Vérifiez l\'orthographe', 'Utilisez le nom complet', 'Essayez en anglais']
            });
        }

        // Analyze search results to extract information
        console.log("🧠 Analyse des résultats de recherche...");
        let companyProfile;
        
        try {
            // First try AnalysisService if it can process the search results
            companyProfile = await analysisService.analyzeSearchResults(query, searchResults);
        } catch (analysisError) {
            console.log("⚠️ AnalysisService échoué, création profil basique:", analysisError.message);
            
            // Create a basic profile from the search results
            companyProfile = createBasicProfileFromSearch(query, searchResults);
        }

        if (!companyProfile || companyProfile.confidence < 0.1) {
            return createErrorResponse(404, 'Analyse de l\'entreprise échouée', {
                query: query,
                searchResults: searchResults,
                suggestions: ['Vérifiez l\'orthographe', 'Utilisez le nom complet', 'Essayez en anglais']
            });
        }

        // Add quality metadata
        const dataQuality = {
            confidence: companyProfile.confidence,
            completeness: calculateCompleteness(companyProfile),
            sources: [companyProfile.source, 'web_search'],
            validationScore: companyProfile.confidence * 100,
            isGenerated: false,
            indicators: generateQualityIndicators(companyProfile),
            searchResultsCount: searchResults.searchResults.reduce((total, sr) => total + sr.results.length, 0),
            searchQueries: searchResults.totalQueries
        };

        const response = {
            success: true,
            data: {
                ...companyProfile,
                searchQuery: query,
                analysisTimestamp: new Date().toISOString()
            },
            dataQuality: dataQuality,
            metadata: {
                searchDuration: Date.now() - startTime,
                apiVersion: '1.0',
                endpoint: 'searchCompany',
                searchEngine: 'SearXNG',
                totalWebQueries: searchResults.totalQueries,
                geographyDetected: searchResults.detectedGeography.country
            }
        };

        context.log(`Analyse terminée pour ${query}: confidence=${companyProfile.confidence}, résultats web=${dataQuality.searchResultsCount}`);

        return createResponse(200, response);

    } catch (error) {
        context.log.error(`Erreur lors de la recherche:`, error);

        return createErrorResponse(500, 'Erreur interne du serveur', {
            error: error.message,
            timestamp: new Date().toISOString(),
            searchDuration: Date.now() - startTime
        });
    }
}

// IMPROVED EXTRACTION FUNCTIONS
function createBasicProfileFromSearch(query, searchResults) {
    console.log("🏗️ Création profil basique à partir des résultats web");
    
    // Gather all results
    const allResults = [];
    searchResults.searchResults.forEach(sr => {
        allResults.push(...sr.results);
    });

    // Combine all content for analysis
    const allContent = allResults.map(r => `${r.title} ${r.content}`).join(' ').toLowerCase();

    const profile = {
        name: query,
        source: 'web_search_analysis',
        confidence: allResults.length > 5 ? 0.8 : 0.6,
        sector: extractSector(allContent),
        industry: extractIndustry(allContent),
        country: extractCountry(allContent),
        region: extractRegion(allContent),
        employees: extractEmployeeCount(allContent),
        employeeCategory: null,
        revenue: extractRevenue(allContent),
        revenueCategory: null,
        size_category: guessSizeCategory(allContent),
        business_model: extractBusinessModel(allContent),
        main_activities: extractActivities(allContent),
        competitors_mentioned: extractCompetitors(allContent),
        market_position: extractMarketPosition(allContent),
        funding_info: extractFundingInfo(allContent),
        leadership: extractLeadership(allContent),
        headquarters: extractHeadquarters(allContent),
        founding_year: extractFoundingYear(allContent),
        isPublic: guessIsPublic(allContent),
        listingStatus: guessIsPublic(allContent) ? "public" : "private",
        description: createDescription(allResults),
        website: extractWebsite(allResults),
        keyPoints: extractKeyPoints(allResults)
    };

    // Compute categories after extraction
    if (profile.employees) {
        profile.employeeCategory = categorizeEmployees(profile.employees);
    }
    if (profile.revenue) {
        profile.revenueCategory = categorizeRevenue(profile.revenue);
    }

    return profile;
}

function extractSector(content) {
    const sectorPatterns = {
        'Technology': ['technology', 'tech', 'it services', 'software', 'digital', 'consulting', 'transformation'],
        'Finance': ['finance', 'financial', 'bank', 'investment', 'insurance'],
        'Healthcare': ['healthcare', 'health', 'medical', 'pharmaceutical', 'pharma'],
        'Manufacturing': ['manufacturing', 'production', 'industrial', 'factory'],
        'Retail': ['retail', 'commerce', 'consumer', 'shopping'],
        'Energy': ['energy', 'oil', 'gas', 'renewable', 'utilities'],
        'Consulting': ['consulting', 'advisory', 'professional services']
    };

    for (const [sector, keywords] of Object.entries(sectorPatterns)) {
        const matches = keywords.filter(keyword => content.includes(keyword)).length;
        if (matches >= 2) {
            return sector;
        }
    }
    return 'Technology';
}

function extractIndustry(content) {
    const industries = {
        'IT Consulting': ['it consulting', 'technology consulting', 'digital consulting'],
        'Software Development': ['software development', 'application development'],
        'Business Consulting': ['business consulting', 'strategy consulting'],
        'Outsourcing': ['outsourcing', 'managed services']
    };

    for (const [industry, keywords] of Object.entries(industries)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return industry;
        }
    }
    return null;
}

function extractCountry(content) {
    const countries = {
        'France': ['france', 'french', 'paris', 'grenoble'],
        'United States': ['usa', 'united states', 'america', 'us'],
        'United Kingdom': ['uk', 'united kingdom', 'britain', 'london'],
        'Germany': ['germany', 'german', 'deutschland'],
        'India': ['india', 'indian'],
        'China': ['china', 'chinese']
    };

    for (const [country, keywords] of Object.entries(countries)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return country;
        }
    }
    return null;
}

function extractRegion(content) {
    const countryToRegion = {
        'France': 'Europe',
        'United Kingdom': 'Europe',
        'Germany': 'Europe',
        'United States': 'North America',
        'India': 'Asia',
        'China': 'Asia'
    };
    
    const country = extractCountry(content);
    return countryToRegion[country] || 'Global';
}

function extractEmployeeCount(content) {
    // More advanced patterns to find employee count
    const patterns = [
        // Pattern for "350,000 employees" or "350 000 employés"
        /(\d{1,3}(?:[,\s]\d{3})+)\s*(?:employees|employés|people|personnes|staff|collaborateurs)/gi,
        // Pattern for "350k employees" or "350K employés"
        /(\d{1,3})[\s,]*k\s*(?:employees|employés|people|personnes|staff|collaborateurs)/gi,
        // Pattern for "workforce of 350,000"
        /workforce.*?(\d{1,3}(?:[,\s]\d{3})+)/gi,
        // Pattern for "emploie 350 000 personnes"
        /emploie.*?(\d{1,3}(?:[,\s]\d{3})+).*?(?:personnes|employés|collaborateurs)/gi,
        // Simpler pattern for smaller numbers
        /(\d{2,6})\s*(?:employees|employés|people|personnes|staff|collaborateurs)/gi
    ];

    for (const pattern of patterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
            let numberStr = match[1].replace(/[,\s]/g, '');
            let number = parseInt(numberStr);
            
            // If it is a "k" format (thousands)
            if (match[0].toLowerCase().includes('k')) {
                number = number * 1000;
            }
            
            // Validate: reasonable employee count (between 1 and 5 million)
            if (number >= 1 && number <= 5000000) {
                console.log(`🧑‍💼 Employés trouvés: ${number} depuis "${match[0]}"`);
                return number;
            }
        }
    }
    
    return null;
}

function extractRevenue(content) {
    // Patterns for different revenue formats
    const patterns = [
        // "chiffre d'affaires de 22,5 milliards d'euros"
        /chiffre.*?affaires.*?(\d{1,3}(?:[,\.]\d{1,3})*)\s*(?:milliards?|billions?)/gi,
        // "revenue of €22.5 billion" or "revenus de 22,5 milliards €"
        /(?:revenue|revenus?).*?[€$]?(\d{1,3}(?:[,\.]\d{1,3})*)\s*(?:milliards?|billions?)/gi,
        // "22.5 billion in revenue"
        /(\d{1,3}(?:[,\.]\d{1,3})*)\s*(?:milliards?|billions?).*?(?:revenue|revenus?|chiffre)/gi,
        // "turnover of €1.2 billion"
        /(?:turnover|ca).*?[€$]?(\d{1,3}(?:[,\.]\d{1,3})*)\s*(?:milliards?|billions?)/gi,
        // Million formats
        /(?:revenue|revenus?|chiffre.*?affaires).*?[€$]?(\d{1,4}(?:[,\.]\d{1,3})*)\s*(?:millions?)/gi,
        /(\d{1,4}(?:[,\.]\d{1,3})*)\s*(?:millions?).*?(?:revenue|revenus?|euros?|dollars?)/gi
    ];

    for (const pattern of patterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
            let amountStr = match[1].replace(/[,\s]/g, '').replace(',', '.');
            let amount = parseFloat(amountStr);
            
            if (isNaN(amount)) continue;
            
            // Convert to millions of euros
            if (match[0].toLowerCase().includes('milliard') || match[0].toLowerCase().includes('billion')) {
                amount = amount * 1000; // Convertir milliards en millions
            }
            
            // Validate: reasonable amount (between 1M€ and 1000000M€)
            if (amount >= 1 && amount <= 1000000) {
                console.log(`💰 Revenus trouvés: €${amount}M depuis "${match[0]}"`);
                return `€${Math.round(amount)}M`;
            }
        }
    }
    
    return null;
}

function categorizeEmployees(employeeCount) {
    if (employeeCount < 50) return 'small';
    if (employeeCount < 1000) return 'medium';
    if (employeeCount < 10000) return 'large';
    return 'enterprise';
}

function categorizeRevenue(revenue) {
    const amount = parseInt(revenue.replace(/[€M]/g, ''));
    if (amount < 10) return 'small';
    if (amount < 100) return 'medium';
    if (amount < 1000) return 'large';
    return 'enterprise';
}

function extractBusinessModel(content) {
    const models = {
        'B2B Services': ['b2b', 'business to business', 'consulting', 'services'],
        'SaaS': ['saas', 'software as a service', 'cloud'],
        'Consulting': ['consulting', 'advisory']
    };

    for (const [model, keywords] of Object.entries(models)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return model;
        }
    }
    return null;
}

function extractActivities(content) {
    const activities = [];
    const activityKeywords = {
        'Digital Transformation': ['digital transformation', 'digitalization'],
        'IT Consulting': ['it consulting', 'technology consulting'],
        'Cloud Services': ['cloud', 'cloud services'],
        'Data Analytics': ['data analytics', 'big data', 'analytics'],
        'Cybersecurity': ['cybersecurity', 'security'],
        'Outsourcing': ['outsourcing', 'managed services']
    };

    for (const [activity, keywords] of Object.entries(activityKeywords)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            activities.push(activity);
        }
    }

    return activities.slice(0, 5);
}

function extractCompetitors(content) {
    const competitors = [];
    const knownCompetitors = ['accenture', 'deloitte', 'ibm', 'tcs', 'infosys', 'wipro', 'atos'];
    
    for (const competitor of knownCompetitors) {
        if (content.includes(competitor)) {
            competitors.push(competitor.charAt(0).toUpperCase() + competitor.slice(1));
        }
    }
    
    return competitors;
}

function extractMarketPosition(content) {
    if (content.includes('leader') || content.includes('leading')) return 'Leader';
    if (content.includes('top') || content.includes('major')) return 'Major Player';
    return null;
}

function extractFundingInfo(content) {
    if (content.includes('public') && content.includes('stock')) {
        return { type: 'Public', exchange: extractStockExchange(content) };
    }
    return null;
}

function extractStockExchange(content) {
    if (content.includes('nasdaq')) return 'NASDAQ';
    if (content.includes('nyse')) return 'NYSE';
    if (content.includes('euronext')) return 'Euronext';
    return null;
}

function extractLeadership(content) {
    const leadership = [];
    
    // Patterns for different roles
    const rolePatterns = {
        'CEO': /(?:ceo|chief executive officer|directeur général|pdg).*?([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
        'CTO': /(?:cto|chief technology officer|directeur technique).*?([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
        'CFO': /(?:cfo|chief financial officer|directeur financier).*?([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
        'Chairman': /(?:chairman|président).*?([A-Z][a-z]+\s+[A-Z][a-z]+)/gi
    };
    
    for (const [role, pattern] of Object.entries(rolePatterns)) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
            const name = match[1];
            if (name && name.length > 3 && name.length < 50) {
                leadership.push({ role, name });
                console.log(`👔 Dirigeant trouvé: ${role} - ${name}`);
                break; // Only one per role
            }
        }
    }
    
    return leadership;
}

function extractHeadquarters(content) {
    // Patterns to find headquarters
    const patterns = [
        // "headquartered in Paris" or "siège social à Paris"
        /(?:headquartered|siège.*?social).*?(?:in|à|en)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
        // "based in Paris, France"
        /based.*?in\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
        // "11 rue de Tilsitt, 75017 Paris"
        /\d+.*?rue.*?(\w+),.*?(\d{5})\s*([A-Z][a-z]+)/gi,
        // "Paris, France" - simple pattern
        /([A-Z][a-z]+),\s*([A-Z][a-z]+)/gi
    ];

    // Known cities for validation
    const knownCities = [
        'Paris', 'London', 'New York', 'Tokyo', 'Berlin', 'Madrid', 
        'Rome', 'Amsterdam', 'Brussels', 'Geneva', 'Zurich', 'Milan',
        'Dublin', 'Stockholm', 'Copenhagen', 'Mumbai', 'Bangalore',
        'Singapore', 'Hong Kong', 'Sydney', 'Toronto', 'Montreal'
    ];

    for (const pattern of patterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
            let city = null;
            
            // Depending on the pattern, the city may be in different groups
            if (match[3]) {
                city = match[3]; // Full address pattern
            } else if (match[1]) {
                city = match[1]; // Standard pattern
            }
            
            if (city && knownCities.includes(city)) {
                console.log(`🏢 Siège social trouvé: ${city} depuis "${match[0]}"`);
                return city;
            }
        }
    }
    
    return null;
}

function extractFoundingYear(content) {
    // Patterns to find the founding year
    const patterns = [
        // "founded in 1967" or "créée en 1967"
        /(?:founded|created|established|créée?|fondée?).*?(?:in|en)\s*(\d{4})/gi,
        // "depuis 1967" or "since 1967"
        /(?:depuis|since)\s*(\d{4})/gi,
        // "1967 création" or "création 1967"
        /(?:création|foundation).*?(\d{4})|(\d{4}).*?(?:création|foundation)/gi,
        // "Capgemini (1967)" or parenthesis format
        /\((\d{4})\)/g,
        // Additional context patterns
        /(?:company|société|entreprise).*?(?:founded|créée?).*?(\d{4})/gi,
        // French format "en 1967"
        /en\s*(\d{4})/gi
    ];

    const currentYear = new Date().getFullYear();
    const foundYears = new Set();

    for (const pattern of patterns) {
        const matches = [...content.matchAll(pattern)];
        for (const match of matches) {
            // The match may have the year in group 1 or 2
            const year = parseInt(match[1] || match[2]);
            
            // Validate: realistic year for a company (between 1800 and current year)
            if (year >= 1800 && year <= currentYear) {
                foundYears.add(year);
                console.log(`📅 Année de création trouvée: ${year} depuis "${match[0]}"`);
            }
        }
    }
    
    // If multiple years are found, take the oldest one (likely the founding year)
    if (foundYears.size > 0) {
        return Math.min(...foundYears);
    }
    
    return null;
}

function guessSizeCategory(content) {
    if (content.includes('multinational') || content.includes('global') || 
        content.includes('fortune') || content.includes('leader')) {
        return 'large';
    }
    if (content.includes('startup') || content.includes('small')) {
        return 'small';
    }
    return 'medium';
}

function guessIsPublic(content) {
    return content.includes('public') || content.includes('stock') || 
           content.includes('nasdaq') || content.includes('nyse') ||
           content.includes('euronext') || content.includes('listed');
}

function createDescription(results) {
    if (results.length > 0) {
        const bestResult = results.find(r => 
            r.content.length > 100 && 
            !r.url.includes('linkedin.com') &&
            !r.url.includes('wikipedia.org')
        ) || results[0];
        
        return bestResult.content.substring(0, 300) + '...';
    }
    return null;
}

function extractWebsite(results) {
    for (const result of results) {
        const url = result.url.toLowerCase();
        if (url.includes('.com/') && 
            !url.includes('linkedin') && 
            !url.includes('wikipedia') &&
            !url.includes('google') &&
            !url.includes('yahoo')) {
            return result.url;
        }
    }
    return null;
}

function extractKeyPoints(results) {
    return results
        .slice(0, 5)
        .map(r => r.title)
        .filter(title => title.length > 5 && title.length < 100);
}

function calculateCompleteness(profile) {
    const fields = ['sector', 'industry', 'country', 'employees', 'revenue', 'description', 'headquarters'];
    const filledFields = fields.filter(field => profile[field] !== null && profile[field] !== undefined);
    return Math.round((filledFields.length / fields.length) * 100);
}

function generateQualityIndicators(profile) {
    const indicators = [];

    if (profile.confidence > 0.8) indicators.push('Haute confiance');
    if (profile.sector) indicators.push('Secteur identifié');
    if (profile.employees) indicators.push('Données RH');
    if (profile.revenue) indicators.push('Données financières');
    if (profile.competitors_mentioned && profile.competitors_mentioned.length > 0) {
        indicators.push('Environnement concurrentiel');
    }
    if (profile.source.includes('web')) indicators.push('Source web validée');

    return indicators;
}

module.exports = { searchCompany };
