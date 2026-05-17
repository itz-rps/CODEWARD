/**
 * Codeward Backend Server
 * Express server that handles GitHub API calls and watsonx.ai integration
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Groq AI Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant'; // Current supported Groq model

/**
 * Call Groq AI API
 */
async function callGroq(systemPrompt, userMessage) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }
  
  try {
    const response = await axios.post(GROQ_URL, {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Groq API error:', error.response?.data || error.message);
    throw error;
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from root directory

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main analysis endpoint
app.post('/api/analyze', async (req, res) => {
  console.log('=== Analysis Request Received ===');
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  
  try {
    const { repoUrl } = req.body;
    
    // Validate GitHub URL
    if (!repoUrl || !repoUrl.startsWith('https://github.com/')) {
      console.error('Invalid URL format:', repoUrl);
      return res.status(400).json({
        error: 'Invalid GitHub URL format'
      });
    }
    
    // Extract owner and repo from URL
    const urlParts = repoUrl.replace('https://github.com/', '').split('/');
    const owner = urlParts[0];
    const repo = urlParts[1];
    
    if (!owner || !repo) {
      return res.status(400).json({ 
        error: 'Could not parse repository owner and name' 
      });
    }
    
    console.log(`Fetching data for ${owner}/${repo}`);
    
    // Fetch repository data from GitHub API
    const [repoData, contentsData, languagesData] = await Promise.all([
      fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}`),
      fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents`),
      fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/languages`)
    ]);
    
    console.log('GitHub data fetched successfully');
    
    // Build overview
    const overview = {
      name: repoData.name,
      fullName: repoData.full_name,
      description: repoData.description || 'No description provided',
      language: repoData.language || 'Unknown',
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      lastUpdated: repoData.updated_at,
      fileCount: Array.isArray(contentsData) ? contentsData.length : 0,
      hasLicense: !!repoData.license,
      defaultBranch: repoData.default_branch
    };
    
    // Get file list for analysis
    const fileList = Array.isArray(contentsData) 
      ? contentsData.map(item => item.name).join(', ')
      : 'Unable to fetch file list';
    
    // Generate plain English summary using watsonx.ai
    console.log('Generating AI summary...');
    const summary = await generateAISummary(overview, languagesData, fileList);
    
    // Run online vulnerability checks
    console.log('Running online vulnerability checks...');
    const vulnerabilities = await checkVulnerabilities(owner, repo, contentsData, languagesData);
    
    // Calculate risk score
    const riskAnalysis = calculateRiskScore(overview, contentsData, repoData, vulnerabilities);
    
    // Determine verdict
    const verdict = determineVerdict(riskAnalysis.score);
    
    // Generate fix recommendations for each flag
    const fixRecommendations = riskAnalysis.flags.map(flag => getFixRecommendation(flag));
    
    // Get score explanation
    const scoreExplanation = getScoreExplanation(riskAnalysis.score);
    
    // Generate teach mode content
    const teachMode = generateTeachMode(overview, contentsData, languagesData, repoData);
    
    // Build response
    const analysis = {
      overview,
      summary,
      riskScore: riskAnalysis.score,
      scoreExplanation,
      redFlags: riskAnalysis.flags,
      fixRecommendations,
      vulnerabilities,
      teachMode,
      verdict: verdict.label,
      verdictAdvice: verdict.advice
    };
    
    console.log('Analysis complete:', { 
      repo: overview.fullName, 
      riskScore: riskAnalysis.score,
      verdict: verdict.label 
    });
    
    res.json(analysis);
    
  } catch (error) {
    console.error('=== Analysis Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error response:', error.response?.status, error.response?.statusText);
    
    if (error.response?.status === 404) {
      console.log('Returning 404: Repository not found');
      return res.status(404).json({
        error: 'Repository not found or is private'
      });
    }
    
    if (error.response?.status === 403) {
      console.log('Returning 429: Rate limit reached');
      return res.status(429).json({
        error: 'GitHub API rate limit reached. Please try again later.'
      });
    }
    
    console.log('Returning 500: Internal server error');
    res.status(500).json({
      error: 'Failed to analyze repository',
      details: error.message
    });
  }
});

/**
 * Fetch data from GitHub API

/**
 * Check for online vulnerabilities
 */
async function checkVulnerabilities(owner, repo, contents, languages) {
  const vulnerabilities = {
    npm: [],
    pypi: [],
    advisories: [],
    sensitiveFiles: []
  };

  try {
    // Check for sensitive files in repo tree
    console.log('Checking for sensitive files...');
    const treeData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
    vulnerabilities.sensitiveFiles = checkSensitiveFiles(treeData.tree || []);

    // Check NPM vulnerabilities if package.json exists
    const hasPackageJson = Array.isArray(contents) && contents.some(item => item.name === 'package.json');
    if (hasPackageJson) {
      console.log('Checking NPM vulnerabilities...');
      vulnerabilities.npm = await checkNPMVulnerabilities(owner, repo);
    }

    // Check PyPI vulnerabilities if requirements.txt exists
    const hasRequirements = Array.isArray(contents) && contents.some(item => item.name === 'requirements.txt');
    if (hasRequirements) {
      console.log('Checking PyPI vulnerabilities...');
      vulnerabilities.pypi = await checkPyPIVulnerabilities(owner, repo);
    }

    // Check GitHub advisories for detected languages
    console.log('Checking GitHub advisories...');
    vulnerabilities.advisories = await checkGitHubAdvisories(languages);

  } catch (error) {
    console.error('Vulnerability check error:', error.message);
    // Don't fail the entire analysis if vulnerability checks fail
  }

  return vulnerabilities;
}

/**
 * Check for sensitive files in repository
 */
function checkSensitiveFiles(tree) {
  const found = [];
  
  tree.forEach(item => {
    const path = item.path.toLowerCase();
    const filename = path.split('/').pop();
    
    // Skip test directories and test fixtures
    if (path.includes('__tests__') || path.includes('/test/') || path.includes('/tests/')) {
      return;
    }
    
    // Skip .js and .md files (including test fixtures)
    if (filename.endsWith('.js') || filename.endsWith('.md')) {
      return;
    }
    
    let isSensitive = false;
    let message = '';
    
    // Check for exact filename matches
    if (filename === '.env' || filename === '.env.local' || filename === '.env.production') {
      isSensitive = true;
      message = `Exposed environment file: ${item.path}`;
    } else if (filename === 'id_rsa' || filename === 'id_rsa.pub') {
      isSensitive = true;
      message = `Exposed SSH key: ${item.path}`;
    } else if (filename === 'secrets.json' || filename === 'credentials.json') {
      isSensitive = true;
      message = `Exposed credentials file: ${item.path}`;
    } else if (filename === 'database.sql' || filename === 'backup.sql') {
      isSensitive = true;
      message = `Exposed database file: ${item.path}`;
    }
    // Check for file extensions (private keys only)
    else if (filename.endsWith('.pem') || filename.endsWith('.key')) {
      isSensitive = true;
      message = `Exposed private key: ${item.path}`;
    }
    
    if (isSensitive) {
      found.push({
        file: item.path,
        severity: 'critical',
        message: message
      });
    }
  });

  return found;
}

/**
 * Check NPM package vulnerabilities
 */
async function checkNPMVulnerabilities(owner, repo) {
  const vulnerabilities = [];
  
  try {
    // Fetch package.json
    const packageJsonData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`);
    const packageJson = JSON.parse(Buffer.from(packageJsonData.content, 'base64').toString());
    
    const riskyPackages = ['eval', 'vm2', 'node-serialize', 'serialize-javascript', 'node-uuid', 'request'];
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    // Check for risky packages
    for (const [pkg, version] of Object.entries(dependencies || {})) {
      if (riskyPackages.includes(pkg)) {
        vulnerabilities.push({
          package: pkg,
          severity: 'critical',
          message: `Risky package detected: ${pkg} (known security issues)`
        });
      }
      
      // Check if package is outdated (sample check for major packages)
      if (['express', 'react', 'vue', 'angular'].includes(pkg)) {
        try {
          const npmData = await axios.get(`https://registry.npmjs.org/${pkg}/latest`, { timeout: 3000 });
          const latestVersion = npmData.data.version;
          const currentMajor = parseInt(version.replace(/[^0-9]/g, '').charAt(0));
          const latestMajor = parseInt(latestVersion.split('.')[0]);
          
          if (latestMajor - currentMajor >= 2) {
            vulnerabilities.push({
              package: pkg,
              severity: 'warning',
              message: `${pkg} is ${latestMajor - currentMajor} major versions behind (current: ${version}, latest: ${latestVersion})`
            });
          }
        } catch (err) {
          // Skip if NPM registry check fails
        }
      }
    }
  } catch (error) {
    console.error('NPM check error:', error.message);
  }
  
  return vulnerabilities;
}

/**
 * Check PyPI package vulnerabilities
 */
async function checkPyPIVulnerabilities(owner, repo) {
  const vulnerabilities = [];
  
  try {
    // Fetch requirements.txt
    const requirementsData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/requirements.txt`);
    const requirements = Buffer.from(requirementsData.content, 'base64').toString();
    
    const lines = requirements.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    for (const line of lines.slice(0, 5)) { // Check first 5 packages to avoid rate limits
      const pkgMatch = line.match(/^([a-zA-Z0-9-_]+)/);
      if (pkgMatch) {
        const pkg = pkgMatch[1];
        
        // Check if version is pinned
        if (!line.includes('==') && !line.includes('>=')) {
          vulnerabilities.push({
            package: pkg,
            severity: 'warning',
            message: `${pkg} has no pinned version (security risk)`
          });
        }
        
        // Check if package exists and is outdated
        try {
          const pypiData = await axios.get(`https://pypi.org/pypi/${pkg}/json`, { timeout: 3000 });
          const latestVersion = pypiData.data.info.version;
          const versionMatch = line.match(/==([0-9.]+)/);
          
          if (versionMatch) {
            const currentVersion = versionMatch[1];
            if (currentVersion !== latestVersion) {
              vulnerabilities.push({
                package: pkg,
                severity: 'info',
                message: `${pkg} may be outdated (current: ${currentVersion}, latest: ${latestVersion})`
              });
            }
          }
        } catch (err) {
          // Skip if PyPI check fails
        }
      }
    }
  } catch (error) {
    console.error('PyPI check error:', error.message);
  }
  
  return vulnerabilities;
}

/**
 * Check GitHub security advisories
 */
async function checkGitHubAdvisories(languages) {
  const advisories = [];
  
  try {
    const languageList = Object.keys(languages);
    
    for (const lang of languageList.slice(0, 2)) { // Check top 2 languages
      const ecosystem = getEcosystem(lang);
      if (ecosystem) {
        try {
          const response = await axios.get(`https://api.github.com/advisories`, {
            params: {
              affects: ecosystem,
              per_page: 3
            },
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Codeward-App'
            },
            timeout: 5000
          });
          
          if (response.data && response.data.length > 0) {
            advisories.push({
              language: lang,
              ecosystem,
              count: response.data.length,
              message: `Known security advisories exist for ${lang} ecosystem`
            });
          }
        } catch (err) {
          // Skip if advisory check fails
        }
      }
    }
  } catch (error) {
    console.error('Advisory check error:', error.message);
  }
  
  return advisories;
}

/**
 * Map language to ecosystem
 */
function getEcosystem(language) {
  const ecosystemMap = {
    'JavaScript': 'npm',
    'TypeScript': 'npm',
    'Python': 'pip',
    'Ruby': 'rubygems',
    'Java': 'maven',
    'Go': 'go',
    'Rust': 'cargo',
    'PHP': 'composer'
  };
  return ecosystemMap[language] || null;
}

/**
 * Generate teach mode content
 */
function generateTeachMode(overview, contents, languages, repoData) {
  const teachMode = {
    languageExplainers: [],
    repoStructure: [],
    keyThings: [],
    questionsToAsk: []
  };

  // Language explainers
  const languageDescriptions = {
    'JavaScript': 'The language that powers most websites and web apps. It runs in browsers and on servers.',
    'TypeScript': 'A safer version of JavaScript that catches errors before your code runs. Used by large teams.',
    'Python': 'A beginner-friendly language great for AI, data science, and automation work.',
    'Java': 'A robust language used for enterprise software, Android apps, and large-scale systems.',
    'Go': 'A fast, efficient language built by Google for backend services and cloud infrastructure.',
    'Ruby': 'An elegant language focused on developer happiness. Popular for web apps with Rails framework.',
    'PHP': 'A server-side language that powers many websites including WordPress.',
    'C++': 'A powerful, fast language used for games, operating systems, and performance-critical apps.',
    'C#': 'Microsoft\'s language for Windows apps, games (Unity), and enterprise software.',
    'Rust': 'A modern language focused on safety and speed. Great for systems programming.',
    'Shell': 'Scripts that automate tasks on Linux/Mac servers. The glue that holds systems together.',
    'HTML': 'The structure of web pages. Not a programming language, but essential for websites.',
    'CSS': 'The styling of web pages. Makes websites look good.',
    'Swift': 'Apple\'s language for iOS and Mac apps.',
    'Kotlin': 'A modern language for Android apps, preferred over Java by many developers.'
  };

  Object.keys(languages).forEach(lang => {
    if (languageDescriptions[lang]) {
      teachMode.languageExplainers.push({
        language: lang,
        description: languageDescriptions[lang]
      });
    }
  });

  // Repo structure insights
  const fileNames = Array.isArray(contents) ? contents.map(item => item.name) : [];
  
  if (fileNames.includes('package.json')) {
    teachMode.repoStructure.push('This is a Node.js project. It uses npm packages — external code libraries that add features.');
  }
  if (fileNames.includes('requirements.txt')) {
    teachMode.repoStructure.push('This is a Python project with external dependencies listed in requirements.txt.');
  }
  if (fileNames.includes('Dockerfile')) {
    teachMode.repoStructure.push('This app is containerized with Docker — it can run the same way on any computer.');
  }
  if (fileNames.some(f => f.startsWith('.github'))) {
    teachMode.repoStructure.push('This repo has automated CI/CD workflows — it tests itself automatically on every change.');
  }
  if (fileNames.some(f => f.toLowerCase().includes('test'))) {
    teachMode.repoStructure.push('This code has automated tests — they check if the code works correctly before deployment.');
  }
  if (fileNames.includes('README.md')) {
    teachMode.repoStructure.push('This repo has documentation in README.md — a good sign of maintainability.');
  }

  // Key things to know
  const contributors = repoData.network_count || 1;
  const daysSinceUpdate = Math.floor((Date.now() - new Date(overview.lastUpdated).getTime()) / (1000 * 60 * 60 * 24));
  
  teachMode.keyThings.push(`This codebase has ${contributors} contributor${contributors > 1 ? 's' : ''} — ${contributors > 5 ? 'many eyes on the code means better quality' : 'a small team or solo project'}.`);
  
  if (daysSinceUpdate < 30) {
    teachMode.keyThings.push(`Last updated ${daysSinceUpdate} days ago — this is an actively maintained project.`);
  } else if (daysSinceUpdate < 180) {
    teachMode.keyThings.push(`Last updated ${Math.floor(daysSinceUpdate / 30)} months ago — moderately active.`);
  } else {
    teachMode.keyThings.push(`Last updated ${Math.floor(daysSinceUpdate / 365)} year(s) ago — this project may be abandoned.`);
  }
  
  if (overview.stars > 1000) {
    teachMode.keyThings.push(`${overview.stars.toLocaleString()} stars means this is widely trusted by the developer community.`);
  } else if (overview.stars > 100) {
    teachMode.keyThings.push(`${overview.stars} stars indicates decent community trust.`);
  }
  
  if (overview.hasLicense) {
    teachMode.keyThings.push('Has a license file — you know the legal terms for using this code.');
  }

  // Questions to ask AI
  if (!overview.hasLicense) {
    teachMode.questionsToAsk.push('Ask your AI: "Can you add an MIT LICENSE file to this repo?"');
  }
  if (!fileNames.some(f => f.toLowerCase().includes('test'))) {
    teachMode.questionsToAsk.push('Ask your AI: "Can you write basic tests for the main functions in this project?"');
  }
  if (fileNames.includes('package.json')) {
    teachMode.questionsToAsk.push('Ask your AI: "Are there any security vulnerabilities in the package.json dependencies?"');
  }
  if (!fileNames.includes('README.md')) {
    teachMode.questionsToAsk.push('Ask your AI: "Can you write a README.md explaining what this project does?"');
  }
  if (daysSinceUpdate > 180) {
    teachMode.questionsToAsk.push('Ask your AI: "Are the dependencies in this project outdated? Should I update them?"');
  }

  return teachMode;
}

/**
 * Fetch data from GitHub API
 */
async function fetchGitHubAPI(url) {
  const response = await axios.get(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Codeward-App'
    }
  });
  return response.data;
}

/**
 * Generate plain English summary using watsonx.ai
 */
async function generateAISummary(overview, languages, fileList) {
  // Check if watsonx credentials are configured
  if (!process.env.WATSONX_API_KEY || !process.env.WATSONX_PROJECT_ID) {
    console.warn('watsonx.ai credentials not configured, using fallback summary');
    return generateFallbackSummary(overview, languages);
  }
  
  try {
    const languageList = Object.keys(languages).join(', ') || overview.language;
    
    const prompt = `You are a code analyst. Given this GitHub repository information: 
Repository: ${overview.name}
Description: ${overview.description}
Languages: ${languageList}
Files: ${fileList}

Write a 3 sentence plain English summary of what this code does. Write it for someone who cannot code. Be clear, simple and direct.`;

    const response = await axios.post(
      'https://us-south.ml.cloud.ibm.com/ml/v1/text/generation',
      {
        input: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.7
        },
        model_id: 'ibm/granite-13b-chat-v2',
        project_id: process.env.WATSONX_PROJECT_ID
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WATSONX_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    
    console.log('AI summary generated successfully');
    return response.data.results[0].generated_text.trim();
    
  } catch (error) {
    console.error('watsonx.ai error:', error.message);
    console.log('Falling back to rule-based summary');
    return generateFallbackSummary(overview, languages);
  }
}

/**
 * Generate fallback summary when AI is unavailable
 */
function generateFallbackSummary(overview, languages) {
  const languageList = Object.keys(languages).join(', ') || overview.language;
  const description = overview.description !== 'No description provided'
    ? overview.description
    : `a ${languageList} project`;
  
  // More human, warmer summary
  const projectType = getProjectType(languageList, overview.name);
  return `This is ${description}. It's written in ${languageList}. ${projectType}`;
}

/**
 * Determine project type for better summary
 */
function getProjectType(languages, name) {
  const lowerLang = languages.toLowerCase();
  const lowerName = name.toLowerCase();
  
  if (lowerLang.includes('javascript') || lowerLang.includes('typescript')) {
    if (lowerName.includes('api') || lowerName.includes('server')) {
      return 'This looks like a web server or API that handles data and requests.';
    }
    return 'This appears to be a web application or tool built with modern JavaScript.';
  }
  
  if (lowerLang.includes('python')) {
    if (lowerName.includes('ml') || lowerName.includes('ai') || lowerName.includes('model')) {
      return 'This looks like a machine learning or AI project.';
    }
    return 'This is a Python application that likely processes data or automates tasks.';
  }
  
  if (lowerLang.includes('java')) {
    return 'This is a Java application, typically used for enterprise software or Android apps.';
  }
  
  if (lowerLang.includes('html') || lowerLang.includes('css')) {
    return 'This is a website or web interface.';
  }
  
  return 'This is a software project that can be reviewed for quality and security.';
}

/**
 * Get fix recommendation for a red flag
 */
function getFixRecommendation(flag) {
  const message = flag.message.toLowerCase();
  
  if (message.includes('no readme')) {
    return {
      issue: flag.message,
      fix: 'Add a README.md file explaining what your project does. Go to GitHub → Add file → Create new file → name it README.md. Write 3-4 sentences about what your code does and how to use it.'
    };
  }
  
  if (message.includes('no license')) {
    return {
      issue: flag.message,
      fix: 'Add a LICENSE file to protect your code legally. Go to GitHub → Add file → Create new file → name it LICENSE. GitHub will offer license templates - MIT License is a good default for open source.'
    };
  }
  
  if (message.includes('no test')) {
    return {
      issue: flag.message,
      fix: 'Your code has no tests. Tests check if your code works correctly and catches bugs early. Ask your AI coding tool to generate tests for your main functions. Put them in a folder called "tests" or "__tests__".'
    };
  }
  
  if (message.includes('not updated')) {
    return {
      issue: flag.message,
      fix: 'This repository hasn\'t been updated recently. If you\'re still working on it, make a small commit to show it\'s active. Old code can have security issues or outdated dependencies.'
    };
  }
  
  if (message.includes('no description')) {
    return {
      issue: flag.message,
      fix: 'Add a description to your repository. Go to GitHub → Settings (gear icon at top) → Add a short description. This helps people understand what your project does at a glance.'
    };
  }
  
  if (message.includes('single file')) {
    return {
      issue: flag.message,
      fix: 'Your project is just one file. Consider organizing your code into multiple files - one for each major feature. This makes it easier to maintain and understand.'
    };
  }
  
  if (message.includes('no dependency')) {
    return {
      issue: flag.message,
      fix: 'Add a dependency file (package.json for JavaScript, requirements.txt for Python, etc.). This tells others what libraries your code needs to run. Your AI tool can generate this for you.'
    };
  }
  
  if (message.includes('.env')) {
    return {
      issue: flag.message,
      fix: 'CRITICAL: You have an exposed .env file with potential secrets! Go to GitHub → find .env file → delete it immediately. Never commit files with passwords or API keys. Add .env to your .gitignore file.'
    };
  }
  
  // Default for any other flags
  return {
    issue: flag.message,
    fix: 'Review this issue and consider addressing it before deploying your code to production.'
  };
}

/**
 * Calculate risk score based on repository characteristics
 */
function calculateRiskScore(overview, contents, repoData, vulnerabilities) {
  let score = 30; // Start at low-medium risk baseline
  const flags = [];
  
  // POSITIVE FACTORS - Reduce risk for quality indicators
  
  // Has README
  const hasReadme = Array.isArray(contents) &&
    contents.some(item => item.name.toLowerCase().startsWith('readme'));
  if (hasReadme) {
    score -= 15;
  } else {
    flags.push({ severity: 'info', message: 'No README documentation found' });
    score += 15;
  }
  
  // Has LICENSE
  if (overview.hasLicense) {
    score -= 10;
  }
  
  // Has tests folder
  const hasTests = Array.isArray(contents) &&
    contents.some(item =>
      item.name.toLowerCase().includes('test') ||
      item.name.toLowerCase().includes('spec') ||
      item.name.toLowerCase().includes('__tests__')
    );
  if (hasTests) {
    score -= 15;
  }
  
  // Updated in last 30 days
  const lastUpdate = new Date(overview.lastUpdated);
  const daysOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < 30) {
    score -= 10;
  }
  
  // Has package.json or requirements.txt
  const hasDependencies = Array.isArray(contents) &&
    contents.some(item =>
      item.name === 'package.json' ||
      item.name === 'requirements.txt'
    );
  if (hasDependencies) {
    score -= 10;
  }
  
  // More than 10 files
  if (overview.fileCount > 10) {
    score -= 10;
  }
  
  // Has description
  if (overview.description !== 'No description provided') {
    score -= 5;
  } else {
    flags.push({ severity: 'info', message: 'No repository description' });
    score += 10;
  }
  
  // Stars over 1000
  if (overview.stars > 1000) {
    score -= 10;
  }
  
  // NEGATIVE FACTORS - Increase risk for issues
  
  // Single file repo
  if (overview.fileCount === 1) {
    flags.push({ severity: 'info', message: 'Single file repository' });
    score += 20;
  }
  
  // Exposed .env file (CRITICAL)
  const hasExposedEnv = Array.isArray(contents) &&
    contents.some(item => item.name === '.env');
  if (hasExposedEnv) {
    flags.push({
      severity: 'critical',
      message: 'Exposed .env file detected - potential credential leak'
    });
    score += 30;
  }
  
  // Not updated in 6 months
  if (daysOld > 180) {
    flags.push({
      severity: 'info',
      message: `Repository not updated in ${Math.floor(daysOld / 30)} months - may be stable or abandoned`
    });
    score += 15;
  }
  
  // Add vulnerability findings to flags
  if (vulnerabilities) {
    // Sensitive files (CRITICAL)
    vulnerabilities.sensitiveFiles.forEach(vuln => {
      flags.push(vuln);
      score += 30; // Major penalty for exposed secrets
    });
    
    // NPM vulnerabilities (only critical ones matter)
    vulnerabilities.npm.forEach(vuln => {
      if (vuln.severity === 'critical') {
        flags.push(vuln);
        score += 15;
      } else if (vuln.severity === 'warning') {
        flags.push(vuln);
        score += 5;
      }
    });
    
    // PyPI vulnerabilities
    vulnerabilities.pypi.forEach(vuln => {
      if (vuln.severity === 'warning') {
        flags.push(vuln);
        score += 5;
      }
    });
    
    // GitHub advisories (informational only)
    vulnerabilities.advisories.forEach(advisory => {
      flags.push({
        severity: 'info',
        message: advisory.message + ' (ecosystem-wide, not specific to this repo)'
      });
      score += 3; // Minimal penalty
    });
  }
  
  // Ensure score is within bounds (0-100)
  score = Math.max(0, Math.min(100, score));
  
  // Add success message if no flags
  if (flags.length === 0) {
    flags.push({ severity: 'success', message: 'No critical issues detected' });
  }
  
  return { score, flags };
}

/**
 * Get plain English explanation of risk score
 */
function getScoreExplanation(score) {
  if (score <= 30) {
    return 'This code looks solid. Safe to move forward.';
  } else if (score <= 60) {
    return 'Some things need attention before shipping.';
  } else {
    return 'This code needs work before it\'s ready.';
  }
}

/**
 * Determine verdict based on risk score
 */
function determineVerdict(score) {
  if (score <= 30) {
    return {
      label: 'SAFE TO SHIP',
      advice: 'This repository shows good practices and low risk indicators.'
    };
  } else if (score <= 60) {
    return {
      label: 'NEEDS REVIEW',
      advice: 'Review the red flags before deploying. Consider adding tests and documentation.'
    };
  } else {
    return {
      label: 'NOT READY',
      advice: 'Address critical issues before using this code in production.'
    };
  }
}

// Chat endpoint for repo questions
app.post('/api/chat', async (req, res) => {
  try {
    const { message, repoContext } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const systemPrompt = `You are Bob, an expert code analyst who analyzed this GitHub repository: ${repoContext || 'a repository'}. Answer questions in plain English for non-technical users. Be helpful, clear, and slightly witty. Keep answers under 150 words.`;
    
    const reply = await callGroq(systemPrompt, message);
    
    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({
      error: 'Failed to generate response',
      reply: 'Sorry, I encountered an error. Please try again.'
    });
  }
});

// Explain code endpoint
app.post('/api/explain', async (req, res) => {
  try {
    const { fileName, fileContent, repoContext } = req.body;
    
    if (!fileName || !fileContent) {
      return res.status(400).json({ error: 'fileName and fileContent are required' });
    }
    
    const systemPrompt = `You are a patient coding teacher explaining code to someone who has never coded before. Format your response exactly like this:

WHAT IT DOES: (1 simple sentence)
HOW IT WORKS: (3 bullet points in plain English)
KEY CONCEPTS: (explain 2-3 technical terms used)
WHY IT MATTERS: (1 sentence on why this file exists)

Use simple analogies. Never use jargon without explaining it. Keep total under 200 words.`;
    
    const userMessage = `Explain this file from ${repoContext || 'a repository'}:

File: ${fileName}
Content:
${fileContent.substring(0, 2000)}`;
    
    const explanation = await callGroq(systemPrompt, userMessage);
    
    res.json({ explanation });
  } catch (error) {
    console.error('Explain error:', error.message);
    res.status(500).json({
      error: 'Failed to generate explanation',
      explanation: 'Sorry, I could not explain this file. Please try again.'
    });
  }
});

// Fetch commits endpoint
app.get('/api/commits/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const commits = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`);
    res.json({ commits });
  } catch (error) {
    console.error('Commits fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// Fetch file tree endpoint
app.get('/api/tree/:owner/:repo', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const tree = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
    res.json({ tree: tree.tree || [] });
  } catch (error) {
    console.error('Tree fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch file tree' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Codeward server running on port ${PORT}`);
  console.log(`📊 Health check: /health`);
  console.log(`🔍 API endpoint: POST /api/analyze\n`);
  
  if (!process.env.WATSONX_API_KEY) {
    console.warn('⚠️  WATSONX_API_KEY not set - using fallback summaries');
  }
  if (!process.env.WATSONX_PROJECT_ID) {
    console.warn('⚠️  WATSONX_PROJECT_ID not set - using fallback summaries');
  }
});

// Made with Bob
