const express = require('express');
const dotenv = require('dotenv');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const OpenAI = require('openai');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Serve static files with proper MIME types
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));
app.use(express.json());

const NEARBLOCKS_API_KEY = process.env.NEARBLOCKS_API_KEY;
const NEARBLOCKS_API = 'https://api.nearblocks.io/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Initialize OpenAI client with DeepSeek's API
const deepseek = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/v1"
});

// Helper function to make API requests to NEARBLOCKS
async function fetchFromNearBlocks(endpoint) {
    const url = `${NEARBLOCKS_API}${endpoint}`;
    console.log('Fetching from NEARBLOCKS:', url);
    
    const response = await fetch(url, {
        headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${NEARBLOCKS_API_KEY}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('NEARBLOCKS API Error:', errorText);
        throw new Error(`NEARBLOCKS API request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('NEARBLOCKS Response:', data);
    return data;
}

// Fetch token information (first page only)
async function getTokenInfo(contractId) {
    try {
        // 1. Get basic token info
        const tokenInfoResponse = await fetch(`https://api.nearblocks.io/v1/fts/${contractId}`, {
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${NEARBLOCKS_API_KEY}`
            }
        });
        const tokenInfo = await tokenInfoResponse.json();

        // 2. Get token holders
        const holdersResponse = await fetch(`https://api.nearblocks.io/v1/fts/${contractId}/holders`, {
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${NEARBLOCKS_API_KEY}`
            }
        });
        const holders = await holdersResponse.json();

        // 3. Get token transactions
        const txnsResponse = await fetch(`https://api.nearblocks.io/v1/fts/${contractId}/txns`, {
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${NEARBLOCKS_API_KEY}`
            }
        });
        const txns = await txnsResponse.json();

        // Format the data
        const formattedData = {
            tokenInfo: tokenInfo.contracts ? tokenInfo.contracts[0] : {},
            holders: holders.holders ? holders.holders.map(h => {
                // Convert string amounts to numbers for calculation
                const amount = parseFloat(h.amount || '0');
                return {
                    account: h.account_id || h.account,
                    amount: amount,
                    percentage: 0 // Will be calculated after total is known
                };
            }) : [],
            transactions: txns.txns ? txns.txns.map(tx => ({
                event_index: tx.event_index,
                affected_account_id: tx.affected_account_id,
                involved_account_id: tx.involved_account_id,
                delta_amount: tx.delta_amount,
                cause: tx.cause,
                block_timestamp: tx.block_timestamp,
                block_height: tx.block?.block_height,
                status: tx.outcomes?.status
            })) : []
        };

        // Calculate total supply and percentages
        if (formattedData.holders.length > 0) {
            const totalSupply = formattedData.holders.reduce((sum, h) => sum + h.amount, 0);
            formattedData.holders = formattedData.holders.map(h => ({
                ...h,
                percentage: totalSupply > 0 ? (h.amount / totalSupply) * 100 : 0
            }));
        }

        return formattedData;
    } catch (error) {
        console.error('Error fetching token info:', error);
        throw error;
    }
}

async function analyzeWithDeepSeek(data) {
    const systemPrompt = `You are an expert in analyzing NEAR Protocol tokens and smart contracts for potential rug pulls and security risks.
Your task is to provide a comprehensive security analysis of tokens, focusing on these key areas:

1. Token Distribution Analysis:
   - Analyze the top holder concentration and distribution patterns
   - Identify suspicious wallet patterns or centralization risks
   - Calculate and evaluate the Gini coefficient of token distribution
   - Flag any concerning ownership patterns

2. Transaction Pattern Analysis:
   - Evaluate recent transaction volumes and frequencies
   - Identify suspicious trading patterns or market manipulation
   - Analyze transaction sizes and timing
   - Look for wash trading or artificial volume
   - Check for large dumps or suspicious transfers

3. Smart Contract Security:
   - Evaluate contract ownership and admin privileges
   - Check for minting capabilities and supply control
   - Identify potential backdoors or high-risk functions
   - Assess contract upgradeability and its implications
   - Review token standard compliance

4. Market and Community Analysis:
   - Social media presence and community engagement
   - Development activity and team transparency
   - Token utility and use cases
   - Integration with DeFi protocols or other contracts

5. Risk Assessment:
   - Provide detailed risk factors with severity levels
   - Identify potential red flags and warning signs
   - Calculate risk metrics across different dimensions
   - Compare against known rug pull patterns

6. Recommendations:
   - Specific actions for risk mitigation
   - Due diligence checklist for investors
   - Security best practices
   - Monitoring suggestions

Provide a detailed markdown report with clear sections and evidence-based analysis. Use tables and lists for better readability.
End with a comprehensive risk score (1-100) where:
- 80-100: Very Safe (Well-audited, transparent, good distribution)
- 60-79: Generally Safe (Some minor concerns)
- 40-59: Moderate Risk (Notable concerns present)
- 20-39: High Risk (Multiple red flags)
- 0-19: Extreme Risk (Strong rug pull indicators)`;

    const userPrompt = `Analyze this NEAR token for rug pull risks and security concerns. Here's the data:
${JSON.stringify(data, null, 2)}

Provide a comprehensive markdown report with these sections:

# Token Analysis Report

## 1. Token Overview
- Basic token information
- Contract details
- Market data and statistics

## 2. Holder Analysis
- Top holder concentration
- Distribution metrics
- Wallet patterns
- Gini coefficient calculation

## 3. Transaction Analysis
- Recent transaction patterns
- Volume analysis
- Suspicious activity detection
- Large transfers investigation

## 4. Smart Contract Security
- Contract features
- Admin privileges
- Minting capabilities
- Security risks

## 5. Risk Assessment
- Detailed risk factors
- Red flags
- Security concerns
- Comparison with known rug pulls

## 6. Market & Community
- Social presence
- Development activity
- Token utility
- Integration analysis

## 7. Recommendations
- Risk mitigation steps
- Due diligence checklist
- Security best practices
- Monitoring suggestions

## 8. Final Verdict
Summarize the analysis and provide clear recommendations.

End your analysis with a risk score in this format:
<SCORE>XX</SCORE>
where XX is a number from 0-100 (higher = safer).`;

    try {
        console.log('Sending to DeepSeek:', { systemPrompt, userPrompt });
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.3,  // Lower temperature for more focused analysis
                max_tokens: 4000   // Increased token limit for more detailed response
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('DeepSeek API Error:', error);
            throw new Error(`DeepSeek API error: ${error.message || response.statusText}`);
        }

        const result = await response.json();
        console.log('DeepSeek Response:', result);
        
        // Extract the score from the response
        const content = result.choices[0].message.content;
        const scoreMatch = content.match(/<SCORE>(\d+)<\/SCORE>/);
        const legitimacyScore = scoreMatch ? parseInt(scoreMatch[1]) : 50;
        
        return {
            analysis: content.replace(/<SCORE>\d+<\/SCORE>/, '').trim(),
            score: legitimacyScore
        };
    } catch (error) {
        console.error('DeepSeek API Error:', error.response?.data || error.message);
        throw new Error('Failed to analyze token data');
    }
}

// API endpoint to check contract
app.post('/api/check-contract', async (req, res) => {
    try {
        console.log('Received request:', req.body);
        
        const { contractId } = req.body;
        if (!contractId) {
            return res.status(400).json({ error: 'Contract ID is required' });
        }

        console.log('Fetching token data for:', contractId);

        // Get comprehensive token information
        const tokenData = await getTokenInfo(contractId);
        console.log('Token data collected:', tokenData);

        // Analyze with DeepSeek
        const { analysis, score } = await analyzeWithDeepSeek(tokenData);
        
        res.json({ 
            analysis,
            risk_score: score,
            data: tokenData // Include the raw data for reference
        });
    } catch (error) {
        console.error('Error checking contract:', error);
        res.status(500).json({ error: error.message || 'Failed to analyze contract' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});