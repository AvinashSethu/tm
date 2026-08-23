import { dynamoDB } from "@/src/utils/awsAgent";
import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { getUserEnrollmentsRaw } from "@/src/libs/courseEnrollment/courseEnrollController";

const USER_TABLE = `${process.env.AWS_DB_NAME}users`;
const USER_INDEX_NAME = "GSI1-index";

export async function getUserGoalStats(userID, goalID) {
  try {
    // 1. Fetch User Enrollments for this Goal
    const allEnrollments = await getUserEnrollmentsRaw(userID);
    const goalEnrollments = allEnrollments.filter((e) => e.goalID === goalID);

    const enrolledCoursesCount = goalEnrollments.length;
    let totalProgress = 0;
    let completedCourses = 0;
    let totalSecondsWatched = 0;
    const activityDates = new Set();
    let analyticsData = [];

    // 2. Fetch Course Analytics (Lesson Progress) for Time Spent
    // We need to fetch COURSE_ANALYTICS for each course
    if (enrolledCoursesCount > 0) {
      const courseIDs = goalEnrollments.map((e) => e.courseID);
      analyticsData = await getBatchCourseAnalytics(userID, courseIDs);

      analyticsData.forEach((record) => {
        if (record.updatedAt) {
          activityDates.add(new Date(record.updatedAt).toDateString());
        }

        const lessonProgress = record.LessonProgress || {};
        Object.values(lessonProgress).forEach((lesson) => {
          if (lesson.currentTime) {
            totalSecondsWatched += lesson.currentTime;
          }
        });
      });

      // Calculate average progress from enrollments (if available) or analytics?
      // Enrollments might not have 'progress' field updated.
      // Let's stick to the previous heuristic for progress for now, or improve it if we had lesson counts.
      // Since we don't have lesson counts here easily, we'll use the enrollment data if available.
      goalEnrollments.forEach((enrollment) => {
        const progress = enrollment.progress || 0;
        totalProgress += progress;
        if (progress === 100 || enrollment.status === "completed") {
          completedCourses++;
        }
      });
    }

    const averageProgress =
      enrolledCoursesCount > 0
        ? Math.round(totalProgress / enrolledCoursesCount)
        : 0;

    // 3. Fetch Exam Attempts for Quizzes and Streak
    const examAttempts = await getUserExamAttempts(userID, goalID);
    const quizzesTaken = examAttempts.length;

    examAttempts.forEach((attempt) => {
      if (attempt.createdAt) {
        activityDates.add(new Date(attempt.createdAt).toDateString());
      }
    });

    // 4. Calculate Streak
    const streak = calculateStreak(Array.from(activityDates));

    // 5. Format Time Spent
    const timeSpent = formatTime(totalSecondsWatched);
    const totalStudyHours = Math.round(totalSecondsWatched / 3600);

    // 6. Identify Last Active Course
    let lastActiveCourseID = null;
    // Sort analytics by updatedAt descending
    const sortedAnalytics = analyticsData.sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0);
      const dateB = new Date(b.updatedAt || 0);
      return dateB - dateA;
    });

    if (sortedAnalytics.length > 0) {
      lastActiveCourseID = sortedAnalytics[0].courseID;
    } else if (goalEnrollments.length > 0) {
      // Fallback to first enrolled course if no analytics
      lastActiveCourseID = goalEnrollments[0].courseID;
    }

    // 7. Calculate Daily Goals Status
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    let studiedToday = false;
    if (sortedAnalytics.length > 0) {
      const lastActivityDate = new Date(sortedAnalytics[0].updatedAt || 0);
      lastActivityDate.setHours(0, 0, 0, 0);
      if (lastActivityDate.getTime() === todayTime) {
        studiedToday = true;
      }
    }

    let takenTestToday = false;
    // Check exam attempts for today
    // We need to check the dates in examAttempts
    for (const attempt of examAttempts) {
      if (attempt.createdAt) {
        const attemptDate = new Date(attempt.createdAt);
        attemptDate.setHours(0, 0, 0, 0);
        if (attemptDate.getTime() === todayTime) {
          takenTestToday = true;
          break;
        }
      }
    }

    const dailyGoals = [
      { task: "Study a Lesson", done: studiedToday },
      { task: "Take a Practice Test", done: takenTestToday },
      {
        task: "Complete 1 Hour of Learning",
        done: totalSecondsWatched > 3600 && studiedToday,
      }, // Heuristic
    ];

    // 8. Calculate Performer Badge (Heuristic)
    let performerBadge = "Rising Star";
    if (streak > 30 || totalStudyHours > 50) {
      performerBadge = "Top 1% Performer";
    } else if (streak > 7 || totalStudyHours > 10) {
      performerBadge = "Top 5% Performer";
    } else if (streak > 3 || totalStudyHours > 5) {
      performerBadge = "Top 10% Performer";
    }

    return {
      success: true,
      data: {
        progress: averageProgress,
        completedCourses,
        enrolledCoursesCount,
        quizzesTaken,
        timeSpent,
        streak: `${streak} Days`,
        streakCount: streak, // Numeric value for calculations
        lastActiveCourseID,
        totalStudyHours,
        dailyGoals,
        performerBadge,
      },
    };
  } catch (error) {
    console.error("Error fetching user goal stats:", error);
    return {
      success: false,
      message: "Failed to fetch stats",
      data: null,
    };
  }
}

async function getUserExamAttempts(userID, goalID) {
  const params = {
    TableName: USER_TABLE,
    IndexName: USER_INDEX_NAME,
    KeyConditionExpression: "#gsiPK = :pk AND #gsiSK = :sk",
    FilterExpression: "#goalID = :goalID",
    ExpressionAttributeNames: {
      "#gsiPK": "GSI1-pKey",
      "#gsiSK": "GSI1-sKey",
      "#goalID": "goalID",
    },
    ExpressionAttributeValues: {
      ":pk": "EXAM_ATTEMPTS",
      ":sk": `EXAM_ATTEMPT@${userID}`,
      ":goalID": goalID,
    },
  };

  try {
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
    return Items;
  } catch (error) {
    console.error("Error fetching exam attempts:", error);
    return [];
  }
}

async function getBatchCourseAnalytics(userID, courseIDs) {
  if (!courseIDs.length) return [];

  const keys = courseIDs.map((courseID) => ({
    pKey: `COURSE_ANALYTICS#${courseID}#${userID}`,
    sKey: userID,
  }));

  try {
    const { Responses } = await dynamoDB.send(
      new BatchGetCommand({
        RequestItems: {
          [USER_TABLE]: {
            Keys: keys,
            ProjectionExpression: "LessonProgress, updatedAt, courseID",
          },
        },
      })
    );
    return Responses?.[USER_TABLE] || [];
  } catch (error) {
    console.error("Error batch fetching course analytics:", error);
    return [];
  }
}

function calculateStreak(dates) {
  if (dates.length === 0) return 0;

  // Sort dates descending
  const sortedDates = dates.map((d) => new Date(d)).sort((a, b) => b - a);

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if the most recent activity was today or yesterday
  const lastActivity = sortedDates[0];
  lastActivity.setHours(0, 0, 0, 0);

  if (
    lastActivity.getTime() !== today.getTime() &&
    lastActivity.getTime() !== yesterday.getTime()
  ) {
    return 0;
  }

  // Count consecutive days
  // We need to handle duplicates and gaps
  let currentDate = lastActivity;
  streak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    date.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(currentDate - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      streak++;
      currentDate = date;
    } else if (diffDays > 1) {
      break;
    }
    // if diffDays === 0, it's the same day, continue
  }

  return streak;
}

function formatTime(seconds) {
  if (!seconds) return "0h 0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
