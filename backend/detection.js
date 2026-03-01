const { Pool } = require("pg");
const pool = require("./db");

// Helper function to get all transactions from the database (for now, will refactor later for specific batches)
const getAllTransactions = async () => {
  const res = await pool.query("SELECT * FROM transactions ORDER BY timestamp ASC");
  return res.rows;
};

// Basic Cycle Detection (simplified)
const detectFraudRings = (transactions) => {
  const adj = new Map(); // Adjacency list for the graph
  const accounts = new Set();

  for (const t of transactions) {
    if (!adj.has(t.sender_id)) adj.set(t.sender_id, []);
    adj.get(t.sender_id).push(t.receiver_id);
    accounts.add(t.sender_id);
    accounts.add(t.receiver_id);
  }

  const visited = new Set();
  const recursionStack = new Set();
  const fraudRings = [];
  let ringIdCounter = 1;

  const dfs = (u, path) => {
    visited.add(u);
    recursionStack.add(u);
    path.push(u);

    for (const v of (adj.get(u) || [])) {
      if (!visited.has(v)) {
        dfs(v, path);
      } else if (recursionStack.has(v)) {
        // Cycle detected
        const cycleStartIndex = path.indexOf(v);
        const cycle = path.slice(cycleStartIndex);
        if (cycle.length >= 3) { // Only consider cycles of length 3 or more
          fraudRings.push({
            ring_id: `RING-${ringIdCounter++}`,
            accounts: cycle,
            cycle_length: cycle.length,
            type: "Cycle Detection",
          });
        }
      }
    }
    recursionStack.delete(u);
    path.pop();
  };

  for (const account of accounts) {
    if (!visited.has(account)) {
      dfs(account, []);
    }
  }
  return fraudRings;
};

// Basic Smurfing Detection (simplified - fan-in/fan-out in a 72-hour window)
const detectSmurfing = (transactions) => {
  const fanIn = new Map(); // receiver -> [{sender, timestamp}]
  const fanOut = new Map(); // sender -> [{receiver, timestamp}]
  const windowMillis = 72 * 60 * 60 * 1000; // 72 hours

  for (const t of transactions) {
    const timestamp = new Date(t.timestamp).getTime();

    // Fan-in
    if (!fanIn.has(t.receiver_id)) fanIn.set(t.receiver_id, []);
    fanIn.get(t.receiver_id).push({ sender: t.sender_id, timestamp });

    // Fan-out
    if (!fanOut.has(t.sender_id)) fanOut.set(t.sender_id, []);
    fanOut.get(t.sender_id).push({ receiver: t.receiver_id, timestamp });
  }

  const smurfingResults = {
    fanIn: [],
    fanOut: [],
  };

  // Check fan-in patterns
  for (const [receiver, entries] of fanIn.entries()) {
    if (entries.length >= 10) { // 10+ senders
      const sortedEntries = entries.sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < sortedEntries.length; i++) {
        const windowStart = sortedEntries[i].timestamp;
        const windowEnd = windowStart + windowMillis;
        const sendersInWindow = new Set();
        for (let j = i; j < sortedEntries.length; j++) {
          if (sortedEntries[j].timestamp < windowEnd) {
            sendersInWindow.add(sortedEntries[j].sender);
          } else {
            break;
          }
        }
        if (sendersInWindow.size >= 10) {
          smurfingResults.fanIn.push({
            receiver: receiver,
            senders: Array.from(sendersInWindow),
            count: sendersInWindow.size,
          });
        }
      }
    }
  }

  // Check fan-out patterns
  for (const [sender, entries] of fanOut.entries()) {
    if (entries.length >= 10) { // 10+ receivers
      const sortedEntries = entries.sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < sortedEntries.length; i++) {
        const windowStart = sortedEntries[i].timestamp;
        const windowEnd = windowStart + windowMillis;
        const receiversInWindow = new Set();
        for (let j = i; j < sortedEntries.length; j++) {
          if (sortedEntries[j].timestamp < windowEnd) {
            receiversInWindow.add(sortedEntries[j].receiver);
          } else {
            break;
          }
        }
        if (receiversInWindow.size >= 10) {
          smurfingResults.fanOut.push({
            sender: sender,
            receivers: Array.from(receiversInWindow),
            count: receiversInWindow.size,
          });
        }
      }
    }
  }

  return smurfingResults;
};

// Basic Shell Chain Analysis (simplified - intermediaries with 2-3 transactions)
const detectShellChains = (transactions) => {
  const accountTransactionCount = new Map(); // account_id -> count
  const shellChains = [];

  for (const t of transactions) {
    accountTransactionCount.set(t.sender_id, (accountTransactionCount.get(t.sender_id) || 0) + 1);
    accountTransactionCount.set(t.receiver_id, (accountTransactionCount.get(t.receiver_id) || 0) + 1);
  }

  // Identify potential shell accounts (2-3 transactions)
  const potentialShellAccounts = Array.from(accountTransactionCount.entries())
    .filter(([, count]) => count >= 2 && count <= 3)
    .map(([accountId]) => accountId);

  // For simplicity, this is a basic check. A real shell chain analysis would involve graph traversal.
  // Here, we just return groups of connected transactions involving potential shell accounts.
  if (potentialShellAccounts.length > 0) {
    const adjacencyList = new Map();
    for (const t of transactions) {
      if (!adjacencyList.has(t.sender_id)) adjacencyList.set(t.sender_id, new Set());
      if (!adjacencyList.has(t.receiver_id)) adjacencyList.set(t.receiver_id, new Set());
      adjacencyList.get(t.sender_id).add(t.receiver_id);
      adjacencyList.get(t.receiver_id).add(t.sender_id); // Bidirectional for chain detection
    }

    const visited = new Set();
    let chainId = 1;

    const bfs = (startNode) => {
      const queue = [startNode];
      const currentChain = new Set();
      currentChain.add(startNode);
      visited.add(startNode);

      let head = 0;
      while (head < queue.length) {
        const u = queue[head++];
        for (const v of (adjacencyList.get(u) || [])) {
          if (!visited.has(v) && potentialShellAccounts.includes(v)) {
            visited.add(v);
            currentChain.add(v);
            queue.push(v);
          }
        }
      }
      if (currentChain.size > 1) { // A chain needs at least two accounts
        shellChains.push(Array.from(currentChain));
      }
    };

    for (const account of potentialShellAccounts) {
      if (!visited.has(account)) {
        bfs(account);
      }
    }
  }

  return shellChains;
};

const analyzeTransactions = async (newTransactions) => {
  // For a full analysis, we'd typically fetch all relevant transactions from the DB
  // For now, we'll use a mix of new and existing to demonstrate.
  const existingTransactions = await getAllTransactions();
  const allTransactions = [...existingTransactions, ...newTransactions];

  const fraudRings = detectFraudRings(allTransactions);
  const smurfing = detectSmurfing(allTransactions);
  const shellChains = detectShellChains(allTransactions);

  // Consolidate suspicious accounts and calculate scores
  const suspiciousAccountsMap = new Map(); // account_id -> { score, reasons }

  fraudRings.forEach(ring => {
    ring.accounts.forEach(accountId => {
      const acc = suspiciousAccountsMap.get(accountId) || { score: 0, reasons: [] };
      acc.score += 20; // Example score
      acc.reasons.push(`Part of fraud ring: ${ring.ring_id}`);
      suspiciousAccountsMap.set(accountId, acc);
    });
  });

  smurfing.fanIn.forEach(pattern => {
    const receiverAcc = suspiciousAccountsMap.get(pattern.receiver) || { score: 0, reasons: [] };
    receiverAcc.score += 15; // Example score
    receiverAcc.reasons.push(`Involved in fan-in smurfing pattern (receiver)`);
    suspiciousAccountsMap.set(pattern.receiver, receiverAcc);
    pattern.senders.forEach(sender => {
      const acc = suspiciousAccountsMap.get(sender) || { score: 0, reasons: [] };
      acc.score += 5; // Example score
      acc.reasons.push(`Involved in fan-in smurfing pattern (sender)`);
      suspiciousAccountsMap.set(sender, acc);
    });
  });

  smurfing.fanOut.forEach(pattern => {
    const senderAcc = suspiciousAccountsMap.get(pattern.sender) || { score: 0, reasons: [] };
    senderAcc.score += 15; // Example score
    senderAcc.reasons.push(`Involved in fan-out smurfing pattern (sender)`);
    suspiciousAccountsMap.set(pattern.sender, senderAcc);
    pattern.receivers.forEach(receiver => {
      const acc = suspiciousAccountsMap.get(receiver) || { score: 0, reasons: [] };
      acc.score += 5; // Example score
      acc.reasons.push(`Involved in fan-out smurfing pattern (receiver)`);
      suspiciousAccountsMap.set(receiver, acc);
    });
  });

  shellChains.forEach(chain => {
    chain.forEach(accountId => {
      const acc = suspiciousAccountsMap.get(accountId) || { score: 0, reasons: [] };
      acc.score += 10; // Example score
      acc.reasons.push(`Part of a shell chain`);
      suspiciousAccountsMap.set(accountId, acc);
    });
  });

  const suspicious_accounts = Array.from(suspiciousAccountsMap.entries()).map(([accountId, data]) => ({
    account_id: accountId,
    score: data.score,
    reasons: [...new Set(data.reasons)], // Ensure unique reasons
  }));

  // Build graph data for visualization
  const graphNodes = new Map();
  const graphEdges = [];

  allTransactions.forEach(t => {
    if (!graphNodes.has(t.sender_id)) {
      graphNodes.set(t.sender_id, { id: t.sender_id, suspicious: false, score: 0 });
    }
    if (!graphNodes.has(t.receiver_id)) {
      graphNodes.set(t.receiver_id, { id: t.receiver_id, suspicious: false, score: 0 });
    }
    graphEdges.push({
      source: t.sender_id,
      target: t.receiver_id,
      amount: parseFloat(t.amount),
      transaction_id: t.transaction_id,
    });
  });

  suspicious_accounts.forEach(acc => {
    if (graphNodes.has(acc.account_id)) {
      graphNodes.get(acc.account_id).suspicious = true;
      graphNodes.get(acc.account_id).score = acc.score;
    }
  });

  const uniqueAccounts = new Set();
  allTransactions.forEach(t => { uniqueAccounts.add(t.sender_id); uniqueAccounts.add(t.receiver_id); });

  const analysisResult = {
    suspicious_accounts,
    fraud_rings: fraudRings,
    smurfing: {
      fanIn: smurfing.fanIn.map(f => ({ receiver: f.receiver, senders: f.senders, count: f.count })),
      fanOut: smurfing.fanOut.map(f => ({ sender: f.sender, receivers: f.receivers, count: f.count })),
    },
    shell_chains: shellChains,
    graph: { nodes: Array.from(graphNodes.values()), edges: graphEdges },
    summary: {
      total_transactions: allTransactions.length,
      total_accounts: uniqueAccounts.size,
      suspicious_accounts_count: suspicious_accounts.length,
      fraud_rings_detected: fraudRings.length,
      smurfing_fan_in_detected: smurfing.fanIn.length,
      smurfing_fan_out_detected: smurfing.fanOut.length,
      shell_chains_detected: shellChains.length,
      analysis_timestamp: new Date().toISOString(),
    },
  };

  // Save detection results to DB (optional for now, but good for persistence)
  await saveDetectionResults(analysisResult);

  return analysisResult;
};

// Save detection results to the database
const saveDetectionResults = async (analysisResult) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clear previous results for simplicity in this prototype. In production, manage history.
    await client.query("DELETE FROM suspicious_accounts");
    await client.query("DELETE FROM fraud_rings");
    await client.query("DELETE FROM smurfing_results");
    await client.query("DELETE FROM shell_chains");

    // Save suspicious accounts
    for (const acc of analysisResult.suspicious_accounts) {
      await client.query(
        "INSERT INTO suspicious_accounts(account_id, score, reasons) VALUES ($1, $2, $3)",
        [acc.account_id, acc.score, acc.reasons]
      );
    }

    // Save fraud rings
    for (const ring of analysisResult.fraud_rings) {
      await client.query(
        "INSERT INTO fraud_rings(ring_id, accounts, cycle_length, type) VALUES ($1, $2, $3, $4)",
        [ring.ring_id, ring.accounts, ring.cycle_length, ring.type]
      );
    }

    // Save smurfing results (fan-in)
    for (const fi of analysisResult.smurfing.fanIn) {
      await client.query(
        "INSERT INTO smurfing_results(type, source_account, related_accounts, transaction_count) VALUES ($1, $2, $3, $4)",
        ["fanIn", fi.receiver, fi.senders, fi.count]
      );
    }

    // Save smurfing results (fan-out)
    for (const fo of analysisResult.smurfing.fanOut) {
      await client.query(
        "INSERT INTO smurfing_results(type, source_account, related_accounts, transaction_count) VALUES ($1, $2, $3, $4)",
        ["fanOut", fo.sender, fo.receivers, fo.count]
      );
    }

    // Save shell chains
    for (const chain of analysisResult.shell_chains) {
      await client.query(
        "INSERT INTO shell_chains(chain) VALUES ($1)",
        [chain]
      );
    }

    await client.query("COMMIT");
    console.log("Detection results saved to database.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error saving detection results:", e);
    throw e;
  } finally {
    client.release();
  }
};

module.exports = { analyzeTransactions };
