# AGENTS.md - Code Mode

This file provides coding-specific guidance for agents working in Code mode.

## Code Mode Constraints

- No access to MCP tools or browser
- Focus on direct code modifications and file operations
- Use standard development tools only

## Critical Coding Patterns

### Backend (server.js)

**GitHub API Integration**
- MUST use `fetchGitHubAPI()` helper function for all GitHub calls
- Include `User-Agent` header (required by GitHub API)
- Handle 404 (not found), 403 (rate limit), and network errors explicitly

**watsonx.ai Integration**
- Check credentials exist before calling API
- ALWAYS have fallback to `generateFallbackSummary()` if API fails
- Model ID is hardcoded: `ibm/granite-13b-chat-v2`
- Endpoint: `https://us-south.ml.cloud.ibm.com/ml/v1/text/generation`

**Risk Score Algorithm**
- Located in `calculateRiskScore()` function
- Returns object: `{ score: number, flags: array }`
- Score bounds: Math.max(0, Math.min(100, score))
- Each flag has: `{ severity: string, message: string }`
- Severity levels: 'critical', 'warning', 'info', 'success'

### Frontend (index.html)

**API Communication**
- Hardcoded endpoint: `http://localhost:3000/api/analyze`
- POST request with JSON body: `{ repoUrl: string }`
- Must handle network errors, 404, 429 (rate limit), 500 errors
- Display user-friendly error messages

**Animation Timing**
- Loading steps: 800ms intervals
- Card fade-in: 150ms delay between cards
- Risk score animation: 20ms intervals, 50 increments
- SVG ring: 1s transition with ease timing

**SVG Ring Calculation**
- Circumference = 2 * Math.PI * 90 (radius is 90)
- Offset = circumference - (score / 100) * circumference
- Must set strokeDasharray before animating strokeDashoffset

## Error Handling

**Backend Errors**
```javascript
// Always return JSON with error field
res.status(code).json({ error: 'message', details: 'optional' });
```

**Frontend Errors**
```javascript
// Show inline error with shake animation
showError('User-friendly message');
```

## Environment Variables

**Never hardcode credentials**
- Use `process.env.WATSONX_API_KEY`
- Use `process.env.WATSONX_PROJECT_ID`
- Check existence before API calls
- Log warnings if missing (not errors)

## Testing Approach

**Manual Testing Required**
1. Valid public repo
2. Invalid URL format
3. Private/non-existent repo (404)
4. Rate limit scenario (403)
5. Network failure
6. Missing watsonx credentials (fallback)

## Common Mistakes to Avoid

- Don't expose .env values to frontend
- Don't skip CORS headers in Express
- Don't forget User-Agent in GitHub API calls
- Don't modify risk score thresholds without updating verdict logic
- Don't change watsonx model without testing
- Don't add external dependencies without updating package.json