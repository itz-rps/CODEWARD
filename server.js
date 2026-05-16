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
  console.log('Analysis requested for:', req.body.repoUrl);
  
  try {
    const { repoUrl } = req.body;
    
    // Validate GitHub URL
    if (!repoUrl || !repoUrl.startsWith('https://github.com/')) {
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
    
    // Calculate risk score
    const riskAnalysis = calculateRiskScore(overview, contentsData, repoData);
    
    // Determine verdict
    const verdict = determineVerdict(riskAnalysis.score);
    
    // Generate fix recommendations for each flag
    const fixRecommendations = riskAnalysis.flags.map(flag => getFixRecommendation(flag));
    
    // Get score explanation
    const scoreExplanation = getScoreExplanation(riskAnalysis.score);
    
    // Build response
    const analysis = {
      overview,
      summary,
      riskScore: riskAnalysis.score,
      scoreExplanation,
      redFlags: riskAnalysis.flags,
      fixRecommendations,
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
    console.error('Analysis error:', error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Repository not found or is private' 
      });
    }
    
    if (error.response?.status === 403) {
      return res.status(429).json({ 
        error: 'GitHub API rate limit reached. Please try again later.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to analyze repository',
      details: error.message 
    });
  }
});

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
function calculateRiskScore(overview, contents, repoData) {
  let score = 50; // Start at medium risk
  const flags = [];
  
  // Check for README
  const hasReadme = Array.isArray(contents) && 
    contents.some(item => item.name.toLowerCase().startsWith('readme'));
  if (hasReadme) {
    score -= 10;
  } else {
    flags.push({ severity: 'warning', message: 'No README documentation found' });
    score += 10;
  }
  
  // Check for LICENSE
  if (overview.hasLicense) {
    score -= 5;
  } else {
    flags.push({ severity: 'info', message: 'No license file found' });
    score += 5;
  }
  
  // Check for tests
  const hasTests = Array.isArray(contents) && 
    contents.some(item => 
      item.name.toLowerCase().includes('test') || 
      item.name.toLowerCase().includes('spec')
    );
  if (hasTests) {
    score -= 15;
  } else {
    flags.push({ severity: 'warning', message: 'No test files detected' });
    score += 15;
  }
  
  // Check last update date
  const lastUpdate = new Date(overview.lastUpdated);
  const monthsOld = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsOld > 6) {
    flags.push({ 
      severity: 'warning', 
      message: `Repository not updated in ${Math.floor(monthsOld)} months` 
    });
    score += 20;
  } else {
    score -= 10;
  }
  
  // Check for description
  if (overview.description === 'No description provided') {
    flags.push({ severity: 'info', message: 'No repository description' });
    score += 10;
  }
  
  // Check file count
  if (overview.fileCount === 1) {
    flags.push({ severity: 'warning', message: 'Single file repository - limited scope' });
    score += 15;
  } else if (overview.fileCount > 20) {
    score -= 10;
  }
  
  // Check for dependency files
  const hasDependencies = Array.isArray(contents) && 
    contents.some(item => 
      item.name === 'package.json' || 
      item.name === 'requirements.txt' ||
      item.name === 'Gemfile' ||
      item.name === 'pom.xml' ||
      item.name === 'build.gradle'
    );
  if (hasDependencies) {
    score -= 10;
  } else {
    flags.push({ severity: 'info', message: 'No dependency manifest found' });
    score += 10;
  }
  
  // Check for exposed .env file (critical security issue)
  const hasExposedEnv = Array.isArray(contents) && 
    contents.some(item => item.name === '.env');
  if (hasExposedEnv) {
    flags.push({ 
      severity: 'critical', 
      message: 'Exposed .env file detected - potential credential leak' 
    });
    score += 30;
  }
  
  // Ensure score is within bounds
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

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Codeward server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 API endpoint: POST http://localhost:${PORT}/api/analyze\n`);
  
  if (!process.env.WATSONX_API_KEY) {
    console.warn('⚠️  WATSONX_API_KEY not set - using fallback summaries');
  }
  if (!process.env.WATSONX_PROJECT_ID) {
    console.warn('⚠️  WATSONX_PROJECT_ID not set - using fallback summaries');
  }
});

// Made with Bob
