const { SearchService } = require('../services/searchService');
const { validateInput, createResponse, createErrorResponse } = require('../utils/helpers');

const searchService = new SearchService();

async function analyzeMetrics(request, context) {
    context.log('Début de analyzeMetrics');
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
            includeComparables = true,  // Optionnel avec défaut
            maxComparables = 5          // Optionnel avec défaut
        } = body;

        context.log(`Analyse de métriques pour: ${companyName}`);

        // Validation de sécurité
        if (containsSuspiciousContent(companyName)) {
            return createErrorResponse(400, "Nom d'entreprise non autorisé");
        }

        // ÉTAPE 1: Analyser l'entreprise principale
        console.log("🔍 Analyse de l'entreprise principale...");
        const mainCompanyResults = await searchService.searchCompanyInfo(companyName, {
            language: 'fr',
            page: 1
        });

        if (!mainCompanyResults.success) {
            return createErrorResponse(404, 'Entreprise non trouvée', {
                companyName: companyName,
                suggestions: ['Vérifiez l\'orthographe', 'Utilisez le nom complet']
            });
        }

        // Créer le profil principal avec métriques
        const mainProfile = createDetailedProfileWithMetrics(companyName, mainCompanyResults);
        console.log("📊 Profil principal créé:", {
            name: mainProfile.name,
            sector: mainProfile.sector,
            employees: mainProfile.employees,
            revenue: mainProfile.revenue
        });

        // ÉTAPE 2: Trouver automatiquement des comparables si demandé
        let comparables = [];
        if (includeComparables && maxComparables > 0) {
            console.log(`🔎 Recherche automatique de ${maxComparables} comparables...`);
            comparables = await findComparablesAutomatically(mainProfile, maxComparables);
            console.log(`📋 ${comparables.length} comparables trouvés`);
        }

        // ÉTAPE 3: Calculer les métriques pour toutes les entreprises
        const allCompanies = [mainProfile, ...comparables];
        const analyzedCompanies = allCompanies.map((company, index) => {
            const metrics = calculateAdvancedFinancialMetrics(company);
            const riskProfile = assessComprehensiveRiskProfile(company, metrics);
            const valuation = estimateDetailedValuation(company, metrics, mainProfile);
            const marketPosition = assessMarketPosition(company, allCompanies);

            return {
                ...company,
                isMainCompany: index === 0,
                financialMetrics: metrics,
                riskProfile: riskProfile,
                valuationEstimate: valuation,
                marketPosition: marketPosition,
                benchmarkScores: calculateBenchmarkScores(company, mainProfile),
                analysisTimestamp: new Date().toISOString()
            };
        });

        // ÉTAPE 4: Analyse comparative
        const comparativeAnalysis = performComparativeAnalysis(analyzedCompanies);
        
        // ÉTAPE 5: Recommandations intelligentes
        const smartRecommendations = generateSmartRecommendations(analyzedCompanies, comparativeAnalysis);

        // ÉTAPE 6: Statistiques globales
        const analysisStats = {
            totalCompanies: analyzedCompanies.length,
            mainCompany: analyzedCompanies[0].name,
            comparablesAnalyzed: comparables.length,
            averageEmployees: Math.round(
                analyzedCompanies
                    .filter(c => c.employees)
                    .reduce((sum, c) => sum + c.employees, 0) / 
                analyzedCompanies.filter(c => c.employees).length || 0
            ),
            sectorDistribution: calculateSectorDistribution(analyzedCompanies),
            riskDistribution: calculateRiskDistribution(analyzedCompanies),
            performanceRanking: analyzedCompanies
                .sort((a, b) => (b.benchmarkScores?.overall || 0) - (a.benchmarkScores?.overall || 0))
                .map((c, i) => ({ rank: i + 1, name: c.name, score: c.benchmarkScores?.overall || 0 }))
        };

        const response = {
            success: true,
            mainCompany: {
                name: mainProfile.name,
                sector: mainProfile.sector,
                country: mainProfile.country,
                analysisDepth: 'comprehensive'
            },
            analyzedCompanies: analyzedCompanies,
            comparativeAnalysis: comparativeAnalysis,
            analysisStats: analysisStats,
            recommendations: smartRecommendations,
            methodology: {
                dataCollection: 'Recherche web automatique via SearXNG',
                metricsCalculation: 'Analyse multi-critères: secteur, taille, performance, risque',
                benchmarking: 'Comparaison relative avec moyennes sectorielles',
                riskAssessment: 'Évaluation pondérée: financier, sectoriel, géographique, données'
            },
            metadata: {
                analysisDuration: Date.now() - startTime,
                apiVersion: '1.0',
                endpoint: 'analyzeMetrics',
                searchEngine: 'SearXNG',
                autoGenerated: true,
                analysisTimestamp: new Date().toISOString()
            }
        };

        context.log(`Analyse terminée: ${analyzedCompanies.length} entreprises analysées en ${Date.now() - startTime}ms`);
        return createResponse(200, response);

    } catch (error) {
        context.log.error(`Erreur lors de l'analyse des métriques:`, error);
        return createErrorResponse(500, 'Erreur interne du serveur', {
            error: error.message,
            timestamp: new Date().toISOString(),
            analysisDuration: Date.now() - startTime
        });
    }
}

// FONCTIONS UTILITAIRES AVANCÉES

function createDetailedProfileWithMetrics(companyName, searchResults) {
    const allResults = [];
    searchResults.searchResults.forEach(sr => {
        allResults.push(...sr.results);
    });

    const allContent = allResults.map(r => `${r.title} ${r.content}`).join(' ').toLowerCase();

    return {
        name: companyName,
        source: 'web_search_metrics',
        confidence: allResults.length > 10 ? 0.9 : 0.7,
        sector: extractSector(allContent),
        industry: extractIndustry(allContent),
        country: extractCountry(allContent),
        region: extractRegion(allContent),
        employees: extractEmployeeCount(allContent),
        revenue: extractRevenue(allContent),
        founding_year: extractFoundingYear(allContent),
        headquarters: extractHeadquarters(allContent),
        size_category: guessSizeCategory(allContent),
        isPublic: guessIsPublic(allContent),
        description: createDescription(allResults),
        website: extractWebsite(allResults),
        marketShare: extractMarketShare(allContent),
        growthRate: extractGrowthRate(allContent),
        profitability: extractProfitability(allContent)
    };
}

async function findComparablesAutomatically(mainProfile, maxResults) {
    const comparables = [];
    
    // Générer des requêtes de recherche ciblées
    const searchQueries = [
        `concurrents ${mainProfile.sector || 'technology'} ${mainProfile.country || ''}`,
        `entreprises similaires ${mainProfile.sector || 'technology'}`,
        `leaders ${mainProfile.sector || 'technology'} secteur`
    ];

    for (const query of searchQueries) {
        try {
            const searchResults = await searchService.searchWeb(query, {
                language: 'fr',
                page: 1
            }, 'competitorAnalysis');

            if (searchResults.success && searchResults.results) {
                const foundCompanies = extractCompaniesFromSearchResults(
                    searchResults.results, 
                    mainProfile.name
                );
                comparables.push(...foundCompanies);
            }
        } catch (error) {
            console.log(`⚠️ Erreur recherche comparable "${query}":`, error.message);
        }
    }

    // Déduplication et limitation
    const uniqueComparables = deduplicateByName(comparables);
    return uniqueComparables.slice(0, maxResults);
}

function extractCompaniesFromSearchResults(results, excludeName) {
    const companies = [];
    const companyPatterns = [
        /([A-Z][a-zA-Z\s&]+)(?:\s+(?:SE|SA|Inc|Corp|Ltd|LLC|SAS|SARL))/g,
        /entreprise\s+([A-Z][a-zA-Z\s&]{3,30})/gi,
        /société\s+([A-Z][a-zA-Z\s&]{3,30})/gi
    ];

    for (const result of results) {
        const content = `${result.title} ${result.content}`;
        
        for (const pattern of companyPatterns) {
            const matches = [...content.matchAll(pattern)];
            for (const match of matches) {
                const companyName = match[1].trim();
                
                if (isValidExtractedCompany(companyName, excludeName)) {
                    companies.push({
                        name: companyName,
                        source: 'competitor_extraction',
                        confidence: 0.6,
                        url: result.url,
                        description: result.content.substring(0, 150) + '...',
                        extractedFrom: result.title,
                        // Essayer d'extraire des infos basiques du contexte
                        sector: extractSectorFromContext(content),
                        country: extractCountryFromContext(content)
                    });
                }
            }
        }
    }

    return companies;
}

function calculateAdvancedFinancialMetrics(company) {
    const metrics = {
        // Métriques de base
        revenuePerEmployee: null,
        employeeProductivity: 'unknown',
        sizeCategory: company.size_category || 'unknown',
        
        // Métriques avancées
        growthStage: determineGrowthStage(company),
        marketPresence: assessMarketPresence(company),
        operationalEfficiency: 'unknown',
        scalabilityIndex: calculateScalabilityIndex(company),
        
        // Indicateurs sectoriels
        sectorRank: 'unknown',
        competitivePosition: 'unknown',
        
        // Scores calculés
        overallHealthScore: 0,
        growthPotential: 0,
        stabilityScore: 0
    };

    // Calculs basés sur les données disponibles
    if (company.revenue && company.employees && company.employees > 0) {
        const revenueStr = company.revenue.replace(/[€M]/g, '');
        const revenueNum = parseInt(revenueStr) * 1000000; // Convertir en euros
        
        metrics.revenuePerEmployee = Math.round(revenueNum / company.employees);
        
        // Classification de la productivité
        if (metrics.revenuePerEmployee > 300000) {
            metrics.employeeProductivity = 'very_high';
            metrics.overallHealthScore += 30;
        } else if (metrics.revenuePerEmployee > 150000) {
            metrics.employeeProductivity = 'high';
            metrics.overallHealthScore += 25;
        } else if (metrics.revenuePerEmployee > 80000) {
            metrics.employeeProductivity = 'medium';
            metrics.overallHealthScore += 15;
        } else {
            metrics.employeeProductivity = 'low';
            metrics.overallHealthScore += 5;
        }
    }

    // Score de croissance basé sur l'âge et la taille
    if (company.founding_year) {
        const age = new Date().getFullYear() - company.founding_year;
        if (age < 10 && company.employees > 100) {
            metrics.growthPotential = 85;
        } else if (age < 20 && company.employees > 500) {
            metrics.growthPotential = 70;
        } else {
            metrics.growthPotential = 50;
        }
    }

    // Score de stabilité
    metrics.stabilityScore = calculateStabilityScore(company);
    
    // Score de santé global
    metrics.overallHealthScore = Math.min(
        metrics.overallHealthScore + metrics.growthPotential * 0.3 + metrics.stabilityScore * 0.4,
        100
    );

    return metrics;
}

function assessComprehensiveRiskProfile(company, metrics) {
    const risks = [];
    let riskScore = 0;
    let riskLevel = 'low';

    // Risque lié à la taille
    if (company.employees) {
        if (company.employees < 10) {
            risks.push('Très petite équipe - volatilité élevée');
            riskScore += 30;
        } else if (company.employees < 50) {
            risks.push('Petite équipe - dépendance aux individus clés');
            riskScore += 20;
        }
    }

    // Risque lié à la productivité
    if (metrics.employeeProductivity === 'low') {
        risks.push('Productivité par employé faible');
        riskScore += 25;
    }

    // Risque lié à l'âge de l'entreprise
    if (company.founding_year) {
        const age = new Date().getFullYear() - company.founding_year;
        if (age < 3) {
            risks.push('Entreprise très jeune - modèle non prouvé');
            riskScore += 35;
        } else if (age > 50) {
            risks.push('Entreprise mature - potentiel disruption');
            riskScore += 15;
        }
    }

    // Risque lié aux données
    if (company.confidence < 0.6) {
        risks.push('Données de confiance limitée');
        riskScore += 20;
    }

    // Risque sectoriel
    const sectorRisks = {
        'Technology': 15, // Volatilité moyenne
        'Finance': 25,    // Régulation forte
        'Healthcare': 20, // Cycles longs
        'Energy': 30,     // Volatilité élevée
        'Retail': 35      // Concurrence intense
    };
    
    if (company.sector && sectorRisks[company.sector]) {
        riskScore += sectorRisks[company.sector];
        risks.push(`Risque sectoriel ${company.sector}`);
    }

    // Classification du niveau de risque
    if (riskScore >= 70) {
        riskLevel = 'high';
    } else if (riskScore >= 40) {
        riskLevel = 'medium';
    } else {
        riskLevel = 'low';
    }

    return {
        level: riskLevel,
        score: Math.min(riskScore, 100),
        factors: risks,
        mitigation: generateRiskMitigation(risks),
        assessment: {
            operational: riskScore > 50 ? 'high' : 'medium',
            financial: metrics.employeeProductivity === 'low' ? 'medium' : 'low',
            market: company.sector ? 'medium' : 'high',
            data: company.confidence > 0.7 ? 'low' : 'medium'
        }
    };
}

function estimateDetailedValuation(company, metrics, referenceCompany) {
    const valuation = {
        method: 'multi_factor_analysis',
        confidence: company.confidence > 0.7 ? 'medium' : 'low',
        estimates: {},
        factors: [],
        adjustments: []
    };

    // Multiples sectoriels avancés
    const advancedSectorMultiples = {
        'Technology': { 
            revenue: { min: 3.0, avg: 5.5, max: 8.0 }, 
            employee: { min: 120000, avg: 180000, max: 250000 } 
        },
        'Finance': { 
            revenue: { min: 1.8, avg: 2.8, max: 4.0 }, 
            employee: { min: 100000, avg: 140000, max: 180000 } 
        },
        'Healthcare': { 
            revenue: { min: 2.2, avg: 3.5, max: 5.0 }, 
            employee: { min: 110000, avg: 150000, max: 200000 } 
        },
        'Consulting': { 
            revenue: { min: 1.5, avg: 2.5, max: 3.5 }, 
            employee: { min: 80000, avg: 120000, max: 160000 } 
        }
    };

    const multiples = advancedSectorMultiples[company.sector] || advancedSectorMultiples['Technology'];

    // Estimation basée sur le chiffre d'affaires
    if (company.revenue) {
        const revenueNum = parseInt(company.revenue.replace(/[€M]/g, ''));
        
        valuation.estimates.conservative = revenueNum * multiples.revenue.min;
        valuation.estimates.average = revenueNum * multiples.revenue.avg;
        valuation.estimates.optimistic = revenueNum * multiples.revenue.max;
        
        valuation.factors.push('Multiple de chiffre d\'affaires sectoriel');
    }

    // Estimation basée sur les employés
    if (company.employees) {
        const employeeValuation = company.employees * multiples.employee.avg;
        valuation.estimates.employeeBased = employeeValuation;
        valuation.factors.push('Valorisation par employé');
    }

    // Ajustements qualitatifs
    let adjustmentFactor = 1.0;

    // Ajustement productivité
    if (metrics.employeeProductivity === 'very_high') {
        adjustmentFactor *= 1.3;
        valuation.adjustments.push('Prime productivité exceptionnelle (+30%)');
    } else if (metrics.employeeProductivity === 'high') {
        adjustmentFactor *= 1.15;
        valuation.adjustments.push('Prime productivité élevée (+15%)');
    } else if (metrics.employeeProductivity === 'low') {
        adjustmentFactor *= 0.85;
        valuation.adjustments.push('Décote productivité faible (-15%)');
    }

    // Ajustement croissance
    if (metrics.growthPotential > 80) {
        adjustmentFactor *= 1.2;
        valuation.adjustments.push('Prime potentiel de croissance (+20%)');
    } else if (metrics.growthPotential < 40) {
        adjustmentFactor *= 0.9;
        valuation.adjustments.push('Décote croissance limitée (-10%)');
    }

    // Ajustement risque
    if (company.riskProfile && company.riskProfile.level === 'high') {
        adjustmentFactor *= 0.8;
        valuation.adjustments.push('Décote risque élevé (-20%)');
    } else if (company.riskProfile && company.riskProfile.level === 'low') {
        adjustmentFactor *= 1.1;
        valuation.adjustments.push('Prime risque faible (+10%)');
    }

    // Appliquer les ajustements
    Object.keys(valuation.estimates).forEach(key => {
        if (valuation.estimates[key]) {
            valuation.estimates[key] = Math.round(valuation.estimates[key] * adjustmentFactor);
        }
    });

    // Recommandation finale
    if (valuation.estimates.average) {
        valuation.recommendedValue = valuation.estimates.average;
        valuation.valueRange = {
            min: valuation.estimates.conservative,
            max: valuation.estimates.optimistic
        };
    }

    return valuation;
}

function assessMarketPosition(company, allCompanies) {
    const position = {
        relative: 'unknown',
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: []
    };

    // Analyse relative par rapport aux autres entreprises
    const sameSeclorCompanies = allCompanies.filter(c => 
        c.sector === company.sector && c.name !== company.name
    );

    if (sameSeclorCompanies.length > 0) {
        // Comparaison de la taille
        const avgEmployees = sameSeclorCompanies
            .filter(c => c.employees)
            .reduce((sum, c) => sum + c.employees, 0) / 
            sameSeclorCompanies.filter(c => c.employees).length;

        if (company.employees && avgEmployees) {
            if (company.employees > avgEmployees * 1.5) {
                position.strengths.push('Taille supérieure à la moyenne sectorielle');
            } else if (company.employees < avgEmployees * 0.5) {
                position.weaknesses.push('Taille inférieure à la moyenne sectorielle');
            }
        }

        // Position relative
        const companyScore = (company.employees || 0) + 
                           (company.revenue ? parseInt(company.revenue.replace(/[€M]/g, '')) * 100 : 0);
        const avgScore = sameSeclorCompanies.reduce((sum, c) => 
            sum + (c.employees || 0) + 
            (c.revenue ? parseInt(c.revenue.replace(/[€M]/g, '')) * 100 : 0), 0
        ) / sameSeclorCompanies.length;

        if (companyScore > avgScore * 1.3) {
            position.relative = 'leader';
            position.strengths.push('Position de leader sectoriel');
        } else if (companyScore > avgScore) {
            position.relative = 'strong_player';
            position.strengths.push('Acteur fort du secteur');
        } else if (companyScore > avgScore * 0.7) {
            position.relative = 'average_player';
        } else {
            position.relative = 'challenger';
            position.opportunities.push('Potentiel de croissance important');
        }
    }

    // Analyse SWOT basique
    if (company.founding_year) {
        const age = new Date().getFullYear() - company.founding_year;
        if (age > 20) {
            position.strengths.push('Expérience et maturité');
        } else if (age < 5) {
            position.opportunities.push('Agilité et innovation');
            position.threats.push('Manque d\'expérience');
        }
    }

    if (company.isPublic) {
        position.strengths.push('Accès aux marchés financiers');
        position.threats.push('Pression des actionnaires');
    }

    return position;
}

function calculateBenchmarkScores(company, referenceCompany) {
    const scores = {
        size: 50,
        productivity: 50,
        growth: 50,
        stability: 50,
        overall: 50
    };

    // Score de taille (comparé à la référence)
    if (company.employees && referenceCompany.employees) {
        const ratio = company.employees / referenceCompany.employees;
        scores.size = Math.min(Math.max(ratio * 50, 10), 100);
    }

    // Score de productivité
    const productivityScores = {
        'very_high': 95,
        'high': 80,
        'medium': 60,
        'low': 30,
        'unknown': 50
    };
    
    if (company.financialMetrics && company.financialMetrics.employeeProductivity) {
        scores.productivity = productivityScores[company.financialMetrics.employeeProductivity];
    }

    // Score de croissance
    if (company.financialMetrics && company.financialMetrics.growthPotential) {
        scores.growth = company.financialMetrics.growthPotential;
    }

    // Score de stabilité
    if (company.financialMetrics && company.financialMetrics.stabilityScore) {
        scores.stability = company.financialMetrics.stabilityScore;
    }

    // Score global pondéré
    scores.overall = Math.round(
        scores.size * 0.2 + 
        scores.productivity * 0.3 + 
        scores.growth * 0.25 + 
        scores.stability * 0.25
    );

    return scores;
}

function performComparativeAnalysis(companies) {
    const analysis = {
        summary: {},
        rankings: {},
        insights: [],
        trends: {}
    };

    // Résumé statistique
    const validEmployees = companies.filter(c => c.employees).map(c => c.employees);
    const validRevenues = companies.filter(c => c.revenue).map(c => 
        parseInt(c.revenue.replace(/[€M]/g, ''))
    );

    analysis.summary = {
        totalCompanies: companies.length,
        averageEmployees: validEmployees.length > 0 ? 
            Math.round(validEmployees.reduce((a, b) => a + b, 0) / validEmployees.length) : null,
        averageRevenue: validRevenues.length > 0 ? 
            Math.round(validRevenues.reduce((a, b) => a + b, 0) / validRevenues.length) : null,
        sectorsRepresented: [...new Set(companies.map(c => c.sector).filter(Boolean))].length,
        countriesRepresented: [...new Set(companies.map(c => c.country).filter(Boolean))].length
    };

    // Rankings
    analysis.rankings = {
        bySize: companies
            .filter(c => c.employees)
            .sort((a, b) => b.employees - a.employees)
            .map((c, i) => ({ rank: i + 1, name: c.name, value: c.employees })),
        
        byRevenue: companies
            .filter(c => c.revenue)
            .sort((a, b) => {
                const aRev = parseInt(a.revenue.replace(/[€M]/g, ''));
                const bRev = parseInt(b.revenue.replace(/[€M]/g, ''));
                return bRev - aRev;
            })
            .map((c, i) => ({ 
                rank: i + 1, 
                name: c.name, 
                value: c.revenue 
            })),
        
        byHealthScore: companies
            .filter(c => c.financialMetrics && c.financialMetrics.overallHealthScore)
            .sort((a, b) => b.financialMetrics.overallHealthScore - a.financialMetrics.overallHealthScore)
            .map((c, i) => ({ 
                rank: i + 1, 
                name: c.name, 
                value: Math.round(c.financialMetrics.overallHealthScore) 
            }))
    };

    // Insights automatiques
    const mainCompany = companies.find(c => c.isMainCompany);
    if (mainCompany) {
        // Position dans les rankings
        const sizeRank = analysis.rankings.bySize.find(r => r.name === mainCompany.name);
        const revenueRank = analysis.rankings.byRevenue.find(r => r.name === mainCompany.name);
        const healthRank = analysis.rankings.byHealthScore.find(r => r.name === mainCompany.name);

        if (sizeRank && sizeRank.rank === 1) {
            analysis.insights.push(`${mainCompany.name} est la plus grande entreprise analysée par nombre d'employés`);
        }
        
        if (revenueRank && revenueRank.rank === 1) {
            analysis.insights.push(`${mainCompany.name} génère le chiffre d'affaires le plus élevé`);
        }
        
        if (healthRank && healthRank.rank <= 2) {
            analysis.insights.push(`${mainCompany.name} présente un excellent score de santé financière`);
        }

        // Comparaisons sectorielles
        const sectorPeers = companies.filter(c => 
            c.sector === mainCompany.sector && c.name !== mainCompany.name
        );
        
        if (sectorPeers.length > 0) {
            analysis.insights.push(
                `${sectorPeers.length} concurrent(s) direct(s) identifié(s) dans le secteur ${mainCompany.sector}`
            );
        }
    }

    return analysis;
}

function generateSmartRecommendations(companies, comparativeAnalysis) {
    const recommendations = [];
    const mainCompany = companies.find(c => c.isMainCompany);

    if (!mainCompany) return recommendations;

    // Recommandations basées sur la position
    const healthRank = comparativeAnalysis.rankings.byHealthScore.find(r => r.name === mainCompany.name);
    if (healthRank && healthRank.rank > companies.length / 2) {
        recommendations.push({
            type: 'performance',
            priority: 'high',
            category: 'Amélioration opérationnelle',
            message: 'Score de santé inférieur à la moyenne - focalisez sur l\'efficacité opérationnelle',
            actions: [
                'Analyser la productivité par employé',
                'Optimiser les processus internes',
                'Benchmarker les meilleures pratiques sectorielles'
            ]
        });
    }

    // Recommandations sur la taille
    if (mainCompany.employees) {
        const avgEmployees = comparativeAnalysis.summary.averageEmployees;
        if (avgEmployees && mainCompany.employees < avgEmployees * 0.5) {
            recommendations.push({
                type: 'growth',
                priority: 'medium',
                category: 'Développement',
                message: 'Taille significativement inférieure aux concurrents - considérez la croissance',
                actions: [
                    'Développer les partenariats'
                ]
            });
        }
    }

    // Recommandations sur le risque
    if (mainCompany.riskProfile && mainCompany.riskProfile.level === 'high') {
        recommendations.push({
            type: 'risk',
            priority: 'high',
            category: 'Gestion des risques',
            message: 'Profil de risque élevé détecté - actions de mitigation recommandées',
            actions: mainCompany.riskProfile.mitigation || [
                'Diversifier les sources de revenus',
                'Renforcer les fonds propres',
                'Améliorer la gouvernance'
            ]
        });
    }

    // Recommandations sectorielles
    const sectorPeers = companies.filter(c => 
        c.sector === mainCompany.sector && c.name !== mainCompany.name
    );
    
    if (sectorPeers.length >= 2) {
        const avgProductivity = sectorPeers
            .filter(c => c.financialMetrics && c.financialMetrics.revenuePerEmployee)
            .reduce((sum, c) => sum + c.financialMetrics.revenuePerEmployee, 0) / 
            sectorPeers.filter(c => c.financialMetrics && c.financialMetrics.revenuePerEmployee).length;

        if (mainCompany.financialMetrics && mainCompany.financialMetrics.revenuePerEmployee && 
            avgProductivity && mainCompany.financialMetrics.revenuePerEmployee < avgProductivity * 0.8) {
            recommendations.push({
                type: 'efficiency',
                priority: 'medium',
                category: 'Productivité',
                message: 'Productivité par employé inférieure aux concurrents directs',
                actions: [
                    'Analyser les écarts de productivité',
                    'Investir dans l\'automation',
                    'Former les équipes aux meilleures pratiques'
                ]
            });
        }
    }

    // Recommandations d'opportunités
    if (mainCompany.marketPosition && mainCompany.marketPosition.opportunities) {
        mainCompany.marketPosition.opportunities.forEach(opportunity => {
            recommendations.push({
                type: 'opportunity',
                priority: 'low',
                category: 'Opportunités',
                message: opportunity,
                actions: ['Évaluer la faisabilité', 'Développer un plan d\'action']
            });
        });
    }

    return recommendations.slice(0, 8); // Limiter à 8 recommandations max
}

// Fonctions utilitaires supplémentaires
function determineGrowthStage(company) {
    if (company.founding_year) {
        const age = new Date().getFullYear() - company.founding_year;
        if (age < 3) return 'startup';
        if (age < 7) return 'growth';
        if (age < 15) return 'expansion';
        if (age < 25) return 'mature';
        return 'established';
    }
    return 'unknown';
}

function assessMarketPresence(company) {
    let score = 0;
    if (company.website) score += 20;
    if (company.isPublic) score += 30;
    if (company.employees && company.employees > 1000) score += 25;
    if (company.country && company.country !== 'France') score += 15; // International
    if (company.headquarters) score += 10;
    
    if (score >= 80) return 'strong';
    if (score >= 50) return 'moderate';
    return 'limited';
}

function calculateScalabilityIndex(company) {
    let index = 50; // Base
    
    if (company.sector === 'Technology') index += 20;
    if (company.isPublic) index += 15;
    if (company.founding_year) {
        const age = new Date().getFullYear() - company.founding_year;
        if (age < 10) index += 10;
    }
    
    return Math.min(index, 100);
}

function calculateStabilityScore(company) {
    let score = 50; // Base
    
    if (company.founding_year) {
        const age = new Date().getFullYear() - company.founding_year;
        if (age > 10) score += 20;
        if (age > 25) score += 10;
    }
    
    if (company.employees && company.employees > 500) score += 15;
    if (company.isPublic) score += 10;
    if (company.confidence > 0.8) score += 5;
    
    return Math.min(score, 100);
}

function generateRiskMitigation(risks) {
    const mitigations = [];
    
    risks.forEach(risk => {
        if (risk.includes('petite')) {
            mitigations.push('Développer les équipes progressivement');
        }
        if (risk.includes('productivité')) {
            mitigations.push('Optimiser les processus opérationnels');
        }
        if (risk.includes('jeune')) {
            mitigations.push('Renforcer la gouvernance et les processus');
        }
        if (risk.includes('données')) {
            mitigations.push('Améliorer la collecte et validation des données');
        }
    });
    
    return [...new Set(mitigations)]; // Déduplication
}

function calculateSectorDistribution(companies) {
    const distribution = {};
    companies.forEach(company => {
        const sector = company.sector || 'Unknown';
        distribution[sector] = (distribution[sector] || 0) + 1;
    });
    return distribution;
}

function calculateRiskDistribution(companies) {
    const distribution = { low: 0, medium: 0, high: 0 };
    
    companies.forEach(company => {
        if (company.riskProfile && company.riskProfile.level) {
            distribution[company.riskProfile.level]++;
        }
    });
    
    const total = companies.length;
    return {
        low: Math.round((distribution.low / total) * 100),
        medium: Math.round((distribution.medium / total) * 100),
        high: Math.round((distribution.high / total) * 100)
    };
}

function deduplicateByName(companies) {
    const seen = new Set();
    return companies.filter(company => {
        const key = company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function isValidExtractedCompany(name, excludeName) {
    if (!name || name.length < 3 || name.length > 50) return false;
    if (name.toLowerCase() === excludeName.toLowerCase()) return false;
    
    const invalid = ['page', 'article', 'news', 'site', 'www', 'http', 'com'];
    return !invalid.some(term => name.toLowerCase().includes(term));
}

function containsSuspiciousContent(text) {
    const suspicious = ['test', 'demo', 'fake', 'sample', 'null', 'undefined'];
    return suspicious.some(term => text.toLowerCase().includes(term));
}

// Réutiliser les fonctions d'extraction existantes
function extractSector(content) {
    const patterns = {
        'Technology': ['technology', 'tech', 'it services', 'software', 'digital'],
        'Finance': ['finance', 'financial', 'bank', 'investment'],
        'Healthcare': ['healthcare', 'health', 'medical', 'pharmaceutical'],
        'Manufacturing': ['manufacturing', 'production', 'industrial'],
        'Retail': ['retail', 'commerce', 'consumer'],
        'Energy': ['energy', 'oil', 'gas', 'renewable'],
        'Consulting': ['consulting', 'advisory', 'professional services']
    };

    for (const [sector, keywords] of Object.entries(patterns)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            return sector;
        }
    }
    return 'Technology';
}

function extractIndustry(content) {
    // Implémentation basique
    return null;
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

function extractEmployeeCount(content) {
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
    const patterns = [
        /revenue.*?€(\d{1,3}(?:,\d{3})*)\s*(?:million|billion)/gi,
        /€(\d{1,3}(?:,\d{3})*)\s*(?:million|billion)/gi,
        /chiffre.*?affaires.*?(\d{1,3}(?:[,\.]\d{1,3})*)\s*(?:milliards?)/gi
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            let amount = parseInt(match[1].replace(/[,\.]/g, ''));
            if (match[0].includes('billion') || match[0].includes('milliard')) {
                amount *= 1000;
            }
            if (amount >= 1 && amount <= 1000000) {
                return `€${amount}M`;
            }
        }
    }
    return null;
}

function extractFoundingYear(content) {
    const patterns = [
        /(?:founded|created|established|créée?|fondée?).*?(?:in|en)\s*(\d{4})/gi,
        /(?:depuis|since)\s*(\d{4})/gi,
        /\((\d{4})\)/g
    ];

    const currentYear = new Date().getFullYear();
    
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            const year = parseInt(match[1]);
            if (year >= 1800 && year <= currentYear) {
                return year;
            }
        }
    }
    return null;
}

function extractHeadquarters(content) {
    const patterns = [
        /(?:headquartered|siège.*?social).*?(?:in|à|en)\s*([A-Z][a-z]+)/gi,
        /based.*?in\s*([A-Z][a-z]+)/gi
    ];

    const knownCities = [
        'Paris', 'London', 'New York', 'Tokyo', 'Berlin', 'Madrid', 
        'Rome', 'Amsterdam', 'Brussels', 'Geneva', 'Milan'
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && knownCities.includes(match[1])) {
            return match[1];
        }
    }
    return null;
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
        
        return bestResult.content.substring(0, 250) + '...';
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

function extractMarketShare(content) {
    const patterns = [
        /market\s+share.*?(\d{1,2})%/gi,
        /part\s+de\s+marché.*?(\d{1,2})%/gi
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            const share = parseInt(match[1]);
            if (share >= 1 && share <= 100) {
                return `${share}%`;
            }
        }
    }
    return null;
}

function extractGrowthRate(content) {
    const patterns = [
        /growth.*?(\d{1,3})%/gi,
        /croissance.*?(\d{1,3})%/gi
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
            const rate = parseInt(match[1]);
            if (rate >= 0 && rate <= 500) {
                return `${rate}%`;
            }
        }
    }
    return null;
}

function extractProfitability(content) {
    if (content.includes('profitable') || content.includes('profit')) {
        return 'profitable';
    }
    if (content.includes('loss') || content.includes('perte')) {
        return 'loss_making';
    }
    return 'unknown';
}

function extractSectorFromContext(content) {
    return extractSector(content.toLowerCase());
}

function extractCountryFromContext(content) {
    return extractCountry(content.toLowerCase());
}

module.exports = { analyzeMetrics };