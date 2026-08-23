import { dynamoDB, s3 } from "@/src/utils/awsAgent";
import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const USER_TABLE = `${process.env.AWS_DB_NAME}users`;
const USER_GSI_INDEX = "GSI1-index";

// shared shape normalizer
function shapeAnswers(userAnswers = []) {
  return userAnswers.map((a) => ({
    questionID: a.questionID || "",
    selectedOptions: a.selectedOptions || [],
    blankAnswers: a.blankAnswers || [],
    markedForReview: a.markedForReview || false,
    timeSpentMs: a.timeSpentMs || 0,
    viewedAt: a.viewedAt || null,
    answeredAt: a.answeredAt || null,
  }));
}

/**
 * Compute scoring for a single question, with no partial credit for MSQ/FIB:
 * - MCQ: full pMark if correct choice, else nMark
 * - MSQ: full pMark only if exact match, else nMark
 * - FIB: full pMark only if all blanks correct, else nMark
 */
function scoreAnswer(meta, selectedOptions = [], blankAnswers = []) {
  let isCorrect = false;
  let pMark = 0;
  let nMark = 0;

  if (!meta || !meta.type) {
    return { isCorrect, pMark, nMark };
  }

  const metaPMark = Number(meta.pMark) || 0;
  const metaNMark = Number(meta.nMark) || 0;
  const opts = Array.isArray(selectedOptions) ? selectedOptions : [];
  const blanks = Array.isArray(blankAnswers) ? blankAnswers : [];

  switch (meta.type) {
    case "MCQ": {
      const sel = opts[0];
      if (sel != null && meta.correct?.[0]?.id === sel) {
        isCorrect = true;
        pMark = metaPMark;
      } else if (sel != null) {
        nMark = metaNMark;
      }
      break;
    }
    case "MSQ": {
      const correctArr = Array.isArray(meta.correct) ? meta.correct : [];
      const correctIds = new Set(correctArr.map((c) => c.id));
      const pickedIds = new Set(opts);
      if (pickedIds.size === 0) break;
      const exactMatch =
        pickedIds.size === correctIds.size &&
        [...pickedIds].every((id) => correctIds.has(id));

      if (exactMatch) {
        isCorrect = true;
        pMark = metaPMark;
      } else {
        nMark = metaNMark;
      }
      break;
    }
    case "FIB": {
      const metaBlanks = Array.isArray(meta.blanks) ? meta.blanks : [];
      if (
        metaBlanks.length === 0 ||
        blanks.length === 0 ||
        blanks.every((b) => !String(b || "").trim())
      ) {
        break;
      }
      const allCorrect = metaBlanks.every((blankMeta, idx) => {
        const ans = String(blanks[idx] || "").trim().toLowerCase();
        const correctAnswers = Array.isArray(blankMeta?.correctAnswers)
          ? blankMeta.correctAnswers
          : [];
        return correctAnswers
          .map((s) => String(s || "").trim().toLowerCase())
          .includes(ans);
      });
      if (allCorrect && blanks.length === metaBlanks.length) {
        isCorrect = true;
        pMark = metaPMark;
      } else {
        nMark = metaNMark;
      }
      break;
    }
    default:
      return { isCorrect, pMark, nMark };
  }

  return { isCorrect, pMark, nMark };
}

// helper to fetch the attempt item (ConsistentRead ensures we see the latest writes)
async function fetchAttempt(attemptID) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: USER_TABLE,
      Key: { pKey: `EXAM_ATTEMPT#${attemptID}`, sKey: "EXAM_ATTEMPTS" },
      ConsistentRead: true,
    })
  );
  if (!result.Item) throw new Error("Attempt not found");
  return result.Item;
}

// helper to fetch attempt with user ownership check
async function fetchAttemptForUser(attemptID, userID) {
  const attempt = await fetchAttempt(attemptID);
  if (attempt.userID !== userID) {
    throw new Error("Attempt not found");
  }
  return attempt;
}

// helper to write back a full updated userAnswers array
async function writeAnswers(attemptID, userAnswers) {
  await dynamoDB.send(
    new UpdateCommand({
      TableName: USER_TABLE,
      Key: { pKey: `EXAM_ATTEMPT#${attemptID}`, sKey: "EXAM_ATTEMPTS" },
      UpdateExpression: "SET userAnswers = :ua, updatedAt = :now",
      ExpressionAttributeValues: {
        ":ua": userAnswers,
        ":now": Date.now(),
      },
    })
  );
}

async function checkExamAttempt(attempt) {
  const { startTimeStamp, duration, status } = attempt;
  const now = Date.now();
  const timeLimit = startTimeStamp + (duration || 0) * 1000 * 60;
  if (status === "COMPLETED") {
    throw new Error("Exam attempt already completed");
  }
  // Allow a small grace period (30s) for in-flight answer saves that arrive
  // just after the timer expires. The client will submit after flushing saves.
  const GRACE_PERIOD_MS = 30_000;
  if (now > timeLimit + GRACE_PERIOD_MS && status === "IN_PROGRESS") {
    // Well past deadline — force auto-submit as a safety net
    try {
      await submitExam(attempt.id, "AUTO");
    } catch (err) {
      console.warn("Auto-submit during expiry check failed:", err?.message);
    }
    throw new Error("Exam attempt expired");
  }
}
// ——————————————————————————————————————————
// 1) Mark‐Viewed (fire‐and‐forget)
// ——————————————————————————————————————————
export async function viewQuestion(attemptID, questionID, userID) {
  // 1) Fetch the *current* attempt with ownership check
  const attempt = await fetchAttemptForUser(attemptID, userID);
  const { userAnswers: originalAnswers } = attempt;

  // Check if the exam attempt is expired
  await checkExamAttempt(attempt);

  // 2) If it's already there, just return it
  if (originalAnswers.some((a) => a.questionID === questionID)) {
    return {
      success: true,
      data: shapeAnswers(originalAnswers),
      serverTimestamp: Date.now(),
    };
  }

  // 3) Otherwise append via a conditional update
  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { pKey: `EXAM_ATTEMPT#${attemptID}`, sKey: "EXAM_ATTEMPTS" },
        // only append if not already present *in storage*
        ConditionExpression: "NOT contains(userAnswers, :qID)",
        UpdateExpression: `
          SET userAnswers = list_append(
            if_not_exists(userAnswers, :emptyList),
            :newItem
          ),
          updatedAt = :now
        `,
        ExpressionAttributeValues: {
          ":qID": questionID,
          ":emptyList": [],
          ":newItem": [
            {
              questionID,
              selectedOptions: [],
              blankAnswers: [],
              markedForReview: false,
              timeSpentMs: 0,
              viewedAt: Date.now(),
              isCorrect: false,
              pMarkObtained: 0,
              nMarkObtained: 0,
              answeredAt: null,
            },
          ],
          ":now": Date.now(),
        },
      })
    );
  } catch (err) {
    // ignore if someone else already wrote it
    if (err.name !== "ConditionalCheckFailedException") throw err;
  }

  // 4) Re-fetch the updated list from storage
  const { userAnswers: updatedAnswers } = await fetchAttempt(attemptID);

  // 5) Optional: dedupe in case of a race
  const unique = Array.from(
    new Map(updatedAnswers.map((u) => [u.questionID, u])).values()
  );

  return {
    success: true,
    data: shapeAnswers(unique),
    serverTimestamp: Date.now(),
  };
}

// ——————————————————————————————————————————
// 2) Submit‐Answer
// ——————————————————————————————————————————
/**
 * Records the student's response to one question, applying "all‑or‑nothing"
 * scoring for MSQ and FIB (no partial credit).
 */
export async function questionResponse(
  attemptID,
  questionID,
  selectedOptions = [],
  blankAnswers = [],
  timeSpentMs = 0,
  userID
) {
  if (!attemptID || !questionID || !userID) {
    throw new Error("Missing required parameters");
  }

  // 1) Load attempt data with ownership check
  const attempt = await fetchAttemptForUser(attemptID, userID);
  const { userAnswers = [], answerList = [] } = attempt;

  // Check if the exam attempt is expired
  await checkExamAttempt(attempt);

  // Server-side time enforcement: allow a grace period for in-flight saves
  // that arrive just after the client timer expires. The client waits for
  // all pending saves before submitting, so these saves must be accepted.
  const SAVE_GRACE_PERIOD_MS = 30_000;
  const now = Date.now();
  const deadline = attempt.startTimeStamp + (attempt.duration || 0) * 60000;
  if (now > deadline + SAVE_GRACE_PERIOD_MS) {
    throw new Error("Exam time has expired");
  }

  // 2) Map metadata by questionID for O(1) lookup
  const metaById = Object.fromEntries(
    (answerList || []).map((q) => [q.questionID, q])
  );

  // 3) Locate user answer slot
  const uaIdx = userAnswers.findIndex((a) => a.questionID === questionID);
  if (uaIdx < 0) throw new Error("Question not viewed yet");

  // 4) Fetch metadata
  const meta = metaById[questionID];
  if (!meta) throw new Error("Question metadata missing");

  // 5) Compute score
  const { isCorrect, pMark, nMark } = scoreAnswer(
    meta,
    selectedOptions,
    blankAnswers
  );

  // 6) Atomic positional update — write ONLY the fields of THIS question's
  // entry. Concurrent saves for different questions target disjoint paths
  // and apply without conflict. Two concurrent saves for the SAME question
  // resolve last-write-wins (latest answer wins, the correct semantic).
  // This replaces the previous read-modify-write of the entire userAnswers
  // array, which had a lost-update race when two saves were in flight at
  // the same time.
  const nowTs = Date.now();
  await dynamoDB.send(
    new UpdateCommand({
      TableName: USER_TABLE,
      Key: { pKey: `EXAM_ATTEMPT#${attemptID}`, sKey: "EXAM_ATTEMPTS" },
      // Guard against a race where the entry got removed/reshuffled between
      // our fetch and our write. If userAnswers[uaIdx].questionID no longer
      // matches, abort — caller can retry and recompute the index.
      ConditionExpression: "userAnswers[" + uaIdx + "].questionID = :qID",
      UpdateExpression:
        "SET userAnswers[" + uaIdx + "].selectedOptions = :opts, " +
        "userAnswers[" + uaIdx + "].blankAnswers   = :blanks, " +
        "userAnswers[" + uaIdx + "].timeSpentMs    = :ts, " +
        "userAnswers[" + uaIdx + "].answeredAt     = :now, " +
        "userAnswers[" + uaIdx + "].isCorrect      = :isCorrect, " +
        "userAnswers[" + uaIdx + "].pMarkObtained  = :pMark, " +
        "userAnswers[" + uaIdx + "].nMarkObtained  = :nMark, " +
        "updatedAt = :now",
      ExpressionAttributeValues: {
        ":qID": questionID,
        ":opts": selectedOptions || [],
        ":blanks": blankAnswers || [],
        ":ts": timeSpentMs || 0,
        ":now": nowTs,
        ":isCorrect": isCorrect,
        ":pMark": pMark,
        ":nMark": nMark,
      },
    })
  );

  // 7) Build the updated entry locally for the response (no extra read)
  userAnswers[uaIdx] = {
    ...userAnswers[uaIdx],
    selectedOptions: selectedOptions || [],
    blankAnswers: blankAnswers || [],
    timeSpentMs: timeSpentMs || 0,
    answeredAt: nowTs,
    isCorrect,
    pMarkObtained: pMark,
    nMarkObtained: nMark,
  };

  // 8) Return normalized state
  return {
    success: true,
    data: shapeAnswers(userAnswers),
    serverTimestamp: nowTs,
  };
}

// ——————————————————————————————————————————
// 3) Toggle‐Bookmark (example of a small flag update)
// ——————————————————————————————————————————
export async function toggleBookmark(attemptID, questionID, bookmarked, userID) {
  // similar pattern: fetch, find, update, write
  const attempt = await fetchAttemptForUser(attemptID, userID);
  const { userAnswers } = attempt;

  // Check if the exam attempt is expired
  await checkExamAttempt(attempt);

  const idx = userAnswers.findIndex((a) => a.questionID === questionID);
  if (idx === -1) {
    throw new Error("Question not viewed yet");
  }
  // Atomic positional update — same race-safety reasoning as questionResponse.
  const nowTs = Date.now();
  await dynamoDB.send(
    new UpdateCommand({
      TableName: USER_TABLE,
      Key: { pKey: `EXAM_ATTEMPT#${attemptID}`, sKey: "EXAM_ATTEMPTS" },
      ConditionExpression: "userAnswers[" + idx + "].questionID = :qID",
      UpdateExpression:
        "SET userAnswers[" + idx + "].markedForReview = :flag, updatedAt = :now",
      ExpressionAttributeValues: {
        ":qID": questionID,
        ":flag": !!bookmarked,
        ":now": nowTs,
      },
    })
  );
  userAnswers[idx].markedForReview = !!bookmarked;
  return {
    success: true,
    data: shapeAnswers(userAnswers),
    serverTimestamp: nowTs,
  };
}

// ——————————————————————————————————————————
// 4) Submit Exam
// ——————————————————————————————————————————
export async function submitExam(attemptID, endedBy = "USER", userID, clientSessionStats = null) {
  // 1) Load the full attempt
  const attempt = await fetchAttempt(attemptID);

  // Verify ownership (skip for AUTO submissions from server-side timer)
  if (userID && attempt.userID !== userID) {
    throw new Error("Attempt not found");
  }

  // Already completed — return success so the client can redirect to results
  if (attempt.status === "COMPLETED") {
    return { success: true, alreadySubmitted: true };
  }

  const { userAnswers = [], answerList = [], settings = {} } = attempt;

  //From userAnswers need to filter the duplicates
  const uniqueUserAnswers = userAnswers.filter(
    (ua, index, self) =>
      index === self.findIndex((t) => t.questionID === ua.questionID)
  );

  // 2) Compute aggregates in two passes
  // possibleMarks = sum of pMark
  const possibleMarks = answerList.reduce((sum, q) => sum + (q.pMark || 0), 0);

  // From userAnswers, tally attempted/correct/wrong/skipped and obtainedMarks
  const {
    totalAttemptedAnswers,
    totalCorrectAnswers,
    totalWrongAnswers,
    totalSkippedAnswers,
    obtainedMarks,
  } = uniqueUserAnswers.reduce(
    (acc, ua) => {
      if (ua.answeredAt != null) {
        acc.totalAttemptedAnswers++;
        if (ua.isCorrect) {
          acc.totalCorrectAnswers++;
        } else {
          acc.totalWrongAnswers++;
        }
        // subtract negative marks too
        acc.obtainedMarks += (ua.pMarkObtained || 0) - (ua.nMarkObtained || 0);
      } else if (ua.viewedAt != null) {
        acc.totalSkippedAnswers++;
      }
      return acc;
    },
    {
      totalAttemptedAnswers: 0,
      totalCorrectAnswers: 0,
      totalWrongAnswers: 0,
      totalSkippedAnswers: 0,
      obtainedMarks: 0,
    }
  );

  // 3) Compute final % score and reward
  const scorePercent = possibleMarks
    ? (obtainedMarks / possibleMarks) * 100
    : 0;

  const { mCoinReward = {} } = settings;
  const mCoinRewardEarned =
    mCoinReward.isEnabled && scorePercent >= (mCoinReward.conditionPercent || 0)
      ? mCoinReward.rewardCoin || 0
      : 0;

  // 4) Single UpdateCommand with ALL_NEW and conditional to prevent double submission
  const now = Date.now();
  try {
    const { Attributes: updated } = await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: {
          pKey: `EXAM_ATTEMPT#${attemptID}`,
          sKey: "EXAM_ATTEMPTS",
        },
        ConditionExpression: "#st <> :completed",
        UpdateExpression: `
          SET #st      = :status,
              endedAt  = :now,
              totalQuestions        = :totalQuestions,
              endedBy               = :endedBy,
              totalAttemptedAnswers = :totalAttemptedAnswers,
              totalCorrectAnswers   = :totalCorrectAnswers,
              totalWrongAnswers     = :totalWrongAnswers,
              totalSkippedAnswers   = :totalSkippedAnswers,
              obtainedMarks         = :obtainedMarks,
              totalMarks            = :possibleMarks,
              mCoinRewardEarned     = :mCoinRewardEarned,
              clientSessionStats    = :clientSessionStats,
              updatedAt             = :now,
              userAnswers           = :userAnswers
        `,
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":completed": "COMPLETED",
          ":status": "COMPLETED",
          ":now": now,
          ":totalQuestions": answerList.length,
          ":endedBy": endedBy,
          ":totalAttemptedAnswers": totalAttemptedAnswers,
          ":totalCorrectAnswers": totalCorrectAnswers,
          ":totalWrongAnswers": totalWrongAnswers,
          ":totalSkippedAnswers": totalSkippedAnswers,
          ":obtainedMarks": obtainedMarks,
          ":possibleMarks": possibleMarks,
          ":mCoinRewardEarned": mCoinRewardEarned,
          ":userAnswers": uniqueUserAnswers,
          // Forensic record of how the student's network behaved during
          // the exam. Null for AUTO submissions (server-initiated, no client).
          ":clientSessionStats": clientSessionStats || null,
        },
        ReturnValues: "ALL_NEW",
      })
    );

    if (!updated) {
      throw new Error("Failed to complete the exam");
    }

    // 5) Return the newly updated item directly (strip answerList from response)
    const { answerList: _removed, ...safeData } = updated;
    return {
      success: true,
      data: safeData,
    };
  } catch (err) {
    // Race condition: another request already completed the exam
    if (err.name === "ConditionalCheckFailedException") {
      return { success: true, alreadySubmitted: true };
    }
    throw err;
  }
}

// ——————————————————————————————————————————
// 5) Update Violation Count
// ——————————————————————————————————————————
export async function updateViolationCount(attemptID, count, userID) {
  if (!attemptID) throw new Error("Attempt ID is required");
  if (typeof count !== "number" || count < 0 || !Number.isFinite(count)) {
    throw new Error("Invalid violation count");
  }
  if (!userID) throw new Error("User ID is required");

  try {
    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: {
          pKey: `EXAM_ATTEMPT#${attemptID}`,
          sKey: "EXAM_ATTEMPTS",
        },
        // Only allow the owner to update their own violation count
        ConditionExpression: "userID = :uid",
        UpdateExpression: "SET violationCount = :count, updatedAt = :now",
        ExpressionAttributeValues: {
          ":count": count,
          ":now": Date.now(),
          ":uid": userID,
        },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new Error("Attempt not found");
    }
    throw err;
  }
  return { success: true };
}

// ——————————————————————————————————————————
// 6) Get Exam Attempts Result
// ——————————————————————————————————————————
async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}
export async function getExamAttemptsResult(attemptID, userID) {
  // 1) Fetch the exam attempt record (strongly consistent — must see the submitted state)
  const { Item } = await dynamoDB.send(
    new GetCommand({
      TableName: USER_TABLE,
      Key: {
        pKey: `EXAM_ATTEMPT#${attemptID}`,
        sKey: "EXAM_ATTEMPTS",
      },
      ConsistentRead: true,
    })
  );

  if (!Item) {
    throw new Error("Attempt not found");
  }

  // Verify ownership
  if (Item.userID !== userID) {
    throw new Error("Attempt not found");
  }

  // Only allow viewing results for completed exams
  if (Item.status !== "COMPLETED") {
    throw new Error("Exam not yet submitted");
  }

  // 2) Load the S3 blob — never fail the whole result if the blob is unavailable
  let questions = [];
  if (Item.blobBucketKey && process.env.AWS_BUCKET_NAME) {
    try {
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: Item.blobBucketKey,
        })
      );
      const jsonString = await streamToString(object.Body);
      const json = JSON.parse(jsonString);
      questions = Array.isArray(json?.sections) ? json.sections : [];
    } catch (err) {
      console.error("Failed to load exam blob for result:", err?.message);
      // Keep questions as [] — client will render overview without question analysis
    }
  }

  // 3) Conditionally include answerList based on exam settings
  const { answerList, ...safeItem } = Item;
  const viewResult = safeItem.settings?.isShowResult !== false;

  return {
    success: true,
    data: {
      ...safeItem,
      questions,
      userAnswers: Array.isArray(safeItem.userAnswers) ? safeItem.userAnswers : [],
      ...(viewResult && Array.isArray(answerList) ? { answerList } : {}),
    },
  };
}

export async function getExamAttemptsByUserID(userID, goalID) {
  if (!userID) throw new Error("User ID is required");

  const params = {
    TableName: USER_TABLE,
    IndexName: "GSI1-index",
    KeyConditionExpression: "#gsi1pKey = :pKey AND #gsi1sKey = :sKey",
    ExpressionAttributeNames: {
      "#gsi1pKey": "GSI1-pKey",
      "#gsi1sKey": "GSI1-sKey",
    },
    ExpressionAttributeValues: {
      ":pKey": "EXAM_ATTEMPTS",
      ":sKey": `EXAM_ATTEMPT@${userID}`,
    },
  };

  if (goalID) {
    params.FilterExpression = "goalID = :goalID";
    params.ExpressionAttributeValues[":goalID"] = goalID;
  }

  // Filter applies within each 1MB page — paginate so attempts aren't
  // silently dropped once a user's attempt history outgrows one page.
  const Items = [];
  let ExclusiveStartKey;
  do {
    const response = await dynamoDB.send(
      new QueryCommand({ ...params, ExclusiveStartKey })
    );
    Items.push(...(response.Items || []));
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return {
    success: true,
    data: Items,
  };
}

export async function getScheduledExamAttemptsByUserID(userID, batchID) {
  if (!userID) {
    throw new Error("userID is required");
  }

  // 1) Query the GSI for this user's exam attempts — paginated, since the
  // filter applies within each 1MB page of the user's attempt history.
  const params = {
    TableName: USER_TABLE,
    IndexName: USER_GSI_INDEX,
    KeyConditionExpression: "#gpk = :pKey AND #gsk = :sKey",
    FilterExpression: "#type = :type AND #batchID = :batchID",
    ExpressionAttributeNames: {
      "#gpk": "GSI1-pKey",
      "#gsk": "GSI1-sKey",
      "#type": "type",
      "#status": "status",
      "#duration": "duration",
      "#batchID": "batchID",
    },
    ExpressionAttributeValues: {
      ":pKey": `EXAM_ATTEMPTS`,
      ":sKey": `EXAM_ATTEMPT@${userID}`,
      ":type": "scheduled",
      ":batchID": batchID,
    },
    ProjectionExpression: [
      "pKey",
      "sKey",
      "examID",
      "batchID",
      "startTimeStamp",
      "#duration",
      "#status",
      "attemptNumber",
      "obtainedMarks",
      "totalQuestions",
      "title",
      "totalMarks",
    ].join(", "),
  };

  const Items = [];
  let ExclusiveStartKey;
  do {
    const response = await dynamoDB.send(
      new QueryCommand({ ...params, ExclusiveStartKey })
    );
    Items.push(...(response.Items || []));
    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  // 2) Map into a clean client payload
  const data = Items.map((item) => ({
    id: item.pKey.split("#", 2)[1],
    examID: item.examID,
    startTimeStamp: item.startTimeStamp,
    duration: item.duration,
    status: item.status,
    attemptNumber: item.attemptNumber,
    obtainedMarks: item.obtainedMarks,
    totalQuestions: item.totalQuestions,
    title: item.title,
    totalMarks: item.totalMarks,
    batchID: item.batchID,
  }));
  return { success: true, data };
}
