import { dynamoDB } from "@/src/utils/awsAgent";
import {
  QueryCommand,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const MASTER_TABLE = `${process.env.AWS_DB_NAME}master`;
const MASTER_INDEX_TABLE = "masterTableIndex";
const USER_TABLE = `${process.env.AWS_DB_NAME}users`;

export async function getBatchByCode(batchCode) {
  const batchResponse = await dynamoDB.send(
    new QueryCommand({
      TableName: MASTER_TABLE,
      IndexName: MASTER_INDEX_TABLE,
      KeyConditionExpression: "#gsi1pk = :pk",
      FilterExpression: "batchCode = :batchCode",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1-pKey" },
      ExpressionAttributeValues: {
        ":pk": "BATCHES",
        ":batchCode": batchCode,
      },
    })
  );

  const batch = batchResponse.Items?.[0];
  if (!batch) {
    return { success: false, message: "Batch not found" };
  }

  return {
    success: true,
    message: "Batch fetched successfully",
    data: {
      title: batch.title,
      tags: batch.tags || [],
      instituteMeta: batch.instituteMeta,
    },
  };
}

export async function enrollStudent(userID, batchCode, rollNo, tag) {
  const now = Date.now();

  // 1) Look up the batch by code via your GSI
  const batchResponse = await dynamoDB.send(
    new QueryCommand({
      TableName: MASTER_TABLE,
      IndexName: MASTER_INDEX_TABLE,
      KeyConditionExpression: "#gsi1pk = :pk",
      FilterExpression: "batchCode = :batchCode",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1-pKey" },
      ExpressionAttributeValues: {
        ":pk": "BATCHES",
        ":batchCode": batchCode,
      },
    })
  );

  const batch = batchResponse.Items?.[0];
  if (!batch) {
    return { success: false, message: "Batch not found" };
  }
  if ((batch.enrolledStudentCount || 0) >= batch.capacity) {
    return { success: false, message: "Batch is full" };
  }

  // 2) Fetch the user
  const { Item: user } = await dynamoDB.send(
    new GetCommand({
      TableName: USER_TABLE,
      Key: {
        pKey: `USER#${userID}`,
        sKey: `USER#${userID}`,
      },
    })
  );
  if (!user) {
    return { success: false, message: "User not found" };
  }

  const batchID = batch.pKey.split("#")[1];

  // 3) Build and run a transaction
  const transactItems = [
    {
      Put: {
        TableName: MASTER_TABLE,
        Item: {
          pKey: `STUDENT_BATCH#${userID}`,
          sKey: `STUDENT_BATCH@${batchID}`,
          "GSI1-pKey": "STUDENT_BATCHES",
          "GSI1-sKey": `STUDENT_BATCH@${batchID}`,
          userID,
          batchID,
          studentMeta: {
            name: user.name,
            email: user.email,
          },
          batchMeta: {
            title: batch.title,
            instituteID: batch.instituteID,
            instituteMeta: batch.instituteMeta,
          },
          rollNo: rollNo || null,
          tag: tag || null, // Store selected tag
          joinedAt: now,
        },
        ConditionExpression: "attribute_not_exists(pKey)",
      },
    },
    {
      Update: {
        TableName: MASTER_TABLE,
        Key: {
          pKey: `BATCH#${batchID}`,
          sKey: "BATCHES",
        },
        UpdateExpression: "ADD enrolledStudentCount :inc",
        ExpressionAttributeValues: {
          ":inc": 1,
        },
      },
    },
  ];

  await dynamoDB.send(
    new TransactWriteCommand({ TransactItems: transactItems })
  );

  return {
    success: true,
    message: "Batch enrolled successfully",
  };
}

export async function getUserBatches(userID) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const batchResponse = await dynamoDB.send(
      new QueryCommand({
        TableName: MASTER_TABLE,
        KeyConditionExpression: "pKey = :pk AND begins_with(sKey, :sk)",
        ExpressionAttributeValues: {
          ":pk": `STUDENT_BATCH#${userID}`,
          ":sk": "STUDENT_BATCH@",
        },
        ExclusiveStartKey,
      })
    );
    items.push(...(batchResponse.Items || []));
    ExclusiveStartKey = batchResponse.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return {
    success: true,
    message: "Batch fetched successfully",
    data: items.map((item) => ({
      ...item,
      pKey: undefined,
      sKey: undefined,
      "GSI1-pKey": undefined,
      "GSI1-sKey": undefined,
    })),
  };
}

export async function getStudentEnrolledBatch(userID, batchID) {
  const batchResponse = await dynamoDB.send(
    new GetCommand({
      TableName: MASTER_TABLE,
      Key: {
        pKey: `STUDENT_BATCH#${userID}`,
        sKey: `STUDENT_BATCH@${batchID}`,
      },
    })
  );
  return {
    success: true,
    message: "Batch fetched successfully",
    data: {
      ...batchResponse.Item,
      pKey: undefined,
      sKey: undefined,
      "GSI1-pKey": undefined,
      "GSI1-sKey": undefined,
    },
  };
}

export async function getTotalClassroomJoins(userID) {
  let count = 0;
  let ExclusiveStartKey;
  do {
    const response = await dynamoDB.send(
      new QueryCommand({
        TableName: MASTER_TABLE,
        KeyConditionExpression: "pKey = :pk AND begins_with(sKey, :sk)",
        ExpressionAttributeValues: {
          ":pk": `STUDENT_BATCH#${userID}`,
          ":sk": "STUDENT_BATCH@",
        },
        Select: "COUNT",
        ExclusiveStartKey,
      })
    );
    count += response.Count || 0;
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return {
    success: true,
    message: "Total classroom joins for user fetched successfully",
    data: {
      count,
    },
  };
}

export async function leaveBatch(userID, batchID) {
  try {
    await dynamoDB.send(
      new TransactWriteCommand({
        TransactItems: [
          // 1) Delete the join record
          {
            Delete: {
              TableName: MASTER_TABLE,
              Key: {
                pKey: `STUDENT_BATCH#${userID}`,
                sKey: `STUDENT_BATCH@${batchID}`,
              },
              ConditionExpression:
                "attribute_exists(pKey) AND attribute_exists(sKey)",
            },
          },
          // 2) Decrement enrolledStudentCount, but only if > 0
          {
            Update: {
              TableName: MASTER_TABLE,
              Key: {
                pKey: `BATCH#${batchID}`,
                sKey: "BATCHES",
              },
              UpdateExpression:
                "SET enrolledStudentCount = enrolledStudentCount - :dec, updatedAt = :u",
              ConditionExpression:
                "attribute_exists(pKey) AND enrolledStudentCount > :zero",
              ExpressionAttributeValues: {
                ":dec": 1,
                ":u": Date.now(),
                ":zero": 0,
              },
            },
          },
        ],
      })
    );

    return { success: true, message: "Successfully left the batch" };
  } catch (err) {
    console.error("Error in leaveBatch:", err);
    if (
      err.message.includes("ConditionalCheckFailed") ||
      (err.CancellationReasons &&
        err.CancellationReasons.some(
          (r) => r.Code === "ConditionalCheckFailed"
        ))
    ) {
      // determine which one failed?
      // Index 0 failed: User wasn't in batch
      // Index 1 failed: Count was 0? (Unlikely if user was in batch)
      return {
        success: false,
        message: "You are not enrolled in this batch or the batch is invalid.",
      };
    }
    return { success: false, message: "Error leaving batch" };
  }
}

export async function updateBatchRollNo(userID, batchID, rollNo) {
  try {
    await dynamoDB.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: MASTER_TABLE,
              Key: {
                pKey: `STUDENT_BATCH#${userID}`,
                sKey: `STUDENT_BATCH@${batchID}`,
              },
              UpdateExpression: "SET rollNo = :rollNo",
              ExpressionAttributeValues: {
                ":rollNo": rollNo,
              },
              ConditionExpression:
                "attribute_exists(pKey) AND attribute_exists(sKey)",
            },
          },
        ],
      })
    );

    return { success: true, message: "Roll number updated successfully" };
  } catch (err) {
    if (
      err.message.includes("ConditionalCheckFailed") ||
      (err.CancellationReasons &&
        err.CancellationReasons.some(
          (r) => r.Code === "ConditionalCheckFailed"
        ))
    ) {
      return { success: false, message: "Batch enrollment not found" };
    }
    console.error("Error in updateBatchRollNo:", err);
    return { success: false, message: "Error updating roll number" };
  }
}
