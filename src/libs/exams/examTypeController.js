import { dynamoDB } from "@/src/utils/awsAgent";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const MASTER_TABLE = `${process.env.AWS_DB_NAME}master`;
const MASTER_INDEX_NAME = "masterTableIndex";

export async function getAllMockExamByGoalID(goalID) {
  if (!goalID) {
    throw new Error("getMockExamByGoalID: goalID is required");
  }

  const params = {
    TableName: MASTER_TABLE,
    IndexName: MASTER_INDEX_NAME,
    KeyConditionExpression: "#gsiPK = :pk AND #gsiSK = :sk",
    FilterExpression: "#sKey = :skey AND goalID = :goalID AND isLive = :isLive",
    ExpressionAttributeNames: {
      "#gsiPK": "GSI1-pKey",
      "#gsiSK": "GSI1-sKey",
      "#sKey": "sKey",
      "#type": "type", // alias reserved word
      "#duration": "duration",
    },
    ExpressionAttributeValues: {
      ":pk": "EXAMS",
      ":sk": "EXAMS",
      ":skey": "EXAMS@mock",
      ":goalID": goalID,
      ":isLive": true,
    },
    ProjectionExpression: [
      "pKey",
      "title",
      "#type", // use alias here
      "#duration", // use alias here
      "totalQuestions",
      "totalSections",
      "totalMarks",
      "settings",
      "startTimeStamp",
      "endTimeStamp",
      "isLifeTime",
      "isLive",
      "goalID",
    ].join(", "),
  };

  try {
    // The EXAMS partition holds every exam in the system; the filter only
    // applies within each 1MB page, so we must follow LastEvaluatedKey.
    const Items = [];
    let ExclusiveStartKey;
    do {
      const response = await dynamoDB.send(
        new QueryCommand({ ...params, ExclusiveStartKey })
      );
      Items.push(...(response.Items || []));
      ExclusiveStartKey = response.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    if (Items.length === 0) {
      return {
        success: true,
        data: [],
        message: "No live mock exam found",
      };
    }

    const data = Items.map((item) => ({
      id: item.pKey.split("#")[1],
      title: item.title,
      type: item.type,
      duration: item.duration,
      totalQuestions: item.totalQuestions,
      totalSections: item.totalSections,
      totalMarks: item.totalMarks,
      settings: item.settings,
      startTimeStamp: item.startTimeStamp,
      endTimeStamp: item.endTimeStamp,
      isLifeTime: item.isLifeTime,
      isLive: item.isLive,
      goalID: item.goalID,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("getMockExamByGoalID error:", err);
    throw new Error("Failed to fetch live mock exam");
  }
}

export async function getAllGroupExamsByGoalID(goalID) {
  if (!goalID) {
    throw new Error("getAllGroupExamsByGoalID: goalID is required");
  }

  const params = {
    TableName: MASTER_TABLE,
    IndexName: MASTER_INDEX_NAME,
    KeyConditionExpression: "#gsiPK = :pk AND #gsiSK = :sk",
    FilterExpression: "#sKey = :skey AND isLive = :isLive",
    ExpressionAttributeNames: {
      "#gsiPK": "GSI1-pKey",
      "#gsiSK": "GSI1-sKey",
      "#sKey": "sKey",
    },
    ExpressionAttributeValues: {
      ":pk": "EXAM_GROUP",
      ":sk": "EXAM_GROUP",
      ":skey": `EXAM_GROUPS@${goalID}`,
      ":isLive": true,
    },
  };

  try {
    // Shared EXAM_GROUP partition + FilterExpression: paginate, see above.
    const Items = [];
    let ExclusiveStartKey;
    do {
      const response = await dynamoDB.send(
        new QueryCommand({ ...params, ExclusiveStartKey })
      );
      Items.push(...(response.Items || []));
      ExclusiveStartKey = response.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    if (Items.length === 0) {
      return {
        success: true,
        data: [],
        message: "No live mock exam found",
      };
    }

    const data = Items.map((item) => ({
      ...item,
      id: item.pKey.split("#")[1],
      pKey: undefined,
      sKey: undefined,
      "GSI1-pKey": undefined,
      "GSI1-sKey": undefined,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("getAllGroupExamsByGoalID error:", err);
    throw new Error("Failed to fetch live mock exam");
  }
}

export async function getAllGroupExamsByGroupID(groupID) {
  if (!groupID) {
    throw new Error("getAllGroupExamsByGroupID: groupID is required");
  }

  const params = {
    TableName: MASTER_TABLE,
    IndexName: MASTER_INDEX_NAME,
    KeyConditionExpression: "#gsiPK = :pk AND #gsiSK = :sk",
    FilterExpression:
      "#sKey = :skey AND isLive = :isLive AND groupID = :groupID",
    ExpressionAttributeNames: {
      "#gsiPK": "GSI1-pKey",
      "#gsiSK": "GSI1-sKey",
      "#sKey": "sKey",
      "#type": "type", // alias reserved word
      "#duration": "duration",
    },
    ExpressionAttributeValues: {
      ":pk": "EXAMS",
      ":sk": "EXAMS",
      ":skey": "EXAMS@group",
      ":isLive": true,
      ":groupID": groupID,
    },
    ProjectionExpression: [
      "pKey",
      "title",
      "#type", // use alias here
      "#duration", // use alias here
      "totalQuestions",
      "totalSections",
      "totalMarks",
      "settings",
      "startTimeStamp",
      "endTimeStamp",
      "isLifeTime",
      "isLive",
      "goalID",
    ].join(", "),
  };

  try {
    // Shared EXAMS partition + FilterExpression: paginate, see above.
    const Items = [];
    let ExclusiveStartKey;
    do {
      const response = await dynamoDB.send(
        new QueryCommand({ ...params, ExclusiveStartKey })
      );
      Items.push(...(response.Items || []));
      ExclusiveStartKey = response.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    if (Items.length === 0) {
      return {
        success: true,
        data: [],
        message: "No live mock exam found",
      };
    }

    const data = Items.map((item) => ({
      id: item.pKey.split("#")[1],
      title: item.title,
      type: item.type,
      duration: item.duration,
      totalQuestions: item.totalQuestions,
      totalSections: item.totalSections,
      totalMarks: item.totalMarks,
      settings: item.settings,
      startTimeStamp: item.startTimeStamp,
      endTimeStamp: item.endTimeStamp,
      isLifeTime: item.isLifeTime,
      isLive: item.isLive,
      goalID: item.goalID,
    }));

    return { success: true, data };
  } catch (err) {
    console.error("getAllGroupExamsByGroupID error:", err);
    throw new Error("Failed to fetch live mock exam");
  }
}

export async function getGroupExamByID(groupID, goalID) {
  if (!groupID || !goalID) {
    throw new Error("getGroupExamByID: groupID and goalID are required");
  }

  const params = {
    TableName: MASTER_TABLE,
    Key: {
      pKey: `EXAM_GROUP#${groupID}`,
      sKey: `EXAM_GROUPS@${goalID}`,
    },
  };

  try {
    const { Item = null } = await dynamoDB.send(new GetCommand(params));
    if (!Item) {
      return {
        success: true,
        data: null,
        message: "Exam group not found",
      };
    }

    if (Item.isLive === false) {
      return {
        success: true,
        data: null,
        message: "Exam group is not live",
      };
    }

    const data = {
      ...Item,
      id: Item.pKey.split("#")[1],
      pKey: undefined,
      sKey: undefined,
      "GSI1-pKey": undefined,
      "GSI1-sKey": undefined,
    };

    return { success: true, data };
  } catch (err) {
    console.error("getGroupExamByID error:", err);
    throw new Error("Failed to fetch group exam");
  }
}