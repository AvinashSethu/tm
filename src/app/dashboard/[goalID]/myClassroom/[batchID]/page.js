"use client";
import { ArrowBackIosNewRounded } from "@mui/icons-material";
import { Button, Skeleton, Stack, Typography, Box } from "@mui/material";
import Courses from "./Components/Courses";
import Exams from "./Components/Exams";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import CustomTabs from "@/src/Components/CustomTabs/CustomTabs";
import DeleteDialogBox from "@/src/Components/DeleteDialogBox/DeleteDialogBox";
import PageSkeleton from "@/src/Components/SkeletonCards/PageSkeleton";

export default function Classroom() {
  const { batchID, goalID } = useParams();
  const router = useRouter();

  const [batchData, setBatchData] = useState(null);
  const [scheduledExams, setScheduledExams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLeaveGroupDialogOpen, setIsLeaveGroupDialogOpen] = useState(false);
  const [leavingLoading, setLeavingLoading] = useState(false);

  // Handlers memoized
  const leaveGroupOpen = useCallback(() => {
    setIsLeaveGroupDialogOpen(true);
  }, []);

  const leaveGroupClose = useCallback(() => {
    setIsLeaveGroupDialogOpen(false);
  }, []);

  const handleLeaveGroup = async () => {
    if (!batchID) return;
    setLeavingLoading(true);

    try {
      const response = await fetch(
        `/api/my-classroom/leave-batch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ batchID }),
        }
      );
      const data = await response.json();
      if (data.success) {
        // Refresh data to update the list view
        router.refresh();
        // Redirect to classrooms
        router.push(`/dashboard/${goalID}/myClassroom`);
      } else {
        alert(data.message);
        setLeavingLoading(false);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to leave group");
      setLeavingLoading(false);
    }
  };

  // Combined fetch for batch data and scheduled exams
  const fetchData = useCallback(async () => {
    if (!batchID) return;
    // setIsLoading(true);
    try {
      const [batchRes, examsRes] = await Promise.all([
        fetch(
          `/api/my-classroom/${batchID}`
        ),
        fetch(
          `/api/my-classroom/${batchID}/get-schedule-exam`
        ),
      ]);

      const batchJson = await batchRes.json();
      if (batchJson.success) {
        setBatchData(batchJson.data);
      } else {
        setBatchData(null);
      }

      const examsJson = await examsRes.json();
      if (examsJson.success) {
        setScheduledExams(examsJson.data);
        setIsLoading(false);
      } else {
        setScheduledExams([]);
        setIsLoading(false);
      }
    } catch (err) {
      // Optionally handle fetch errors, e.g., show a snackbar
      setBatchData(null);
      setScheduledExams([]);
      setIsLoading(false);
    }
  }, [batchID]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Memoize tabs so they aren't recreated each render
  const tabs = useMemo(
    () => [
      {
        label: "Exams",
        content: (
          <Exams
            scheduledExams={scheduledExams}
            batchID={batchID}
            examID={batchID}
          />
        ),
      },
    ],
    [scheduledExams, batchID]
  );

  return isLoading ? (
    <PageSkeleton />
  ) : (
    <Stack
      padding={{ xs: 2, md: 4 }}
      gap={4}
      minHeight="100vh"
      sx={{ marginBottom: "60px" }}
      width="100%"
      maxWidth="1200px"
      margin="0 auto"
    >
      {/* Hero Header */}
      <Stack
        sx={{
          background:
            "linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-dark) 100%)",
          borderRadius: "24px",
          padding: { xs: "24px", md: "40px" },
          color: "white",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 20px 40px rgba(37, 99, 235, 0.15)",
        }}
      >
        {/* Decorative Circles */}
        <Box
          sx={{
            position: "absolute",
            top: "-50px",
            right: "-50px",
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: "-30px",
            left: "20%",
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.05)",
          }}
        />

        <Stack gap={3} sx={{ position: "relative", zIndex: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Button
              onClick={() => router.back()}
              startIcon={<ArrowBackIosNewRounded sx={{ fontSize: "16px" }} />}
              sx={{
                color: "white",
                textTransform: "none",
                fontFamily: "var(--font-geist-sans)",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                backdropFilter: "blur(10px)",
                borderRadius: "12px",
                padding: "8px 16px",
                "&:hover": {
                  backgroundColor: "rgba(255, 255, 255, 0.3)",
                },
              }}
            >
              Back
            </Button>
            <Button
              variant="text"
              onClick={leaveGroupOpen}
              sx={{
                color: "rgba(255, 255, 255, 0.8)",
                textTransform: "none",
                fontFamily: "var(--font-geist-sans)",
                fontSize: "14px",
                "&:hover": {
                  color: "white",
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                },
              }}
            >
              Leave Room
            </Button>
          </Stack>

          <Stack gap={1}>
            <Typography
              variant="h3"
              sx={{
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 800,
                fontSize: { xs: "28px", md: "40px" },
                lineHeight: 1.2,
              }}
            >
              {batchData ? (
                batchData.batchMeta?.title
              ) : (
                <Skeleton
                  variant="text"
                  width="300px"
                  sx={{ bgcolor: "rgba(255,255,255,0.2)" }}
                />
              )}
            </Typography>
            <Typography
              sx={{
                fontFamily: "var(--font-geist-sans)",
                fontSize: { xs: "16px", md: "18px" },
                opacity: 0.9,
                fontWeight: 500,
              }}
            >
              {batchData ? (
                batchData.batchMeta?.instituteMeta?.title
              ) : (
                <Skeleton
                  variant="text"
                  width="200px"
                  sx={{ bgcolor: "rgba(255,255,255,0.2)" }}
                />
              )}
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      <Stack>{tabs[0].content}</Stack>

      <LeaveGroupDialog
        open={isLeaveGroupDialogOpen}
        onClose={leaveGroupClose}
        onConfirm={handleLeaveGroup}
        isLoading={leavingLoading}
      />
    </Stack>
  );
}

const LeaveGroupDialog = ({ open, onClose, onConfirm, isLoading }) => {
  // Memoize action buttons maybe, but simple enough
  return (
    <DeleteDialogBox
      isOpen={open}
      title="Leave Group"
      actionButton={
        <Stack direction="row" spacing={2} justifyContent="center" width="100%">
          <Button
            variant="contained"
            sx={{ backgroundColor: "var(--delete-color)" }}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Leaving..." : "Confirm"}
          </Button>
          <Button
            variant="outlined"
            sx={{ color: "var(--text2)", borderColor: "var(--text2)" }}
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </Stack>
      }
    />
  );
};
