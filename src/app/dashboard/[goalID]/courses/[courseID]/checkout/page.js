"use client";
import React from "react";
import { Button, Stack, Typography, Grid, Box } from "@mui/material";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import CheckoutPayCard from "@/src/Components/CheckoutPayCard/CheckoutPayCard";
import { ArrowBackIos, CheckCircle } from "@mui/icons-material";
import { useEffect, useState, useCallback } from "react";
import { enqueueSnackbar } from "notistack";
import BillingInformation from "./Components/BillingInformation";
import PaymentButton from "./Components/PaymentButton";
import { useSession } from "next-auth/react";
import AddressCard from "./Components/AddressCard";
import { validateBasicBillingInfo } from "@/src/utils/validateBasicBillingInfo";
import PaymentLoadingOverlay from "@/src/Components/PaymentOverlay/PaymentOverlay";
import PageSkeleton from "@/src/Components/SkeletonCards/PageSkeleton";

export default function Checkout() {
  const params = useParams();
  const goalID = params.goalID;
  const courseID = params.courseID;
  const searchParams = useSearchParams();
  const planIndex = searchParams.get("plan");
  const { data: session } = useSession();
  const router = useRouter();
  const [courseDetails, setCourseDetails] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDetails, setCouponDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingInfo, setBillingInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });
  const [billingInfoList, setBillingInfoList] = useState([]);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [selectedAddressIndex, setSelectedAddressIndex] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const userType = session?.user?.accountType;

  const isPaidCourseForUser =
    (userType === "FREE" && !courseDetails?.subscription.isFree) ||
    (userType === "PRO" &&
      !courseDetails?.subscription.isFree &&
      !courseDetails?.subscription.isPro);

  const handleAddressSelect = (index) => {
    setSelectedAddressIndex((prevIndex) =>
      prevIndex === index ? null : index
    );
  };

  const courseEnroll = async () => {
    if (paymentLoading) return; // Prevent double-clicks
    setPaymentLoading(true); // Set loading IMMEDIATELY to prevent double-clicks

    const selectedPlanIndex = courseDetails?.subscription?.plans?.findIndex(
      (plan) =>
        String(plan.duration) === String(selectedPlan.duration) &&
        plan.type === selectedPlan.type &&
        String(plan.priceWithTax) === String(selectedPlan.priceWithTax) &&
        String(plan.discountInPercent) === String(selectedPlan.discountInPercent)
    );

    if (selectedPlanIndex === -1) {
      setPaymentLoading(false);
      enqueueSnackbar("Selected plan not found. Please try again.", {
        variant: "error",
      });
      return;
    }
    try {
      const response = await fetch(
        `/api/checkout/course-enroll`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courseID: courseID,
            goalID: goalID,
            couponCode: couponCode || undefined,
            subscriptionPlanIndex: selectedPlanIndex,
            billingInfoIndex: selectedAddressIndex,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to initiate payment");
      }
      const { order, priceDetails, transactionID } = result.data;
      setPaymentInfo({ order, priceDetails, transactionID });
    } catch (error) {
      setPaymentLoading(false); // Reset loading on error
      enqueueSnackbar(error.message || "Payment initiation failed", {
        variant: "error",
      });
    }
  };

  const fetchCourseDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/courses`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courseID: courseID,
            goalID: goalID,
          }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setCourseDetails(data.data);
        const plans = data.data.subscription?.plans || [];
        const index = parseInt(planIndex, 10);
        if (!isNaN(index) && index >= 0 && index < plans.length) {
          setSelectedPlan(plans[index]);
        } else if (plans.length > 0) {
          setSelectedPlan(plans[0]);
        }
      } else {
        enqueueSnackbar(data.message || "Failed to load course", {
          variant: "error",
        });
        router.back();
      }
    } catch (error) {
      enqueueSnackbar("Failed to load course details", { variant: "error" });
      router.back();
    } finally {
      setIsLoading(false);
    }
  }, [courseID, goalID, planIndex, enqueueSnackbar, router]);

  const applyCoupon = async (couponCode) => {
    try {
      const response = await fetch(
        `/api/coupon/${couponCode}`,
        {
          method: "GET",
        }
      );
      const data = await response.json();
      if (data.success) {
        const coupon = data.data;
      // Validate coupon applicability
      if (coupon.couponClass === "COURSES") {
        const applicableCourses = (coupon.applicableCourses || []).map((id) =>
          String(id).trim()
        );
        if (
          applicableCourses.length > 0 &&
          !applicableCourses.includes(String(courseID).trim())
        ) {
          enqueueSnackbar("Coupon is not applicable to this course", {
            variant: "error",
          });
          return;
        }
      } else if (coupon.couponClass === "GOALS") {
        const applicableGoals = (coupon.applicableGoals || []).map((id) =>
          String(id).trim()
        );
        if (
          applicableGoals.length > 0 &&
          !applicableGoals.includes(String(goalID).trim())
        ) {
          enqueueSnackbar("Coupon is not applicable to this goal", {
            variant: "error",
          });
          return;
        }
      }

      setCouponDetails(coupon);
      enqueueSnackbar("Coupon applied successfully", {
        variant: "success",
      });
      } else {
        enqueueSnackbar(data.message, {
          variant: "error",
        });
      }
    } catch (error) {
      enqueueSnackbar("Failed to apply coupon. Please try again.", {
        variant: "error",
      });
    }
  };

  const removeCoupon = () => {
    setCouponDetails(null);
    setCouponCode("");
    enqueueSnackbar("Coupon removed", {
      variant: "success",
    });
  };

  const handlePlanChange = (index) => {
    setSelectedPlan(courseDetails?.subscription.plans[index]);
  };

  const fetchBillingInfo = useCallback(async () => {
    if (!session?.user?.id) {
      console.warn("User not authenticated, cannot fetch billing info");
      setBillingInfoList([]);
      return;
    }
    setIsLoading(true);
    try {
      const url = `/api/checkout/billing-info`;

      await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.data)) {
            setBillingInfoList(data.data);
          } else if (Array.isArray(data)) {
            setBillingInfoList(data);
          } else {
            setBillingInfoList([]);
          }
          setIsLoading(false);
        });
    } catch (error) {
      setBillingInfoList([]);
      enqueueSnackbar(error.message, {
        variant: "error",
      });
    }
  }, [session?.user?.id]);

  const handlePinChange = async (e) => {
    const pin = e.target.value;
    setBillingInfo((prev) => ({ ...prev, pin }));

    if (pin.length === 6) {
      try {
        const response = await fetch(
          `https://api.postalpincode.in/pincode/${pin}`
        );
        if (!response.ok) {
          throw new Error(
            `API error: ${response.status} ${response.statusText}`
          );
        }
        const data = await response.json();

        if (data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
          const city = data[0].PostOffice[0].Division;
          const state = data[0].PostOffice[0].State;

          setBillingInfo((prev) => ({
            ...prev,
            city,
            state,
            pin,
          }));
        } else {
          setBillingInfo((prev) => ({
            ...prev,
            city: "",
            state: "",
            pin,
          }));
        }
      } catch (error) {
        console.error("Error fetching PIN data:", error.message, error);
        setBillingInfo((prev) => ({
          ...prev,
          city: "",
          state: "",
          pin,
        }));
      }
    } else {
      setBillingInfo((prev) => ({
        ...prev,
        city: "",
        state: "",
        pin,
      }));
    }
  };

  const addBillingInfo = async (billingInfo) => {
    try {
      const updatedBillingInfo = { ...billingInfo, zip: billingInfo.pin };
      validateBasicBillingInfo(updatedBillingInfo);
      const response = await fetch(
        `/api/checkout/billing-info`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userID: session.user.id,
            billingInfo: updatedBillingInfo,
          }),
        }
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            fetchBillingInfo();
            setShowBillingForm(false);
            setBillingInfo({
              firstName: "",
              lastName: "",
              email: "",
              phone: "",
              address: "",
              city: "",
              state: "",
              zip: "",
            });
            enqueueSnackbar("Address added", {
              variant: "success",
            });
          }
        });
    } catch (error) {
      enqueueSnackbar(error.message, {
        variant: "error",
      });
    }
  };

  const updateBillingInfo = async (billingInfo, index) => {
    const billingInfoID = billingInfoList[index]?.id;
    if (!billingInfoID) {
      enqueueSnackbar("Billing info ID not found.", { variant: "error" });
      return;
    }

    try {
      if (!billingInfo.pin || !/^\d{5,6}$/.test(billingInfo.pin)) {
        enqueueSnackbar("A valid ZIP code (5-6 digits) is required.", {
          variant: "error",
        });
        return;
      }

      const updatedBillingInfo = { ...billingInfo, zip: billingInfo.pin };
      validateBasicBillingInfo(updatedBillingInfo);

      await fetch(
        `/api/checkout/billing-info`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userID: session.user.id,
            billingInfoID: billingInfoID,
            billingInfo: updatedBillingInfo,
          }),
        }
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            fetchBillingInfo();
            setShowBillingForm(false);
            setBillingInfo({
              firstName: "",
              lastName: "",
              email: "",
              phone: "",
              address: "",
              city: "",
              state: "",
              zip: "",
            });
            setEditIndex(null);
            enqueueSnackbar("Updated", {
              variant: "success",
            });
            return;
          }
          enqueueSnackbar(data.message, {
            variant: "error",
          });
        });
    } catch (error) {
      enqueueSnackbar(error.message, {
        variant: "error",
      });
    }
  };

  useEffect(() => {
    fetchCourseDetails();
    fetchBillingInfo();
  }, [goalID, params.courseID, fetchCourseDetails, fetchBillingInfo]);

  const editBillingInfo = (billingInfo, index) => {
    setBillingInfo({
      firstName: billingInfo.firstName || "",
      lastName: billingInfo.lastName || "",
      email: billingInfo.email || "",
      phone: billingInfo.phone || "",
      address: billingInfo.address || "",
      city: billingInfo.city || "",
      state: billingInfo.state || "",
      pin: billingInfo.zip || "",
    });
    setEditIndex(index);
    setShowBillingForm(true);
  };

  const deleteBillingInfo = async (index) => {
    const billingInfoID = billingInfoList[index]?.id;
    try {
      const response = await fetch(
        `/api/checkout/billing-info`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userID: session.user.id,
            billingInfoID: billingInfoID,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setBillingInfoList((prev) => prev.filter((_, i) => i !== index));
        enqueueSnackbar("Deleted successfully", {
          variant: "success",
        });
      } else {
        enqueueSnackbar(data.message || "Failed to delete", {
          variant: "error",
        });
      }
    } catch (error) {
      enqueueSnackbar("Failed to delete: " + error.message, {
        variant: "error",
      });
    }
  };

  const handleEnroll = async () => {
    try {
      const response = await fetch(
        `/api/courses/free-course-enroll`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courseID: courseID,
            goalID: goalID,
          }),
        }
      );
      const data = await response.json();

      if (data.success) {
        router.push(`/dashboard/${goalID}/courses`);
        enqueueSnackbar("Enrolled", { variant: "success" });
      } else {
        enqueueSnackbar(data.message, { variant: "error" });
      }
    } catch (err) {
      console.error("Error in enroll", err);
      enqueueSnackbar(err.message || "Failed to enroll. Please try again.", {
        variant: "error",
      });
    }
  };

  return (
    <Stack>
      {paymentLoading && paymentInfo && (
        <PaymentLoadingOverlay
          {...paymentInfo}
          onClose={() => setPaymentLoading(false)}
          description={`Payment for ${courseDetails?.title}`}
          billingInfo={billingInfoList[selectedAddressIndex]}
        />
      )}
      <Stack
        padding={{ xs: "20px", sm: "40px" }}
        alignItems="center"
        minHeight="100vh"
        bgcolor="var(--library-expand)"
      >
        {isLoading ? (
          <PageSkeleton />
        ) : (
          <Stack gap="30px" width="100%" maxWidth="1200px">
            {/* Header */}
            <Stack
              direction="row"
              alignItems="center"
              gap={2}
              sx={{
                cursor: "pointer",
                width: "fit-content",
              }}
              onClick={() => router.back()}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  bgcolor: "var(--white)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--border-color)",
                  transition: "all 0.2s",
                  "&:hover": {
                    bgcolor: "var(--primary-color)",
                    color: "var(--white)",
                    borderColor: "var(--primary-color)",
                  },
                  color: "var(--text1)",
                }}
              >
                <ArrowBackIos sx={{ fontSize: "18px", ml: 1 }} />
              </Box>
              <Typography
                sx={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--text1)",
                }}
              >
                Checkout
              </Typography>
            </Stack>

            <Grid container spacing={4}>
              {/* Left Column: Billing & Details */}
              <Grid size={{ xs: 12, md: 8 }}>
                <Stack gap={4}>
                  {isPaidCourseForUser ? (
                    <Stack gap={3}>
                      <Typography
                        sx={{
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "var(--text1)",
                        }}
                      >
                        Billing Address
                      </Typography>
                      {billingInfoList.map((info, index) => {
                        if (!info || !info.firstName) return null;
                        return (
                          <AddressCard
                            key={info.id || index}
                            billingInfo={info}
                            title={`Address ${index + 1}`}
                            onEdit={editBillingInfo}
                            index={index}
                            onDelete={deleteBillingInfo}
                            isSelected={selectedAddressIndex === index}
                            onSelect={() => handleAddressSelect(index)}
                          />
                        );
                      })}
                      <BillingInformation
                        billingInfo={billingInfo}
                        setBillingInfo={setBillingInfo}
                        handlePinChange={handlePinChange}
                        addBillingInfo={addBillingInfo}
                        showBillingForm={showBillingForm}
                        setShowBillingForm={setShowBillingForm}
                        updateBillingInfo={updateBillingInfo}
                        editIndex={editIndex}
                      />
                    </Stack>
                  ) : (
                    <Stack
                      sx={{
                        border: "1px solid var(--border-color)",
                        borderRadius: "24px",
                        p: 4,
                        bgcolor: "var(--white)",
                        gap: 3,
                      }}
                    >
                      <Stack gap={1}>
                        <Typography
                          sx={{
                            fontSize: "24px",
                            fontWeight: 800,
                            color: "var(--text1)",
                          }}
                        >
                          Enroll for Free
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "16px",
                            color: "var(--text2)",
                            lineHeight: 1.6,
                          }}
                        >
                          This course is completely free of cost. You’ll get
                          full access to all lessons and materials immediately
                          after enrollment.
                        </Typography>
                      </Stack>

                      <Stack gap={2}>
                        {[
                          "100% Free – No credit card required",
                          "Instant access to all course materials",
                          "Learn at your own pace with lifetime access",
                        ].map((text, i) => (
                          <Stack
                            key={i}
                            direction="row"
                            alignItems="center"
                            gap={2}
                          >
                            <CheckCircle
                              sx={{
                                fontSize: 24,
                                color: "var(--primary-color)",
                              }}
                            />
                            <Typography
                              sx={{
                                fontSize: "16px",
                                fontWeight: 500,
                                color: "var(--text1)",
                              }}
                            >
                              {text}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>

                      <Button
                        variant="contained"
                        onClick={handleEnroll}
                        sx={{
                          bgcolor: "var(--primary-color)",
                          color: "var(--white)",
                          fontSize: "16px",
                          fontWeight: 700,
                          textTransform: "none",
                          py: 2,
                          borderRadius: "100px",
                          boxShadow: "0px 4px 20px rgba(0,0,0,0.1)",
                          "&:hover": {
                            bgcolor: "var(--primary-color-dark)",
                            transform: "translateY(-2px)",
                            boxShadow: "0px 8px 25px rgba(0,0,0,0.15)",
                          },
                          transition: "all 0.3s ease",
                        }}
                      >
                        Enroll Now for Free
                      </Button>
                    </Stack>
                  )}

                  {isPaidCourseForUser && (
                    <Stack sx={{ display: { xs: "none", md: "block" } }}>
                      <PaymentButton
                        isDisabled={selectedAddressIndex === null}
                        onPaymentClick={courseEnroll}
                        loading={paymentLoading}
                        isFree={courseDetails?.subscription?.isFree}
                      />
                    </Stack>
                  )}
                </Stack>
              </Grid>

              {/* Right Column: Order Summary */}
              {isPaidCourseForUser && (
                <Grid size={{ xs: 12, md: 4 }}>
                  <Stack position="sticky" top={24}>
                    <CheckoutPayCard
                      courseDetails={courseDetails}
                      selectedPlan={selectedPlan}
                      handlePlanChange={handlePlanChange}
                      couponDetails={couponDetails}
                      applyCoupon={applyCoupon}
                      setCouponCode={setCouponCode}
                      couponCode={couponCode}
                      removeCoupon={removeCoupon}
                      isDisabled={selectedAddressIndex === null}
                      onPaymentClick={courseEnroll}
                      loading={paymentLoading}
                      planIndex={planIndex}
                      setSelectedPlan={setSelectedPlan}
                    />
                  </Stack>
                </Grid>
              )}
            </Grid>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
