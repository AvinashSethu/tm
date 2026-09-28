"use client";
import PrimaryCard from "@/src/Components/PrimaryCard/PrimaryCard";
import { East } from "@mui/icons-material";
import { Button, Stack, Box } from "@mui/material";
import gate_cse from "@/public/icons/gate_cse.svg";
import banking from "@/public/icons/banking.svg";
import placements from "@/public/icons/placements.svg";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import PrimaryCardSkeleton from "@/src/Components/SkeletonCards/PrimaryCardSkeleton";
import NoDataFound from "@/src/Components/NoDataFound/NoDataFound";

export default function GoalsList() {
  const router = useRouter();
  const params = useParams();
  const goalID = params.goalID;
  const [goalDetails, setGoalDetails] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGoal = async () => {
    setIsLoading(true);
    const response = await fetch(
      `/api/goal/all`
    );
    const data = await response.json();
    setGoalDetails(data.data);
    setIsLoading(false);
  };
  useEffect(() => {
    fetchGoal();
  }, []);

  return (
    <Box
      sx={{
        overflowX: { xs: "auto", md: "" },
        whiteSpace: "nowrap",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        width: "100%",
      }}
    >
      <Stack
        flexDirection="row"
        flexWrap={{ xs: "wrap" }}
        gap="10px"
        sx={{
          minWidth: { xs: "max-content", md: "100%" },
        }}
      >
        {isLoading ? (
          <Stack direction="row" gap="10px">
            <PrimaryCardSkeleton />
            <PrimaryCardSkeleton />
            <PrimaryCardSkeleton />
          </Stack>
        ) : goalDetails.length > 0 ? (
          goalDetails.map((item, index) => (
            <PrimaryCard
              key={index}
              title={item.title}
              actionButton={
                <Button
                  variant="text"
                  endIcon={<East />}
                  onClick={() =>
                    router.push(`/dashboard/${goalID}/home/${item.id}`)
                  }
                  sx={{
                    textTransform: "none",
                    fontFamily: "Lato",
                    color: "var(--primary-color)",
                    fontSize: "14px",
                    padding: "2px",
                  }}
                >
                  Enrolled
                </Button>
              }
              icon={
                item.icon === "castle"
                  ? gate_cse
                  : item.icon === "org"
                  ? banking
                  : placements
              }
              enrolled={item.enrolled}
            />
          ))
        ) : (
          <NoDataFound info="No Goals are enrolled" />
        )}
      </Stack>
    </Box>
  );
}
