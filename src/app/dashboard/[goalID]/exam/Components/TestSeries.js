"use client";
import { useState } from "react";
import { Button, Stack, Box, Typography } from "@mui/material";
import { East, Lock } from "@mui/icons-material";
import { useRouter, useParams } from "next/navigation";
import StyledSelect from "@/src/Components/StyledSelect/StyledSelect";
import PlansDialogBox from "@/src/Components/PlansDialogBox/PlansDialogBox";

export default function TestSeries({ subjectOptions, isPro }) {
  const router = useRouter();
  const { goalID } = useParams();
  const [selectedSubject, setSelectedSubject] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("all");
  const [plansDialogOpen, setPlansDialogOpen] = useState(false);
  const handlePlansDialogClose = () => {
    setPlansDialogOpen(false);
  };
  const handlePlansDialogOpen = () => {
    setPlansDialogOpen(true);
  };
  const handleStartTest = async () => {
    const response = await fetch(
      `/api/exams/type/${goalID}/practice/create`,
      {
        method: "POST",
        body: JSON.stringify({
          subjectID: selectedSubject,
          ...(difficultyLevel !== "all" && { difficultyLevel }),
        }),
      }
    );
    const data = await response.json();
    if (data.success) {
      router.push(`/exam/${data.data.examID}/${data.data.attemptID}`);
    } else {
    }
  };

  const difficultyLevelOptions = [
    { label: "All", value: "all" },
    { label: "Easy", value: 0 },
    { label: "Medium", value: 1 },
    { label: "Hard", value: 2 },
  ];

  return (
    <Stack gap={2} width="100%">
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <Box
          sx={{ p: 1, bgcolor: "var(--sec-color-acc-2)", borderRadius: "8px" }}
        >
          <East sx={{ color: "var(--primary-color)", fontSize: 20 }} />
        </Box>
        <Box>
          <Typography
            sx={{ fontSize: "16px", fontWeight: 700, color: "var(--text1)" }}
          >
            Custom Practice
          </Typography>
          <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
            Create your own test by topic
          </Typography>
        </Box>
      </Stack>

      <StyledSelect
        title="Select Topic"
        options={subjectOptions}
        getLabel={(option) => option.label}
        getValue={(option) => option.value}
        value={selectedSubject}
        onChange={(e) => setSelectedSubject(e.target.value)}
      />
      <StyledSelect
        title="Difficulty Level"
        options={difficultyLevelOptions}
        getLabel={(option) => option.label}
        getValue={(option) => option.value}
        value={difficultyLevel}
        onChange={(e) => setDifficultyLevel(e.target.value)}
      />

      <Button
        variant="contained"
        fullWidth
        startIcon={!isPro && <Lock />}
        endIcon={isPro && <East />}
        onClick={isPro ? handleStartTest : handlePlansDialogOpen}
        sx={{
          textTransform: "none",
          bgcolor: "var(--primary-color)",
          color: "white",
          fontFamily: "Lato",
          fontWeight: 700,
          fontSize: "14px",
          py: 1.5,
          borderRadius: "12px",
          mt: 1,
          "&:hover": {
            bgcolor: "var(--primary-color-dark)",
          },
        }}
      >
        {isPro ? "Start Practice Test" : "Unlock with PRO"}
      </Button>

      <PlansDialogBox
        plansDialogOpen={plansDialogOpen}
        handlePlansDialogClose={handlePlansDialogClose}
      />
    </Stack>
  );
}
