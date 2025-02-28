export const config = {
    runtime: 'edge'
};

const NEARBLOCKS_API_KEY = process.env.NEARBLOCKS_API_KEY;
const NEARBLOCKS_API = 'https://api.nearblocks.io/v1';

async function analyzeToken(tokenData) {
    // Basic analysis of token data
    const analysis = {
        riskFactors: [],
        positiveFactors: [],
        overallRisk: 'UNKNOWN'
    };

    try {
        if (!tokenData || !tokenData.holders || !tokenData.transactions) {
            return analysis;
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
            }
        }

        // Calculate overall risk
        const riskScore = analysis.riskFactors.reduce((score, factor) => {
            switch (factor.severity) {
                case 'HIGH': return score + 3;
                case 'MEDIUM': return score + 2;
                case 'LOW': return score + 1;
                default: return score;
            }
        }, 0);

        if (riskScore >= 5) {
            analysis.overallRisk = 'HIGH';
        } else if (riskScore >= 3) {
            analysis.overallRisk = 'MEDIUM';
        } else if (riskScore > 0) {
            analysis.overallRisk = 'LOW';
        } else {
            analysis.overallRisk = 'UNKNOWN';
        }

        return analysis;
    } catch (error) {
        console.error('Error in token analysis:', error);
        return analysis;
    }
}

// Fetch token information with timeout and retries
async function getTokenInfo(contractId) {
    const TIMEOUT_MS = 10000; // 10 seconds
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000; // 1 second

    const fetchWithTimeout = async (url, options) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    };

    const fetchWithRetry = async (url, options) => {
        let lastError;
        
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const response = await fetchWithTimeout(url, options);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            } catch (error) {
                lastError = error;
                if (error.name === 'AbortError') {
                    console.error(`Request timeout on attempt ${attempt + 1}`);
                } else {
                    console.error(`Request failed on attempt ${attempt + 1}:`, error);
                }
                
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }
        
        throw lastError;
    };

    try {
        const headers = {
            'accept': 'application/json',
            'Authorization': `Bearer ${NEARBLOCKS_API_KEY}`
        };

        // Make API calls in parallel with retries
        const [tokenInfoResponse, holdersResponse, txnsResponse] = await Promise.all([
            fetchWithRetry(`${NEARBLOCKS_API}/fts/${contractId}`, { headers }),
            fetchWithRetry(`${NEARBLOCKS_API}/fts/${contractId}/holders`, { headers }),
            fetchWithRetry(`${NEARBLOCKS_API}/fts/${contractId}/txns`, { headers })
        ]);

        // Parse responses
        const [tokenInfo, holders, txns] = await Promise.all([
            tokenInfoResponse.json(),
            holdersResponse.json(),
            txnsResponse.json()
        ]);

        // Format the data
        const formattedData = {
            tokenInfo: tokenInfo?.contracts?.[0] || {},
            holders: holders?.holders?.map(h => {
                const amount = parseFloat(h?.amount || '0');
                return {
                    account: h?.account_id || h?.account || 'Unknown',
                    amount: amount,
                    percentage: 0
                };
            }) || [],
            transactions: txns?.txns?.map(tx => ({
                event_index: tx?.event_index,
                affected_account_id: tx?.affected_account_id || 'Unknown',
                involved_account_id: tx?.involved_account_id || 'Unknown',
                delta_amount: tx?.delta_amount || '0',
                cause: tx?.cause || 'Unknown',
                block_timestamp: tx?.block_timestamp,
                block_height: tx?.block?.block_height,
                status: tx?.outcomes?.status || 'UNKNOWN'
            })) || []
        };

        // Calculate total supply and percentages
        if (formattedData.holders.length > 0) {
            const totalSupply = formattedData.holders.reduce((sum, h) => sum + (h.amount || 0), 0);
            formattedData.holders = formattedData.holders.map(h => ({
                ...h,
                percentage: totalSupply > 0 ? ((h.amount || 0) / totalSupply) * 100 : 0
            }));
        }

        // Analyze the token data
        const analysis = await analyzeToken(formattedData);
        formattedData.analysis = analysis;

        return formattedData;
    } catch (error) {
        console.error('Error fetching token info:', error);
        // Return a safe default structure
        return {
            tokenInfo: {},
            holders: [],
            transactions: [],
            analysis: {
                riskFactors: [],
                positiveFactors: [],
                overallRisk: 'ERROR'
            },
            error: error.message
        };
    }
}

export default async function handler(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }

    try {
        const body = await request.json();
        const { contractId } = body;

        if (!contractId) {
            return new Response(JSON.stringify({ error: 'Contract ID is required' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        const tokenData = await getTokenInfo(contractId);
        
        return new Response(JSON.stringify(tokenData), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Error processing request:', error);
        return new Response(JSON.stringify({ 
            error: error.message,
            tokenInfo: {},
            holders: [],
            transactions: [],
            analysis: {
                riskFactors: [],
                positiveFactors: [],
                overallRisk: 'ERROR'
            }
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}
