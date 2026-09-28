"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Skeleton,
  Stack,
  Typography,
  CircularProgress,
  Box,
} from "@mui/material";
import {
  ArrowBackIosNew,
  InsertDriveFile,
  Lock,
  PlayCircle,
  PauseCircle,
  Translate,
  PlayLesson,
  AccessTimeFilled,
  SaveAlt,
  CheckCircle,
  ExpandMore,
  ExpandLess,
  Fullscreen,
  FullscreenExit,
  PlayArrow,
  Pause,
} from "@mui/icons-material";
import LessonCard from "@/src/Components/LessonCard.js/LessonCard";
import CheckoutCard from "@/src/Components/CheckoutCard.js/CheckoutCard";
import MDPreview from "@/src/Components/MarkdownPreview/MarkdownPreview";
import LessoncardSkeleton from "@/src/Components/SkeletonCards/LessoncardSkeleton";
import Script from "next/script";
import { useSession } from "next-auth/react";


function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} Hours`;
  return `${h}h ${m}m`;
}

const MyCourse = () => {
  const router = useRouter();
  const { goalID, courseID } = useParams();
  const [courseDetails, setCourseDetails] = useState({});
  const [lessonList, setLessonList] = useState([]);
  const [sections, setSections] = useState([]);
  const [expandedSections, setExpandedSections] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [videoPreview, setVideoPreview] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrollment, setEnrollment] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [selectedLessonIndex, setSelectedLessonIndex] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef(null);
  const iframeRef = useRef(null);
  const videoContainerRef = useRef(null);
  const [lessonProgress, setLessonProgress] = useState({});
  const { data: session } = useSession();

  const progressRef = useRef({});
  const [renderTick, setRenderTick] = useState(0);
  const [watermarkPos, setWatermarkPos] = useState({ top: 30, left: 20 });
  const [showControls, setShowControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsTimerRef = useRef(null);
  const lastTickRef = useRef(0); // Persist last tick timestamp

  const apiHeaders = useMemo(
    () => ({ "Content-Type": "application/json" }),
    [],
  );

  const saveProgressToDB = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/courses/analytics/save-progress`,
        {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({
            courseID,
            lessonProgress: progressRef.current,
          }),
          credentials: "include",
        },
      );
      const data = await response.json();
      if (data.success) {
      } else {
        console.error("Failed to save progress:", data.message);
      }
    } catch (err) {
      console.error("Error saving progress to DB:", err);
    }
  }, [courseID, apiHeaders]);

  const initializePlayer = useCallback(() => {
    if (iframeRef.current && window.playerjs) {
      const player = new window.playerjs.Player(iframeRef.current);
      playerRef.current = player;

      player.on("ready", () => {
        const currentTime =
          progressRef.current[selectedLessonId]?.currentTime || 0;
        player.setCurrentTime(currentTime);
      });

      player.on("play", () => setIsPlaying(true));
      player.on("pause", () => {
        setIsPlaying(false);
      });

      player.on("timeupdate", ({ seconds, duration }) => {
        const progress = (seconds / duration) * 100;

        progressRef.current[selectedLessonId] = {
          progress,
          currentTime: seconds,
          isCompleted:
            progressRef.current[selectedLessonId]?.isCompleted ||
            progress >= 100,
        };

        setRenderTick((t) => t + 1);
      });

      player.on("ended", () => {
        progressRef.current[selectedLessonId] = {
          progress: 100,
          currentTime: 0,
          isCompleted: true,
        };
        // Force an immediate save by bypassing the 30s throttle
        saveProgressToDB();
        setLastUpdatedAt(Date.now());

        setIsPlaying(false);
        setRenderTick((t) => t + 1);
      });

      player.on("error", () => {
        setError("Failed to control video playback. Please try again.");
      });
    }
  }, [selectedLessonId, saveProgressToDB]);

  useEffect(() => {
    setLessonProgress((prev) => ({
      ...prev,
      [selectedLessonId]: progressRef.current,
    }));
  }, [selectedLessonId]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdatedAt > 30000) {
      saveProgressToDB();
      setLastUpdatedAt(now);
    }
  }, [lastUpdatedAt, renderTick, saveProgressToDB]);

  const fetchCourseData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [enrollRes, courseRes, lessonsRes, progressRes] = await Promise.all(
        [
          fetch(`/api/courses/get-enroll`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({ courseID }),
            credentials: "include",
          }),
          fetch(`/api/courses`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({ courseID, goalID }),
            credentials: "include",
          }),
          fetch(`/api/courses/lessons`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({ courseID }),
            credentials: "include",
          }),
          fetch(`/api/courses/get-progress`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({ courseID }),
            credentials: "include",
          }),
        ],
      );

      const [enrollData, courseData, lessonsData, progressData] =
        await Promise.all([
          enrollRes.json(),
          courseRes.json(),
          lessonsRes.json(),
          progressRes.json(),
        ]);

      if (enrollData.success && enrollData.data?.length > 0) {
        const enrollmentInfo = enrollData.data[0];
        setIsEnrolled(enrollmentInfo.status === "active");
        setEnrollment(enrollmentInfo);
      }

      if (!courseData.success) throw new Error(courseData.message);
      setCourseDetails(courseData.data);

      if (!lessonsData.success) throw new Error(lessonsData.message);
      setLessonList(lessonsData.data);
      setSections(lessonsData.sections || []);

      if (progressData.success && progressData.data) {
        // Merge server progress with any local progress to avoid clobbering
        // in-flight unsaved state if this fetch races with player events.
        progressRef.current = {
          ...progressData.data,
          ...progressRef.current,
        };
        setRenderTick((t) => t + 1);
      }

      const firstPreview = lessonsData.data.find(
        (lesson) => lesson.type === "VIDEO" && lesson.isPreview,
      );
      if (firstPreview) {
        setSelectedLessonId(firstPreview.id);
        setSelectedLessonIndex(lessonsData.data.indexOf(firstPreview) + 1);
        await playVideo({
          lessonID: firstPreview.id,
          courseID,
          setVideoLoading,
          setVideoPreview,
        });
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load course data. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [courseID, goalID, apiHeaders]);

  useEffect(() => {
    fetchCourseData();
  }, [fetchCourseData]);

  useEffect(() => {
    if (videoPreview && iframeRef.current) {
      initializePlayer();
    }
  }, [videoPreview, initializePlayer]);

  // Toggle fullscreen + lock landscape on mobile
  const toggleFullscreen = useCallback(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      // Exit fullscreen → unlock orientation
      screen.orientation?.unlock?.();
      document.exitFullscreen().catch(() => {});
    } else {
      // Enter fullscreen → lock landscape on mobile
      container.requestFullscreen().then(() => {
        screen.orientation?.lock?.("landscape").catch(() => {});
      }).catch(() => {});
    }
  }, []);

  // Track fullscreen state changes + unlock orientation on exit
  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) {
        screen.orientation?.unlock?.();
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Show controls overlay, auto-hide after 3s
  const flashControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // When iframe steals focus, pull it back to the container
  useEffect(() => {
    const handleWindowBlur = () => {
      setTimeout(() => {
        if (document.activeElement === iframeRef.current || document.activeElement === document.body) {
          videoContainerRef.current?.focus({ preventScroll: true });
        }
      }, 100);
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, []);

  // Keyboard: Space = play/pause, F = fullscreen
  const handleContainerKeyDown = useCallback(
    (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (playerRef.current) {
          isPlaying ? playerRef.current.pause() : playerRef.current.play();
        }
      }
      if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      }
    },
    [isPlaying, toggleFullscreen],
  );

  // Watermark: drift to random position every 8 seconds
  useEffect(() => {
    if (!videoPreview) return;
    const interval = setInterval(() => {
      setWatermarkPos({
        top: Math.floor(Math.random() * 70) + 5,   // 5% to 75%
        left: Math.floor(Math.random() * 50) + 5,  // 5% to 55%
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [videoPreview]);

  const handleLessonClick = useCallback(
    (item, index) => {
      if (item.type !== "VIDEO" || (!item.isPreview && !isEnrolled)) return;

      const isSame = selectedLessonId === item.id;

      if (isSame && playerRef.current) {
        isPlaying ? playerRef.current.pause() : playerRef.current.play();
      } else {
        setSelectedLessonId(item.id);
        setSelectedLessonIndex(index + 1);
        setIsPlaying(true);
        playVideo({
          lessonID: item.id,
          courseID,
          enrollmentID: enrollment?.id,
          setVideoLoading,
          setVideoPreview,
        });
      }
    },
    [selectedLessonId, isEnrolled, enrollment, courseID, isPlaying],
  );

  const handleFileDownload = useCallback(
    async (lessonID) => {
      try {
        const res = await fetch(
          `/api/courses/lessons/get-file-url`,
          {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
              lessonID,
              courseID,
              enrollmentID: enrollment?.id,
            }),
            credentials: "include",
          },
        );
        const data = await res.json();
        if (data.success) {
          const link = document.createElement("a");
          link.href = data.data;
          link.download = "resource";
          link.click();
        } else {
          throw new Error(data.message);
        }
      } catch (err) {
        setError("Failed to download file.");
      }
    },
    [courseID, enrollment, apiHeaders],
  );

  // Calculate Analytics
  const analytics = useMemo(() => {
    const totalLessons = lessonList.length || 1;
    const completedLessons = Object.values(progressRef.current).filter(
      (p) => p.isCompleted,
    ).length;
    const progressPercentage = Math.round(
      (completedLessons / totalLessons) * 100,
    );

    let totalSecondsWatched = 0;
    Object.values(progressRef.current).forEach((p) => {
      totalSecondsWatched += p.currentTime || 0;
    });

    const hours = Math.floor(totalSecondsWatched / 3600);
    const minutes = Math.floor((totalSecondsWatched % 3600) / 60);
    const timeSpent = `${hours}h ${minutes}m`;

    return {
      completedLessons,
      totalLessons,
      progressPercentage,
      timeSpent,
    };
  }, [lessonList, renderTick]);

  // Build a lookup map for lessons by ID
  const lessonsById = useMemo(() => {
    const map = {};
    lessonList.forEach((l) => { map[l.id] = l; });
    return map;
  }, [lessonList]);

  const toggleSection = useCallback((sectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  // Get global index for a lesson (across all sections/flat list)
  const getGlobalIndex = useCallback(
    (lessonId) => lessonList.findIndex((l) => l.id === lessonId),
    [lessonList],
  );

  if (isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" height="100vh">
        <CircularProgress sx={{ color: "var(--primary-color)" }} />
      </Stack>
    );
  }
  const userType = session?.user?.accountType;


  const renderSectionedLessons = () =>
    sections.map((section, sIndex) => {
      const sectionLessons = (section.lessonIDs || [])
        .map((id) => lessonsById[id])
        .filter(Boolean);
      const isExpanded = expandedSections[section.id];
      const completedCount = sectionLessons.filter(
        (l) => progressRef.current[l.id]?.isCompleted,
      ).length;
      const totalCount = sectionLessons.length;
      const hasProgress = completedCount > 0;

      return (
        <Box key={section.id} width="100%">
          {/* Section Header */}
          <Stack
            direction="row"
            alignItems="center"
            onClick={() => toggleSection(section.id)}
            sx={{
              p: "14px 16px",
              borderRadius: isExpanded ? "10px 10px 0 0" : "10px",
              bgcolor: isExpanded ? "var(--primary-color)" : "var(--white)",
              border: "1px solid",
              borderColor: isExpanded ? "var(--primary-color)" : "var(--border-color)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              "&:hover": {
                bgcolor: isExpanded ? "var(--primary-color)" : "var(--library-expand)",
              },
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "8px",
                bgcolor: isExpanded ? "rgba(255,255,255,0.2)" : "var(--sec-color-acc-1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mr: 1.5,
                flexShrink: 0,
              }}
            >
              {isExpanded ? (
                <ExpandLess sx={{ fontSize: 18, color: isExpanded ? "white" : "var(--text3)" }} />
              ) : (
                <ExpandMore sx={{ fontSize: 18, color: "var(--sec-color)" }} />
              )}
            </Box>
            <Stack flex={1} gap={0.3}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: "14px",
                  color: isExpanded ? "white" : "var(--text1)",
                  fontFamily: "Lato",
                  lineHeight: 1.2,
                }}
              >
                {section.title}
              </Typography>
              {totalCount > 0 && (
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: isExpanded ? "rgba(255,255,255,0.7)" : "var(--text4)",
                  }}
                >
                  {completedCount}/{totalCount} lessons {hasProgress ? "completed" : ""}
                </Typography>
              )}
            </Stack>
            {totalCount > 0 && (
              <Box
                sx={{
                  bgcolor: isExpanded ? "rgba(255,255,255,0.2)" : hasProgress ? "var(--primary-color-acc-2)" : "var(--library-expand)",
                  px: 1,
                  py: 0.3,
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: isExpanded ? "white" : hasProgress ? "var(--primary-color)" : "var(--text4)",
                  ml: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {totalCount} {totalCount === 1 ? "lesson" : "lessons"}
              </Box>
            )}
          </Stack>

          {/* Expanded Lessons */}
          {isExpanded && (
            <Stack
              gap={0}
              sx={{
                border: "1px solid var(--border-color)",
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
                overflow: "hidden",
              }}
            >
              {sectionLessons.map((item, lIndex) => {
                const isAccessible = isEnrolled || item.isPreview;
                const isSelected = selectedLessonId === item.id;
                const globalIndex = getGlobalIndex(item.id);
                const progress = progressRef.current[item.id]?.progress || 0;
                const isCompleted = progressRef.current[item.id]?.isCompleted || false;
                const isLast = lIndex === sectionLessons.length - 1;

                return (
                  <Stack
                    key={item.id}
                    direction="row"
                    alignItems="center"
                    gap={1.5}
                    onClick={() => {
                      if (item.type === "VIDEO" && isAccessible) handleLessonClick(item, globalIndex);
                    }}
                    sx={{
                      p: "10px 16px",
                      bgcolor: isSelected ? "var(--sec-color-acc-1)" : "var(--white)",
                      borderBottom: isLast ? "none" : "1px solid var(--border-color)",
                      cursor: item.type === "VIDEO" && isAccessible ? "pointer" : "default",
                      opacity: isAccessible ? 1 : 0.55,
                      transition: "background 0.15s",
                      "&:hover": {
                        bgcolor: isAccessible
                          ? isSelected ? "var(--sec-color-acc-1)" : "var(--library-expand)"
                          : "var(--white)",
                      },
                    }}
                  >
                    {/* Play/File Icon */}
                    <Box sx={{ color: isSelected ? "var(--sec-color)" : "var(--text4)", display: "flex", flexShrink: 0 }}>
                      {item.type === "VIDEO" ? (
                        isSelected && isPlaying ? (
                          <PauseCircle sx={{ fontSize: 22 }} />
                        ) : (
                          <PlayCircle sx={{ fontSize: 22 }} />
                        )
                      ) : (
                        <InsertDriveFile sx={{ fontSize: 22 }} />
                      )}
                    </Box>

                    {/* Title + Duration */}
                    <Stack flex={1} gap={0}>
                      <Typography
                        sx={{
                          fontSize: "13px",
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? "var(--text1)" : "var(--text2)",
                          fontFamily: "Lato",
                          lineHeight: 1.3,
                        }}
                      >
                        {item.title}
                      </Typography>
                      {item.duration > 0 && (
                        <Typography sx={{ fontSize: "11px", color: "var(--text4)" }}>
                          {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, "0")} min
                        </Typography>
                      )}
                    </Stack>

                    {/* Status Icon */}
                    <Box sx={{ flexShrink: 0, display: "flex" }}>
                      {!isAccessible ? (
                        <Lock sx={{ fontSize: 18, color: "var(--text4)" }} />
                      ) : isCompleted ? (
                        <CheckCircle sx={{ fontSize: 18, color: "var(--primary-color)" }} />
                      ) : progress > 0 ? (
                        <CircularProgress variant="determinate" value={progress} size={18} thickness={5} sx={{ color: "var(--primary-color)" }} />
                      ) : (
                        <Box sx={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--border-color)" }} />
                      )}
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Box>
      );
    });

  const isPaidCourseForUser =
    (userType === "FREE" && !courseDetails?.subscription?.isFree) ||
    (userType === "PRO" &&
      !courseDetails?.subscription?.isFree &&
      !courseDetails?.subscription?.isPro);

  return (
    <Stack
      padding={{ xs: "10px", sm: "20px" }}
      alignItems="center"
      sx={{
        marginBottom: isEnrolled
          ? { xs: "0%", md: "0px" }
          : { xs: "40%", sm: "20%", md: "0px" },
      }}
    >
      <Script
        src="https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js"
        onLoad={initializePlayer}
      />

      <Stack gap="20px" width="100%" maxWidth="1200px">
        {/* Title Bar */}
        <Stack
          flexDirection="row"
          alignItems="center"
          gap="5px"
          sx={{
            border: "1px solid var(--border-color)",
            backgroundColor: "var(--white)",
            borderRadius: "10px",
            padding: "10px 20px",
            width: "100%",
            height: "50px",
          }}
        >
          <ArrowBackIosNew
            onClick={() => router.back()}
            sx={{ cursor: "pointer", fontSize: "18px" }}
          />
          <Typography
            sx={{ fontSize: { xs: "14px", sm: "18px" }, fontFamily: "Lato" }}
          >
            {courseDetails?.title || <Skeleton variant="text" width="120px" />}
          </Typography>
        </Stack>

        {/* Main Content: Left (Video + Description) + Right (Checkout + Lectures) */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          gap={{ xs: "20px", lg: "30px" }}
          justifyContent="space-between"
        >
          {/* Left Column: Video + Description */}
          <Stack gap="15px" flex={1} width="100%">
            {/* Video Player */}
            <Stack>
              {videoLoading ? (
                <Stack
                  width="100%"
                  height="500px"
                  justifyContent="center"
                  alignItems="center"
                >
                  <CircularProgress
                    sx={{ color: "var(--primary-color)" }}
                    size={50}
                  />
                </Stack>
              ) : videoPreview ? (
                <Stack
                  ref={videoContainerRef}
                  tabIndex={0}
                  onKeyDown={handleContainerKeyDown}
                  onDoubleClick={toggleFullscreen}
                  onClick={(e) => {
                    // Single tap on mobile: show controls
                    // Click on desktop: focus container for keyboard
                    videoContainerRef.current?.focus({ preventScroll: true });
                    // Don't flash controls if user clicked on the controls themselves
                    if (e.target === e.currentTarget || e.target.tagName === "IFRAME") {
                      flashControls();
                    }
                  }}
                  sx={{
                    width: "100%",
                    aspectRatio: "16 / 9",
                    borderRadius: isFullscreen ? 0 : "15px",
                    overflow: "hidden",
                    backgroundColor: "black",
                    position: "relative",
                    cursor: "pointer",
                    outline: "none",
                    "&:fullscreen": {
                      borderRadius: 0,
                      width: "100vw",
                      height: "100vh",
                      "& iframe": { borderRadius: 0 },
                    },
                    // Show controls on hover (desktop)
                    "&:hover .video-controls": {
                      opacity: 1,
                    },
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    id="bunny-stream-embed"
                    src={videoPreview}
                    style={{
                      borderRadius: isFullscreen ? 0 : "15px",
                      width: "100%",
                      maxWidth: "100%",
                      height: "100%",
                      border: "none",
                    }}
                    allow="autoplay"
                  />

                  {/* Custom fullscreen button — top-right, always clickable */}
                  <Box
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFullscreen();
                    }}
                    sx={{
                      position: "absolute",
                      top: { xs: 8, sm: 12 },
                      right: { xs: 8, sm: 12 },
                      width: { xs: 40, sm: 44 },
                      height: { xs: 40, sm: 44 },
                      borderRadius: "10px",
                      backgroundColor: "rgba(0,0,0,0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      backdropFilter: "blur(8px)",
                      transition: "background 0.2s",
                      zIndex: 4,
                      "&:hover": { backgroundColor: "rgba(0,0,0,0.7)" },
                      "&:active": { transform: "scale(0.93)" },
                    }}
                  >
                    {isFullscreen ? (
                      <FullscreenExit sx={{ color: "white", fontSize: { xs: 22, sm: 26 } }} />
                    ) : (
                      <Fullscreen sx={{ color: "white", fontSize: { xs: 22, sm: 26 } }} />
                    )}
                  </Box>

                  {/* Anti-piracy watermark — drifts to random position */}
                  {session?.user?.email && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: `${watermarkPos.top}%`,
                        left: `${watermarkPos.left}%`,
                        pointerEvents: "none",
                        zIndex: 2,
                        transition: "top 2s ease-in-out, left 2s ease-in-out",
                      }}
                    >
                      <Typography
                        sx={{
                          color: "rgba(255, 255, 255, 0.18)",
                          fontSize: { xs: "12px", sm: "15px", md: "18px" },
                          fontWeight: 700,
                          fontFamily: "monospace",
                          letterSpacing: "1.5px",
                          userSelect: "none",
                          transform: "rotate(-20deg)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {session.user.email}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              ) : (
                <Stack
                  sx={{
                    width: "100%",
                    aspectRatio: "16 / 9",
                    borderRadius: "15px",
                    overflow: "hidden",
                    backgroundColor: "var(--library-expand)",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                  }}
                >
                  {courseDetails?.thumbnail ? (
                    <Box
                      component="img"
                      src={courseDetails.thumbnail}
                      alt={courseDetails.title}
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <>
                      <PlayCircle sx={{ fontSize: 64, color: "var(--text4)" }} />
                      <Typography
                        sx={{ mt: 1, color: "var(--text3)", fontWeight: 600, fontSize: "14px" }}
                      >
                        Select a lesson to start watching
                      </Typography>
                    </>
                  )}
                </Stack>
              )}
            </Stack>

            {/* Language, Lessons and Duration tags */}
            <Stack
              flexDirection="row"
              width="100%"
              gap="10px"
            >
              {[
                { icon: <Translate sx={{ fontSize: "16px" }} />, text: courseDetails?.language?.join?.(", ") || courseDetails?.language || "N/A" },
                { icon: <PlayLesson sx={{ fontSize: "16px" }} />, text: `${courseDetails?.lessons || lessonList.length} Lessons` },
                { icon: <AccessTimeFilled sx={{ fontSize: "16px" }} />, text: formatDuration(courseDetails?.duration) },
              ].map((tag, i) => (
                <Typography
                  key={i}
                  sx={{
                    fontFamily: "Lato",
                    fontSize: { xs: "12px", lg: "13px" },
                    fontWeight: 500,
                    backgroundColor: "var(--sec-color-acc-1)",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    color: "var(--sec-color)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {tag.icon}
                  {tag.text}
                </Typography>
              ))}
            </Stack>

            {/* About this course — Desktop only */}
            <Stack
              sx={{
                display: { xs: "none", md: "block" },
              }}
            >
              {courseDetails?.description && (
                <Stack
                  sx={{
                    backgroundColor: "var(--white)",
                    padding: "20px 25px",
                    borderRadius: "10px",
                    maxHeight: "500px",
                    overflow: "auto",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "18px",
                      fontWeight: 700,
                      mb: 2,
                      color: "var(--text1)",
                      fontFamily: "Lato",
                    }}
                  >
                    About this course
                  </Typography>
                  <MDPreview value={courseDetails.description} />
                </Stack>
              )}
            </Stack>
          </Stack>

          {/* Right Column: Checkout/Analytics + Info Tags + Lectures */}
          <Stack
            gap="20px"
            alignItems="stretch"
            width={{ xs: "100%", md: "350px" }}
            minWidth={{ md: "350px" }}
            sx={{ marginBottom: { xs: "60px", md: "0px" } }}
          >
            {/* Checkout Card or Analytics */}
            {!isEnrolled ? (
              <CheckoutCard
                courseDetails={courseDetails}
                lessonList={lessonList}
                isPaidCourseForUser={isPaidCourseForUser}
              />
            ) : (
              <Stack
                sx={{
                  bgcolor: "var(--white)",
                  p: 2.5,
                  borderRadius: "10px",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  mb={1.5}
                >
                  <Typography
                    sx={{ fontSize: "14px", fontWeight: 600, color: "var(--text3)" }}
                  >
                    Progress
                  </Typography>
                  <Typography
                    sx={{ fontSize: "14px", fontWeight: 700, color: "var(--text1)" }}
                  >
                    {analytics.progressPercentage}%
                  </Typography>
                </Stack>
                <Box
                  sx={{
                    width: "100%",
                    height: 6,
                    bgcolor: "var(--library-expand)",
                    borderRadius: "3px",
                    overflow: "hidden",
                    mb: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: `${analytics.progressPercentage}%`,
                      height: "100%",
                      bgcolor: "var(--primary-color)",
                      borderRadius: "3px",
                      transition: "width 0.5s ease",
                    }}
                  />
                </Box>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
                    {analytics.timeSpent} watched
                  </Typography>
                  <Typography sx={{ fontSize: "12px", color: "var(--text3)" }}>
                    {analytics.completedLessons}/{analytics.totalLessons} lessons
                  </Typography>
                </Stack>
              </Stack>
            )}

            {/* Lectures List */}
            <Stack
              width="100%"
              gap="15px"
            >
              <Stack
                width="100%"
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  sx={{
                    fontSize: { xs: "18px", sm: "20px" },
                    fontWeight: 700,
                    fontFamily: "Lato",
                  }}
                >
                  Lectures
                </Typography>
                <Typography sx={{ fontSize: "16px", color: "var(--text3)" }}>
                  {selectedLessonIndex}/{lessonList.length}
                </Typography>
              </Stack>

              {lessonList.length > 0
                ? sections.length > 0
                  ? renderSectionedLessons()
                  : lessonList.map((item, index) => {
                      const isAccessible = isEnrolled || item.isPreview;
                      const isSelected = selectedLessonId === item.id;
                      const progress = progressRef.current[item.id]?.progress || 0;
                      const isCompleted = progressRef.current[item.id]?.isCompleted || false;

                      return (
                        <LessonCard
                          key={item.id}
                          onClick={() => {
                            if (item.type === "VIDEO" && isAccessible) {
                              handleLessonClick(item, index);
                            }
                          }}
                          style={{
                            cursor:
                              item.type === "VIDEO" && isAccessible
                                ? "pointer"
                                : "not-allowed",
                            opacity: isAccessible ? 1 : 0.6,
                          }}
                          LessonName={
                            <span style={{ color: "var(--text1)" }}>
                              {item.title}
                            </span>
                          }
                          duration={item.duration}
                          iconStart={
                            item.type === "VIDEO" ? (
                              isSelected && isPlaying ? (
                                <PauseCircle
                                  sx={{ color: isAccessible ? "var(--sec-color)" : "var(--primary-color)" }}
                                />
                              ) : (
                                <PlayCircle
                                  sx={{ color: isAccessible ? "var(--sec-color)" : "var(--primary-color)" }}
                                />
                              )
                            ) : (
                              <InsertDriveFile
                                sx={{ color: isAccessible ? "var(--sec-color)" : "var(--primary-color)" }}
                              />
                            )
                          }
                          iconEnd={
                            item.type === "FILE" ? (
                              isAccessible ? (
                                <SaveAlt
                                  sx={{ color: "var(--sec-color)", cursor: "pointer" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFileDownload(item.id);
                                  }}
                                />
                              ) : (
                                <Lock sx={{ color: "var(--primary-color)" }} />
                              )
                            ) : !isAccessible ? (
                              <Lock sx={{ color: "var(--primary-color)" }} />
                            ) : isCompleted ? (
                              <CheckCircle sx={{ color: "var(--primary-color)", fontSize: 22 }} />
                            ) : progress > 0 ? (
                              <CircularProgress
                                variant="determinate"
                                value={progress}
                                size={22}
                                thickness={5}
                                sx={{ color: "var(--primary-color)" }}
                              />
                            ) : null
                          }
                          isPreview={item.isPreview}
                          isEnrolled={isEnrolled}
                          isSelected={isSelected}
                          now={isSelected}
                        />
                      );
                    })
                : Array.from({ length: 4 }).map((_, i) => (
                    <LessoncardSkeleton key={i} />
                  ))}
            </Stack>

            {/* About this course — Mobile only */}
            <Stack
              sx={{
                display: { xs: "block", md: "none" },
                width: "100%",
              }}
            >
              {courseDetails?.description && (
                <Stack
                  sx={{
                    backgroundColor: "var(--white)",
                    padding: "20px 25px",
                    borderRadius: "10px",
                    maxHeight: "500px",
                    overflow: "auto",
                    marginTop: "20px",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "18px",
                      fontWeight: 700,
                      mb: 2,
                      color: "var(--text1)",
                      fontFamily: "Lato",
                    }}
                  >
                    About this course
                  </Typography>
                  <MDPreview value={courseDetails.description} />
                </Stack>
              )}
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  );
};

const playVideo = async ({
  lessonID,
  courseID,
  enrollmentID,
  setVideoLoading,
  setVideoPreview,
}) => {
  setVideoLoading(true);
  try {
    const response = await fetch(
      `/api/courses/lessons/get-video-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonID, courseID, enrollmentID }),
        credentials: "include",
      },
    );
    const data = await response.json();
    if (data.success) {
      setVideoPreview(data.data);
    } else {
      throw new Error(data.message || "Failed to load video");
    }
  } catch (error) {
    console.error("Video play error:", error);
    setVideoPreview("");
  } finally {
    setVideoLoading(false);
  }
};

export default MyCourse;
