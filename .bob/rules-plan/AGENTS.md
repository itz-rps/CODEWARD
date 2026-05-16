# AGENTS.md - Plan Mode

This file provides planning and architectural guidance for Plan mode.

## Plan Mode Purpose

- High-level planning and architecture decisions
- Breaking down complex tasks into steps
- Analyzing requirements and constraints
- No direct code modifications

## Project Architecture

### System Design

**Single-Page Application with Backend API**
- Frontend: Pure HTML/CSS/JS (no frameworks)
- Backend: Node.js Express server
- External APIs: GitHub REST API v3, IBM watsonx.ai

### Data Flow

```
User Input (GitHub URL)
    ↓
Frontend (index.html)
    ↓ POST /api/analyze
Backend (server.js)
    ↓
GitHub API (fetch repo data)
    ↓
watsonx.ai (generate summary)
    ↓
Risk Calculation (server-side)
    ↓
JSON Response
    ↓
Frontend Rendering (5-section report)
```

## Architectural Constraints

**Frontend Constraints**
- Must work without build process
- All code in single HTML file
- No external dependencies or CDN
- Pure vanilla JavaScript only

**Backend Constraints**
- Minimal dependencies (express, axios, dotenv, cors)
- Server-side API calls only (no client-side GitHub calls)
- Environment variables for credentials
- Fallback mechanisms for AI failures

**API Constraints**
- GitHub API: 60 requests/hour without auth
- watsonx.ai: Requires API key and project ID
- CORS: Handled by Express middleware

## Key Design Decisions

**Why Single HTML File?**
- Simplicity: no build process
- Portability: works by opening file directly
- Minimal dependencies: easier to maintain

**Why Backend for Static App?**
- Avoid CORS issues with GitHub API
- Secure credential storage (watsonx.ai)
- Server-side processing for risk calculation

**Why No Framework?**
- Reduces complexity and dependencies
- Faster load times
- Easier to understand and modify

## Scalability Considerations

**Current Limitations**
- GitHub API rate limit (60/hour)
- Single server instance
- No caching mechanism
- Synchronous request processing

**Future Enhancements**
- Add GitHub authentication for higher rate limits
- Implement Redis caching for repeated repos
- Add request queuing for concurrent analysis
- Store analysis history in database

## Security Architecture

**Credential Management**
- .env file for sensitive data (gitignored)
- Never expose credentials to frontend
- Server-side API calls only

**Input Validation**
- URL format validation
- GitHub URL pattern matching
- Error handling for malicious inputs

**API Security**
- CORS configured for local development
- Rate limiting on GitHub API
- Error messages don't expose internals

## Testing Strategy

**Manual Testing Required**
- Valid public repositories
- Invalid URL formats
- Private/non-existent repos
- Rate limit scenarios
- Network failures
- Missing credentials (fallback)

**No Automated Tests Yet**
- Consider adding: Jest for backend, Playwright for frontend
- Test coverage for risk calculation algorithm
- Integration tests for API endpoints

## Deployment Planning

**Development**
- Local: npm start on port 3000
- Hot reload: npm run dev with nodemon

**Production**
- Set NODE_ENV=production
- Configure .env on server
- Serve static files from Express
- Consider reverse proxy (nginx)
- HTTPS for production deployment