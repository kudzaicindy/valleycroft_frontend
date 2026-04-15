import {Composition} from "remotion";
import {ValleyCroftAd} from "./ValleyCroftAd";

/** TikTok / Reels portrait 1080×1920 (~63s @ 30fps — booking beat shows Choose Room + Review) */
const DURATION = 1880;

export const RemotionRoot = () => {
  return (
    <Composition
      id="ValleyCroftAd"
      component={ValleyCroftAd}
      durationInFrames={DURATION}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        headline: "Your farm stay starts here",
        /** Dev: Vite default. Render/export: pass production URL, e.g. --props='{"siteUrl":"https://yoursite.com"}' */
        siteUrl: "http://127.0.0.1:5173",
      }}
    />
  );
};
