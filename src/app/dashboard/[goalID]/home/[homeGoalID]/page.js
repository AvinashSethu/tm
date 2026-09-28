"use client";
import {
  Button,
  Skeleton,
  Stack,
  Typography,
  Box,
} from "@mui/material";
import {
  InsertDriveFile,
  ShoppingBagRounded,
  Timeline,
  AccessTime,
  EmojiEvents,
  TrendingUp,
  PlayArrow,
} from "@mui/icons-material";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// Components
import GoalHead from "@/src/Components/GoalHead/GoalHead";
import SecondaryCard from "@/src/Components/SecondaryCard/SecondaryCard";
import SecondaryCardSkeleton from "@/src/Components/SkeletonCards/SecondaryCardSkeleton";
import CourseCard from "@/src/Components/CourseCard/CourseCard";
import { formatDuration } from "@/src/utils/formatDuration";
import CourseCardSkeleton from "@/src/Components/SkeletonCards/CourseCardSkeleton";
import NoDataFound from "@/src/Components/NoDataFound/NoDataFound";
import MDPreview from "@/src/Components/MarkdownPreview/MarkdownPreview";
import PracticeTest from "../Components/PracticeTest";
import GoalContents from "../Components/GoalContents";
import MobileSidebar from "../Components/MobileSidebar";
import LinearProgressLoading from "@/src/Components/LinearProgressLoading/LinearProgressLoading";
import PageSkeleton from "@/src/Components/SkeletonCards/PageSkeleton";

// API helpers
const fetchGoalDetails = async (goalID, signal) =>
  fetch(`/api/home/goal-details`, {
    method: "POST",
    body: JSON.stringify({ goalID }),
    signal,
  }).then((res) => res.json());

const fetchBlog = async (goalID, blogID, signal) =>
  fetch(`/api/home/get-blog`, {
    method: "POST",
    body: JSON.stringify({ goalID, blogID }),
    signal,
  }).then((res) => res.json());

const fetchStats = async (goalID, signal) =>
  fetch(`/api/home/stats`, {
    method: "POST",
    body: JSON.stringify({ goalID }),
    signal,
  }).then((res) => res.json());

export default function HomeGoalID() {
  const { homeGoalID: goalID } = useParams();
  const router = useRouter();
  const { data: session } = useSession();

  const [goalDetails, setGoalDetails] = useState({});
  const [blogList, setBlogList] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [stats, setStats] = useState(null);
  const [isGoalLoading, setIsGoalLoading] = useState(true);
  const [isBlogLoading, setIsBlogLoading] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  const pageLoading = isGoalLoading || isBlogLoading;

  const getBlogData = useCallback(
    async (blogID) => {
      const controller = new AbortController();
      setIsBlogLoading(true);
      try {
        const data = await fetchBlog(goalID, blogID, controller.signal);
        if (data.success) {
          const normalizedBlog = {
            ...data.data,
            blogID: data.data.id,
          };
          setSelectedBlog(normalizedBlog);
        }
      } catch (err) {
        if (err.name !== "AbortError") console.error("Blog fetch error:", err);
      } finally {
        setIsBlogLoading(false);
      }
    },
    [goalID]
  );

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

  const getGoalData = useCallback(async () => {
    const controller = new AbortController();
    setIsGoalLoading(true);
    try {
      const data = await fetchGoalDetails(goalID, controller.signal);
      if (data.success) {
        setGoalDetails(data.data);
        const blogs = data.data.blogList || [];
        setBlogList(blogs);
        if (blogs.length > 0) getBlogData(blogs[0].blogID);
      } else {
        console.error("Goal fetch failed:", data.message);
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Goal fetch error:", err);
    } finally {
      setIsGoalLoading(false);
    }
  }, [goalID, getBlogData]);

  useEffect(() => {
    getGoalData();
    getStatsData();
  }, [getGoalData, getStatsData]);

  const handlePurchase = (courseID) => {
    router.push(`/dashboard/${goalID}/courses/${courseID}`);
  };

  return (
    <Stack
      padding={{ xs: "12px", md: "24px" }}
      gap="24px"
      sx={{ minHeight: "100vh", mb: { xs: "70px", md: 0 } }}
      width="100%"
      alignItems="center"
    >
      {pageLoading ? (
        <PageSkeleton />
      ) : (
        <>
          <Stack width="100%" maxWidth="1200px" gap="24px">
            <GoalHead
              title={
                isGoalLoading ? <Skeleton width="120px" /> : goalDetails.title
              }
              icon={goalDetails.icon}
              isPro={session?.user?.accountType !== "PRO"}
              bannerImage={goalDetails.bannerImage}
            />

            {/* Quick Stats */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, 1fr)",
                  md: "repeat(4, 1fr)",
                },
                gap: 2,
              }}
            >
              {[
                {
                  label: "Progress",
                  value: isStatsLoading ? (
                    <Skeleton width="40px" />
                  ) : (
                    `${stats?.progress || 0}%`
                  ),
                  icon: <Timeline sx={{ fontSize: 20 }} />,
                  color: "#3b82f6",
                },
                {
                  label: "Time Spent",
                  value: isStatsLoading ? (
                    <Skeleton width="60px" />
                  ) : (
                    stats?.timeSpent || "0h 0m"
                  ),
                  icon: <AccessTime sx={{ fontSize: 20 }} />,
                  color: "#10b981",
                },
                {
                  label: "Quizzes",
                  value: isStatsLoading ? (
                    <Skeleton width="30px" />
                  ) : (
                    stats?.quizzesTaken || 0
                  ),
                  icon: <EmojiEvents sx={{ fontSize: 20 }} />,
                  color: "#f59e0b",
                },
                {
                  label: "Streak",
                  value: isStatsLoading ? (
                    <Skeleton width="50px" />
                  ) : (
                    stats?.streak || "0 Days"
                  ),
                  icon: <TrendingUp sx={{ fontSize: 20 }} />,
                  color: "#ef4444",
                },
              ].map((stat, idx) => (
                <Stack
                  key={idx}
                  direction="row"
                  alignItems="center"
                  gap={1.5}
                  sx={{
                    bgcolor: "var(--white)",
                    p: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    transition: "all 0.15s ease",
                    "&:hover": {
                      borderColor: "var(--primary-color)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      p: "8px",
                      borderRadius: "8px",
                      bgcolor: `${stat.color}15`,
                      color: stat.color,
                      display: "flex",
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Stack>
                    <Typography
                      sx={{
                        fontSize: "11px",
                        color: "var(--text3)",
                        fontWeight: 600,
                      }}
                    >
                      {stat.label}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "15px",
                        fontWeight: 700,
                        color: "var(--text1)",
                      }}
                    >
                      {stat.value}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Box>

            <Stack
              direction={{ xs: "column", lg: "row" }}
              gap="24px"
              width="100%"
              alignItems="flex-start"
            >
              {/* LEFT COLUMN */}
              <Stack flex={1} gap="24px">
                {/* Overview */}
                <Stack gap="12px">
                  <Stack gap="4px">
                    <Typography
                      sx={{
                        fontSize: { xs: "16px", md: "18px" },
                        fontWeight: 700,
                        color: "var(--text1)",
                      }}
                    >
                      Overview
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "13px",
                        color: "var(--text3)",
                        fontWeight: 500,
                      }}
                    >
                      About this learning path
                    </Typography>
                  </Stack>

                  <Stack
                    sx={{
                      border: "1px solid var(--border-color)",
                      bgcolor: "var(--white)",
                      borderRadius: "10px",
                      p: { xs: "16px", md: "20px" },
                      minHeight: { xs: "auto", md: "250px" },
                      gap: "12px",
                    }}
                  >
                    {isBlogLoading ? (
                      <LinearProgressLoading />
                    ) : selectedBlog ? (
                      <MDPreview value={selectedBlog.description} />
                    ) : (
                      <NoDataFound info="No Blog Content Available" />
                    )}
                  </Stack>
                </Stack>

                {/* Subjects */}
                <Stack gap="12px">
                  <Stack gap="4px">
                    <Typography
                      sx={{
                        fontSize: { xs: "16px", md: "18px" },
                        fontWeight: 700,
                        color: "var(--text1)",
                      }}
                    >
                      Subjects
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "13px",
                        color: "var(--text3)",
                        fontWeight: 500,
                      }}
                    >
                      Core topics you&apos;ll master
                    </Typography>
                  </Stack>
                  <Stack
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(auto-fill, minmax(280px, 1fr))",
                      },
                      gap: "16px",
                      width: "100%",
                    }}
                  >
                    {isGoalLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <SecondaryCardSkeleton cardWidth="100%" key={i} />
                      ))
                    ) : goalDetails.subjectList?.length ? (
                      goalDetails.subjectList.map((subject, i) => (
                        <SecondaryCard
                          key={i}
                          title={subject.title}
                          cardWidth="100%"
                          icon={
                            <InsertDriveFile
                              sx={{ color: "var(--sec-color)" }}
                            />
                          }
                        />
                      ))
                    ) : (
                      <NoDataFound info="No Subjects Found" />
                    )}
                  </Stack>
                </Stack>

                {/* Courses */}
                <Stack gap="12px">
                  <Stack gap="4px">
                    <Typography
                      sx={{
                        fontSize: { xs: "16px", md: "18px" },
                        fontWeight: 700,
                        color: "var(--text1)",
                      }}
                    >
                      Recommended Courses
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "13px",
                        color: "var(--text3)",
                        fontWeight: 500,
                      }}
                    >
                      Structured learning paths for you
                    </Typography>
                  </Stack>

                  {isGoalLoading ? (
                    <Stack
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(auto-fill, minmax(280px, 1fr))",
                        },
                        gap: "16px",
                      }}
                    >
                      <CourseCardSkeleton />
                      <CourseCardSkeleton />
                      <CourseCardSkeleton />
                    </Stack>
                  ) : goalDetails.coursesList?.length ? (
                    <Stack
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(auto-fill, minmax(280px, 1fr))",
                        },
                        gap: "16px",
                        width: "100%",
                      }}
                    >
                      {goalDetails.coursesList.map((course) => (
                        <CourseCard
                          key={course.id}
                          title={course.title}
                          thumbnail={course.thumbnail}
                          Language={course.language}
                          lessons={`${course.lessons} Lessons`}
                          hours={formatDuration(course.duration)}
                          progress={course.progress}
                          actionButton={
                            <Button
                              variant="text"
                              endIcon={
                                <ShoppingBagRounded
                                  sx={{ width: 16, height: 16 }}
                                />
                              }
                              size="small"
                              onClick={() => handlePurchase(course.id)}
                              sx={{
                                textTransform: "none",
                                color: "white",
                                bgcolor: "var(--primary-color)",
                                fontFamily: "Lato",
                                fontSize: "12px",
                                fontWeight: 700,
                                px: 2,
                                borderRadius: "8px",
                              }}
                            >
                              Enroll
                            </Button>
                          }
                          actionMobile={
                            <Button
                              variant="contained"
                              endIcon={
                                <ShoppingBagRounded
                                  sx={{ width: 16, height: 16 }}
                                />
                              }
                              sx={{
                                textTransform: "none",
                                color: "white",
                                bgcolor: "var(--primary-color)",
                                borderRadius: "0px 0px 10px 10px",
                                fontWeight: 700,
                              }}
                              onClick={() => handlePurchase(course.id)}
                            >
                              Enroll Now
                            </Button>
                          }
                        />
                      ))}
                    </Stack>
                  ) : (
                    <NoDataFound info="No Courses Available" />
                  )}
                </Stack>

                {/* Quizzes */}
                <Stack gap="12px">
                  <Stack gap="4px">
                    <Typography
                      sx={{
                        fontSize: { xs: "16px", md: "18px" },
                        fontWeight: 700,
                        color: "var(--text1)",
                      }}
                    >
                      Weekly Quizzes
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: "13px",
                        color: "var(--text3)",
                        fontWeight: 500,
                      }}
                    >
                      Test your knowledge regularly
                    </Typography>
                  </Stack>
                  <PracticeTest />
                </Stack>
              </Stack>

              {/* RIGHT COLUMN (Desktop) - Sticky Sidebar */}
              <Stack
                display={{ xs: "none", lg: "flex" }}
                gap={2}
                sx={{
                  minWidth: "280px",
                  maxWidth: "320px",
                  position: "sticky",
                  top: "24px",
                  alignSelf: "flex-start",
                  height: "fit-content",
                }}
              >
                {/* Quick Actions */}
                <Stack
                  sx={{
                    bgcolor: "var(--white)",
                    p: "16px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                  }}
                  gap={1.5}
                >
                  <Typography
                    sx={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "var(--text1)",
                      mb: 0.5,
                    }}
                  >
                    Quick Actions
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<PlayArrow sx={{ fontSize: 18 }} />}
                    onClick={() => {
                      if (stats?.lastActiveCourseID) {
                        router.push(
                          `/dashboard/${goalID}/courses/${stats.lastActiveCourseID}`
                        );
                      } else {
                        router.push(`/dashboard/${goalID}/courses`);
                      }
                    }}
                    sx={{
                      bgcolor: "var(--primary-color)",
                      textTransform: "none",
                      borderRadius: "8px",
                      py: 1.2,
                      fontSize: "13px",
                      fontWeight: 700,
                      "&:hover": {
                        bgcolor: "var(--primary-color-dark)",
                      },
                      transition: "all 0.15s ease",
                    }}
                  >
                    Resume Learning
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AccessTime sx={{ fontSize: 18 }} />}
                    onClick={() => router.push(`/dashboard/${goalID}/exam`)}
                    sx={{
                      borderColor: "var(--border-color)",
                      color: "var(--text3)",
                      textTransform: "none",
                      borderRadius: "8px",
                      py: 1.2,
                      fontSize: "13px",
                      fontWeight: 600,
                      "&:hover": {
                        borderColor: "var(--primary-color)",
                        bgcolor: "var(--bg-color)",
                      },
                      transition: "all 0.15s ease",
                    }}
                  >
                    View Schedule
                  </Button>
                </Stack>

                {/* Contents */}
                <Box
                  sx={{
                    bgcolor: "var(--white)",
                    borderRadius: "10px",
                    p: "16px",
                    border: "1px solid var(--border-color)",
                    maxHeight: "calc(100vh - 280px)",
                    overflowY: "auto",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "15px",
                      fontWeight: 700,
                      mb: 1.5,
                      color: "var(--text1)",
                    }}
                  >
                    Course Content
                  </Typography>
                  <GoalContents
                    blogList={blogList}
                    selectedBlog={selectedBlog}
                    onClick={getBlogData}
                  />
                </Box>
              </Stack>

              {/* MOBILE SIDEBAR */}
              <MobileSidebar
                blogList={blogList}
                selectedBlog={selectedBlog}
                onClick={getBlogData}
              />
            </Stack>
          </Stack>
        </>
      )}
    </Stack>
  );
}
