"use client";
import {
  East,
  AccessTime,
  Assignment,
  EmojiEvents,
  Close,
} from "@mui/icons-material";
import { Button, Stack, Typography, Box, Tabs, Tab, Chip } from "@mui/material";
import mocks from "@/public/icons/mocks.svg";
import PrimaryCard from "@/src/Components/PrimaryCard/PrimaryCard";
import { useRouter } from "next/navigation";
import NoDataFound from "@/src/Components/NoDataFound/NoDataFound";
import PrimaryCardSkeleton from "@/src/Components/SkeletonCards/PrimaryCardSkeleton";
import { useEffect, useState, useCallback, useMemo } from "react";
import SecondaryCardSkeleton from "@/src/Components/SkeletonCards/SecondaryCardSkeleton";
import banking from "@/public/icons/banking.svg";
import Image from "next/image";

export default function Exams({ scheduledExams, examID, batchID }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [examHistory, setExamHistory] = useState([]);
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Fetch history, memoized
  const fetchHistory = useCallback(async () => {
    if (!examID) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/my-classroom/${batchID}/get-scheduled-history`
      );
      const data = await res.json();
      if (data.success) {
        setExamHistory(data.data || []);
        setIsLoading(false);
      } else {
        setExamHistory([]);
      }
    } catch (err) {
      setExamHistory([]);
      setIsLoading(false);
    }
  }, [examID, batchID, setIsLoading]);

  // Run on mount or when examID changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Split scheduledExams into active and expired
  const { activeExams, expiredExams } = useMemo(() => {
    if (!Array.isArray(scheduledExams))
      return { activeExams: [], expiredExams: [] };

    const now = new Date();
    const active = [];
    const expired = [];

    scheduledExams.forEach((exam) => {
      const { startTimeStamp, duration, endTimeStamp } = exam;
      const startDate = new Date(startTimeStamp);
      const endDate = endTimeStamp
        ? new Date(endTimeStamp)
        : new Date(startDate.getTime() + (duration || 60) * 60000);

      if (now > endDate) {
        expired.push({ ...exam, endDate });
      } else {
        active.push(exam);
      }
    });

    return { activeExams: active, expiredExams: expired };
  }, [scheduledExams]);

  // Memoize scheduled exam list items (Active Only)
  const examList = useMemo(() => {
    return activeExams.map((exam) => {
      const {
        id,
        title,
        startTimeStamp,
        duration,
        totalQuestions,
        totalMarks,
        endTimeStamp,
      } = exam;
      const startDate = new Date(startTimeStamp);
      const endDate = endTimeStamp
        ? new Date(endTimeStamp)
        : new Date(startDate.getTime() + (duration || 60) * 60000);

      const dateStr = startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const startTimeStr = startDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const endTimeStr = endDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const handleStart = () => {
        router.push(`/exam/${id}`);
      };
      return {
        key: id,
        title,
        dateStr,
        startTimeStr,
        endTimeStr,
        duration: duration || 60,
        totalQuestions: totalQuestions || 0,
        totalMarks: totalMarks || 0,
        actionButton: (
          <Button
            variant="contained"
            endIcon={<East />}
            sx={{
              textTransform: "none",
              fontFamily: "var(--font-geist-sans)",
              backgroundColor: "var(--primary-color)",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
              padding: "8px 20px",
              fontSize: "14px",
              fontWeight: 600,
              "&:hover": {
                backgroundColor: "var(--primary-color)",
                boxShadow: "0 6px 16px rgba(37, 99, 235, 0.3)",
              },
            }}
            onClick={handleStart}
            disableElevation
          >
            Start Exam
          </Button>
        ),
      };
    });
  }, [activeExams, router]);

  // Memoize history cards (History + Expired)
  const historyList = useMemo(() => {
    const attempts = Array.isArray(examHistory)
      ? examHistory.map((exam) => {
          const {
            id: attemptId,
            examID: exID,
            title,
            obtainedMarks,
            totalMarks,
            totalQuestions,
            duration,
            status,
            startTimeStamp,
          } = exam;

          const date = new Date(startTimeStamp || Date.now());
          const dateStr = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });

          const handleClick = () => {
            if (status === "COMPLETED") {
              router.push(`/exam/${exID}/${attemptId}/result`);
            } else {
              router.push(`/exam/${exID}/${attemptId}`);
            }
          };

          return {
            key: attemptId,
            title,
            dateStr,
            duration,
            totalQuestions,
            totalMarks,
            status,
            leftBlock: (
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{
                  backgroundColor:
                    status === "COMPLETED"
                      ? "rgba(16, 185, 129, 0.1)"
                      : "var(--primary-color-acc-2)",
                  borderRadius: "16px",
                  padding: "12px",
                  minWidth: "80px",
                  height: "80px",
                }}
              >
                {status === "COMPLETED" ? (
                  <>
                    <Typography
                      sx={{
                        fontFamily: "var(--font-geist-sans)",
                        fontWeight: 800,
                        fontSize: "20px",
                        color: "var(--success-color)",
                        lineHeight: 1,
                      }}
                    >
                      {obtainedMarks}
                    </Typography>
                    <Box
                      sx={{
                        width: "100%",
                        height: "1px",
                        backgroundColor: "var(--success-color)",
                        opacity: 0.3,
                        my: 0.5,
                      }}
                    />
                    <Typography
                      sx={{
                        fontFamily: "var(--font-geist-sans)",
                        fontWeight: 600,
                        fontSize: "12px",
                        color: "var(--success-color)",
                      }}
                    >
                      {totalMarks}
                    </Typography>
                  </>
                ) : (
                  <Typography
                    sx={{
                      fontFamily: "var(--font-geist-sans)",
                      fontWeight: 700,
                      fontSize: "14px",
                      color: "var(--primary-color)",
                      textAlign: "center",
                    }}
                  >
                    In Progress
                  </Typography>
                )}
              </Stack>
            ),
            actionButton: (
              <Button
                variant={status === "COMPLETED" ? "outlined" : "contained"}
                onClick={handleClick}
                sx={{
                  textTransform: "none",
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "var(--font-geist-sans)",
                  borderRadius: "8px",
                  padding: "8px 20px",
                  backgroundColor:
                    status === "COMPLETED"
                      ? "transparent"
                      : "var(--primary-color)",
                  color:
                    status === "COMPLETED" ? "var(--primary-color)" : "white",
                  borderColor: "var(--primary-color)",
                  boxShadow:
                    status === "COMPLETED"
                      ? "none"
                      : "0 4px 12px rgba(37, 99, 235, 0.2)",
                  "&:hover": {
                    backgroundColor:
                      status === "COMPLETED"
                        ? "var(--primary-color-acc-2)"
                        : "var(--primary-color)",
                    borderColor: "var(--primary-color)",
                  },
                }}
                disableElevation
              >
                {status === "COMPLETED" ? "View Result" : "Continue"}
              </Button>
            ),
          };
        })
      : [];

    const attemptedExamIDs = new Set(
      Array.isArray(examHistory) ? examHistory.map((e) => e.examID) : []
    );

    const missed = expiredExams
      .filter((exam) => !attemptedExamIDs.has(exam.id))
      .map((exam) => {
        const {
          id,
          title,
          duration,
          totalQuestions,
          totalMarks,
          endTimeStamp,
        } = exam;
        const date = endTimeStamp ? new Date(endTimeStamp) : new Date();
        const dateStr = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        return {
          key: `expired-${id}`,
          title,
          dateStr,
          duration: duration || 60,
          totalQuestions: totalQuestions || 0,
          totalMarks: totalMarks || 0,
          status: "EXPIRED",
          leftBlock: (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{
                backgroundColor: "var(--bg-color)",
                borderRadius: "16px",
                padding: "12px",
                minWidth: "80px",
                height: "80px",
                border: "1px solid var(--border-color)",
              }}
            >
              <Typography
                sx={{
                  fontFamily: "var(--font-geist-sans)",
                  fontWeight: 700,
                  fontSize: "12px",
                  color: "var(--text3)",
                  textTransform: "uppercase",
                }}
              >
                Expired
              </Typography>
              <Typography
                sx={{
                  fontFamily: "var(--font-geist-sans)",
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "var(--text2)",
                  marginTop: "4px",
                }}
              >
                {dateStr}
              </Typography>
            </Stack>
          ),
          actionButton: (
            <Button
              variant="outlined"
              disabled
              startIcon={<Close />}
              sx={{
                textTransform: "none",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "var(--font-geist-sans)",
                borderRadius: "8px",
                padding: "8px 20px",
                borderColor: "var(--border-color)",
                color: "var(--text3)",
                "&.Mui-disabled": {
                  borderColor: "var(--border-color)",
                  color: "var(--text3)",
                },
              }}
              disableElevation
            >
              Expired
            </Button>
          ),
        };
      });

    return [...attempts, ...missed];
  }, [examHistory, expiredExams, router]);

  return (
    <Stack gap={3}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{
            "& .MuiTab-root": {
              textTransform: "none",
              fontFamily: "var(--font-geist-sans)",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text2)",
              minHeight: "48px",
            },
            "& .Mui-selected": {
              color: "var(--primary-color) !important",
            },
            "& .MuiTabs-indicator": {
              backgroundColor: "var(--primary-color)",
              height: "3px",
              borderRadius: "3px 3px 0 0",
            },
          }}
        >
          <Tab label={`Upcoming Exams (${activeExams.length})`} />
          <Tab label={`History (${historyList.length})`} />
        </Tabs>
      </Box>

      {/* Upcoming Exams Tab */}
      <div role="tabpanel" hidden={tabValue !== 0}>
        {tabValue === 0 && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(auto-fill, minmax(400px, 1fr))",
              },
              gap: 3,
            }}
          >
            {!isLoading ? (
              examList.length > 0 ? (
                examList.map((item) => (
                  <Stack
                    key={item.key}
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                    gap={3}
                    sx={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "20px",
                      padding: "24px",
                      backgroundColor: "var(--white)",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 12px 24px rgba(0,0,0,0.05)",
                        borderColor: "var(--primary-color)",
                      },
                    }}
                  >
                    <Stack
                      direction="row"
                      gap={3}
                      alignItems="center"
                      width="100%"
                    >
                      {/* Date Block */}
                      <Stack
                        alignItems="center"
                        justifyContent="center"
                        sx={{
                          backgroundColor: "var(--sec-color-acc-2)",
                          borderRadius: "16px",
                          padding: "12px",
                          minWidth: "70px",
                          height: "70px",
                        }}
                      >
                        <Typography
                          sx={{
                            fontFamily: "var(--font-geist-sans)",
                            fontWeight: 700,
                            fontSize: "14px",
                            color: "var(--primary-color)",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.dateStr.split(" ")[0]}
                        </Typography>
                        <Typography
                          sx={{
                            fontFamily: "var(--font-geist-sans)",
                            fontWeight: 800,
                            fontSize: "24px",
                            color: "var(--text1)",
                            lineHeight: 1,
                          }}
                        >
                          {item.dateStr.split(" ")[1]}
                        </Typography>
                      </Stack>

                      {/* Info Block */}
                      <Stack gap={1} flex={1}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontFamily: "var(--font-geist-sans)",
                            fontWeight: 700,
                            fontSize: "18px",
                            color: "var(--text1)",
                            lineHeight: 1.3,
                          }}
                        >
                          {item.title}
                        </Typography>

                        <Stack
                          direction="row"
                          flexWrap="wrap"
                          gap={2}
                          alignItems="center"
                        >
                          <Chip
                            label={`${item.startTimeStr} - ${item.endTimeStr}`}
                            size="small"
                            icon={
                              <AccessTime
                                sx={{ fontSize: "14px !important" }}
                              />
                            }
                            sx={{
                              fontFamily: "var(--font-geist-sans)",
                              backgroundColor: "var(--bg-color)",
                              fontWeight: 600,
                              color: "var(--text2)",
                              borderRadius: "8px",
                            }}
                          />
                          <Stack
                            direction="row"
                            gap={2}
                            sx={{ display: { xs: "none", md: "flex" } }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              gap={0.5}
                            >
                              <AccessTime
                                sx={{ fontSize: 16, color: "var(--text2)" }}
                              />
                              <Typography
                                sx={{
                                  fontFamily: "var(--font-geist-sans)",
                                  fontSize: "13px",
                                  color: "var(--text2)",
                                  fontWeight: 500,
                                }}
                              >
                                {item.duration} mins
                              </Typography>
                            </Stack>
                            <Stack
                              direction="row"
                              alignItems="center"
                              gap={0.5}
                            >
                              <Assignment
                                sx={{ fontSize: 16, color: "var(--text2)" }}
                              />
                              <Typography
                                sx={{
                                  fontFamily: "var(--font-geist-sans)",
                                  fontSize: "13px",
                                  color: "var(--text2)",
                                  fontWeight: 500,
                                }}
                              >
                                {item.totalQuestions} Qs
                              </Typography>
                            </Stack>
                            <Stack
                              direction="row"
                              alignItems="center"
                              gap={0.5}
                            >
                              <EmojiEvents
                                sx={{ fontSize: 16, color: "var(--text2)" }}
                              />
                              <Typography
                                sx={{
                                  fontFamily: "var(--font-geist-sans)",
                                  fontSize: "13px",
                                  color: "var(--text2)",
                                  fontWeight: 500,
                                }}
                              >
                                {item.totalMarks} Marks
                              </Typography>
                            </Stack>
                          </Stack>
                        </Stack>
                      </Stack>
                    </Stack>

                    {/* Action Button */}
                    <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
                      {item.actionButton}
                    </Box>
                  </Stack>
                ))
              ) : (
                <Stack
                  gridColumn="1 / -1"
                  alignItems="center"
                  justifyContent="center"
                  minHeight="300px"
                >
                  <NoDataFound info="No upcoming exams scheduled." />
                </Stack>
              )
            ) : (
              <PrimaryCardSkeleton />
            )}
          </Box>
        )}
      </div>

      {/* History Tab */}
      <div role="tabpanel" hidden={tabValue !== 1}>
        {tabValue === 1 && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(auto-fill, minmax(400px, 1fr))",
              },
              gap: 3,
            }}
          >
            {!isLoading ? (
              historyList.length > 0 ? (
                historyList.map((item) => (
                  <Stack
                    key={item.key}
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                    gap={3}
                    sx={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "20px",
                      padding: "24px",
                      backgroundColor: "var(--white)",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 12px 24px rgba(0,0,0,0.05)",
                        borderColor: "var(--primary-color)",
                      },
                    }}
                  >
                    <Stack
                      direction="row"
                      gap={3}
                      alignItems="center"
                      width="100%"
                    >
                      {/* Left Block (Score/Expired) */}
                      {item.leftBlock}

                      {/* Info Block */}
                      <Stack gap={1} flex={1}>
                        <Typography
                          variant="h6"
                          sx={{
                            fontFamily: "var(--font-geist-sans)",
                            fontWeight: 700,
                            fontSize: "18px",
                            color: "var(--text1)",
                            lineHeight: 1.3,
                          }}
                        >
                          {item.title}
                        </Typography>

                        <Stack
                          direction="row"
                          flexWrap="wrap"
                          gap={2}
                          alignItems="center"
                        >
                          <Stack direction="row" alignItems="center" gap={0.5}>
                            <AccessTime
                              sx={{ fontSize: 16, color: "var(--text2)" }}
                            />
                            <Typography
                              sx={{
                                fontFamily: "var(--font-geist-sans)",
                                fontSize: "13px",
                                color: "var(--text2)",
                                fontWeight: 500,
                              }}
                            >
                              {item.duration} mins
                            </Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" gap={0.5}>
                            <Assignment
                              sx={{ fontSize: 16, color: "var(--text2)" }}
                            />
                            <Typography
                              sx={{
                                fontFamily: "var(--font-geist-sans)",
                                fontSize: "13px",
                                color: "var(--text2)",
                                fontWeight: 500,
                              }}
                            >
                              {item.totalQuestions} Qs
                            </Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" gap={0.5}>
                            <EmojiEvents
                              sx={{ fontSize: 16, color: "var(--text2)" }}
                            />
                            <Typography
                              sx={{
                                fontFamily: "var(--font-geist-sans)",
                                fontSize: "13px",
                                color: "var(--text2)",
                                fontWeight: 500,
                              }}
                            >
                              {item.totalMarks} Marks
                            </Typography>
                          </Stack>
                        </Stack>
                      </Stack>
                    </Stack>

                    {/* Action Button */}
                    <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
                      {item.actionButton}
                    </Box>
                  </Stack>
                ))
              ) : (
                <Stack
                  gridColumn="1 / -1"
                  alignItems="center"
                  justifyContent="center"
                  minHeight="300px"
                >
                  <NoDataFound info="No exam history available." />
                </Stack>
              )
            ) : (
              <SecondaryCardSkeleton />
            )}
          </Box>
        )}
      </div>
    </Stack>
  );
}
