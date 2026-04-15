import {useLayoutEffect, useRef} from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  IFrame,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const colors = {
  forestDark: "#1a3010",
  gold: "#9a7328",
  calmTop: "#eef4f8",
  calmMid: "#f4f1ec",
  calmBottom: "#e8ebe6",
};

const ambientUrl = staticFile("ad-ambient.mp3");

/** Extra home length for longer house beat / scroll-out. */
const HOME_ACCOM_HEAD_HOLD_EXTRA = 140;
const HOME_FRAMES = 1020 + HOME_ACCOM_HEAD_HOLD_EXTRA;
const BOOKING_FRAMES = 600;
const OUTRO_FRAMES = 120;

const SCREEN_W = 398;
const IFRAME_DOC_HEIGHT = 3800;

const ease = Easing.inOut(Easing.cubic);

/** Frames 200..this: vertical pan through #book into #accommodation until ~bottom of house cards. */
const HOME_SCROLL_IN_END_FRAME = 518;
/** Hold on final pose before horizontal per-card gallery automation. */
const HOME_POSE_HOLD_BEFORE_ROW = 28;
/** First frame where `roomAdPayload` drives the row / galleries. */
const HOME_ROW_ANIM_START = HOME_SCROLL_IN_END_FRAME + HOME_POSE_HOLD_BEFORE_ROW;
/**
 * Land after the big #book block (only quick-action card bottoms may peek), with “Our farm
 * houses”, the full card row, and the sticky CTA in frame — matches the tighter phone comp.
 */
const HOME_ACCOM_SCROLL_Y = -1008;

function homeScrollY(frame) {
  if (frame <= 200) {
    return interpolate(frame, [0, 200], [0, -280], {easing: ease, extrapolateRight: "clamp"});
  }
  if (frame <= HOME_SCROLL_IN_END_FRAME) {
    return interpolate(frame, [200, HOME_SCROLL_IN_END_FRAME], [-280, HOME_ACCOM_SCROLL_Y], {
      easing: ease,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  const scrollOutStart = 900 + HOME_ACCOM_HEAD_HOLD_EXTRA;
  if (frame <= scrollOutStart) {
    return HOME_ACCOM_SCROLL_Y;
  }
  return interpolate(frame, [scrollOutStart, HOME_FRAMES - 1], [HOME_ACCOM_SCROLL_Y, -1720], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Drives row position + which house card + which gallery photo (inside iframe).
 * `activeCard` 0..2 = Willow Cottage, Studio Flier, Blue House (DOM order). -1 = row only.
 */
function roomAdPayload(frame) {
  if (frame < HOME_ROW_ANIM_START) {
    return {rowProgress: 0, activeCard: -1, gallerySlide: 0};
  }
  const s0 = HOME_ROW_ANIM_START;
  if (frame < s0 + 150) {
    const t = frame - s0;
    const rowProgress = interpolate(t, [0, 28], [0, 0.08], {easing: ease, extrapolateRight: "clamp"});
    const gallerySlide = Math.floor(Math.max(0, t - 24) / 22);
    return {rowProgress, activeCard: 0, gallerySlide};
  }
  if (frame < s0 + 300) {
    const t = frame - (s0 + 150);
    const rowProgress = interpolate(t, [0, 28], [0.33, 0.52], {easing: ease, extrapolateRight: "clamp"});
    const gallerySlide = Math.floor(Math.max(0, t - 24) / 22);
    return {rowProgress, activeCard: 1, gallerySlide};
  }
  if (frame < s0 + 450) {
    const t = frame - (s0 + 300);
    const rowProgress = interpolate(t, [0, 28], [0.68, 0.94], {easing: ease, extrapolateRight: "clamp"});
    const gallerySlide = Math.floor(Math.max(0, t - 24) / 22);
    return {rowProgress, activeCard: 2, gallerySlide};
  }
  const t = frame - (s0 + 450);
  return {
    rowProgress: interpolate(t, [0, 90], [0.48, 0.1], {easing: ease, extrapolateRight: "clamp"}),
    activeCard: -1,
    gallerySlide: 0,
  };
}

/** Matches BookingPage static ROOMS[0] — used to prefill Review & Pay in the ad. */
const DEMO_BOOKING_ROOM = {id: "house-1", name: "Willow Cottage", price: 1920};

/**
 * Vertical pan inside booking iframe: step 1 (dates) → step 2 (choose room) → step 4 (review).
 * Steps are driven by `bookingAdPayload` via postMessage; scroll only frames what’s on screen.
 */
function bookingScrollY(t) {
  if (t < 120) {
    return interpolate(t, [0, 120], [0, -200], {easing: ease, extrapolateRight: "clamp"});
  }
  if (t < 300) {
    return interpolate(t, [120, 220], [-200, -248], {easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  }
  if (t < 480) {
    return interpolate(t, [300, 420], [-320, -520], {easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  }
  return interpolate(t, [480, BOOKING_FRAMES - 1], [-520, -600], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function bookingAdPayload(bf) {
  if (bf < 100) {
    return {step: 1};
  }
  if (bf < 290) {
    return {step: 2};
  }
  return {
    step: 4,
    room: DEMO_BOOKING_ROOM,
    demoGuest: true,
  };
}

function CalmBackground() {
  return (
    <AbsoluteFill
      style={{
        zIndex: 0,
        background: `linear-gradient(168deg, ${colors.calmTop} 0%, ${colors.calmMid} 48%, ${colors.calmBottom} 100%)`,
      }}
    />
  );
}

function IPhone14ProMaxShell({children, innerHeight, scrollY = 0}) {
  const bezel = 14;
  const outerRadius = 54;
  const screenRadius = 48;

  return (
    <div
      style={{
        position: "relative",
        padding: bezel,
        borderRadius: outerRadius,
        background: "linear-gradient(145deg, #3d3d42 0%, #1c1c1e 40%, #0d0d0f 100%)",
        boxShadow: `
          0 50px 120px rgba(0,0,0,0.45),
          0 24px 48px rgba(0,0,0,0.28),
          inset 0 1px 1px rgba(255,255,255,0.14),
          inset 0 -1px 1px rgba(0,0,0,0.4)
        `,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 10,
          borderRadius: outerRadius - 2,
          border: "1px solid rgba(255,255,255,0.06)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          borderRadius: screenRadius,
          overflow: "hidden",
          height: innerHeight,
          background: "#000",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 118,
            height: 36,
            background: "#000",
            borderRadius: 20,
            zIndex: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 15,
            pointerEvents: "none",
            background: "linear-gradient(125deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 100%)",
          }}
        />

        <div
          style={{
            transform: `translate3d(0, ${Math.round(scrollY)}px, 0)`,
            transformOrigin: "top center",
            marginTop: 4,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          {children}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: -3,
          top: "22%",
          width: 4,
          height: 56,
          background: "linear-gradient(180deg, #2a2a2c, #1a1a1c)",
          borderRadius: "2px 0 0 2px",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -3,
          top: "32%",
          width: 4,
          height: 56,
          background: "linear-gradient(180deg, #2a2a2c, #1a1a1c)",
          borderRadius: "2px 0 0 2px",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -3,
          top: "28%",
          width: 4,
          height: 88,
          background: "linear-gradient(180deg, #2a2a2c, #1a1a1c)",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}

function adEmbedUrl(baseUrl, pathSuffix) {
  const path = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${baseUrl}${path}${sep}vc_embed=1`;
}

function LiveSitePhone({baseUrl, path: pathSuffix, innerHeight, scrollY, iframeRef}) {
  const url = adEmbedUrl(baseUrl, pathSuffix);
  return (
    <IPhone14ProMaxShell innerHeight={innerHeight} scrollY={scrollY}>
      <IFrame
        ref={iframeRef}
        src={url}
        delayRenderTimeoutInMilliseconds={120000}
        style={{
          width: SCREEN_W,
          height: IFRAME_DOC_HEIGHT,
          border: 0,
          display: "block",
          pointerEvents: "none",
          backgroundColor: "#FDFBF7",
        }}
      />
    </IPhone14ProMaxShell>
  );
}

export const ValleyCroftAd = ({headline, siteUrl}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const homeIframeRef = useRef(null);
  const bookingIframeRef = useRef(null);
  const lastRoomAdPayloadJson = useRef(null);
  const lastBookingAdPayloadJson = useRef(null);

  const baseUrl = String(siteUrl || "http://127.0.0.1:5173").replace(/\/+$/, "");

  const postToOrigin = (win, msg) => {
    let targetOrigin;
    try {
      targetOrigin = new URL(baseUrl).origin;
    } catch {
      targetOrigin = "*";
    }
    win.postMessage(msg, targetOrigin);
  };

  useLayoutEffect(() => {
    if (frame < 0 || frame >= HOME_FRAMES) {
      return;
    }
    const win = homeIframeRef.current?.contentWindow;
    if (!win) {
      return;
    }
    const pl = roomAdPayload(frame);
    const key = JSON.stringify(pl);
    if (key === lastRoomAdPayloadJson.current) {
      return;
    }
    lastRoomAdPayloadJson.current = key;
    postToOrigin(win, {type: "VC_ROOM_AD", ...pl});
  }, [frame, baseUrl]);

  const bf = frame - HOME_FRAMES;
  useLayoutEffect(() => {
    if (bf < 0 || bf >= BOOKING_FRAMES) {
      return;
    }
    const win = bookingIframeRef.current?.contentWindow;
    if (!win) {
      return;
    }
    const pl = bookingAdPayload(bf);
    const key = JSON.stringify(pl);
    if (key === lastBookingAdPayloadJson.current) {
      return;
    }
    lastBookingAdPayloadJson.current = key;
    postToOrigin(win, {type: "VC_BOOKING_AD", ...pl});
  }, [bf, baseUrl]);

  const intro = spring({frame, fps, durationInFrames: 22, config: {damping: 16}});
  const heroFade = interpolate(frame, [230, 310], [1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const rawPhoneFloat = Math.sin(frame / 48) * 5;
  const phoneFloat = Math.round(rawPhoneFloat);
  const accomHoldEnd = 900 + HOME_ACCOM_HEAD_HOLD_EXTRA;
  /** Ease out the idle bob before the accommodation hold so the shell does not jump one frame. */
  const phoneFloatBlendStart = HOME_SCROLL_IN_END_FRAME - 22;
  let phoneFloatHome;
  if (frame >= HOME_SCROLL_IN_END_FRAME && frame <= accomHoldEnd) {
    phoneFloatHome = 0;
  } else if (frame >= phoneFloatBlendStart && frame < HOME_SCROLL_IN_END_FRAME) {
    const d = HOME_SCROLL_IN_END_FRAME - phoneFloatBlendStart;
    const u = d > 0 ? (frame - phoneFloatBlendStart) / d : 1;
    const sm = u * u * (3 - 2 * u);
    phoneFloatHome = Math.round(rawPhoneFloat * (1 - sm));
  } else {
    phoneFloatHome = Math.round(rawPhoneFloat);
  }

  const phoneInnerHome = 796;
  const phoneInnerBook = 812;
  const phoneInnerOutro = 640;

  const outroLocal = frame - HOME_FRAMES - BOOKING_FRAMES;

  return (
    <AbsoluteFill style={{fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"}}>
      <CalmBackground />

      <Audio src={ambientUrl} loop volume={0.52} playbackRate={0.96} />

      <div
        style={{
          position: "absolute",
          top: 36,
          right: 40,
          zIndex: 25,
          fontSize: 15,
          fontWeight: 600,
          color: "rgba(40,55,45,0.55)",
          letterSpacing: 1.1,
          textTransform: "uppercase",
        }}
      >
        Live website
      </div>

      <AbsoluteFill style={{zIndex: 10}}>
        <Sequence from={0} durationInFrames={HOME_FRAMES}>
          <AbsoluteFill>
            <div
              style={{
                position: "absolute",
                top: 72,
                left: 0,
                right: 0,
                textAlign: "center",
                padding: "0 36px",
                opacity: Math.min(intro, heroFade),
                transform: `translateY(${Math.round(interpolate(intro, [0, 1], [28, 0]))}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: 3.5,
                  textTransform: "uppercase",
                  color: colors.gold,
                  fontWeight: 700,
                }}
              >
                ValleyCroft
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 44,
                  lineHeight: 1.08,
                  fontFamily: "Georgia, 'Times New Roman', ui-serif, serif",
                  color: colors.forestDark,
                  fontWeight: 700,
                }}
              >
                {headline}
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                top: 268,
                left: 0,
                right: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                transform: `translateY(${phoneFloatHome}px)`,
              }}
            >
              <LiveSitePhone
                baseUrl={baseUrl}
                path="/"
                innerHeight={phoneInnerHome}
                scrollY={Math.round(homeScrollY(frame))}
                iframeRef={homeIframeRef}
              />
            </div>
          </AbsoluteFill>
        </Sequence>

        <Sequence from={HOME_FRAMES} durationInFrames={BOOKING_FRAMES}>
          <AbsoluteFill>
            <div
              style={{
                position: "absolute",
                top: 88,
                width: "100%",
                textAlign: "center",
                fontSize: 30,
                fontFamily: "Georgia, ui-serif, serif",
                fontWeight: 700,
                color: colors.forestDark,
                padding: "0 28px",
              }}
            >
              Same phone — real booking flow
            </div>
            <div
              style={{
                position: "absolute",
                top: 200,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                transform: `translateY(${Math.round(Math.sin(bf / 50) * 4)}px)`,
              }}
            >
              <LiveSitePhone
                baseUrl={baseUrl}
                path="/booking"
                innerHeight={phoneInnerBook}
                scrollY={Math.round(bookingScrollY(Math.max(0, bf)))}
                iframeRef={bookingIframeRef}
              />
            </div>
          </AbsoluteFill>
        </Sequence>

        <Sequence from={HOME_FRAMES + BOOKING_FRAMES} durationInFrames={OUTRO_FRAMES}>
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: "center",
              padding: "32px 40px 48px",
            }}
          >
            <div style={{textAlign: "center", marginBottom: 28}}>
              <div
                style={{
                  fontSize: 48,
                  fontFamily: "Georgia, ui-serif, serif",
                  fontWeight: 700,
                  color: colors.forestDark,
                  lineHeight: 1.12,
                }}
              >
                Book your farm stay
              </div>
              <div
                style={{
                  marginTop: 16,
                  fontSize: 26,
                  color: "rgba(40,55,45,0.88)",
                  lineHeight: 1.4,
                }}
              >
                ValleyCroft · B&amp;B &amp; events
              </div>
            </div>
            <div
              style={{
                transform: `scale(${interpolate(outroLocal, [0, 45], [0.92, 1], {extrapolateRight: "clamp"})}) translateY(${Math.round(phoneFloat * 0.5)}px)`,
              }}
            >
              <LiveSitePhone
                baseUrl={baseUrl}
                path="/"
                innerHeight={phoneInnerOutro}
                scrollY={Math.round(
                  interpolate(outroLocal, [15, OUTRO_FRAMES - 1], [0, -220], {
                    easing: ease,
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                )}
              />
            </div>
          </AbsoluteFill>
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
