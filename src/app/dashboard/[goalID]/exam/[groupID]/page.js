"use client";
import {
  Stack,
  Button,
  Typography,
  Skeleton,
  Box,
  Chip,
  Grid,
} from "@mui/material";
import {
  ArrowBack,
  AccessTime,
  Quiz,
  EmojiEvents,
  Lock,
  CheckCircle,
  TrendingUp,
} from "@mui/icons-material";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import NoDataFound from "@/src/Components/NoDataFound/NoDataFound";
import { useSession } from "next-auth/react";
import ExamCard from "@/src/Components/ExamCard/ExamCard";
import trophy from "@/public/icons/troffy.svg";

import ExamInstructionDialog from "@/src/Components/ExamInstruction/ExamInstructionDialog";

export default function GroupID() {
  const { data: session } = useSession();
  const isPro = session?.user?.accountType === "PRO";
  const router = useRouter();
  const { groupID } = useParams();
  const params = useParams();
  const goalID = params.goalID;
  const [groupExam, setGroupExam] = useState([]);
  const [groupExamData, setGroupExamData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [instructionOpen, setInstructionOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);

  const handleExamClick = (exam) => {
    setSelectedExam(exam);
    setInstructionOpen(true);
  };

  const handleStartExam = () => {
    if (selectedExam) {
      router.push(`/exam/${selectedExam.id}`);
    }
    setInstructionOpen(false);
  };

  const fetchGroupExam = async () => {
    setLoading(true);
    const response = await fetch(
      `/api/exams/type/${groupID}/group/all-exams`
    );
    const data = await response.json();
    if (data.success) {
      setGroupExam(data.data);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupExam();
  }, []);

  const fetchGroupExamData = useCallback(async () => {
    setLoading(true);
    const response = await fetch(
      `/api/exams/type/${goalID}/group/get-group`,
      {
        method: "POST",
        body: JSON.stringify({
          groupID: groupID,
        }),
      }
    );
    const data = await response.json();
    if (data.success) {
      setGroupExamData(data.data);
    }
    setLoading(false);
  }, [groupID, goalID]);

  useEffect(() => {
    fetchGroupExamData();
  }, [fetchGroupExamData, goalID]);

  const completedCount = groupExam.filter(
    (exam) => exam.status === "completed"
  ).length;
  const totalExams = groupExam.length;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "var(--library-expand)",
        pb: { xs: 10, md: 4 },
      }}
    >
      <Stack
        gap={4}
        width="100%"
        maxWidth="1200px"
        margin="0 auto"
        p={{ xs: 2, md: 3 }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          gap={2}
          sx={{
            bgcolor: "var(--white)",
            p: { xs: 2, md: 3 },
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            boxShadow: "0px 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <Button
            onClick={() => router.back()}
            sx={{
              minWidth: "auto",
              p: 1,
              borderRadius: "12px",
              color: "var(--text2)",
              "&:hover": {
                bgcolor: "var(--library-expand)",
                color: "var(--primary-color)",
              },
            }}
          >
            <ArrowBack />
          </Button>
          <Stack flex={1}>
            <Typography
              sx={{
                fontSize: { xs: "20px", md: "24px" },
                fontWeight: 800,
                color: "var(--text1)",
              }}
            >
              {loading ? (
                <Skeleton variant="text" width={200} />
              ) : (
                groupExamData?.title || "Exam Group"
              )}
            </Typography>
            <Typography
              sx={{
                fontSize: "14px",
                color: "var(--text3)",
                mt: 0.5,
              }}
            >
              {loading ? (
                <Skeleton variant="text" width={150} />
              ) : (
                `${totalExams} ${
                  totalExams === 1 ? "Exam" : "Exams"
                } • ${completedCount} Completed`
              )}
            </Typography>
          </Stack>
        </Stack>

        {/* Stats Overview */}
        {!loading && totalExams > 0 && (
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Box
                sx={{
                  bgcolor: "var(--white)",
                  p: 2,
                  borderRadius: "16px",
                  border: "1px solid var(--border-color)",
                  textAlign: "center",
                }}
              >
                <Quiz
                  sx={{ fontSize: 32, color: "var(--primary-color)", mb: 1 }}
                />
                <Typography
                  sx={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "var(--text1)",
                  }}
                >
                  {totalExams}
                </Typography>
                <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
                  Total Tests
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Box
                sx={{
                  bgcolor: "var(--white)",
                  p: 2,
                  borderRadius: "16px",
                  border: "1px solid var(--border-color)",
                  textAlign: "center",
                }}
              >
                <CheckCircle sx={{ fontSize: 32, color: "#22c55e", mb: 1 }} />
                <Typography
                  sx={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "var(--text1)",
                  }}
                >
                  {completedCount}
                </Typography>
                <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
                  Completed
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Box
                sx={{
                  bgcolor: "var(--white)",
                  p: 2,
                  borderRadius: "16px",
                  border: "1px solid var(--border-color)",
                  textAlign: "center",
                }}
              >
                <TrendingUp
                  sx={{ fontSize: 32, color: "var(--sec-color)", mb: 1 }}
                />
                <Typography
                  sx={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "var(--text1)",
                  }}
                >
                  {totalExams > 0
                    ? Math.round((completedCount / totalExams) * 100)
                    : 0}
                  %
                </Typography>
                <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
                  Progress
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Box
                sx={{
                  bgcolor: "var(--white)",
                  p: 2,
                  borderRadius: "16px",
                  border: "1px solid var(--border-color)",
                  textAlign: "center",
                }}
              >
                <EmojiEvents sx={{ fontSize: 32, color: "#f59e0b", mb: 1 }} />
                <Typography
                  sx={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "var(--text1)",
                  }}
                >
                  {totalExams - completedCount}
                </Typography>
                <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
                  Remaining
                </Typography>
              </Box>
            </Grid>
          </Grid>
        )}

        {/* Exams Grid */}
        <Box>
          <Typography
            sx={{
              fontSize: "18px",
              fontWeight: 800,
              color: "var(--text1)",
              mb: 2,
            }}
          >
            Available Tests
          </Typography>
          <Grid container spacing={3}>
            {!loading ? (
              groupExam.length > 0 ? (
                groupExam.map((group, index) => {
                  const isLocked = !isPro && group.settings?.isProTest;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <ExamCard
                        title={group.title}
                        icon={trophy.src}
                        duration={group.duration || 60}
                        totalQuestions={group.totalQuestions || 0}
                        totalMarks={group.totalMarks || 100}
                        difficulty={group.difficulty || "medium"}
                        status={group.status || "upcoming"}
                        isPro={group.settings?.isProTest}
                        actionButton={
                          <Button
                            variant="contained"
                            fullWidth
                            disabled={isLocked}
                            startIcon={isLocked ? <Lock /> : null}
                            onClick={() => handleExamClick(group)}
                            sx={{
                              bgcolor: isLocked
                                ? "var(--border-color)"
                                : "var(--primary-color)",
                              color: "var(--white)",
                              fontWeight: 700,
                              textTransform: "none",
                              py: 1.2,
                              borderRadius: "12px",
                              "&:hover": {
                                bgcolor: isLocked
                                  ? "var(--border-color)"
                                  : "var(--primary-color-dark)",
                              },
                            }}
                          >
                            {isLocked ? "PRO Only" : "Start Test"}
                          </Button>
                        }
                      />
                    </Grid>
                  );
                })
              ) : (
                <Grid item xs={12}>
                  <Box
                    sx={{
                      bgcolor: "var(--white)",
                      p: 6,
                      borderRadius: "20px",
                      border: "2px dashed var(--border-color)",
                      textAlign: "center",
                    }}
                  >
                    <NoDataFound info="No exams available in this group" />
                  </Box>
                </Grid>
              )
            ) : (
              [...Array(6)].map((_, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Box
                    sx={{
                      bgcolor: "var(--white)",
                      p: 3,
                      borderRadius: "16px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <Skeleton
                      variant="rectangular"
                      height={120}
                      sx={{ borderRadius: 2, mb: 2 }}
                    />
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="60%" />
                  </Box>
                </Grid>
              ))
            )}
          </Grid>
        </Box>
      </Stack>

      {selectedExam && (
        <ExamInstructionDialog
          open={instructionOpen}
          onClose={() => setInstructionOpen(false)}
          onStart={handleStartExam}
          examData={{
            title: selectedExam.title,
            icon: trophy.src,
            duration: selectedExam.duration,
            totalQuestions: selectedExam.totalQuestions,
            totalMarks: selectedExam.totalMarks,
          }}
        />
      )}
    </Box>
  );
}
