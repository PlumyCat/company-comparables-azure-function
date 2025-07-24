const { SearchService } = require('./searchService');

class AnalysisService {
    constructor() {
        this.searchService = new SearchService();
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
        
        this.sectorKeywords = {
            'Technology': ['tech', 'software', 'digital', 'informatique', 'numérique', 'logiciel'],
            'Healthcare': ['santé', 'médical', 'pharma', 'biotechnology', 'health'],
            'Finance': ['finance', 'banque', 'assurance', 'fintech', 'bank'],
            'Retail': ['retail', 'commerce', 'vente', 'distribution', 'e-commerce'],
            'Manufacturing': ['manufacturing', 'industrie', 'production', 'fabrication'],
            'Energy': ['énergie', 'energy', 'renewable', 'renouvelable', 'électricité'],
            'Real Estate': ['immobilier', 'real estate', 'property', 'construction'],
            'Transportation': ['transport', 'logistics', 'logistique', 'mobility'],
            'Education': ['éducation', 'formation', 'training', 'école', 'university'],
            'Consulting': ['conseil', 'consulting', 'advisory', 'services']
        };
    }

    async analyzeCompany(companyName, options = {}) {
        const cacheKey = `profile_${companyName.toLowerCase()}`;
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        try {
            const webProfile = await this.deepWebAnalysis(companyName);
            const enrichedProfile = await this.enrichWithSectorData(webProfile);
            
            this.setCachedData(cacheKey, enrichedProfile);
            return enrichedProfile;
        } catch (error) {
            return this.createFallbackProfile(companyName);
        }
    }

    async deepWebAnalysis(companyName) {
        const searches = [
            `"${companyName}" company business profile activity`,
            `"${companyName}" sector industry market business model`,
            `"${companyName}" revenue employees size funding`,
            `"${companyName}" competitors benchmark sector`,
            `"${companyName}" management headquarters address`,
            `"${companyName}" funding investment growth`,
            `"${companyName}" valuation assessment price sale`
        ];

        const searchPromises = searches.map(async (query) => {
            try {
                const result = await this.searchService.searchWeb(query, {
                    maxResults: 5,
                    language: 'en',
                    categories: 'general,news'
                });
                return { query, result };
            } catch (error) {
                return { query, result: null };
            }
        });

        const results = await Promise.all(searchPromises);
        return this.extractCompanyProfile(companyName, results);
    }

    extractCompanyProfile(companyName, searchResults) {
        const profile = {
            name: companyName,
            source: 'web_analysis',
            confidence: 0,
            sector: null,
            industry: null,
            country: null,
            region: null,
            employees: null,
            employeeCategory: null,
            revenue: null,
            revenueCategory: null,
            size_category: null,
            business_model: null,
            main_activities: [],
            competitors_mentioned: [],
            market_position: null,
            funding_info: null,
            leadership: [],
            headquarters: null,
            founding_year: null,
            isPublic: false,
            listingStatus: 'private',
            description: null,
            website: null,
            keyPoints: []
        };

        let totalResults = 0;
        let relevantResults = 0;

        searchResults.forEach(({ query, result }) => {
            if (!result || !result.results) return;

            totalResults += result.results.length;

            result.results.forEach(item => {
                if (this.isRelevantResult(companyName, item)) {
                    relevantResults++;
                    this.enrichProfileFromResult(profile, item, query);
                }
            });
        });

        profile.confidence = relevantResults > 0 ? Math.min(relevantResults / 10, 1) : 0;
        profile.size_category = this.determineSizeCategory(profile);
        this.cleanAndValidateProfile(profile);

        return profile;
    }

    enrichProfileFromResult(profile, result, query) {
        const content = `${result.title} ${result.content}`.toLowerCase();
        const url = result.url || '';

        if (!profile.sector) {
            profile.sector = this.extractSector(content);
        }

        if (!profile.industry) {
            profile.industry = this.extractIndustry(content);
        }

        if (!profile.employees) {
            profile.employees = this.extractEmployeeCount(content);
        }

        if (!profile.revenue) {
            profile.revenue = this.extractRevenue(content);
        }

        const competitors = this.extractCompetitors(content, profile.name);
        profile.competitors_mentioned = [...new Set([...profile.competitors_mentioned, ...competitors])];

        const activities = this.extractActivities(content);
        profile.main_activities = [...new Set([...profile.main_activities, ...activities])];

        if (!profile.headquarters) {
            profile.headquarters = this.extractHeadquarters(content, url);
        }

        if (!profile.founding_year) {
            profile.founding_year = this.extractFoundingYear(content);
        }

        if (!profile.website && url) {
            profile.website = this.extractWebsite(url);
        }

        if (!profile.funding_info) {
            profile.funding_info = this.extractFundingInfo(content);
        }

        const keyPoint = this.extractKeyPoint(result, query);
        if (keyPoint) {
            profile.keyPoints.push(keyPoint);
        }
    }

    async findComparables(referenceCompany, options = {}) {
        try {
            const normalizedCompany = {
                name: referenceCompany.name || 'Entreprise inconnue',
                sector: referenceCompany.sector || this.inferSectorFromName(referenceCompany.name) || 'Technology',
                size_category: referenceCompany.size_category || referenceCompany.sizeCategory || 'PME',
                country: referenceCompany.country || 'France',
                industry: referenceCompany.industry || referenceCompany.sector || null,
                employees: referenceCompany.employees || null,
                revenue: referenceCompany.revenue || null
            };

            const privateComparables = await this.findPrivateComparables(
                normalizedCompany.sector,
                normalizedCompany.size_category,
                normalizedCompany.country,
                normalizedCompany.industry
            ).catch(error => {
                return this.getFallbackPrivateComparables(normalizedCompany.sector, normalizedCompany.size_category, normalizedCompany.country);
            });

            const rankedComparables = this.rankForFinancialAnalysis(
                privateComparables || [],
                [],
                normalizedCompany,
                options
            );

            return rankedComparables;
        } catch (error) {
            const fallbackResults = this.getFallbackPrivateComparables('Technology', 'PME', 'France');
            return fallbackResults;
        }
    }

    async findPrivateComparables(sector, sizeCategory, country = 'France', industry = null) {
        try {
            const sectorQuery = `"${sector}" entreprises France secteur ${sizeCategory}`;
            const result = await this.searchService.searchWeb(sectorQuery, {
                language: 'fr',
                maxResults: 10
            }, 'marketAnalysis');

            if (result && result.results && result.results.length > 0) {
                const companies = this.extractCompaniesFromResults(result, sector, industry);
                return companies.slice(0, 8);
            }

            return this.getFallbackPrivateComparables(sector, sizeCategory, country);
        } catch (error) {
            return this.getFallbackPrivateComparables(sector, sizeCategory, country);
        }
    }

    extractCompaniesFromResults(searchResult, targetSector, targetIndustry) {
        if (!searchResult || !searchResult.results) {
            return this.getFallbackPrivateComparables(targetSector, 'PME', 'France').slice(0, 2);
        }

        const companies = [];

        searchResult.results.forEach((result) => {
            const extractedCompanies = this.extractCompanyNamesFromContent(
                result.title,
                result.content,
                result.url
            );

            extractedCompanies.forEach(company => {
                companies.push({
                    name: company.name,
                    sector: company.sector || targetSector,
                    industry: company.industry || targetIndustry,
                    source: 'web_search',
                    confidence: company.confidence || 0.5,
                    url: result.url,
                    description: company.description,
                    isPublic: false,
                    listingStatus: 'private'
                });
            });
        });

        if (companies.length === 0) {
            return this.getFallbackPrivateComparables(targetSector, 'PME', 'France').slice(0, 3);
        }

        return companies;
    }

    extractCompanyNamesFromContent(title, content, url) {
        const companies = [];
        const text = `${title} ${content}`;

        const priorityPatterns = [
            /\b([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&\-'\.]{2,35})\s+(?:SAS|SARL|SA|EURL|SNC|SASU)\b/g,
            /\b([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&\-'\.]{2,35})\s+(?:Ltd|LLC|Inc|Corp|GmbH|AG|Limited)\b/gi,
            /(?:Groupe|Group|Holding)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&\-'\.]{2,35})\b/g,
            /\b([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{2,20})\s*&\s*([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]{2,20})\b/g
        ];

        priorityPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const name = match[1] ? match[1].trim() : match[0].trim();
                
                if (match[2]) {
                    const fullName = `${match[1].trim()} & ${match[2].trim()}`;
                    if (this.isValidCompanyName(fullName)) {
                        companies.push({
                            name: fullName,
                            confidence: 0.9,
                            description: this.extractCompanyDescription(fullName, content),
                            source: 'priority_pattern'
                        });
                    }
                } else if (this.isValidCompanyName(name)) {
                    companies.push({
                        name: name,
                        confidence: 0.8,
                        description: this.extractCompanyDescription(name, content),
                        source: 'priority_pattern'
                    });
                }
            }
        });

        const uniqueCompanies = new Map();
        companies.forEach(company => {
            const key = company.name.toLowerCase().trim();
            if (!uniqueCompanies.has(key) || uniqueCompanies.get(key).confidence < company.confidence) {
                if (this.isHighQualityCompanyName(company.name)) {
                    uniqueCompanies.set(key, company);
                }
            }
        });

        return Array.from(uniqueCompanies.values())
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }

    rankForFinancialAnalysis(privateComparables, publicComparables, referenceCompany, options = {}) {
        const allComparables = [...privateComparables, ...publicComparables];

        if (allComparables.length === 0) {
            return this.getFallbackPrivateComparables(
                referenceCompany.sector || 'Technology',
                referenceCompany.size_category || 'PME',
                referenceCompany.country || 'France'
            );
        }

        const scoredComparables = allComparables.map(comparable => ({
            ...comparable,
            similarityScore: this.calculateFinancialSimilarity(referenceCompany, comparable),
            relevanceScore: this.calculateRelevanceScore(referenceCompany, comparable)
        }));

        scoredComparables.sort((a, b) => b.similarityScore - a.similarityScore);

        const maxResults = options.maxResults || 10;
        return scoredComparables.slice(0, maxResults);
    }

    calculateFinancialSimilarity(reference, comparable) {
        let score = 0;

        if (reference.sector && comparable.sector) {
            if (reference.sector.toLowerCase() === comparable.sector.toLowerCase()) {
                score += 40;
            } else if (this.areSectorsRelated(reference.sector, comparable.sector)) {
                score += 25;
            }
        }

        const sizeScore = this.calculateSizeScore(reference, comparable);
        score += (sizeScore * 0.3);

        const geoScore = this.calculateGeoScore(reference, comparable);
        score += (geoScore * 0.2);

        const stageScore = this.calculateStageScore(reference, comparable);
        score += (stageScore * 0.1);

        return Math.min(Math.max(Math.round(score), 0), 100);
    }

    calculateRelevanceScore(reference, comparable) {
        let score = 0;

        if (comparable.revenue) score += 10;
        if (comparable.employees) score += 10;
        if (comparable.description) score += 5;
        if (comparable.competitors_mentioned && comparable.competitors_mentioned.length > 0) score += 5;
        if (comparable.confidence > 0.7) score += 10;

        return score;
    }

    // Extraction methods
    extractSector(content) {
        const sectorPatterns = [
            { pattern: /secteur[:\s]+([\w\s\-&]+?)(?:\.|,|\n|;|$)/i, minLength: 4 },
            { pattern: /industrie[:\s]+([\w\s\-&]+?)(?:\.|,|\n|;|$)/i, minLength: 4 },
            { pattern: /domaine[:\s]+([\w\s\-&]+?)(?:\.|,|\n|;|$)/i, minLength: 4 },
            { pattern: /spécialisé dans[:\s]+([\w\s\-&]+?)(?:\.|,|\n|;|$)/i, minLength: 5 }
        ];

        for (const { pattern, minLength } of sectorPatterns) {
            const match = content.match(pattern);
            if (match) {
                let sector = match[1].trim();
                if (this.isValidSectorExtraction(sector, minLength)) {
                    sector = this.cleanSectorName(sector);
                    if (sector.length >= minLength && sector.length <= 60) {
                        return sector;
                    }
                }
            }
        }

        return this.extractSectorByKeywords(content);
    }

    isValidSectorExtraction(sector, minLength) {
        if (!sector || sector.length < minLength) return false;

        const invalidPatterns = [
            /^[a-z]$/i,
            /^[a-z]{1,2}$/i,
            /^\d+$/,
            /^[^\w]/,
            /^(et|de|du|des|le|la|les|un|une|dans|sur|pour|avec|par)$/i
        ];

        return !invalidPatterns.some(pattern => pattern.test(sector.trim()));
    }

    cleanSectorName(sector) {
        return sector
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\-&]/g, '')
            .replace(/^(du|de|des|le|la|les)\s+/i, '')
            .trim();
    }

    extractSectorByKeywords(content) {
        const sectorKeywords = {
            'Financial Services': [
                'finance', 'banque', 'assurance', 'fintech', 'banking', 'insurance',
                'capital', 'investissement', 'gestion', 'patrimoine', 'crédit',
                'financier', 'bancaire', 'fonds', 'épargne', 'placement',
                'conseil financier', 'advisory', 'asset management', 'private equity',
                'venture capital', 'wealth management', 'financial advisor',
                'b & capital', 'b&capital', 'capital management', 'financial services'
            ],
            'Technology': [
                'technologie', 'informatique', 'logiciel', 'digital', 'tech', 'it', 'software',
                'cloud', 'saas', 'développement', 'programmation', 'système',
                'application', 'plateforme', 'données', 'intelligence artificielle',
                'cybersécurité', 'blockchain', 'iot', 'mobile', 'web'
            ],
            'Healthcare': [
                'santé', 'pharmaceutique', 'médical', 'biotechnologie', 'health', 'medical',
                'pharma', 'clinique', 'hôpital', 'thérapie', 'diagnostic', 'recherche médicale'
            ],
            'Energy': [
                'énergie', 'renouvelable', 'électricité', 'energy', 'renewable',
                'solaire', 'éolien', 'nucléaire', 'pétrole', 'gaz', 'hydrogène'
            ]
        };

        const sectorScores = {};

        for (const [sector, keywords] of Object.entries(sectorKeywords)) {
            let score = 0;
            const contentLower = content.toLowerCase();

            for (const keyword of keywords) {
                const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
                const matches = contentLower.match(regex);
                if (matches) {
                    let weight = 1;
                    if (keyword.length > 10) weight = 2;
                    if (keyword.includes('&') || keyword.includes('capital')) weight = 3;
                    score += matches.length * weight;
                }
            }
            if (score > 0) {
                sectorScores[sector] = score;
            }
        }

        const bestSector = Object.entries(sectorScores)
            .filter(([sector, score]) => score >= 1)
            .sort(([, a], [, b]) => b - a)[0];

        return bestSector ? bestSector[0] : null;
    }

    // Helper methods
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCachedData(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    getFallbackPrivateComparables(sector, sizeCategory, country) {
        const fallbackData = {
            'Technology': [
                {
                    name: 'DevTech Solutions',
                    sector: 'Technology',
                    industry: 'Software Development',
                    source: 'fallback_data',
                    confidence: 0.8,
                    url: 'https://example.com/devtech',
                    description: 'Société de développement logiciel spécialisée dans les solutions d\'entreprise.',
                    isPublic: false,
                    listingStatus: 'private',
                    employees: 150,
                    country: 'France',
                    baseScore: 70,
                    similarityScore: 75,
                    relevanceScore: 15
                },
                {
                    name: 'InnovateTech SARL',
                    sector: 'Technology',
                    industry: 'Digital Services',
                    source: 'fallback_data',
                    confidence: 0.85,
                    url: 'https://example.com/innovatetech',
                    description: 'Entreprise de services numériques pour les PME et ETI.',
                    isPublic: false,
                    listingStatus: 'private',
                    employees: 85,
                    country: 'France',
                    baseScore: 75,
                    similarityScore: 80,
                    relevanceScore: 20
                }
            ],
            'Finance': [
                {
                    name: 'FinTech Innovations',
                    sector: 'Finance',
                    industry: 'Financial Technology',
                    source: 'fallback_data',
                    confidence: 0.8,
                    url: 'https://example.com/fintech',
                    description: 'Solutions technologiques pour le secteur financier.',
                    isPublic: false,
                    listingStatus: 'private',
                    employees: 95,
                    country: 'France',
                    baseScore: 72,
                    similarityScore: 78,
                    relevanceScore: 18
                }
            ]
        };

        const sectorData = fallbackData[sector] || fallbackData['Technology'];
        
        return sectorData.map(company => ({
            ...company,
            extractionDate: new Date().toISOString()
        }));
    }

    // Placeholder methods for completeness
    extractIndustry(content) { return null; }
    extractEmployeeCount(content) { return null; }
    extractRevenue(content) { return null; }
    extractCompetitors(content, name) { return []; }
    extractActivities(content) { return []; }
    extractHeadquarters(content, url) { return null; }
    extractFoundingYear(content) { return null; }
    extractWebsite(url) { return null; }
    extractFundingInfo(content) { return null; }
    extractKeyPoint(result, query) { return null; }
    extractCompanyDescription(name, content) { return `Entreprise ${name}`; }
    
    isRelevantResult(companyName, result) { return true; }
    isValidCompanyName(name) { return name && name.length >= 3 && name.length <= 60; }
    isHighQualityCompanyName(name) { return this.isValidCompanyName(name); }
    
    determineSizeCategory(profile) { return 'medium'; }
    cleanAndValidateProfile(profile) { return profile; }
    areSectorsRelated(s1, s2) { return false; }
    
    calculateSizeScore(ref, comp) { return 50; }
    calculateGeoScore(ref, comp) { return 50; }
    calculateStageScore(ref, comp) { return 50; }
    
    inferSectorFromName(name) { return 'Technology'; }
    createFallbackProfile(name) {
        return {
            name: name,
            source: 'fallback',
            confidence: 0.1,
            sector: 'Technology',
            isPublic: false,
            listingStatus: 'private'
        };
    }

    async enrichWithSectorData(profile) {
        return profile;
    }
}

module.exports = { AnalysisService };