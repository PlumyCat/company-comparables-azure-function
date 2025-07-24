# Company Comparables Azure Function

This repository contains a set of Node.js Azure Functions that expose HTTP endpoints for searching and analysing company information. The code relies on a self‑hosted [SearXNG](https://searxng.org/) instance for web scraping and uses simple heuristics to enrich profiles with sector, geography and financial data.

## Overview

The main entry point is [`src/index.js`](src/index.js) which registers the different functions. Each endpoint accepts JSON requests and returns JSON responses.

### Available Functions

| Function            | Method | Description                                       |
|---------------------|--------|---------------------------------------------------|
| `searchCompany`     | POST   | Search the web for basic company information.     |
| `getCompanyDetails` | POST   | Build a detailed profile from search results.     |
| `findComparables`   | POST   | Look for companies similar to a reference one.    |
| `analyzeMetrics`    | POST   | Compute advanced metrics and benchmarking.        |
| `testConnection`    | GET/POST | Check that the SearXNG instance is reachable.  |

See the `src/functions` directory for the implementation of each handler.

## Project Layout

```
company-comparables-azure-function/
├── host.json               # Azure Functions host configuration
├── package.json            # Node.js dependencies and scripts
├── .env.example            # Example environment variables
├── src/
│   ├── index.js            # Azure Functions setup
│   ├── functions/          # Individual HTTP handlers
│   ├── services/           # Reusable services (web search, analysis)
│   └── utils/              # Helper utilities
```

## Requirements

- Node.js 18 or higher
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4
- Access to a SearXNG instance secured with Azure AD

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` or create `local.settings.json` and provide the required variables:
   - `SEARXNG_URL` – URL of your SearXNG instance
   - `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`, `TOKEN_URL` – Azure AD credentials
3. Start the functions host:
   ```bash
   npm run dev
   ```

## HTTP Endpoints

Requests must be sent with the `Content-Type: application/json` header. Example payloads are shown below.

### `POST /api/searchCompany`
```json
{
  "query": "Microsoft"
}
```

### `POST /api/getCompanyDetails`
```json
{
  "name": "Microsoft" 
}
```

### `POST /api/findComparables`
```json
{
  "companyName": "Microsoft",
  "maxResults": 5
}
```

### `POST /api/analyzeMetrics`
```json
{
  "companyName": "Microsoft",
  "includeComparables": true
}
```

### `GET /api/testConnection`
Returns a JSON object describing the connectivity status.

## Deployment

Deploy the function app using the Azure CLI:
```bash
az login
az group create --name rg-comparables --location "West Europe"
az functionapp create \
  --resource-group rg-comparables \
  --consumption-plan-location "West Europe" \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name company-comparables-func \
  --storage-account <storage>
func azure functionapp publish company-comparables-func
```
Remember to configure the same environment variables in the Azure portal.

## License

This project is licensed under the MIT License.
