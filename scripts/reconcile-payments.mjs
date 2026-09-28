// One-off repair for payments Razorpay captured but the app never activated
// (e.g. when verify-payment was blocked during the Sept 2026 domain move).
//
// Dry run (read-only, default):
//   node --env-file=.env.local --import ./scripts/register.mjs scripts/reconcile-payments.mjs --since=2026-09-01
// Apply fixes:
//   node --env-file=.env.local --import ./scripts/register.mjs scripts/reconcile-payments.mjs --since=2026-09-01 --apply
//
// --apply settles each flagged transaction through checkAndUpdateTransactionStatus,
// the same code path students hit from the transaction page.
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDB } from "@/src/utils/awsAgent";
import { razorpay, getOrderStatus } from "@/src/utils/razorpay";
import { checkAndUpdateTransactionStatus } from "@/src/libs/transaction/transactionController";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const APPLY = args.apply === true;
const since = new Date(args.since || Date.now() - 30 * 24 * 3600e3);
if (Number.isNaN(since.getTime())) throw new Error(`Invalid --since: ${args.since}`);
const USER_TABLE = `${process.env.AWS_DB_NAME}users`;

async function scanTransactions() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await dynamoDB.send(
      new ScanCommand({
        TableName: USER_TABLE,
        FilterExpression: "begins_with(pKey, :prefix) AND createdAt >= :since",
        ExpressionAttributeValues: { ":prefix": "TRANSACTION#", ":since": since.getTime() },
        ExclusiveStartKey,
      })
    );
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const isActivated = (doc) => doc?.status === "active" && typeof doc.expiresAt === "number";

async function classify(tx) {
  const orderId = tx.order?.id;
  const { Item: doc } = await dynamoDB.send(
    new GetCommand({ TableName: USER_TABLE, Key: { pKey: tx.document?.pKey, sKey: tx.document?.sKey } })
  );
  if (tx.status === "completed" && isActivated(doc)) return { action: null };
  if (!orderId) return { action: null, note: "no Razorpay order on transaction" };
  if (!doc) return { action: null, note: "purchase row missing — needs manual review" };

  const order = await getOrderStatus(orderId);
  let captured = false;
  if (order.status === "paid") {
    const { items = [] } = await razorpay.orders.fetchPayments(orderId);
    captured = items.some((p) => p.status === "captured");
  }
  // Completed transactions only ever came from a captured payment.
  const paid = captured || tx.status === "completed";
  if (!paid) return { action: null, orderStatus: order.status };
  if (!isActivated(doc) || tx.status !== "completed") {
    return { action: "settle", orderStatus: order.status, docStatus: doc.status };
  }
  return { action: null };
}

const transactions = await scanTransactions();
console.log(`Scanned ${transactions.length} transactions since ${since.toISOString()} (${APPLY ? "APPLY" : "DRY RUN"})\n`);

const flagged = [];
for (const tx of transactions.sort((a, b) => a.createdAt - b.createdAt)) {
  try {
    const c = await classify(tx);
    if (c.note) console.log(`  ! ${tx.pKey}: ${c.note}`);
    if (c.action) flagged.push({ tx, ...c });
  } catch (err) {
    console.log(`  ! ${tx.pKey}: classify failed — ${err.message}`);
  }
}

console.table(
  flagged.map(({ tx, orderStatus, docStatus }) => ({
    transaction: tx.pKey.split("#")[1],
    created: new Date(tx.createdAt).toISOString().slice(0, 16),
    user: tx.userMeta?.email ?? tx.sKey.split("@")[1],
    amount: tx.amount,
    txStatus: tx.status,
    razorpay: orderStatus,
    purchase: docStatus,
  }))
);
const total = flagged.reduce((s, f) => s + (Number(f.tx.amount) || 0), 0);
console.log(`\n${flagged.length} paid transaction(s) need settling, total ₹${total}.`);

if (!APPLY) {
  console.log("Dry run only — re-run with --apply to activate these purchases.");
  process.exit(0);
}

let ok = 0;
for (const { tx } of flagged) {
  try {
    const r = await checkAndUpdateTransactionStatus({
      transactionID: tx.pKey.split("#")[1],
      razorpayOrderId: tx.order.id,
      userID: tx.sKey.split("@")[1],
    });
    console.log(`  ✓ ${tx.pKey} -> ${r.status}`);
    if (r.status === "completed") ok++;
  } catch (err) {
    console.log(`  ✗ ${tx.pKey}: ${err.message}`);
  }
}
console.log(`\nSettled ${ok}/${flagged.length}.`);
