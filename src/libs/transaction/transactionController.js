import { dynamoDB } from "@/src/utils/awsAgent";
import {
  PutCommand,
  UpdateCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import {
  razorpay,
  createOrder,
  verifyPaymentWithSignature,
  getOrderStatus,
} from "@/src/utils/razorpay";

const USER_TABLE = `${process.env.AWS_DB_NAME}users`;
const USER_TABLE_INDEX = "GSI1-index";
const MASTER_TABLE = `${process.env.AWS_DB_NAME}master`;

export async function createTransaction({
  userID,
  document,
  amount,
  userMeta,
  itemName,
}) {
  if (!userID || !document || typeof amount !== "number" || isNaN(amount) || amount <= 0 || !userMeta) {
    throw new Error("createTransaction: missing or invalid parameters (amount must be a positive number)");
  }
  const now = Date.now();
  const transactionID = randomUUID();

  const notes = {};
  if (itemName) {
    notes.itemName = itemName;
  }
  const order = await createOrder(amount, userID, notes);

  await dynamoDB.send(
    new PutCommand({
      TableName: USER_TABLE,
      Item: {
        pKey: `TRANSACTION#${transactionID}`,
        sKey: `TRANSACTIONS@${userID}`,
        "GSI1-pKey": `TRANSACTION#${order.id}`,
        "GSI1-sKey": "TRANSACTIONS",
        document,
        userMeta,
        amount,
        order,
        paymentDetails: null,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: "attribute_not_exists(pKey)",
    })
  );

  const transaction = await getTransaction({ transactionID, userID });
  return transaction;
}

export async function verifyPayment({
  userID,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  if (!userID || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new Error("verifyPayment: missing parameters");
  }

  const transaction = await getTransaction({ razorpayOrderId });
  if (!transaction) {
    throw new Error("Transaction not found");
  }
  if (transaction.sKey !== `TRANSACTIONS@${userID}`) {
    throw new Error("Unauthorized: Transaction does not belong to user");
  }

  const payment = await verifyPaymentWithSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  const now = Date.now();
  const paymentDetails = {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    method: payment.method,
    status: payment.status,
    captured: payment.status === "captured",
    amount: payment.amount,
    currency: payment.currency,
    createdAt: payment.created_at,
  };

  // Re-running this for an already-completed transaction is safe and also
  // repairs a purchase whose activation failed on an earlier attempt.
  if (payment.status === "captured") {
    await settleCapturedPayment(transaction, paymentDetails, now);
    return {
      success: true,
      message: "Payment verified",
      status: "completed",
    };
  }

  const transactionStatus =
    payment.status === "failed" || payment.status === "refunded"
      ? "failed"
      : "pending";

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { pKey: transaction.pKey, sKey: transaction.sKey },
        ConditionExpression: "#status = :pendingStatus",
        UpdateExpression:
          "set paymentDetails = :paymentDetails, #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":paymentDetails": paymentDetails,
          ":status": transactionStatus,
          ":updatedAt": now,
          ":pendingStatus": "pending",
        },
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
    // No longer pending — report the real state instead of assuming success.
    const current = await getTransaction({ razorpayOrderId });
    return {
      success: true,
      message: `Transaction is ${current.status}`,
      status: current.status,
    };
  }

  return {
    success: true,
    message: "Payment verified",
    status: transactionStatus,
  };
}

export async function getTransaction({
  transactionID,
  userID,
  razorpayOrderId,
}) {
  if (!transactionID && !userID && !razorpayOrderId) {
    throw new Error("getTransaction: missing parameters");
  }

  if (transactionID && userID) {
    const params = {
      TableName: USER_TABLE,
      Key: {
        pKey: `TRANSACTION#${transactionID}`,
        sKey: `TRANSACTIONS@${userID}`,
      },
      ConsistentRead: true,
    };

    const transactionResult = await dynamoDB.send(new GetCommand(params));
    if (!transactionResult.Item) {
      throw new Error("Transaction not found");
    }
    return transactionResult.Item;
  } else if (razorpayOrderId) {
    const params = {
      TableName: USER_TABLE,
      IndexName: USER_TABLE_INDEX,
      KeyConditionExpression: "#gsi1pKey = :gsi1pKey AND #gsi1sKey = :gsi1sKey",
      ExpressionAttributeNames: {
        "#gsi1pKey": "GSI1-pKey",
        "#gsi1sKey": "GSI1-sKey",
      },
      ExpressionAttributeValues: {
        ":gsi1pKey": `TRANSACTION#${razorpayOrderId}`,
        ":gsi1sKey": "TRANSACTIONS",
      },
    };

    const queryResult = await dynamoDB.send(new QueryCommand(params));
    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new Error("Transaction not found");
    }
    return queryResult.Items[0];
  }

  throw new Error("Invalid parameters for getTransaction");
}

export async function cancelTransaction({
  transactionID,
  razorpayOrderId,
  userID,
}) {
  if (!transactionID || !razorpayOrderId || !userID) {
    throw new Error("cancelTransaction: missing parameters");
  }

  const transaction = await getTransaction({ razorpayOrderId });
  if (!transaction) {
    throw new Error("Transaction not found");
  }
  if (`TRANSACTION#${transactionID}` !== transaction.pKey) {
    throw new Error("Transaction ID and order ID do not match");
  }

  if (transaction.sKey !== `TRANSACTIONS@${userID}`) {
    throw new Error("Unauthorized: Transaction does not belong to user");
  }

  if (transaction.status === "completed") {
    throw new Error("Cannot cancel a completed transaction");
  }

  const now = Date.now();
  const updateParams = {
    TableName: USER_TABLE,
    Key: {
      pKey: transaction.pKey,
      sKey: transaction.sKey,
    },
    UpdateExpression: "set #status = :status, updatedAt = :updatedAt",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    // Only cancel if still pending — never cancel a completed payment.
    ConditionExpression: "#status = :pendingStatus",
    ExpressionAttributeValues: {
      ":status": "cancelled",
      ":updatedAt": now,
      ":pendingStatus": "pending",
    },
  };

  try {
    await dynamoDB.send(new UpdateCommand(updateParams));
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new Error("Cannot cancel — transaction is no longer pending");
    }
    throw err;
  }

  return {
    success: true,
    message: "Transaction cancelled successfully",
  };
}

export async function checkAndUpdateTransactionStatus({
  transactionID,
  razorpayOrderId,
  userID,
}) {
  if (!transactionID || !razorpayOrderId || !userID) {
    throw new Error("checkAndUpdateTransactionStatus: missing parameters");
  }

  const transaction = await getTransaction({ razorpayOrderId });
  if (!transaction) {
    throw new Error("Transaction not found");
  }
  if (`TRANSACTION#${transactionID}` !== transaction.pKey) {
    throw new Error("Transaction ID and order ID do not match");
  }

  if (transaction.sKey !== `TRANSACTIONS@${userID}`) {
    throw new Error("Unauthorized: Transaction does not belong to user");
  }

  const now = Date.now();

  // Completion is only ever recorded after Razorpay reported a captured
  // payment; make sure the purchase itself was activated too (older code
  // could mark a transaction completed without activating it).
  if (transaction.status === "completed") {
    await grantEntitlement(transaction, now);
    return {
      success: true,
      message: "Transaction already in completed state",
      status: "completed",
    };
  }

  // Razorpay is the source of truth for money: ask it before deciding,
  // whatever the transaction's age or local status (a UPI payment can
  // complete after the modal was dismissed and the row was cancelled).
  const order = await getOrderStatus(razorpayOrderId);
  let payments = [];
  if (order.status === "paid") {
    try {
      const result = await razorpay.orders.fetchPayments(razorpayOrderId);
      payments = result.items || []; // newest first
    } catch (error) {
      console.error("Error fetching payment status:", error);
    }

    const captured = payments.find((p) => p.status === "captured");
    if (captured) {
      await settleCapturedPayment(
        transaction,
        {
          razorpayOrderId,
          razorpayPaymentId: captured.id,
          method: captured.method,
          status: captured.status,
          captured: true,
          amount: captured.amount,
          currency: captured.currency,
          createdAt: captured.created_at,
        },
        now
      );
      return {
        success: true,
        message: "Transaction status updated to completed",
        status: "completed",
      };
    }
  }

  if (transaction.status !== "pending") {
    return {
      success: true,
      message: `Transaction already in ${transaction.status} state`,
      status: transaction.status,
    };
  }

  const timeoutThreshold = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const isExpired = now - transaction.createdAt > timeoutThreshold;
  let newStatus;

  if (order.status === "created" || order.status === "attempted") {
    // Never paid — give up on it only after 24 hours.
    newStatus = isExpired ? "cancelled" : "pending";
  } else if (order.status === "paid") {
    // Paid order but no captured payment yet (e.g. only "authorized").
    const latest = payments[0];
    newStatus =
      latest?.status === "failed" || latest?.status === "refunded"
        ? "failed"
        : "pending";
  } else {
    newStatus = "cancelled"; // Any other order status
  }

  // Update transaction status in DynamoDB if changed — but only if it's
  // still pending, so we don't overwrite a completion from verifyPayment
  // that raced with this status check.
  if (transaction.status !== newStatus) {
    const updateParams = {
      TableName: USER_TABLE,
      Key: {
        pKey: transaction.pKey,
        sKey: transaction.sKey,
      },
      ConditionExpression: "#status = :currentStatus",
      UpdateExpression: "set #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": newStatus,
        ":updatedAt": now,
        ":currentStatus": transaction.status,
      },
    };

    try {
      await dynamoDB.send(new UpdateCommand(updateParams));
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        // Transaction was updated concurrently — re-read and return its
        // current state so the caller doesn't act on stale data.
        const fresh = await getTransaction({ razorpayOrderId });
        return {
          success: true,
          message: `Transaction status is ${fresh.status}`,
          status: fresh.status,
        };
      }
      throw err;
    }
  }

  return {
    success: true,
    message: `Transaction status updated to ${newStatus}`,
    status: newStatus,
  };
}

export async function getUserTransactions({ userID }) {
  if (!userID) {
    throw new Error("User ID is required");
  }

  const params = {
    TableName: USER_TABLE,
    FilterExpression: "#sKey = :sKey AND begins_with(#pKey, :pKeyPrefix)",
    ExpressionAttributeNames: {
      "#pKey": "pKey",
      "#sKey": "sKey",
    },
    ExpressionAttributeValues: {
      ":pKeyPrefix": "TRANSACTION#",
      ":sKey": `TRANSACTIONS@${userID}`,
    },
  };

  try {
    let allItems = [];
    let lastEvaluatedKey = undefined;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDB.send(new ScanCommand(params));
      if (result.Items) {
        allItems = [...allItems, ...result.Items];
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Filter valid transactions server-side
    const validTransactions = allItems.filter((item) => {
      if (!item.status) {
        // console.warn("Transaction missing status:", item);
        return false;
      }
      return [
        "pending",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ].includes(item.status);
    });

    return {
      success: true,
      data: validTransactions,
      message:
        validTransactions.length > 0
          ? "Transactions retrieved successfully"
          : "No transactions found",
    };
  } catch (error) {
    console.error("Error fetching user transactions:", error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }
}

// Settles a payment Razorpay reports as captured. The purchase is activated
// BEFORE the transaction is marked completed: if activation fails, the
// transaction stays open and any retry (verify or status check) finishes the
// job. Both writes are conditional, so repeats and races are no-ops.
async function settleCapturedPayment(transaction, paymentDetails, now) {
  await grantEntitlement(transaction, now);
  await markTransactionCompleted(transaction, paymentDetails, now);
}

// Activates the purchased course/subscription row. Rows are created
// "inactive" with expiresAt = null and only this function activates them,
// so the condition matches exactly the never-activated rows. Returns true
// only for the call that actually activated.
async function grantEntitlement(transaction, now) {
  const { document } = transaction;
  const documentDetails = await getDocument(document.pKey, document.sKey);
  const expiresAt = calculateExpiresAt(
    documentDetails.plan.duration,
    documentDetails.plan.type,
    now
  );

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { pKey: document.pKey, sKey: document.sKey },
        ConditionExpression:
          "#status <> :active AND (attribute_not_exists(expiresAt) OR attribute_type(expiresAt, :nullType))",
        UpdateExpression:
          "set #status = :active, expiresAt = :expiresAt, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":active": "active",
          ":nullType": "NULL",
          ":expiresAt": expiresAt,
          ":updatedAt": now,
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return false;
    throw err;
  }

  await recordCouponRedemption(documentDetails);
  return true;
}

async function recordCouponRedemption(documentDetails) {
  const couponId = documentDetails.couponDetails?.id;
  if (!couponId) return;

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: MASTER_TABLE,
        Key: { pKey: `COUPON#${couponId}`, sKey: "COUPONS" },
        UpdateExpression:
          "SET redemptionCount = if_not_exists(redemptionCount, :zero) + :inc, totalDiscountGiven = if_not_exists(totalDiscountGiven, :zero) + :discount, totalSalesWithCoupon = if_not_exists(totalSalesWithCoupon, :zero) + :sales",
        ExpressionAttributeValues: {
          ":inc": 1,
          ":discount": documentDetails.priceBreakdown?.couponDiscount || 0,
          ":sales": documentDetails.priceBreakdown?.totalPrice || 0,
          ":zero": 0,
        },
      })
    );
  } catch (e) {
    // Analytics only — the purchase itself is already activated.
    console.error("Failed to update coupon analytics:", e);
  }
}

// Any non-completed state (pending, cancelled, failed) may move to completed:
// callers only get here after Razorpay reported a captured payment, e.g. a
// UPI payment that finished after the checkout modal was dismissed.
async function markTransactionCompleted(transaction, paymentDetails, now) {
  const values = {
    ":completed": "completed",
    ":updatedAt": now,
  };
  let UpdateExpression = "set #status = :completed, updatedAt = :updatedAt";
  if (paymentDetails) {
    UpdateExpression += ", paymentDetails = :paymentDetails";
    values[":paymentDetails"] = paymentDetails;
  }

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { pKey: transaction.pKey, sKey: transaction.sKey },
        ConditionExpression: "#status <> :completed",
        UpdateExpression,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: values,
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
  }
}

async function getDocument(pKey, sKey) {
  const params = {
    TableName: USER_TABLE,
    Key: {
      pKey: pKey,
      sKey: sKey,
    },
  };
  const result = await dynamoDB.send(new GetCommand(params));
  if (!result.Item) {
    throw new Error("Course enrollment not found");
  }
  return result.Item;
}

function calculateExpiresAt(duration, type, now) {
  const date = new Date(now);
  if (type === "MONTHLY") {
    const months = parseInt(duration);
    date.setMonth(date.getMonth() + months);
  }
  if (type === "YEARLY") {
    const years = parseInt(duration);
    date.setFullYear(date.getFullYear() + years);
  }
  return date.getTime();
}
