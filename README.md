# Codeward

AI-powered code trust and verification tool for both technical and non-technical builders who use AI-generated code and need to verify it before shipping.

## What It Does

Codeward analyzes any GitHub repository and returns:
- **Plain English explanation** of what the code does
- **Risk score** (0-100, lower is safer)
- **Specific red flags** detected
- **Dangerous patterns** identified
- **"Safe to ship" verdict** with actionable advice

Powered by **IBM Bob**.

## Tech Stack

- **Frontend**: Pure HTML, CSS, JavaScript (no frameworks)
- **Backend**: Node.js with Express
- **AI**: IBM Bob (development partner)
- **APIs**: GitHub REST API v3

## Project Structure

```
codeward/
├── index.html          # Frontend UI
├── server.js           # Express backend
├── package.json        # Node dependencies
├── .env               # Environment variables (not in git)
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
```

### 3. Start the Server

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### 4. Open the Application

Navigate to `http://localhost:3000` in your browser.

## API Endpoints

### POST `/api/analyze`

Analyzes a GitHub repository.

**Request:**
```json
{
  "repoUrl": "https://github.com/username/repository"
}
```

**Response:**
```json
{
  "overview": {
    "name": "repository",
    "fullName": "username/repository",
    "description": "Repository description",
    "language": "JavaScript",
    "stars": 1234,
    "forks": 567,
    "lastUpdated": "2026-05-16T05:00:00Z",
    "fileCount": 42,
    "hasLicense": true,
    "defaultBranch": "main"
  },
  "summary": "AI-generated plain English summary...",
  "riskScore": 35,
  "redFlags": [
    {
      "severity": "warning",
      "message": "No test files detected"
    }
  ],
  "verdict": "NEEDS REVIEW",
  "verdictAdvice": "Review the red flags before deploying..."
}
```

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-16T05:00:00.000Z"
}
```

## How It Works

1. **User Input**: User pastes a GitHub repository URL
2. **Backend Processing**:
   - Fetches repository data from GitHub API
   - Analyzes file structure and metadata
   - Generates plain English summary
   - Calculates risk score based on multiple factors
3. **Risk Analysis**: Checks for:
   - Documentation (README, LICENSE)
   - Test coverage
   - Update frequency
   - Dependency management
   - Security issues (exposed .env files)
4. **Report Generation**: Returns comprehensive analysis with verdict

## Risk Score Calculation

The risk score (0-100) is calculated based on:

- ✅ **Reduces Risk** (-points):
  - Has README (-10)
  - Has LICENSE (-5)
  - Has tests (-15)
  - Recently updated (-10)
  - Has dependencies file (-10)
  - Multiple files (-10)

- ⚠️ **Increases Risk** (+points):
  - No README (+10)
  - No LICENSE (+5)
  - No tests (+15)
  - Not updated in 6+ months (+20)
  - No description (+10)
  - Single file repo (+15)
  - No dependencies (+10)
  - Exposed .env file (+30)

**Verdict Thresholds:**
- 0-30: **SAFE TO SHIP** (Green)
- 31-60: **NEEDS REVIEW** (Yellow)
- 61-100: **NOT READY** (Red)

## Development

### Running Tests

```bash
# Add test command when tests are implemented
npm test
```

### Code Style

- Use ES6+ features
- Async/await for asynchronous operations
- Clear error handling with try/catch
- Console logging for debugging
- Comments for complex logic

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |

## Deployment

### Local Development
```bash
npm start
```

### Production
```bash
NODE_ENV=production npm start
```

## Security Notes

- Never commit `.env` file to version control
- Keep API keys secure
- The `.gitignore` file is configured to exclude sensitive files
- GitHub API calls are made server-side to avoid CORS issues
- No credentials are exposed to the frontend

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Built With

- [Express](https://expressjs.com/) - Web framework
- [Axios](https://axios-http.com/) - HTTP client
- [GitHub API](https://docs.github.com/en/rest) - Repository data

## Acknowledgments

Built at **IBM Bob Hackathon 2026**

Powered by **IBM Bob**