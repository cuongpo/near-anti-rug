const express = require('express');
const dotenv = require('dotenv');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const OpenAI = require('openai');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

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
    
    try {
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
    } catch (error) {
        console.error('Error in fetchFromNearBlocks:', error);
        throw error;
    }
}

// Fetch token information (first page only)
async function getTokenInfo(contractId) {
    try {
        console.log('Starting token info fetch for:', contractId);

        // Make API calls in parallel for better performance
        const [tokenInfo, holders, txns] = await Promise.all([
            fetchFromNearBlocks(`/fts/${contractId}`),
            fetchFromNearBlocks(`/fts/${contractId}/holders`),
            fetchFromNearBlocks(`/fts/${contractId}/txns`)
        ]);

        // Format the data
        const formattedData = {
            tokenInfo: tokenInfo.contracts ? tokenInfo.contracts[0] : {},
            holders: holders.holders ? holders.holders.map(h => {
                const amount = parseFloat(h.amount || '0');
                return {
                    account: h.account_id || h.account,
                    amount: amount,
                    percentage: 0
                };
            }) : [],
            transactions: txns.txns ? txns.txns.map(tx => ({
                event_index: tx.event_index,
                affected_account_id: tx.affected_account_id,
                involved_account_id: tx.involved_account_id,
                delta: tx.delta,
                cause: tx.cause,
                receipt_id: tx.receipt_id,
                block_timestamp: tx.block_timestamp,
                block_height: tx.block_height,
                status: tx.status
            })) : []
        };

        // Calculate total supply and holder percentages
        if (formattedData.holders.length > 0) {
            const totalSupply = formattedData.holders.reduce((sum, h) => sum + h.amount, 0);
            formattedData.holders = formattedData.holders.map(h => ({
                ...h,
                percentage: totalSupply > 0 ? (h.amount / totalSupply) * 100 : 0
            }));
            // Sort holders by percentage in descending order
            formattedData.holders.sort((a, b) => b.percentage - a.percentage);
        }

        console.log('Formatted data prepared successfully');
        return formattedData;
    } catch (error) {
        console.error('Error in getTokenInfo:', error);
        throw error;
    }
}

// API endpoint to check contract
app.post('/api/check-contract', async (req, res) => {
    try {
        console.log('Received request:', req.body);
        
        const { contractId } = req.body;
        if (!contractId) {
            return res.status(400).json({ 
                error: 'Contract ID is required',
                details: 'Please provide a valid NEAR contract ID'
            });
        }

        console.log('Fetching token data for:', contractId);

        // Get comprehensive token information
        const tokenData = await getTokenInfo(contractId);
        
        // Basic analysis
        const analysis = {
            riskFactors: [],
            positiveFactors: [],
            overallRisk: 'UNKNOWN'
        };

        // Add positive factors
        if (tokenData.tokenInfo.description) {
            analysis.positiveFactors.push({
                type: 'DOCUMENTATION',
                description: 'Token has proper documentation'
            });
        }

        if (tokenData.tokenInfo.website) {
            analysis.positiveFactors.push({
                type: 'WEBSITE',
                description: 'Token has an official website'
            });
        }

        // Check holder concentration
        if (tokenData.holders.length > 0) {
            const topHolder = tokenData.holders[0];
            if (topHolder.percentage > 50) {
                analysis.riskFactors.push({
                    type: 'HOLDER_CONCENTRATION',
                    description: `Single holder owns ${topHolder.percentage.toFixed(2)}% of tokens`,
                    severity: 'HIGH'
                });
            } else if (topHolder.percentage > 20) {
                analysis.riskFactors.push({
                    type: 'HOLDER_CONCENTRATION',
                    description: `Single holder owns ${topHolder.percentage.toFixed(2)}% of tokens`,
                    severity: 'MEDIUM'
                });
            } else {
                analysis.positiveFactors.push({
                    type: 'HOLDER_DISTRIBUTION',
                    description: 'Token has good holder distribution'
                });
            }
        }

        // Check transaction patterns
        if (tokenData.transactions.length > 0) {
            const successfulTxns = tokenData.transactions.filter(tx => tx.status === 'SUCCESS').length;
            const failedTxns = tokenData.transactions.filter(tx => tx.status !== 'SUCCESS').length;
            
            if (failedTxns > successfulTxns) {
                analysis.riskFactors.push({
                    type: 'FAILED_TRANSACTIONS',
                    description: 'High rate of failed transactions',
                    severity: 'MEDIUM'
                });
            } else {
                analysis.positiveFactors.push({
                    type: 'TRANSACTION_HEALTH',
                    description: 'Healthy transaction success rate'
                });
            }
        }

        // Calculate risk score
        const riskScore = analysis.riskFactors.reduce((score, factor) => {
            switch (factor.severity) {
                case 'HIGH': return score + 3;
                case 'MEDIUM': return score + 2;
                case 'LOW': return score + 1;
                default: return score;
            }
        }, 0);

        // Adjust risk score based on positive factors
        const adjustedScore = Math.max(0, riskScore - (analysis.positiveFactors.length * 0.5));

        analysis.overallRisk = adjustedScore >= 5 ? 'HIGH' : adjustedScore >= 3 ? 'MEDIUM' : adjustedScore > 0 ? 'LOW' : 'SAFE';
        
        res.json({ 
            analysis,
            risk_score: adjustedScore,
            data: tokenData
        });
    } catch (error) {
        console.error('Error in API endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to analyze contract',
            details: error.message,
            contractId: req.body?.contractId
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});