"use client";
import { ArrowBackIos } from "@mui/icons-material";
import { Skeleton, Stack, Typography } from "@mui/material";
import ProAddressCard from "./Components/ProAddressCard";
import ProBillingInformation from "./Components/ProBillingInformation";
import ProPaymentButton from "./Components/ProPaymentButton";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import ProPayCard from "@/src/Components/ProPayCard/ProPayCard";
import { enqueueSnackbar } from "notistack";
import { validateBasicBillingInfo } from "@/src/utils/validateBasicBillingInfo";
import PageSkeleton from "@/src/Components/SkeletonCards/PageSkeleton";
import PaymentLoadingOverlay from "@/src/Components/PaymentOverlay/PaymentOverlay";

export default function ProSubscription() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planIndex = searchParams.get("plan");
  const [couponCode, setCouponCode] = useState("");
  const [couponDetails, setCouponDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(
          `/api/subscription/get-all-plans`
        );
        const data = await response.json();
        if (data.success) {
          setPlans(data.data);
          setSelectedPlan(data.data[0]);
          setSelectedPlanIndex(0);
          setIsLoading(false);
        } else {
          console.error("Failed to fetch plans:", data.message);
        }
      } catch (error) {
        console.error("Error fetching plans:", error);
      }
    };
    fetchPlans();
  }, []);

  // Handler to select an address
  const handleAddressSelect = (index) => {
    setSelectedAddressIndex((prevIndex) =>
      prevIndex === index ? null : index
    );
  };

  const applyCoupon = async (couponCode) => {
    const response = await fetch(
      `/api/coupon/${couponCode}`,
      {
        method: "GET",
      }
    );
    const data = await response.json();
    if (data.success) {
      setCouponDetails(data.data);
      enqueueSnackbar("Coupon applied successfully", {
        variant: "success",
      });
    } else {
      enqueueSnackbar(data.message, {
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

  // Fetch existing billing info from API
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
        });
      setIsLoading(false);
    } catch (error) {
      setBillingInfoList([]);
      enqueueSnackbar(error.message, {
        variant: "error",
      });
    }
  }, [session?.user?.id]);

  // Handle PIN code change and fetch city/state
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

  // Add billing info
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

  // Update billing info
  const updateBillingInfo = async (billingInfo, index) => {
    const billingInfoID = billingInfoList[index]?.id;
    if (!billingInfoID) {
      enqueueSnackbar("Billing info ID not found.", { variant: "error" });
      return;
    }

    try {
      // Validate pin (which will be mapped to zip) before proceeding
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
    fetchBillingInfo();
  }, [fetchBillingInfo]);

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

  // Delete billing info
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

  const proSubscription = async () => {
    const subscriptionPlanID = plans[selectedPlanIndex]?.id;

    try {
      const response = await fetch(
        `/api/checkout/pro-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subscriptionPlanID: subscriptionPlanID,
            couponCode: couponCode || undefined,
            billingInfoIndex: selectedAddressIndex,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to initiate payment");
      }
      setPaymentLoading(true);
      const { order, priceDetails, transactionID } = result.data;
      setPaymentInfo({ order, priceDetails, transactionID });
    } catch (error) {
      enqueueSnackbar(error.message || "Payment initiation failed", {
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
          description={`Pro Subscription`}
          billingInfo={billingInfoList[selectedAddressIndex]}
        />
      )}

      <Stack
        sx={{
          backgroundColor: "var( --sec-color-acc-2)",
          minHeight: "100vh",
        }}
      >
        {isLoading ? (
          <PageSkeleton />
        ) : (
          <Stack padding={{ xs: "10px", sm: "30px" }} alignItems="center">
            <Stack gap="20px" width="100%" maxWidth="1200px">
              <Stack
                sx={{
                  width: "100%",
                  alignItems: "center",
                  flexDirection: "row",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  backgroundColor: "var(--white)",
                  padding: "20px",
                  height: "60px",
                }}
              >
                <ArrowBackIos
                  onClick={() => router.back()}
                  sx={{ cursor: "pointer", fontSize: "20px" }}
                />
                <Typography
                  sx={{
                    fontSize: "20px",
                    fontFamily: "Lato",
                    fontWeight: "700",
                  }}
                >
                  Pro Subscription
                </Typography>
              </Stack>
              <Stack
                direction={{ xs: "column", lg: "row", md: "row" }}
                gap={{ xs: "20px", lg: "30px" }}
                width={{ xs: "100%", md: "100%", lg: "100%" }}
                justifyContent="space-between"
                marginBottom={{ xs: "200px", md: "0px" }}
              >
                <Stack
                  flex={{ xs: "auto", md: 0.6, lg: 0.6 }}
                  gap={{ xs: "20px", lg: "30px" }}
                >
                  {/* Billing Address Card */}
                  <Stack>
                    {billingInfoList
                      .filter((info) => info && info.firstName)
                      .map((info, index) => (
                        <ProAddressCard
                          key={index}
                          billingInfo={info}
                          title={`Billing Address ${index + 1}`}
                          onEdit={editBillingInfo}
                          index={index}
                          onDelete={deleteBillingInfo}
                          isSelected={selectedAddressIndex === index}
                          onSelect={() => handleAddressSelect(index)}
                        />
                      ))}
                  </Stack>

                  <ProBillingInformation
                    billingInfo={billingInfo}
                    setBillingInfo={setBillingInfo}
                    handlePinChange={handlePinChange}
                    addBillingInfo={addBillingInfo}
                    showBillingForm={showBillingForm}
                    setShowBillingForm={setShowBillingForm}
                    updateBillingInfo={updateBillingInfo}
                    editIndex={editIndex}
                  />

                  <Stack
                    marginTop="0px"
                    width="100%"
                    sx={{ display: { xs: "none", md: "block" } }}
                  >
                    <ProPaymentButton
                      isDisabled={selectedAddressIndex === null}
                      loading={paymentLoading}
                      onClick={proSubscription}
                    />
                  </Stack>
                </Stack>

                <Stack
                  flex={{ xs: "auto", md: 0.4, lg: 0.4 }}
                  gap="20px"
                  width="100%"
                >
                  <ProPayCard
                    isDisabled={selectedAddressIndex === null}
                    applyCoupon={applyCoupon}
                    removeCoupon={removeCoupon}
                    couponCode={couponCode}
                    setCouponCode={setCouponCode}
                    couponDetails={couponDetails}
                    setCouponDetails={setCouponDetails}
                    planIndex={planIndex}
                    plans={plans}
                    selectedPlan={selectedPlan}
                    setSelectedPlan={setSelectedPlan}
                    selectedPlanIndex={selectedPlanIndex}
                    setSelectedPlanIndex={setSelectedPlanIndex}
                    onClick={proSubscription}
                    onSelect={() => handleAddressSelect(index)}
                  />
                </Stack>
              </Stack>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
