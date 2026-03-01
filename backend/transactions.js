const pool = require("./db");

const saveTransactions = async (transactions) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const queryText = `
      INSERT INTO transactions(transaction_id, sender_id, receiver_id, amount, timestamp)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (transaction_id) DO NOTHING;
    `;

    for (const transaction of transactions) {
      await client.query(queryText, [
        transaction.transaction_id,
        transaction.sender_id,
        transaction.receiver_id,
        transaction.amount,
        new Date(transaction.timestamp),
      ]);
    }
    await client.query("COMMIT");
    return { success: true, message: `${transactions.length} transactions processed.` };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

module.exports = { saveTransactions };
