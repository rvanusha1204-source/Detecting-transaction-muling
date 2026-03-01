-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY,
    sender_id VARCHAR(255) NOT NULL,
    receiver_id VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Suspicious Accounts Table
CREATE TABLE IF NOT EXISTS suspicious_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id VARCHAR(255) UNIQUE NOT NULL,
    score NUMERIC(5, 2) NOT NULL,
    reasons TEXT[] NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fraud Rings Table
CREATE TABLE IF NOT EXISTS fraud_rings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ring_id VARCHAR(255) UNIQUE NOT NULL,
    accounts TEXT[] NOT NULL,
    cycle_length INTEGER NOT NULL,
    type VARCHAR(255) NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Smurfing Results Table
CREATE TABLE IF NOT EXISTS smurfing_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL, -- 'fanIn' or 'fanOut'
    source_account VARCHAR(255) NOT NULL, -- receiver for fanIn, sender for fanOut
    related_accounts TEXT[] NOT NULL, -- senders for fanIn, receivers for fanOut
    transaction_count INTEGER NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shell Chains Table
CREATE TABLE IF NOT EXISTS shell_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain TEXT[] NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);