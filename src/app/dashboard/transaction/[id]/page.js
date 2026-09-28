"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Stack,
  Typography,
  CircularProgress,
  Button,
  Skeleton,
  Box,
  Grid,
  Divider,
} from "@mui/material";
import {
  CheckCircle,
  Cancel,
  HourglassEmpty,
  Replay,
  Dashboard,
  ReceiptLong,
  Event,
  CreditCard,
  Tag,
} from "@mui/icons-material";
import { useSession } from "next-auth/react";
import { enqueueSnackbar } from "notistack";
import PaymentLoadingOverlay from "@/src/Components/PaymentOverlay/PaymentOverlay";

export default function Transaction() {
  const { data: session, status: sessionStatus, update } = useSession();
  const params = useParams();
  const router = useRouter();
  const transactionID = params.id;

  const [status, setStatus] = useState("loading");
  const [transaction, setTransaction] = useState(null);
  const [error, setError] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [retryPaymentInfo, setRetryPaymentInfo] = useState(null);
  const [shouldFetch, setShouldFetch] = useState(true);

  const userID = session?.user?.id;

  const fetchTransactionStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/checkout/course-enroll/transaction-status?transactionID=${transactionID}&userID=${userID}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      if (data.success) {
        const tx = data.data;
        setTransaction(tx);
        setStatus(tx.status || "failed");

        // Reconcile with Razorpay whatever the stored status: a cancelled
        // payment can turn out to be paid, and a completed one may still
        // need its purchase activated.
        let finalStatus = tx.status;
        if (tx.order?.id) {
          const checkStatusResponse = await fetch(
            `/api/checkout/course-enroll/check-transaction-status`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                transactionID,
                razorpayOrderId: tx.order.id,
              }),
            }
          );

          const checkStatusData = await checkStatusResponse.json();
          if (checkStatusData.success) {
            finalStatus = checkStatusData.status;
            setStatus(finalStatus);
            setTransaction({ ...tx, status: finalStatus });
          }
        }

        if (finalStatus === "completed") {
          update();
        }
      } else {
        throw new Error(data.message || "Failed to fetch transaction");
      }
    } catch (err) {
      setError(err.message);
      setStatus("error");
    } finally {
      setShouldFetch(false);
    }
  }, [transactionID, update, userID]);

  useEffect(() => {
    if (
      sessionStatus === "loading" ||
      !transactionID ||
      !userID ||
      !shouldFetch
    ) {
      return;
    }

    let pollingInterval;
    const fetchAndPoll = async () => {
      await fetchTransactionStatus();
      if (status === "pending") {
        pollingInterval = setInterval(fetchTransactionStatus, 5000);
      }
    };

    fetchAndPoll();

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [
    transactionID,
    userID,
    sessionStatus,
    shouldFetch,
    fetchTransactionStatus,
    status,
  ]);

  const retryPayment = async () => {
    if (!transaction?.order?.id || !transaction?.amount) {
      enqueueSnackbar("Invalid transaction data for retry", {
        variant: "error",
      });
      return;
    }

    try {
      const orderStatusResponse = await fetch(
        `/api/checkout/course-enroll/order-status?orderId=${transaction.order.id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const orderStatusData = await orderStatusResponse.json();
      if (
        !orderStatusData.success ||
        !["created", "attempted"].includes(orderStatusData.data.status)
      ) {
        throw new Error("Order is not valid for retry");
      }

      setPaymentLoading(true);
      setRetryPaymentInfo({
        order: transaction.order,
        priceDetails: transaction.amount,
        transactionID: transactionID,
        description: `Retry Payment for Course Enrollment`,
        billingInfo: transaction.billingInfo,
      });

      enqueueSnackbar("Payment retry initiated successfully", {
        variant: "success",
      });
    } catch (error) {
      enqueueSnackbar(
        error.message || "Payment retry failed. Please try again.",
        {
          variant: "error",
        }
      );
    }
  };

  const handlePaymentClose = useCallback(() => {
    setPaymentLoading(false);
    setShouldFetch(true);
  }, []);

  const getStatusConfig = () => {
    switch (status) {
      case "completed":
        return {
          icon: <CheckCircle sx={{ fontSize: 80, color: "#22c55e" }} />,
          title: "Payment Successful!",
          message: "Your payment has been successfully processed.",
          color: "#22c55e",
        };
      case "failed":
      case "cancelled":
        return {
          icon: <Cancel sx={{ fontSize: 80, color: "var(--delete-color)" }} />,
          title:
            status === "cancelled" ? "Payment Cancelled" : "Payment Failed",
          message:
            status === "cancelled"
              ? "You cancelled the payment process."
              : "Something went wrong. Please try again.",
          color: "var(--delete-color)",
        };
      case "pending":
        return {
          icon: (
            <HourglassEmpty sx={{ fontSize: 80, color: "var(--sec-color)" }} />
          ),
          title: "Payment Pending",
          message: "We are verifying your payment status.",
          color: "var(--sec-color)",
        };
      case "error":
        return {
          icon: <Cancel sx={{ fontSize: 80, color: "var(--delete-color)" }} />,
          title: "Error",
          message: error || "Failed to fetch transaction details.",
          color: "var(--delete-color)",
        };
      default:
        return {
          icon: (
            <CircularProgress
              size={60}
              sx={{ color: "var(--primary-color)" }}
            />
          ),
          title: "Loading...",
          message: "Fetching transaction details...",
          color: "var(--primary-color)",
        };
    }
  };

  const { icon, title, message: statusMessage, color } = getStatusConfig();

  const amount = transaction?.amount || "N/A";
  const refNumber =
    status === "completed"
      ? transaction?.razorpayPaymentId || "N/A"
      : transaction?.order?.id || "N/A";
  const refLabel = status === "completed" ? "Payment ID" : "Order ID";
  const paymentTime = transaction?.updatedAt
    ? new Date(transaction.updatedAt).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";
  const method = transaction?.paymentDetails?.method || "-";

  if (status === "loading") {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        bgcolor="var(--library-expand)"
        p={3}
      >
        <Stack
          width="100%"
          maxWidth="500px"
          bgcolor="var(--white)"
          borderRadius="24px"
          p={4}
          alignItems="center"
          gap={3}
          sx={{
            boxShadow: "0px 10px 40px rgba(0,0,0,0.05)",
            border: "1px solid var(--border-color)",
          }}
        >
          <Skeleton variant="circular" width={80} height={80} />
          <Stack alignItems="center" width="100%" gap={1}>
            <Skeleton variant="text" width="60%" height={40} />
            <Skeleton variant="text" width="80%" />
          </Stack>
          <Divider flexItem />
          <Stack width="100%" gap={2}>
            <Skeleton
              variant="rectangular"
              height={60}
              sx={{ borderRadius: 2 }}
            />
            <Skeleton
              variant="rectangular"
              height={60}
              sx={{ borderRadius: 2 }}
            />
          </Stack>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      bgcolor="var(--library-expand)"
      p={3}
    >
      {paymentLoading && retryPaymentInfo && (
        <PaymentLoadingOverlay
          setPaymentLoading={setPaymentLoading}
          {...retryPaymentInfo}
          onClose={handlePaymentClose}
        />
      )}

      <Stack
        width="100%"
        maxWidth="500px"
        bgcolor="var(--white)"
        borderRadius="24px"
        p={{ xs: 3, sm: 5 }}
        alignItems="center"
        gap={3}
        sx={{
          boxShadow: "0px 10px 40px rgba(0,0,0,0.05)",
          border: "1px solid var(--border-color)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top Decoration */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            bgcolor: color,
          }}
        />

        <Stack alignItems="center" gap={2} textAlign="center">
          {icon}
          <Stack gap={0.5}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                color: "var(--text1)",
                fontSize: { xs: "24px", sm: "28px" },
              }}
            >
              {title}
            </Typography>
            <Typography
              sx={{
                color: "var(--text2)",
                fontSize: "15px",
                lineHeight: 1.5,
              }}
            >
              {statusMessage}
            </Typography>
          </Stack>
        </Stack>

        {(status === "completed" ||
          status === "failed" ||
          status === "pending" ||
          status === "cancelled") && (
          <>
            <Divider flexItem sx={{ borderStyle: "dashed" }} />

            <Stack width="100%" gap={2.5}>
              {/* Amount */}
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                bgcolor="var(--library-expand)"
                p={2}
                borderRadius="16px"
              >
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <ReceiptLong sx={{ color: "var(--text3)" }} />
                  <Typography
                    sx={{
                      fontWeight: 600,
                      color: "var(--text2)",
                      fontSize: "14px",
                    }}
                  >
                    Total Amount
                  </Typography>
                </Stack>
                <Typography
                  sx={{
                    fontWeight: 800,
                    color: "var(--text1)",
                    fontSize: "20px",
                  }}
                >
                  ₹{amount}
                </Typography>
              </Stack>

              {/* Details Grid */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Stack gap={0.5}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Tag sx={{ fontSize: 16, color: "var(--text4)" }} />
                      <Typography
                        sx={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--text3)",
                          textTransform: "uppercase",
                        }}
                      >
                        {refLabel}
                      </Typography>
                    </Stack>
                    <Typography
                      sx={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text1)",
                        wordBreak: "break-all",
                      }}
                    >
                      {refNumber}
                    </Typography>
                  </Stack>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Stack gap={0.5}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Event sx={{ fontSize: 16, color: "var(--text4)" }} />
                      <Typography
                        sx={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--text3)",
                          textTransform: "uppercase",
                        }}
                      >
                        Date & Time
                      </Typography>
                    </Stack>
                    <Typography
                      sx={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text1)",
                      }}
                    >
                      {paymentTime}
                    </Typography>
                  </Stack>
                </Grid>

                {status === "completed" && (
                  <Grid item xs={12}>
                    <Stack gap={0.5}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <CreditCard
                          sx={{ fontSize: 16, color: "var(--text4)" }}
                        />
                        <Typography
                          sx={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--text3)",
                            textTransform: "uppercase",
                          }}
                        >
                          Payment Method
                        </Typography>
                      </Stack>
                      <Typography
                        sx={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--text1)",
                        }}
                      >
                        {method}
                      </Typography>
                    </Stack>
                  </Grid>
                )}
              </Grid>
            </Stack>

            <Stack width="100%" gap={2} mt={1}>
              {(status === "failed" ||
                status === "pending" ||
                status === "cancelled") && (
                <Button
                  variant="contained"
                  onClick={retryPayment}
                  startIcon={<Replay />}
                  sx={{
                    bgcolor: "var(--sec-color)",
                    color: "var(--white)",
                    py: 1.5,
                    borderRadius: "100px",
                    textTransform: "none",
                    fontWeight: 700,
                    fontSize: "16px",
                    boxShadow: "0px 4px 15px rgba(0,0,0,0.1)",
                    "&:hover": {
                      bgcolor: "var(--sec-color)",
                      filter: "brightness(0.9)",
                      transform: "translateY(-2px)",
                    },
                    transition: "all 0.2s",
                  }}
                >
                  Retry Payment
                </Button>
              )}
              <Button
                variant="contained"
                onClick={() => router.push("/dashboard")}
                startIcon={<Dashboard />}
                sx={{
                  bgcolor: "var(--primary-color)",
                  color: "var(--white)",
                  py: 1.5,
                  borderRadius: "100px",
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: "16px",
                  boxShadow: "0px 4px 15px rgba(0,0,0,0.1)",
                  "&:hover": {
                    bgcolor: "var(--primary-color-dark)",
                    transform: "translateY(-2px)",
                  },
                  transition: "all 0.2s",
                }}
              >
                Go to Dashboard
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Stack>
  );
}
