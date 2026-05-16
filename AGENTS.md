# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Codeward is an AI-powered code trust verification tool. Single-page app with Node.js backend that analyzes GitHub repos and returns risk assessments.

## Build & Run Commands

```bash
# Install dependencies
npm install

# Start server (production)
npm start

# Start with auto-reload (development)
npm run dev

# Server runs on http://localhost:3000
```

## Architecture

- **Frontend**: Single `index.html` file with embedded CSS/JS (no build step)
- **Backend**: `server.js` Express server handles GitHub API calls and watsonx.ai integration
- **API Flow**: Frontend → `/api/analyze` → GitHub API + watsonx.ai → Response

## Critical Patterns

### API Integration
- GitHub API calls MUST be server-side (avoids CORS, no auth needed for public repos)
- watsonx.ai credentials stored in `.env`, NEVER exposed to frontend
- Fallback summary generator activates if watsonx credentials missing

### Risk Score Calculation
- Algorithm in `calculateRiskScore()` function (server.js)
- Score range: 0-100 (lower = safer)
- Thresholds: 0-30 safe, 31-60 review, 61-100 danger
- Each check adds/subtracts specific points (documented in function)

### Frontend-Backend Communication
- Frontend fetches `http://localhost:3000/api/analyze` with POST
- Must send `{ repoUrl: "https://github.com/..." }`
- Backend returns full analysis object (see README for schema)

## Code Style

### Backend (server.js)
- Use async/await for all async operations
- Console.log major steps for debugging
- Return clean JSON errors with appropriate status codes
- All GitHub API calls through `fetchGitHubAPI()` helper

### Frontend (index.html)
- Pure vanilla JS, no frameworks
- All code embedded in single HTML file
- Use `fetch()` API for backend calls
- Error handling with user-friendly messages
- Animations use CSS keyframes

## Environment Variables

Required in `.env`:
- `WATSONX_API_KEY` - IBM watsonx.ai API key
- `WATSONX_PROJECT_ID` - IBM watsonx.ai project ID
- `PORT` - Server port (optional, defaults to 3000)

**CRITICAL**: `.env` is gitignored. Never commit credentials.

## Testing

No test suite currently implemented. Manual testing workflow:
1. Start server: `npm start`
2. Open `http://localhost:3000`
3. Test with public repos (e.g., `https://github.com/torvalds/linux`)
4. Verify all 5 report sections render correctly
5. Test error cases (invalid URL, private repo, network failure)

## Common Gotchas

- Frontend hardcodes `http://localhost:3000` - update for production deployment
- GitHub API rate limit: 60 requests/hour without auth (handled with 429 error)
- watsonx.ai model: `ibm/granite-13b-chat-v2` - don't change without testing
- Risk score calculation is additive - changes affect all verdicts
- SVG ring animation requires specific circumference calculation (2 * π * 90)

## File Structure

```
codeward/
├── index.html       # Complete frontend (HTML + CSS + JS)
├── server.js        # Express backend with all logic
├── package.json     # Dependencies: express, axios, dotenv, cors
├── .env            # Credentials (gitignored)
├── .gitignore      # Excludes .env, node_modules, logs
└── README.md       # User documentation
```

## Deployment Notes

- No build process required
- Serve `index.html` as static file from Express
- Set `NODE_ENV=production` for production
- Ensure `.env` configured on server
- CORS enabled for local development (may need adjustment for production)