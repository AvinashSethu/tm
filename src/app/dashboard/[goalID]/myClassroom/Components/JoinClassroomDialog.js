"use client";
import DialogBox from "@/src/Components/DialogBox/DialogBox";
import StyledTextField from "@/src/Components/StyledTextField/StyledTextField";
import { Close, East, Add } from "@mui/icons-material";
import {
  Button,
  IconButton,
  Stack,
  Typography,
  Box,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";

const JoinClassroomDialog = ({
  isDialogOpen,
  dialogClose,
  refetchClassrooms,
  localLoading,
  setLocalLoading,
}) => {
  const [batchCode, setBatchCode] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [step, setStep] = useState(1);
  const [batchDetails, setBatchDetails] = useState(null);
  const [selectedTag, setSelectedTag] = useState("");
  const { enqueueSnackbar } = useSnackbar();

  // Reset state when dialog closes
  useEffect(() => {
    if (!isDialogOpen) {
      setBatchCode("");
      setRollNo("");
      setStep(1);
      setBatchDetails(null);
      setSelectedTag("");
      setLocalLoading(false);
    }
  }, [isDialogOpen, setLocalLoading]);

  const fetchBatchInfo = async () => {
    setLocalLoading(true);
    try {
      const response = await fetch(
        `/api/my-classroom/get-batch-info`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchCode }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setBatchDetails(data.data);
        setStep(2);
      } else {
        enqueueSnackbar(data.message, {
          variant: "error",
          autoHideDuration: 3000,
        });
      }
    } catch (error) {
      enqueueSnackbar("Failed to fetch batch info", {
        variant: "error",
        autoHideDuration: 3000,
      });
    } finally {
      setLocalLoading(false);
    }
  };

  const joinClassroom = async () => {
    setLocalLoading(true);
    try {
      const response = await fetch(
        `/api/my-classroom/batch-enroll`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batchCode: batchCode,
            rollNo: rollNo,
            tag: selectedTag || null,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        refetchClassrooms();
        dialogClose();
        enqueueSnackbar("Successfully joined the batch!", {
          variant: "success",
          autoHideDuration: 3000,
        });
      } else {
        enqueueSnackbar(data.message, {
          variant: "error",
          autoHideDuration: 3000,
        });
      }
    } catch (error) {
      enqueueSnackbar("Failed to join batch", {
        variant: "error",
        autoHideDuration: 3000,
      });
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <DialogBox
      isOpen={isDialogOpen}
      title="Join Classroom"
      icon={
        <IconButton
          onClick={dialogClose}
          sx={{
            marginLeft: "auto",
            padding: "4px",
            borderRadius: "8px",
            color: "var(--text2)",
            "&:hover": { backgroundColor: "var(--bg-color)" },
          }}
        >
          <Close />
        </IconButton>
      }
      actionButton={
        <Button
          variant="contained"
          endIcon={step === 1 ? <East /> : <Add />}
          onClick={() => {
            if (step === 1) {
              fetchBatchInfo();
            } else {
              joinClassroom();
            }
          }}
          disabled={
            localLoading ||
            (step === 1 && !batchCode) ||
            (step === 2 && batchDetails?.tags?.length > 0 && !selectedTag)
          }
          fullWidth
          sx={{
            textTransform: "none",
            fontFamily: "var(--font-geist-sans)",
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: "var(--primary-color)",
            borderRadius: "10px",
            padding: "10px",
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
            "&:hover": {
              backgroundColor: "var(--primary-color)",
              boxShadow: "0 6px 16px rgba(37, 99, 235, 0.3)",
            },
            "&:disabled": {
              backgroundColor: "var(--text3)",
              color: "white",
            },
          }}
        >
          {localLoading
            ? "Processing..."
            : step === 1
            ? "Verify Code"
            : "Join Batch"}
        </Button>
      }
    >
      <Stack gap={3}>
        {step === 1 && (
          <StyledTextField
            placeholder="Enter Batch Code"
            value={batchCode}
            onChange={(e) => setBatchCode(e.target.value)}
            sx={{
              "& .MuiInputBase-root": {
                fontFamily: "var(--font-geist-sans)",
                borderRadius: "10px",
              },
            }}
          />
        )}

        {step === 2 && batchDetails && (
          <Stack gap={2}>
            <Box
              sx={{
                p: 2,
                bgcolor: "var(--bg-color)",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
              }}
            >
              <Typography
                variant="subtitle2"
                color="var(--text2)"
                sx={{ mb: 0.5, fontSize: "12px" }}
              >
                INSTITUTE
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontFamily: "var(--font-geist-sans)",
                  fontWeight: 700,
                  fontSize: "16px",
                }}
              >
                {batchDetails.instituteMeta.title}
              </Typography>
              <Typography
                variant="subtitle2"
                color="var(--text2)"
                sx={{ mt: 1.5, mb: 0.5, fontSize: "12px" }}
              >
                BATCH
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontFamily: "var(--font-geist-sans)",
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "var(--primary-color)",
                }}
              >
                {batchDetails.title}
              </Typography>
            </Box>

            {batchDetails.tags && batchDetails.tags.length > 0 && (
              <TextField
                select
                label="Select Department"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                SelectProps={{
                  native: true,
                }}
                sx={{
                  "& .MuiInputBase-root": {
                    borderRadius: "10px",
                    fontFamily: "var(--font-geist-sans)",
                  },
                }}
              >
                <option value="" disabled>
                  Select Department
                </option>
                {batchDetails.tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </TextField>
            )}

            <StyledTextField
              placeholder="Enter Roll No (Optional)"
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
              sx={{
                "& .MuiInputBase-root": {
                  fontFamily: "var(--font-geist-sans)",
                  borderRadius: "10px",
                },
              }}
            />
          </Stack>
        )}
      </Stack>
    </DialogBox>
  );
};

export default JoinClassroomDialog;
