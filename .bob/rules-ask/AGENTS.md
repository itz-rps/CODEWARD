# AGENTS.md - Ask Mode

This file provides documentation and context guidance for Ask mode.

## Ask Mode Purpose

- Answer questions about the codebase
- Provide documentation and explanations
- Help understand architecture and patterns
- No code modifications

## Project Context

**Codeward** is a single-page application that analyzes GitHub repositories for code trust and security.

### Architecture Overview

**Frontend (index.html)**
- Pure HTML/CSS/JS, no frameworks or build process
- Embedded styles and scripts in single file
- Communicates with backend via fetch API
- Displays 5-section analysis report with animations

**Backend (server.js)**
- Express server on port 3000
- Proxies GitHub API calls (avoids CORS)
- Integrates with IBM watsonx.ai for AI summaries
- Calculates risk scores based on repository characteristics

### Key Components

**Risk Score Calculation**
- Located in `calculateRiskScore()` function
- Analyzes: README, LICENSE, tests, update frequency, dependencies
- Returns score (0-100) and array of flags
- Lower score = safer code

**AI Summary Generation**
- Uses IBM watsonx.ai Granite model
- Fallback to rule-based summary if credentials missing
- Generates 3-sentence plain English explanation

**GitHub API Integration**
- Fetches repo metadata, contents, and languages
- Server-side calls avoid CORS issues
- Handles rate limiting (60 req/hour without auth)

## File Structure

```
codeward/
├── index.html       # Complete frontend
├── server.js        # Express backend
├── package.json     # Node dependencies
├── .env            # Credentials (gitignored)
└── README.md       # User documentation
```

## Common Questions

**Q: Why is everything in one HTML file?**
A: Simplicity - no build process, works by opening file directly in browser.

**Q: Why use a backend if it's a single-page app?**
A: To avoid CORS issues with GitHub API and to keep watsonx.ai credentials secure.

**Q: How is the risk score calculated?**
A: Additive algorithm checking for best practices (README, tests, etc.). See `calculateRiskScore()` in server.js.

**Q: What happens if watsonx.ai is unavailable?**
A: Automatic fallback to rule-based summary using repo metadata.

## Environment Variables

- `WATSONX_API_KEY` - IBM watsonx.ai API key (optional, uses fallback if missing)
- `WATSONX_PROJECT_ID` - IBM watsonx.ai project ID (optional)
- `PORT` - Server port (default: 3000)

## Deployment

- No build step required
- Serve index.html as static file from Express
- Configure .env on server
- CORS enabled for local development