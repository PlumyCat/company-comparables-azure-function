# Company Comparables Azure Function

Cette Azure Function fournit des services d'analyse financière et de recherche de sociétés comparables via des endpoints HTTP RESTful.

## 🚀 Vue d'ensemble

Cette fonction serverless offre les mêmes capacités que le serveur MCP original, mais adaptée pour Azure Functions :

- **Recherche de sociétés comparables** - Trouve des entreprises similaires par secteur et critères
- **Analyse financière** - Récupère et traite les données financières d'entreprises
- **Recherche web de fallback** - Complète les données manquantes via recherche web
- **Validation des données** - Détecte et valide la qualité des données

## 📁 Structure du projet

```
company-comparables-azure-function/
├── host.json                    # Configuration Azure Functions
├── local.settings.json          # Variables d'environnement locales  
├── package.json                 # Dépendances npm
├── README.md                    # Cette documentation
├── src/
│   ├── index.js                 # Handler principal Azure Function
│   ├── data/
│   │   └── sectorMapping.js     # Mapping des secteurs d'activité
│   ├── services/
│   │   ├── financialApiService.js    # Intégration APIs financières
│   │   ├── webSearchService.js       # Service de recherche web
│   │   └── companyProfileService.js  # Profils d'entreprises
│   └── utils/
│       └── dataValidation.js    # Validation et détection de données
└── docs/
    └── [documentation]
```

## 🛠️ Installation et configuration

### Prérequis

- Node.js >= 18.0.0
- Azure Functions Core Tools v4
- Compte Azure avec Function App

### Installation locale

1. **Cloner et installer les dépendances** :
```bash
cd F:\b-and-capital\company-comparables-azure-function
npm install
```

2. **Configurer les variables d'environnement** :
Éditer `local.settings.json` avec vos clés API :
```json
{
  "Values": {
    "ALPHA_VANTAGE_KEY": "votre_clé_ici",
    "FINNHUB_KEY": "votre_clé_ici", 
    "FMP_KEY": "votre_clé_ici",
    "BRAVE_SEARCH_API_KEY": "votre_clé_ici"
  }
}
```

3. **Démarrer en mode développement** :
```bash
npm run dev
# ou
func start --javascript
```

## 🌐 Endpoints disponibles

### GET /api/health
Vérification de l'état du service

**Réponse** :
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-XX",
    "version": "1.0.0",
    "services": {
      "financialApi": "ready",
      "webSearch": "ready", 
      "companyProfile": "ready"
    }
  }
}
```

### GET|POST /api/companies/search
Recherche de sociétés comparables

**Paramètres** :
- `companyName` (requis) - Nom de l'entreprise de référence
- `sector` (optionnel) - Secteur d'activité
- `country` (optionnel, défaut: "US") - Pays
- `maxResults` (optionnel, défaut: 10) - Nombre max de résultats

**Exemple GET** :
```
GET /api/companies/search?companyName=Microsoft&sector=Technology&maxResults=5
```

**Exemple POST** :
```json
{
  "companyName": "Microsoft",
  "sector": "Technology",
  "country": "US",
  "maxResults": 5
}
```

### GET|POST /api/companies/{symbol}/analyze
Analyse financière détaillée d'une société

**Paramètres URL** :
- `symbol` - Symbole boursier (ex: MSFT)

**Réponse exemple** :
```json
{
  "success": true,
  "data": {
    "symbol": "MSFT",
    "companyName": "Microsoft Corporation",
    "financialMetrics": { ... },
    "marketData": { ... },
    "profile": { ... }
  }
}
```

### POST /api/search/web
Recherche web pour données manquantes

**Paramètres** :
```json
{
  "query": "terme de recherche",
  "maxResults": 5,
  "focusFinancial": true
}
```

## 🚀 Déploiement Azure

### Déploiement via Azure CLI

1. **Se connecter à Azure** :
```bash
az login
```

2. **Créer un groupe de ressources** :
```bash
az group create --name rg-company-comparables --location "West Europe"
```

3. **Créer la Function App** :
```bash
az functionapp create \
  --resource-group rg-company-comparables \
  --consumption-plan-location "West Europe" \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name company-comparables-func \
  --storage-account votrecompte
```

4. **Déployer le code** :
```bash 
func azure functionapp publish company-comparables-func
```

### Configuration des variables d'environnement Azure

```bash
az functionapp config appsettings set --name company-comparables-func \
  --resource-group rg-company-comparables \
  --settings \
    ALPHA_VANTAGE_KEY="votre_clé" \
    FINNHUB_KEY="votre_clé" \
    FMP_KEY="votre_clé" \
    BRAVE_SEARCH_API_KEY="votre_clé"
```

## 🔧 Scripts disponibles

- `npm start` - Démarrer la function localement
- `npm run dev` - Mode développement avec auto-reload
- `npm test` - Exécuter les tests
- `npm run deploy` - Déployer vers Azure

## 📊 Monitoring et logging

Les logs sont automatiquement envoyés vers Azure Application Insights. Vous pouvez les consulter via :

- Azure Portal > Function App > Monitoring
- Application Insights queries
- Live Metrics Stream

## 🔄 Différences avec le projet MCP

| Aspect | Projet MCP | Azure Function |
|--------|------------|----------------|
| **Transport** | Protocole MCP (stdio) | HTTP REST API |
| **Interface** | Claude/Cursor | Appels HTTP directs |
| **Déploiement** | Serveur local/distant | Serverless Azure |
| **Scalabilité** | Manuelle | Automatique |
| **Coût** | Serveur permanent | Pay-per-use |

## 📚 Services réutilisés

Les services métier suivants ont été migrés depuis le projet MCP :

- **FinancialAPIService** - APIs Alpha Vantage, Finnhub, FMP
- **WebSearchService** - Recherche Brave Search  
- **CompanyProfileService** - Enrichissement profils
- **DataValidation** - Validation et détection qualité

## 🛡️ Sécurité

- Authentification via Azure Active Directory (optionnel)
- Rate limiting automatique Azure
- Variables d'environnement sécurisées
- CORS configuré pour domaines autorisés

## 🚦 Statut du projet

- ✅ Configuration Azure Functions
- ✅ Migration des services métier
- ✅ Endpoints de base (health, search)
- 🔄 Tests et validation
- 🔄 Documentation complète
- ⏳ Déploiement production

## 💡 Utilisation recommandée

Cette Azure Function est idéale pour :

- **Applications web** nécessitant des données financières
- **Intégrations API** dans des systèmes existants  
- **Microservices** d'analyse financière
- **Dashboards** de sociétés comparables
- **Outils d'aide à la décision** d'investissement

---

## 🔗 Liens utiles

- [Documentation Azure Functions](https://docs.microsoft.com/azure/azure-functions/)
- [Projet MCP original](../Recherche%20de%20sociétés%20comparables/) 
- [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools)