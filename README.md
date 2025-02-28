# NEAR Anti-Rug Checker

A web application to analyze NEAR protocol smart contracts for potential rug pull risks.

## Features

- Input any NEAR contract address for analysis
- Checks for common rug pull patterns
- Analyzes contract ownership and permissions
- Provides risk assessment with detailed explanations
- Modern, user-friendly interface

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:3000`

## How it Works

The application analyzes smart contracts for several risk factors:

1. Contract ownership status
2. Presence of minting capabilities
3. Transfer restrictions
4. Other suspicious patterns

Risk levels are calculated based on the number and severity of risk factors found.

## Technology Stack

- Frontend: HTML, JavaScript, TailwindCSS
- Backend: Node.js, Express
- Blockchain: NEAR Protocol, near-api-js
