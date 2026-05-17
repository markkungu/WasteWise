# WasteWise

A blockchain-powered plastic recycling platform that incentivizes community participation in plastic waste collection through token rewards, AI-powered verification, and optimized recycling logistics.

---

## Overview

WasteWise is designed to address the growing problem of plastic pollution by creating an inclusive and incentive-driven recycling ecosystem. The platform allows users to collect plastic waste, submit proof through images or videos, and receive blockchain-based rewards after successful verification.

The system integrates:

- AI-powered plastic verification
- Blockchain reward distribution
- User and recycling company dashboards
- Waste collection route optimization
- Data analytics and reporting

---

## Problem Statement

Plastic waste collection has largely been left to informal collectors, limiting public participation and reducing recycling efficiency. Existing systems lack:

- Direct incentives for users
- Transparent reward systems
- Efficient waste routing
- Reliable verification mechanisms
- Centralized recycling data

WasteWise addresses these challenges using blockchain technology, artificial intelligence, and optimization algorithms.

---

## Objectives

### Main Objective

To develop a blockchain-based recycling platform that encourages community participation in plastic waste collection and recycling.

### Specific Objectives

- Connect collectors with recycling companies
- Implement blockchain-based token rewards
- Develop a waste verification system using AI
- Provide optimized waste collection routes
- Generate waste analytics and reports

---

# System Modules

## 1. Verification Module

Handles AI-based validation of submitted waste.

### Responsibilities

- Receive uploaded images/videos
- Process and analyze media
- Detect and classify plastic waste
- Generate verification scores
- Prevent fraudulent submissions

---

## 2. Blockchain Module

Handles rewards and blockchain transactions.

### Responsibilities

- Execute smart contracts
- Calculate token rewards
- Transfer rewards to user wallets
- Record transactions on blockchain

---

## 3. Data Management Module

Handles data storage and administration.

### Responsibilities

- Store user information
- Manage waste submissions
- Store uploaded media
- Maintain recycling company records
- Generate reports and dashboards

---

## 4. User Interaction Module

Provides the main frontend interface for users.

### Responsibilities

- User registration and login
- Wallet connection
- Waste submission
- Reward tracking
- Route viewing

---

## 5. Optimization Module

Handles waste collection route optimization.

### Responsibilities

- Process geographic location data
- Generate optimized collection routes
- Minimize collection distance
- Support classical and quantum optimization techniques

---

# System Architecture

```text
Frontend (React / React Native)
        ↓
Backend API (Node.js + Express)
        ↓
Database (PostgreSQL / MySQL)
        ↓
AI Verification Service
        ↓
Blockchain Layer (Ethereum / Polygon)
```

---

# Technology Stack

## Frontend
- React.js
- React Native
- Tailwind CSS

## Backend
- Node.js
- Express.js

## Database
- PostgreSQL or MySQL

## Blockchain
- Solidity
- Web3.js / Ethers.js
- Ethereum Sepolia Testnet or Polygon

## AI / Machine Learning
- Python
- TensorFlow / PyTorch
- OpenCV

## Optimization
- Qiskit
- Graph optimization algorithms

---

# Database Tables

The system uses the following main tables:

1. users
2. roles
3. wallets
4. plastic_submissions
5. verification
6. rewards
7. recycling_companies
8. optimized_routes

---

# Suggested Project Structure

```bash
wastewise/
│
├── client/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── assets/
│
├── server/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── models/
│   ├── services/
│   └── config/
│
├── blockchain/
│   ├── contracts/
│   ├── scripts/
│   └── tests/
│
├── ai-verification/
│   ├── dataset/
│   ├── models/
│   └── inference/
│
├── optimization/
│   ├── algorithms/
│   └── simulations/
│
├── docs/
│
├── README.md
├── package.json
└── .gitignore
```

---

# Installation

## Clone Repository

```bash
git clone https://github.com/your-username/wastewise.git

cd wastewise
```

---

## Install Frontend Dependencies

```bash
cd client

npm install
```

---

## Install Backend Dependencies

```bash
cd ../server

npm install
```

---

## Install AI Dependencies

```bash
cd ../ai-verification

pip install -r requirements.txt
```

---

# Environment Variables

Create a `.env` file inside the `server` directory.

```env
PORT=5000

DB_URL=your_database_url

JWT_SECRET=your_secret_key

BLOCKCHAIN_RPC=your_rpc_url

PRIVATE_KEY=your_wallet_private_key
```

---

# Running the Application

## Start Backend Server

```bash
cd server

npm run dev
```

---

## Start Frontend

```bash
cd client

npm start
```

---

## Start AI Verification Service

```bash
python app.py
```

---

# Smart Contract Workflow

1. User uploads waste image/video
2. AI verifies the submission
3. Verification score is generated
4. Smart contract calculates reward
5. Tokens are transferred to user wallet
6. Transaction is recorded on blockchain

---

# API Endpoints

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login user |

---

## Waste Submissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/submissions | Submit waste |
| GET | /api/submissions | Get submissions |

---

## Rewards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/rewards | Get rewards |
| POST | /api/rewards/claim | Claim rewards |

---

# Testing

The system will include:

- Unit Testing
- API Testing
- Smart Contract Testing
- AI Model Evaluation
- User Acceptance Testing

---

# Future Improvements

- IoT smart bin integration
- NFT-based environmental rewards
- Real-time route optimization
- Mobile push notifications
- Advanced fraud detection
- Carbon credit integration

---

# Contributors

- Antony Omondi
- Mark Kungu
- Allan Mutai

Supervisor:
- Prof. Stephen Kimani

---

# License

This project is intended for academic and research purposes.

---

# Vision

WasteWise aims to create a transparent, rewarding, and community-driven recycling ecosystem using blockchain technology, artificial intelligence, and optimization systems to support cleaner and smarter cities.