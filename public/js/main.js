// Wait for DOM to be fully loaded
window.addEventListener('DOMContentLoaded', () => {
    // Get form elements
    const form = document.getElementById('checkForm');
    const resultDiv = document.getElementById('result');
    const loadingDiv = document.getElementById('loading');

    if (!form || !resultDiv || !loadingDiv) {
        console.error('Required elements not found:', {
            form: !!form,
            resultDiv: !!resultDiv,
            loadingDiv: !!loadingDiv
        });
        return;
    }

    // Function to format numbers with commas
    const formatNumber = (num) => {
        if (!num) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    // Function to format timestamp
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString();
    };

    // Function to truncate address
    const truncateAddress = (address) => {
        if (!address) return 'N/A';
        return address.length > 16 ? 
            `${address.substring(0, 8)}...${address.substring(address.length - 8)}` : 
            address;
    };

    // Function to create legitimacy score gauge
    const createLegitimacyGauge = (score) => {
        const color = score > 70 ? 'green' : score > 40 ? 'yellow' : 'red';
        const colorClass = {
            red: 'bg-red-500',
            yellow: 'bg-yellow-500',
            green: 'bg-green-500'
        }[color];

        return `
            <div class="mb-6">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-lg font-semibold">Legitimacy Score</span>
                    <span class="text-2xl font-bold ${score > 70 ? 'text-green-500' : score > 40 ? 'text-yellow-500' : 'text-red-500'}">${score}/100</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-4">
                    <div class="${colorClass} h-4 rounded-full" style="width: ${score}%"></div>
                </div>
                <div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    ${score > 70 ? 'High legitimacy - This contract appears to be safe and well-maintained' :
                      score > 40 ? 'Medium legitimacy - Exercise caution and do additional research' :
                      'Low legitimacy - High risk, proceed with extreme caution'}
                </div>
            </div>
        `;
    };

    // Function to create token overview section
    const createTokenOverview = (tokenInfo) => {
        if (!tokenInfo) return '';
        
        const {
            name,
            symbol,
            decimals,
            icon,
            total_supply,
            circulating_supply
        } = tokenInfo;

        return `
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6 hover:shadow-xl transition-shadow duration-300">
                <div class="flex items-center gap-4 mb-6">
                    ${icon ? `<img src="${icon}" alt="${symbol}" class="w-16 h-16 rounded-full ring-2 ring-blue-500 p-1">` : 
                            `<div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center ring-2 ring-blue-500">
                                <span class="text-2xl font-bold text-white">${symbol ? symbol[0] : 'T'}</span>
                             </div>`}
                    <div>
                        <div class="group relative">
                            <h2 class="text-2xl font-bold group-hover:text-blue-500 transition-colors duration-200">${name || 'Unknown Token'}</h2>
                            <span class="text-gray-600 dark:text-gray-400 text-sm">${symbol || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors duration-200">
                        <div class="flex items-center justify-between">
                            <p class="text-sm text-gray-600 dark:text-gray-400">Total Supply</p>
                            <svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
                            </svg>
                        </div>
                        <p class="text-lg font-semibold mt-1">${formatNumber(total_supply || 0)}</p>
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors duration-200">
                        <div class="flex items-center justify-between">
                            <p class="text-sm text-gray-600 dark:text-gray-400">Circulating Supply</p>
                            <svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <p class="text-lg font-semibold mt-1">${formatNumber(circulating_supply || 0)}</p>
                    </div>
                    <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors duration-200">
                        <div class="flex items-center justify-between">
                            <p class="text-sm text-gray-600 dark:text-gray-400">Decimals</p>
                            <svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4-1a1 1 0 10-2 0v7a1 1 0 102 0V8z" clip-rule="evenodd"></path>
                            </svg>
                        </div>
                        <p class="text-lg font-semibold mt-1">${decimals || 'N/A'}</p>
                    </div>
                </div>
            </div>
        `;
    };

    // Function to create holders section
    const createHoldersSection = (holders) => {
        if (!holders || !holders.length) {
            return `
                <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
                    <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                        <svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path>
                        </svg>
                        Top Token Holders
                    </h3>
                    <p class="text-gray-600 dark:text-gray-400 text-center py-4">No holder data available</p>
                </div>
            `;
        }

        // Sort holders by amount in descending order
        const sortedHolders = [...holders].sort((a, b) => b.amount - a.amount);

        return `
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
                <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                    <svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path>
                    </svg>
                    Top Token Holders
                </h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Rank</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Account</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Balance</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Percentage</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            ${sortedHolders.slice(0, 25).map((holder, index) => {
                                const percentage = holder.percentage || 0;
                                return `
                                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                                        <td class="px-6 py-4 whitespace-nowrap text-sm">${index + 1}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <a href="https://nearblocks.io/address/${holder.account}" 
                                               target="_blank" 
                                               class="text-blue-500 hover:text-blue-700">
                                                ${truncateAddress(holder.account)}
                                            </a>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm">${formatNumber(holder.amount)}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                                            <div class="flex items-center">
                                                <div class="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                                    <div class="bg-blue-500 h-2 rounded-full" 
                                                         style="width: ${Math.min(percentage, 100)}%">
                                                    </div>
                                                </div>
                                                <span>${percentage.toFixed(2)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    // Function to create transactions section
    const createTransactionsSection = (transactions) => {
        if (!transactions || !transactions.length) return '';

        return `
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
                <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
                    <svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd"></path>
                    </svg>
                    Recent Transactions
                </h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">From</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">To</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            ${transactions.map(tx => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">${formatDate(tx.block_timestamp)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            tx.delta_amount > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }">
                                            ${tx.delta_amount > 0 ? 'Receive' : 'Send'}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <a href="https://nearblocks.io/address/${tx.affected_account_id}" target="_blank" class="text-blue-500 hover:text-blue-700">
                                            ${truncateAddress(tx.affected_account_id)}
                                        </a>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <a href="https://nearblocks.io/address/${tx.involved_account_id}" target="_blank" class="text-blue-500 hover:text-blue-700">
                                            ${truncateAddress(tx.involved_account_id)}
                                        </a>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${
                                        tx.delta_amount > 0 ? 'text-green-600' : 'text-red-600'
                                    }">${formatNumber(Math.abs(tx.delta_amount))}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            tx.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }">
                                            ${tx.status}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const contractId = document.getElementById('contractId').value.trim();
        
        if (!contractId) {
            resultDiv.innerHTML = `
                <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                    <p>Please enter a contract ID</p>
                </div>
            `;
            return;
        }

        try {
            // Show loading indicator
            loadingDiv.classList.remove('hidden');
            resultDiv.innerHTML = '';

            // Make API request
            const response = await fetch('/api/check-contract', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contractId })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Convert markdown to HTML using marked library
            const analysisHtml = marked.parse(data.analysis);
            
            // Display results
            resultDiv.innerHTML = `
                <div class="space-y-6">
                    ${createLegitimacyGauge(data.risk_score)}
                    
                    ${createTokenOverview(data.data.tokenInfo)}
                    
                    <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 class="text-xl font-bold mb-4">Analysis Report</h2>
                        <div class="prose dark:prose-invert max-w-none">
                            ${analysisHtml}
                        </div>
                    </div>

                    ${createHoldersSection(data.data.holders)}
                    ${createTransactionsSection(data.data.transactions)}
                </div>
            `;
        } catch (error) {
            resultDiv.innerHTML = `
                <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                    <p>Error: ${error.message}</p>
                </div>
            `;
        } finally {
            // Hide loading indicator
            loadingDiv.classList.add('hidden');
        }
    });
});