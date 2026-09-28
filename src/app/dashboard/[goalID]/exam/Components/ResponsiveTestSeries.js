"use client";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { East, ExpandMore } from "@mui/icons-material";
import { useEffect, useState } from "react";
import MobileHeader from "@/src/Components/MobileHeader/MobileHeader";
import mocks from "@/public/icons/mocks.svg";
import troffy from "@/public/icons/troffy.svg";
import Image from "next/image";
import TestSeries from "./TestSeries";
import MyClassroom from "../../myClassroom/page";
import ExamHistoryResponsive from "@/src/Components/ExamHistoryResponsive/ExamHistoryResponsive";
// import PrimaryCard from "@/src/Components/PrimaryCard/PrimaryCard"; // Removing PrimaryCard
import ExamCard from "@/src/Components/ExamCard/ExamCard"; // Importing ExamCard - Updated
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import ExamInstructionDialog from "@/src/Components/ExamInstruction/ExamInstructionDialog";

export default function ResponsiveTestSeries({
  testSeries,
  groupExams,
  subjectOptions,
}) {
  const { data: session } = useSession();
  const isPro = session?.user?.accountType === "PRO";
  const [expanded, setExpanded] = useState(false);
  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };
  const router = useRouter();
  const [groupExam, setGroupExam] = useState({});

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

  const fetchGroupExam = async (groupID) => {
    try {
      const response = await fetch(
        `/api/exams/type/${groupID}/group/all-exams`
      );
      const data = await response.json();
      if (data.success) {
        setGroupExam((prev) => ({
          ...prev,
          [groupID]: data.data,
        }));
      }
    } catch (err) {
      console.error("Error fetching group exams:", err);
    }
  };

  useEffect(() => {
    groupExams.forEach((item) => {
      fetchGroupExam(item.id);
    });
  }, [groupExams]);

  const SectionHeader = ({ title }) => (
    <Typography
      sx={{
        fontSize: "18px",
        fontWeight: 800,
        color: "var(--text1)",
        mb: 1.5,
        mt: 1,
      }}
    >
      {title}
    </Typography>
  );

  const HorizontalScrollBox = ({ children }) => (
    <Box
      sx={{
        overflowX: "auto",
        whiteSpace: "nowrap",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        width: "100%",
        pb: 1, // Add some padding for shadow/elevation visibility
      }}
    >
      <Stack
        flexDirection="row"
        gap={2}
        sx={{
          minWidth: "max-content",
          pr: 2, // Right padding for last item
        }}
      >
        {children}
      </Stack>
    </Box>
  );

  return (
    <Stack sx={{ display: { xs: "block", md: "none" }, pb: 10 }}>
      {/* Header */}
      <Stack sx={{ mb: 2 }}>
        <MobileHeader />
      </Stack>

      <Stack sx={{ px: 2, gap: 3 }}>
        {/* Practice Test Section */}
        <Box>
          <SectionHeader title="Practice Test" />
          <Box
            sx={{
              bgcolor: "var(--white)",
              p: 2,
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
            }}
          >
            <TestSeries subjectOptions={subjectOptions} isPro={isPro} />
          </Box>
        </Box>

        {/* Test Series Section */}
        <Box>
          <SectionHeader title="Test Series" />
          <HorizontalScrollBox>
            {testSeries.length > 0 ? (
              testSeries.map((item, index) => (
                <Box key={index} sx={{ width: "280px", flexShrink: 0 }}>
                  <ExamCard
                    title={item.title}
                    icon={mocks.src}
                    duration={item.duration}
                    totalQuestions={item.totalQuestions}
                    totalMarks={item.totalMarks}
                    status={item.status || "upcoming"}
                    actionButton={
                      <Button
                        variant="contained"
                        endIcon={<East />}
                        onClick={() => handleExamClick(item)}
                        fullWidth
                        sx={{
                          bgcolor: "var(--primary-color)",
                          color: "white",
                          textTransform: "none",
                          fontSize: "14px",
                          fontWeight: 700,
                          borderRadius: "10px",
                          py: 1,
                          "&:hover": {
                            bgcolor: "var(--primary-color-dark)",
                          },
                        }}
                      >
                        Take Test
                      </Button>
                    }
                  />
                </Box>
              ))
            ) : (
              <Box
                sx={{
                  p: 2,
                  width: "100%",
                  textAlign: "center",
                  bgcolor: "#F8F9FA",
                  borderRadius: "12px",
                }}
              >
                <Typography sx={{ color: "text.secondary", fontSize: "14px" }}>
                  No test series found
                </Typography>
              </Box>
            )}
          </HorizontalScrollBox>
        </Box>

        {/* Exam Groups Sections */}
        {groupExams.length > 0 && (
          <Stack gap={3}>
            {groupExams.map((item, index) => (
              <Box key={index}>
                <SectionHeader title={item.title} />
                <HorizontalScrollBox>
                  {(groupExam[item.id] || []).length > 0 ? (
                    groupExam[item.id].map((exam) => (
                      <Box key={exam.id} sx={{ width: "280px", flexShrink: 0 }}>
                        <ExamCard
                          title={exam.title}
                          icon={troffy.src}
                          duration={exam.duration}
                          totalQuestions={exam.totalQuestions}
                          totalMarks={exam.totalMarks}
                          status={exam.status || "upcoming"}
                          actionButton={
                            <Button
                              variant="contained"
                              endIcon={<East />}
                              onClick={() => handleExamClick(exam)}
                              fullWidth
                              sx={{
                                bgcolor: "var(--primary-color)",
                                color: "white",
                                textTransform: "none",
                                fontSize: "14px",
                                fontWeight: 700,
                                borderRadius: "10px",
                                py: 1,
                                "&:hover": {
                                  bgcolor: "var(--primary-color-dark)",
                                },
                              }}
                            >
                              Take Test
                            </Button>
                          }
                        />
                      </Box>
                    ))
                  ) : (
                    <Box
                      sx={{
                        p: 2,
                        width: "100%",
                        textAlign: "center",
                        bgcolor: "#F8F9FA",
                        borderRadius: "12px",
                      }}
                    >
                      <Typography
                        sx={{ color: "text.secondary", fontSize: "14px" }}
                      >
                        No group exams found
                      </Typography>
                    </Box>
                  )}
                </HorizontalScrollBox>
              </Box>
            ))}
          </Stack>
        )}

        {/* History & Classroom */}
        <Box>
          <SectionHeader title="Recent Activity" />
          <ExamHistoryResponsive />
        </Box>

        <Box
          sx={{
            bgcolor: "var(--white)",
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          <MyClassroom />
        </Box>
      </Stack>
      <Stack
        sx={{
          backgroundColor: "var(--white)",
          borderRadius: "10px",
          marginTop: "10px",
        }}
      >
        <MyClassroom />
      </Stack>

      {selectedExam && (
        <ExamInstructionDialog
          open={instructionOpen}
          onClose={() => setInstructionOpen(false)}
          onStart={handleStartExam}
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
