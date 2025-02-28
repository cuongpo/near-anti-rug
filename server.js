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

// Helper function to make API requests to NEARBLOCKS with timeout
async function fetchFromNearBlocks(endpoint) {
    const TIMEOUT_MS = 30000; // 30 seconds timeout
    const url = `${NEARBLOCKS_API}${endpoint}`;
    console.log('Fetching from NEARBLOCKS:', url);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
        const response = await fetch(url, {
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${NEARBLOCKS_API_KEY}`
            },
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('NEARBLOCKS API Error:', errorText);
            throw new Error(`NEARBLOCKS API request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('NEARBLOCKS Response:', data);
        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out after ' + (TIMEOUT_MS/1000) + ' seconds');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

// Fetch token information (first page only)
async function getTokenInfo(contractId) {
    try {
        // 1. Get basic token info
        const tokenInfoResponse = await fetchFromNearBlocks(`/fts/${contractId}`);
        const tokenInfo = await tokenInfoResponse.json();

        // 2. Get token holders
        const holdersResponse = await fetchFromNearBlocks(`/fts/${contractId}/holders`);
        const holders = await holdersResponse.json();

        // 3. Get token transactions
        const txnsResponse = await fetchFromNearBlocks(`/fts/${contractId}/txns`);
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
    const systemPrompt = `You are an expert in analyzing NEAR Protocol tokens and assessing their legitimacy and safety.
Analyze the provided token data focusing on:
1. Token Distribution: Check if tokens are well-distributed among holders (top 25 holders)
2. Transaction Patterns: Look for healthy transaction patterns (last 25 transactions)
3. Token Metadata: Verify decimals, name, symbol, and other metadata
4. Contract Features: Analyze functions and capabilities
5. Legitimacy Indicators: Identify positive signs and potential concerns

Provide a detailed assessment with clear explanations and assign a legitimacy score (1-100):
- 80-100: High legitimacy (Very safe, well-maintained, professional)
- 50-79: Medium legitimacy (Generally safe but needs more verification)
- 1-49: Low legitimacy (Concerning patterns, exercise extreme caution)`;

    const userPrompt = `Please analyze this NEAR token data and provide a legitimacy assessment:
${JSON.stringify(data, null, 2)}

Format your response in markdown with these sections:
1. Token Overview
2. Holder Analysis (Top 25)
3. Recent Transaction Analysis
4. Legitimacy Assessment
5. Recommendations

End your analysis with a clear legitimacy score (1-100) in this exact format:
<SCORE>XX</SCORE>
where XX is the numerical score.`;

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
                temperature: 0.7,
                max_tokens: 2000
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
        const legitimacyScore = scoreMatch ? parseInt(scoreMatch[1]) : 50; // Default to 50 if no score found
        
        return {
            analysis: content.replace(/<SCORE>\d+<\/SCORE>/, '').trim(), // Remove the score tag from the analysis
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