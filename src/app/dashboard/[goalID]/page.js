"use client";
import { Button, Stack, Typography, Box, Chip, Skeleton } from "@mui/material";
import { useEffect, useState, useCallback } from "react";
import {
  East,
  CheckCircle,
  RadioButtonUnchecked,
  ArrowForward,
  Star,
  LocalFireDepartment,
} from "@mui/icons-material";
import Header from "@/src/Components/Header/Header";
import StatisticCard from "@/src/Components/StatisticCard/StatisticCard";
import practice from "@/public/icons/practice.svg";
import mocks from "@/public/icons/mocks.svg";
import hours from "@/public/icons/hours.svg";
import courses from "@/public/icons/courses.svg";
import week1 from "@/public/icons/week1.svg";
import PrimaryCardSkeleton from "@/src/Components/SkeletonCards/PrimaryCardSkeleton";
import MobileHeader from "@/src/Components/MobileHeader/MobileHeader";
import Subscribe from "../Components/Subscribe";

import { useSession } from "next-auth/react";
import { useExams } from "../../context/ExamProvider";
import { useParams, useRouter } from "next/navigation";
import CourseCard from "@/src/Components/CourseCard/CourseCard";
import { formatDuration } from "@/src/utils/formatDuration";
import { useCourses } from "../../context/CourseProvider";
import NoDataFound from "@/src/Components/NoDataFound/NoDataFound";
import CourseCardSkeleton from "@/src/Components/SkeletonCards/CourseCardSkeleton";

import ExamCard from "@/src/Components/ExamCard/ExamCard";

const fetchStats = async (goalID, signal) =>
  fetch(`/api/home/stats`, {
    method: "POST",
    body: JSON.stringify({ goalID }),
    signal,
  }).then((res) => res.json());

import ExamInstructionDialog from "@/src/Components/ExamInstruction/ExamInstructionDialog";

export default function Home() {
  const { data: session } = useSession();
  const { mock, loading } = useExams();
  const [isLoading, setIsLoading] = useState(false);
  const [totalClassroomJoins, setTotalClassroomJoins] = useState(0);
  const [stats, setStats] = useState(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const router = useRouter();
  const { goalID } = useParams();

  const [instructionOpen, setInstructionOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [isStartingExam, setIsStartingExam] = useState(false);

  const handleExamClick = (exam) => {
    setSelectedExam(exam);
    setInstructionOpen(true);
  };

  const handleStartExam = () => {
    if (selectedExam) {
      setIsStartingExam(true);
      router.push(`/exam/${selectedExam.id}`);
      // Reset loading state after a brief delay so if the user navigates back, it's not stuck spinning
      setTimeout(() => setIsStartingExam(false), 2000);
    }
  };

  useEffect(() => {
    setIsLoading(loading);
  }, [loading]);

  useEffect(() => {
    const fetchTotalClassroomJoins = async () => {
      try {
        const response = await fetch("/api/my-classroom/total-count");
        const data = await response.json();
        if (data.success) {
          setTotalClassroomJoins(data.data.count);
        }
      } catch (error) {
        console.error("Failed to fetch total classroom joins:", error);
      }
    };
    fetchTotalClassroomJoins();
  }, []);

  const getStatsData = useCallback(async () => {
    const controller = new AbortController();
    setIsStatsLoading(true);
    try {
      const data = await fetchStats(goalID, controller.signal);
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Stats fetch error:", err);
    } finally {
      setIsStatsLoading(false);
    }
  }, [goalID]);

  useEffect(() => {
    getStatsData();
  }, [getStatsData]);

  const { enrolledCourses, load } = useCourses();
  const getCourseRoute = (courseId) =>
    `/dashboard/${goalID}/courses/${courseId}`;

  // Sort courses: Last active course first, then others
  const sortedCourses = Array.isArray(enrolledCourses)
    ? [...enrolledCourses].sort((a, b) => {
        if (stats?.lastActiveCourseID) {
          if (a.id === stats.lastActiveCourseID) return -1;
          if (b.id === stats.lastActiveCourseID) return 1;
        }
        return 0;
      })
    : [];

  const hasCourses = sortedCourses.length > 0;
  const firstName = session?.user?.name?.split(" ")[0] || "Scholar";

  return (
    <>
      <MobileHeader />
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "var(--library-expand)",
          pb: { xs: 10, md: 4 },
        }}
      >
        <Stack gap={4} width="100%">
          {/* Header Area - Full width container to match Header's internal layout */}
          <Box sx={{ pt: { xs: 2, md: 4 } }}>
            <Header />
          </Box>

          {/* Body Content - Constrained width with padding to align with Header content */}
          <Stack
            gap={4}
            sx={{
              maxWidth: "1200px",
              margin: "0 auto",
              width: "100%",
              px: { xs: 2, md: 3 },
            }}
          >
            {/* Hero Section */}
            <Box
              sx={{
                background:
                  "linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-dark, #764ba2) 100%)",
                borderRadius: "24px",
                p: { xs: 3, md: 4 },
                color: "var(--white)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  top: -50,
                  right: -50,
                  width: 200,
                  height: 200,
                  borderRadius: "50%",
                  bgcolor: "rgba(255,255,255,0.1)",
                }}
              />
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                gap={3}
              >
                <Stack
                  gap={2}
                  flex={1}
                  sx={{ position: "relative", zIndex: 1 }}
                >
                  <Typography
                    sx={{
                      fontSize: { xs: "28px", md: "40px" },
                      fontWeight: 900,
                      letterSpacing: "-1px",
                    }}
                  >
                    Welcome back, {firstName}! 🎯
                  </Typography>
                  <Typography sx={{ fontSize: "16px", opacity: 0.95 }}>
                    You&apos;re doing great! Keep up the momentum and achieve
                    your goals.
                  </Typography>
                  <Stack direction="row" gap={2} flexWrap="wrap">
                    <Chip
                      icon={<LocalFireDepartment sx={{ fontSize: 18 }} />}
                      label={
                        isStatsLoading
                          ? "Loading..."
                          : `${stats?.streakCount || 0} Day Streak`
                      }
                      sx={{
                        bgcolor: "rgba(255,255,255,0.2)",
                        color: "white",
                        fontWeight: 700,
                        backdropFilter: "blur(10px)",
                      }}
                    />
                    <Chip
                      icon={<Star sx={{ fontSize: 18 }} />}
                      label={
                        isStatsLoading
                          ? "Loading..."
                          : stats?.performerBadge || "Rising Star"
                      }
                      sx={{
                        bgcolor: "rgba(255,255,255,0.2)",
                        color: "white",
                        fontWeight: 700,
                        backdropFilter: "blur(10px)",
                      }}
                    />
                  </Stack>
                </Stack>

                {/* Quick Actions */}
                <Stack
                  direction={{ xs: "row", md: "column" }}
                  gap={1.5}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.15)",
                    p: 2,
                    borderRadius: "16px",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <Button
                    variant="contained"
                    fullWidth
                    sx={{
                      bgcolor: "var(--white)",
                      color: "var(--primary-color)",
                      fontWeight: 700,
                      textTransform: "none",
                      "&:hover": { bgcolor: "var(--library-expand)" },
                    }}
                    onClick={() => router.push(`/dashboard/${goalID}/exam`)}
                  >
                    Take a Test
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{
                      borderColor: "var(--white)",
                      color: "var(--white)",
                      fontWeight: 700,
                      textTransform: "none",
                      "&:hover": {
                        borderColor: "var(--white)",
                        bgcolor: "rgba(255,255,255,0.1)",
                      },
                    }}
                    onClick={() => router.push(`/dashboard/${goalID}/courses`)}
                  >
                    Browse Courses
                  </Button>
                </Stack>
              </Stack>
            </Box>

            {/* Main Grid */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 4,
                px: { xs: 2, md: 0 },
              }}
            >
              {/* Left Column */}
              <Stack gap={4}>
                {/* Stats Grid */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: "20px",
                      fontWeight: 800,
                      mb: 2.5,
                      color: "var(--text1)",
                    }}
                  >
                    Your Progress Overview
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "repeat(2, 1fr)",
                        sm: "repeat(3, 1fr)",
                        md: "repeat(5, 1fr)",
                      },
                      gap: 2,
                    }}
                  >
                    <StatisticCard
                      title="Practice Tests"
                      count={isStatsLoading ? "..." : stats?.quizzesTaken || 0}
                      icon={practice}
                      trend={12}
                    />
                    <StatisticCard
                      title="Mock Exams"
                      count={isStatsLoading ? "..." : 0} // Placeholder until we distinguish mock exams
                      icon={mocks}
                      trend={5}
                    />
                    <StatisticCard
                      title="Study Hours"
                      count={
                        isStatsLoading ? "..." : stats?.totalStudyHours || 0
                      }
                      icon={hours}
                      trend={-2}
                    />
                    <StatisticCard
                      title="Courses"
                      count={
                        isStatsLoading
                          ? "..."
                          : stats?.enrolledCoursesCount || 0
                      }
                      icon={courses}
                    />
                    <StatisticCard
                      title="Classrooms"
                      count={totalClassroomJoins}
                      icon={courses}
                    />
                  </Box>
                </Box>

                {/* Today's Goals */}
                <Box
                  sx={{
                    bgcolor: "var(--white)",
                    borderRadius: "20px",
                    p: 3,
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={2}
                  >
                    <Typography
                      sx={{
                        fontSize: "18px",
                        fontWeight: 800,
                        color: "var(--text1)",
                      }}
                    >
                      Today&apos;s Goals
                    </Typography>
                    <Chip
                      label={
                        isStatsLoading
                          ? "Loading..."
                          : `${
                              stats?.dailyGoals?.filter((g) => g.done).length ||
                              0
                            }/${stats?.dailyGoals?.length || 3} Completed`
                      }
                      size="small"
                      sx={{
                        bgcolor: "#dbeafe",
                        color: "#1e40af",
                        fontWeight: 700,
                      }}
                    />
                  </Stack>
                  <Stack gap={1.5}>
                    {isStatsLoading
                      ? [...Array(3)].map((_, i) => (
                          <Skeleton key={i} height={50} />
                        ))
                      : (
                          stats?.dailyGoals || [
                            { task: "Study a Lesson", done: false },
                            { task: "Take a Practice Test", done: false },
                            {
                              task: "Complete 1 Hour of Learning",
                              done: false,
                            },
                          ]
                        ).map((goal, idx) => (
                          <Stack
                            key={idx}
                            direction="row"
                            alignItems="center"
                            gap={1.5}
                            sx={{
                              p: 1.5,
                              borderRadius: "12px",
                              bgcolor: goal.done ? "#f0fdf4" : "#f8fafc",
                              border: "1px solid",
                              borderColor: goal.done ? "#bbf7d0" : "#e2e8f0",
                            }}
                          >
                            {goal.done ? (
                              <CheckCircle
                                sx={{ color: "#16a34a", fontSize: 20 }}
                              />
                            ) : (
                              <RadioButtonUnchecked
                                sx={{ color: "#94a3b8", fontSize: 20 }}
                              />
                            )}
                            <Typography
                              sx={{
                                flex: 1,
                                fontSize: "14px",
                                fontWeight: 600,
                                color: goal.done ? "#166534" : "#475569",
                                textDecoration: goal.done
                                  ? "line-through"
                                  : "none",
                              }}
                            >
                              {goal.task}
                            </Typography>
                          </Stack>
                        ))}
                  </Stack>
                </Box>

                {/* Subscribe Banner */}
                {session?.user?.accountType !== "PRO" && <Subscribe />}

                {/* Available Exams */}
                <Box>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={2.5}
                  >
                    <Stack gap={0.5}>
                      <Typography
                        sx={{
                          fontSize: "20px",
                          fontWeight: 800,
                          color: "var(--text1)",
                        }}
                      >
                        Recommended Tests
                      </Typography>
                      <Typography
                        sx={{ fontSize: "14px", color: "var(--text3)" }}
                      >
                        Curated exams based on your learning path
                      </Typography>
                    </Stack>
                    <Button
                      endIcon={<ArrowForward />}
                      sx={{
                        textTransform: "none",
                        color: "var(--primary-color)",
                        fontWeight: 700,
                      }}
                      onClick={() => router.push(`/dashboard/${goalID}/exam`)}
                    >
                      View All
                    </Button>
                  </Stack>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(2, 1fr)",
                      },
                      gap: 3,
                    }}
                  >
                    {!loading ? (
                      mock.length > 0 ? (
                        mock.slice(0, 4).map((item, index) => (
                          <ExamCard
                            key={index}
                            title={item.title}
                            icon={week1.src}
                            duration={item.duration || 60}
                            totalQuestions={item.totalQuestions || 50}
                            totalMarks={item.totalMarks || 100}
                            difficulty={item.difficulty || "medium"}
                            status={item.status || "upcoming"}
                            actionButton={
                              <Button
                                variant="contained"
                                endIcon={<East />}
                                onClick={() => handleExamClick(item)}
                                fullWidth
                                sx={{
                                  textTransform: "none",
                                  bgcolor: "var(--primary-color)",
                                  fontWeight: 700,
                                  py: 1.2,
                                  borderRadius: "12px",
                                  "&:hover": {
                                    bgcolor: "var(--primary-color-dark)",
                                  },
                                }}
                              >
                                Start Test
                              </Button>
                            }
                          />
                        ))
                      ) : (
                        <Box sx={{ gridColumn: "1 / -1" }}>
                          <NoDataFound info="No exams available right now" />
                        </Box>
                      )
                    ) : (
                      [...Array(4)].map((_, index) => (
                        <PrimaryCardSkeleton key={index} />
                      ))
                    )}
                  </Box>
                </Box>

                {/* My Courses */}
                <Box>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={2.5}
                  >
                    <Stack gap={0.5}>
                      <Typography
                        sx={{
                          fontSize: "20px",
                          fontWeight: 800,
                          color: "var(--text1)",
                        }}
                      >
                        Continue Learning
                      </Typography>
                      <Typography
                        sx={{ fontSize: "14px", color: "var(--text3)" }}
                      >
                        Pick up where you left off
                      </Typography>
                    </Stack>
                    <Button
                      endIcon={<ArrowForward />}
                      sx={{
                        textTransform: "none",
                        color: "var(--primary-color)",
                        fontWeight: 700,
                      }}
                      onClick={() =>
                        router.push(`/dashboard/${goalID}/courses`)
                      }
                    >
                      All Courses
                    </Button>
                  </Stack>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(2, 1fr)",
                      },
                      gap: 3,
                    }}
                  >
                    {!loading ? (
                      hasCourses ? (
                        sortedCourses.slice(0, 4).map((item) => {
                          const courseUrl = getCourseRoute(item.id);
                          return (
                            <CourseCard
                              key={item.id}
                              title={item.title || "Untitled Course"}
                              thumbnail={item.thumbnail}
                              lessons={`${item.lessons || 0} Lessons`}
                              hours={formatDuration(item.duration)}
                              Language={item.language || "N/A"}
                              actionButton={
                                <Button
                                  variant="contained"
                                  endIcon={<East />}
                                  onClick={() => router.push(courseUrl)}
                                  fullWidth
                                  sx={{
                                    textTransform: "none",
                                    bgcolor: "var(--primary-color)",
                                    fontWeight: 700,
                                    borderRadius: "0 0 16px 16px",
                                    py: 1.5,
                                    "&:hover": {
                                      bgcolor: "var(--primary-color-dark)",
                                    },
                                  }}
                                >
                                  Continue
                                </Button>
                              }
                            />
                          );
                        })
                      ) : (
                        <Stack
                          sx={{
                            gridColumn: "1 / -1",
                            bgcolor: "var(--white)",
                            p: 4,
                            borderRadius: "20px",
                            border: "2px dashed var(--border-color)",
                            alignItems: "center",
                            gap: 2,
                          }}
                        >
                          <NoDataFound info="Start your learning journey today" />
                          <Button
                            variant="contained"
                            sx={{
                              bgcolor: "var(--primary-color)",
                              fontWeight: 700,
                            }}
                            onClick={() =>
                              router.push(`/dashboard/${goalID}/courses`)
                            }
                          >
                            Explore Courses
                          </Button>
                        </Stack>
                      )
                    ) : (
                      [...Array(4)].map((_, idx) => (
                        <CourseCardSkeleton key={idx} />
                      ))
                    )}
                  </Box>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Box>

      {selectedExam && (
        <ExamInstructionDialog
          open={instructionOpen}
          onClose={() => setInstructionOpen(false)}
          onStart={handleStartExam}
          loading={isStartingExam}
          examData={{
            title: selectedExam.title,
            icon: week1.src,
            duration: selectedExam.duration,
            totalQuestions: selectedExam.totalQuestions,
            totalMarks: selectedExam.totalMarks,
          }}
        />
      )}
    </>
  );
}
