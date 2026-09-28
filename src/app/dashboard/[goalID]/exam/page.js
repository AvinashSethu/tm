"use client";
import { useEffect, useState } from "react";
import Header from "@/src/Components/Header/Header";
import {
  Stack,
  Typography,
  Button,
  IconButton,
  DialogContent,
  Tabs,
  Tab,
  Box,
  CircularProgress,
} from "@mui/material";
import { Close, Lock, East } from "@mui/icons-material";
import mocks from "@/public/icons/mocks.svg";
import troffy from "@/public/icons/week2.svg";
import DialogBox from "@/src/Components/DialogBox/DialogBox";
import StyledSelect from "@/src/Components/StyledSelect/StyledSelect";
import { useRouter, useParams } from "next/navigation";
import PrimaryCardSkeleton from "@/src/Components/SkeletonCards/PrimaryCardSkeleton";
import ResponsiveTestSeries from "./Components/ResponsiveTestSeries";
import ExamCard from "@/src/Components/ExamCard/ExamCard";
import LinearProgressLoading from "@/src/Components/LinearProgressLoading/LinearProgressLoading";
import { enqueueSnackbar } from "notistack";
import PageSkeleton from "@/src/Components/SkeletonCards/PageSkeleton";
import ExamGroups from "./Components/ExamGroups";
import { useExams } from "@/src/app/context/ExamProvider";
import { useSession } from "next-auth/react";
import PlansDialogBox from "@/src/Components/PlansDialogBox/PlansDialogBox";
import NoDataFound from "@/src/Components/NoDataFound/NoDataFound";
import ExamInstructionDialog from "@/src/Components/ExamInstruction/ExamInstructionDialog";
import ClassroomView from "../myClassroom/Components/ClassroomView";
import CountdownTimer from "@/src/Components/CountdownTimer/CountdownTimer";

export default function Exams() {
  const { data: session } = useSession();
  const isPro = session?.user?.accountType === "PRO";
  const { group, mock, loading, subjects, history } = useExams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);
  const params = useParams();
  const goalID = params.goalID;
  const [loacalLoading, setLoacalLoading] = useState(false);
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [plansDialogOpen, setPlansDialogOpen] = useState(false);
  const [isCreatingPracticeTest, setIsCreatingPracticeTest] = useState(false);

  const [instructionOpen, setInstructionOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [isStartingExam, setIsStartingExam] = useState(false);

  const [directExams, setDirectExams] = useState([]);
  const [directExamsLoading, setDirectExamsLoading] = useState(true);

  useEffect(() => {
    const fetchDirectExams = async () => {
      try {
        const res = await fetch("/api/my-exams/get-schedule-exam");
        const data = await res.json();
        if (data.success) setDirectExams(data.data || []);
      } catch (err) {
        console.error("Failed to fetch assigned exams:", err);
      } finally {
        setDirectExamsLoading(false);
      }
    };
    fetchDirectExams();
  }, []);

  const handleExamClick = (exam) => {
    setSelectedExam(exam);
    setInstructionOpen(true);
  };

  const handleStartExam = () => {
    if (selectedExam) {
      setLoacalLoading(true);
      setIsStartingExam(true); // Set new loading state for dialog
      router.push(`/exam/${selectedExam.id}`);
    }
    // Do not close immediately
    // setInstructionOpen(false);
  };

  // Tab State
  const [tabValue, setTabValue] = useState(0);
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handlePlansDialogClose = () => {
    setPlansDialogOpen(false);
  };
  const handlePlansDialogOpen = () => {
    setPlansDialogOpen(true);
  };

  useEffect(() => {
    if (subjects) {
      const subjectsOptions = subjects.map((subject) => ({
        label: subject.title,
        value: subject.subjectID,
      }));
      setSubjectOptions(subjectsOptions);
    }
  }, [subjects]);

  const difficultyLevelOptions = [
    { label: "All", value: "all" },
    { label: "Easy", value: 0 },
    { label: "Medium", value: 1 },
    { label: "Hard", value: 2 },
  ];

  const handleStartTest = async () => {
    if (!selectedSubject) {
      enqueueSnackbar("Please select a subject", {
        variant: "error",
      });
      return;
    }

    setIsCreatingPracticeTest(true);
    try {
      const response = await fetch(
        `/api/exams/type/${goalID}/practice/create`,
        {
          method: "POST",
          body: JSON.stringify({
            subjectID: selectedSubject,
            ...(difficultyLevel !== "all" && { difficultyLevel }),
          }),
        },
      );
      const data = await response.json();
      if (data.success) {
        router.push(`/exam/${data.data.examID}/${data.data.attemptID}`);
      } else {
        enqueueSnackbar(data.message, {
          variant: "error",
        });
        setIsCreatingPracticeTest(false);
      }
    } catch (error) {
      enqueueSnackbar("Failed to create practice test", { variant: "error" });
      setIsCreatingPracticeTest(false);
    }
  };

  return (
    <Stack width="100%" alignItems="center">
      {loacalLoading && <LinearProgressLoading />}
      {loading ? (
        <PageSkeleton />
      ) : (
        <Stack width="100%" maxWidth="1200px">
          <Stack spacing={3} padding={{ xs: 2, md: 4 }}>
            <Header />

            {/* Tabs Header */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ borderBottom: "1px solid var(--border-color)", mb: 4 }}
            >
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons
                allowScrollButtonsMobile
                sx={{
                  "& .MuiTab-root": {
                    textTransform: "none",
                    fontSize: { xs: "14px", md: "16px" },
                    fontWeight: 600,
                    fontFamily: "var(--font-geist-sans)",
                    minWidth: { xs: "auto", md: "120px" },
                    padding: { xs: "12px 16px", md: "12px 16px" },
                    color: "var(--text2)",
                  },
                  "& .Mui-selected": {
                    color: "var(--primary-color) !important",
                  },
                  "& .MuiTabs-indicator": {
                    backgroundColor: "var(--primary-color)",
                    height: "3px",
                    borderRadius: "3px 3px 0 0",
                  },
                  "& .MuiTabs-scrollButtons": {
                    "&.Mui-disabled": {
                      opacity: 0.3,
                    },
                  },
                }}
              >
                <Tab label="Available Exams" />
                <Tab label="Exam History" />
                <Tab label="My Classrooms" />
              </Tabs>
            </Stack>

            {/* Tab 1: Available Exams */}
            <Box role="tabpanel" hidden={tabValue !== 0}>
              {tabValue === 0 && (
                <Stack gap={{ xs: 3, md: 5 }}>

                  {/* Scheduled / Assigned Exams */}
                  {(directExamsLoading || directExams.length > 0) && (
                    <Stack spacing={3}>
                      <Typography
                        variant="h5"
                        sx={{ fontWeight: 700, color: "var(--text1)", fontSize: { xs: "16px", md: "18px" } }}
                      >
                        Scheduled Exams
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(280px, 1fr))" },
                          gap: 3,
                        }}
                      >
                        {directExamsLoading ? (
                          <PrimaryCardSkeleton />
                        ) : (
                          directExams.map((exam) => {
                            const now = Date.now();
                            const startDate = exam.startTimeStamp ? new Date(exam.startTimeStamp) : null;
                            const endDate = exam.endTimeStamp
                              ? new Date(exam.endTimeStamp)
                              : startDate
                                ? new Date(startDate.getTime() + (exam.duration || 60) * 60000)
                                : null;
                            const isNotStarted = startDate && now < startDate.getTime();
                            const isExpired = endDate && now > endDate.getTime();
                            return (
                              <ExamCard
                                key={exam.id}
                                title={exam.title}
                                icon={mocks.src}
                                duration={exam.duration || 60}
                                totalQuestions={exam.totalQuestions || 0}
                                totalMarks={exam.totalMarks || 0}
                                difficulty="scheduled"
                                status={isExpired ? "completed" : "live"}
                                actionButton={
                                  isNotStarted ? (
                                    <CountdownTimer targetTime={exam.startTimeStamp} />
                                  ) : !isExpired ? (
                                    <Button
                                      variant="contained"
                                      endIcon={<East />}
                                      onClick={() => router.push(`/exam/${exam.id}`)}
                                      fullWidth
                                      disableElevation
                                      sx={{
                                        textTransform: "none",
                                        backgroundColor: "var(--primary-color)",
                                        fontSize: "14px",
                                        fontWeight: 600,
                                        borderRadius: "10px",
                                        fontFamily: "var(--font-geist-sans)",
                                        py: 1,
                                      }}
                                    >
                                      Start Exam
                                    </Button>
                                  ) : (
                                    <Button variant="outlined" disabled fullWidth sx={{ borderRadius: "10px", textTransform: "none", fontSize: "14px" }}>
                                      Expired
                                    </Button>
                                  )
                                }
                              />
                            );
                          })
                        )}
                      </Box>
                    </Stack>
                  )}

                  <Stack spacing={3}>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 700,
                        color: "var(--text1)",
                        fontSize: { xs: "16px", md: "18px" },
                      }}
                    >
                      Practice Test
                    </Typography>
                    <ExamGroups handleOpen={handleOpen} />
                  </Stack>

                  {/* Test Series Section */}
                  <Stack gap={3}>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 700,
                        color: "var(--text1)",
                        fontSize: { xs: "16px", md: "18px" },
                      }}
                    >
                      Test Series
                    </Typography>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(auto-fill, minmax(280px, 1fr))",
                        },
                        gap: 3,
                      }}
                    >
                      {!loading ? (
                        mock && mock.length > 0 ? (
                          mock.map((test) => (
                            <ExamCard
                              key={test.id}
                              title={test.title}
                              icon={mocks.src}
                              duration={test.duration || 60}
                              totalQuestions={test.totalQuestions || 50}
                              totalMarks={test.totalMarks || 100}
                              difficulty={test.difficulty || "medium"}
                              status={test.status || "upcoming"}
                              actionButton={
                                <Button
                                  variant="outlined"
                                  endIcon={<East />}
                                  onClick={() => handleExamClick(test)}
                                  fullWidth
                                  sx={{
                                    color: "var(--primary-color)",
                                    borderColor: "var(--primary-color)",
                                    textTransform: "none",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    borderRadius: "10px",
                                    fontFamily: "var(--font-geist-sans)",
                                    py: 1,
                                    "&:hover": {
                                      backgroundColor: "var(--sec-color-acc-2)",
                                      borderColor: "var(--primary-color)",
                                    },
                                  }}
                                >
                                  Take Test
                                </Button>
                              }
                            />
                          ))
                        ) : (
                          <Typography color="text.secondary">
                            No test series found
                          </Typography>
                        )
                      ) : (
                        <PrimaryCardSkeleton />
                      )}
                    </Box>
                  </Stack>

                  {/* Exam Groups Section */}
                  <Stack gap={3}>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 700,
                        color: "var(--text1)",
                        fontSize: { xs: "16px", md: "18px" },
                      }}
                    >
                      Exam Groups
                    </Typography>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(auto-fill, minmax(280px, 1fr))",
                        },
                        gap: 3,
                      }}
                    >
                      {!loading ? (
                        group && group.length > 0 ? (
                          group.map((group, index) => (
                            <ExamCard
                              key={index}
                              title={group.title}
                              icon={troffy.src}
                              duration={null}
                              totalQuestions={group.totalExams || 0}
                              totalMarks={null}
                              difficulty="various"
                              status="active"
                              actionButton={
                                <Button
                                  variant="outlined"
                                  onClick={() => {
                                    setLoacalLoading(true);
                                    router.push(
                                      `/dashboard/${goalID}/exam/${group.id}`,
                                    );
                                  }}
                                  endIcon={<East />}
                                  fullWidth
                                  sx={{
                                    textTransform: "none",
                                    color: "var(--primary-color)",
                                    borderColor: "var(--primary-color)",
                                    fontFamily: "var(--font-geist-sans)",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    borderRadius: "10px",
                                    py: 1,
                                    "&:hover": {
                                      backgroundColor: "var(--sec-color-acc-2)",
                                      borderColor: "var(--primary-color)",
                                    },
                                  }}
                                >
                                  View Exams
                                </Button>
                              }
                            />
                          ))
                        ) : (
                          <Typography color="text.secondary">
                            No Group Exams found
                          </Typography>
                        )
                      ) : (
                        <PrimaryCardSkeleton />
                      )}
                    </Box>
                  </Stack>
                </Stack>
              )}
            </Box>

            {/* Tab 2: Exam History */}
            <Box role="tabpanel" hidden={tabValue !== 1}>
              {tabValue === 1 && (
                <Stack gap={3}>
                  <Typography
                    variant="h5"
                    sx={{
                      fontFamily: "var(--font-geist-sans)",
                      fontWeight: 700,
                      color: "var(--text1)",
                    }}
                  >
                    Your Attempts
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(auto-fill, minmax(300px, 1fr))",
                      },
                      gap: 3,
                    }}
                  >
                    {!loading ? (
                      history && history.length > 0 ? (
                        history.map((item, index) => (
                          <ExamCard
                            key={index}
                            title={`${item.title} (${item.type})`}
                            icon={mocks.src}
                            duration={item.duration}
                            totalQuestions={item.totalQuestions}
                            totalMarks={item.totalMarks}
                            difficulty="medium"
                            status={
                              item.status === "COMPLETED" ? "completed" : "live"
                            }
                            score={
                              item.status === "COMPLETED"
                                ? item.obtainedMarks
                                : null
                            }
                            actionButton={
                              item.status === "COMPLETED" ? (
                                <Button
                                  variant="outlined"
                                  onClick={() =>
                                    router.push(
                                      `/exam/${item.examID}/${item.id}/result`,
                                    )
                                  }
                                  fullWidth
                                  sx={{
                                    textTransform: "none",
                                    color: "var(--sec-color)",
                                    borderColor: "var(--sec-color)",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    borderRadius: "10px",
                                    fontFamily: "var(--font-geist-sans)",
                                    py: 1,
                                  }}
                                >
                                  View Result
                                </Button>
                              ) : (
                                <Button
                                  variant="contained"
                                  onClick={() =>
                                    router.push(
                                      `/exam/${item.examID}/${item.id}`,
                                    )
                                  }
                                  fullWidth
                                  sx={{
                                    textTransform: "none",
                                    backgroundColor: "var(--primary-color)",
                                    color: "white",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    borderRadius: "10px",
                                    fontFamily: "var(--font-geist-sans)",
                                    py: 1,
                                  }}
                                >
                                  Continue Test
                                </Button>
                              )
                            }
                          />
                        ))
                      ) : (
                        <Stack
                          width="100%"
                          height="400px"
                          justifyContent="center"
                          alignItems="center"
                          gridColumn="1 / -1"
                        >
                          <NoDataFound info="You have not taken any exams yet." />
                        </Stack>
                      )
                    ) : (
                      <PrimaryCardSkeleton />
                    )}
                  </Box>
                </Stack>
              )}
            </Box>

            {/* Tab 3: My Classrooms */}
            <Box role="tabpanel" hidden={tabValue !== 2}>
              {tabValue === 2 && <ClassroomView />}
            </Box>
          </Stack>
        </Stack>
      )}
      <PlansDialogBox
        plansDialogOpen={plansDialogOpen}
        handlePlansDialogClose={handlePlansDialogClose}
      />

      {subjectOptions.length > 0 && (
        <DialogBox
          isOpen={open}
          title="Take a Practice Test"
          onClose={handleClose}
          icon={
            <IconButton
              onClick={handleClose}
              sx={{ borderRadius: "8px", padding: "4px" }}
            >
              <Close />
            </IconButton>
          }
          actionButton={
            <Button
              variant="text"
              onClick={isPro ? handleStartTest : handlePlansDialogOpen}
              disabled={isCreatingPracticeTest}
              endIcon={
                isCreatingPracticeTest ? (
                  <CircularProgress size={20} color="inherit" />
                ) : isPro ? (
                  <East />
                ) : (
                  <Lock />
                )
              }
              sx={{
                textTransform: "none",
                color: "var(--primary-color)",
                fontFamily: "var(--font-geist-sans)",
                fontSize: "16px",
                fontWeight: 600,
              }}
            >
              {isCreatingPracticeTest
                ? "Starting..."
                : isPro
                  ? "Start Test"
                  : "Upgrade to PRO"}
            </Button>
          }
        >
          <DialogContent>
            <Stack gap={3}>
              <StyledSelect
                title="Select Topic"
                options={subjectOptions}
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                }}
                getLabel={(option) => option.label}
                getValue={(option) => option.value}
                sx={{
                  "& .MuiInputLabel-root": {
                    fontFamily: "var(--font-geist-sans)",
                  },
                  "& .MuiSelect-select": {
                    fontFamily: "var(--font-geist-sans)",
                  },
                }}
              />

              <Stack gap={1.5}>
                <Typography
                  sx={{
                    fontFamily: "var(--font-geist-sans)",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--text2)",
                  }}
                >
                  Difficulty Level
                </Typography>
                <Stack direction="row" gap={1.5}>
                  {difficultyLevelOptions.map((option) => {
                    const isSelected = difficultyLevel === option.value;
                    let color = "var(--text2)";
                    let borderColor = "var(--border-color)";
                    let bgcolor = "transparent";

                    if (isSelected) {
                      if (option.value === "all") {
                        color = "var(--primary-color)";
                        borderColor = "var(--primary-color)";
                        bgcolor = "var(--primary-color-acc-2)";
                      } else if (option.value === 0) {
                        color = "#4CAF50";
                        borderColor = "#4CAF50";
                        bgcolor = "#E8F5E9";
                      } else if (option.value === 1) {
                        color = "#FF9800";
                        borderColor = "#FF9800";
                        bgcolor = "#FFF3E0";
                      } else if (option.value === 2) {
                        color = "#F44336";
                        borderColor = "#F44336";
                        bgcolor = "#FFEBEE";
                      }
                    }

                    return (
                      <Box
                        key={option.value}
                        onClick={() => setDifficultyLevel(option.value)}
                        sx={{
                          flex: 1,
                          border: `1px solid ${borderColor}`,
                          borderRadius: "12px",
                          padding: "12px",
                          cursor: "pointer",
                          bgcolor: bgcolor,
                          transition: "all 0.2s ease",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          "&:hover": {
                            borderColor: isSelected
                              ? borderColor
                              : "var(--text2)",
                          },
                        }}
                      >
                        <Typography
                          sx={{
                            fontFamily: "var(--font-geist-sans)",
                            fontSize: "13px",
                            fontWeight: 700,
                            color: color,
                          }}
                        >
                          {option.label}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            </Stack>
          </DialogContent>
        </DialogBox>
      )}

      {selectedExam && (
        <ExamInstructionDialog
          open={instructionOpen}
          onClose={() => setInstructionOpen(false)}
          onStart={handleStartExam}
          loading={isStartingExam}
          examData={{
            title: selectedExam.title,
            icon: mocks.src,
            duration: selectedExam.duration,
            totalQuestions: selectedExam.totalQuestions,
            totalMarks: selectedExam.totalMarks,
          }}
        />
      )}
    </Stack>
  );
}
