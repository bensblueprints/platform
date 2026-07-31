"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: Window["fbq"];
    __metaPixelInited?: Record<string, boolean>;
  }
}

/**
 * Meta (Facebook) Pixel: installs the official fbq stub, loads fbevents.js,
 * inits the pixel, tracks PageView, then fires each entry in `events` once the
 * script is ready. Events appended later (e.g. a Purchase detected after
 * mount) fire as they appear.
 */
export default function MetaPixel({
  pixelId,
  events = [],
}: {
  pixelId: string;
  events?: Array<{ name: string; params?: Record<string, unknown> }>;
}) {
  const [loaded, setLoaded] = useState(false);
  const fired = useRef(0);

  useEffect(() => {
    if (!loaded || typeof window.fbq !== "function") return;
    for (; fired.current < events.length; fired.current++) {
      const e = events[fired.current];
      window.fbq("track", e.name, e.params);
    }
  }, [loaded, events]);

  const id = JSON.stringify(pixelId);

  return (
    <>
      <Script id={`meta-pixel-stub-${pixelId}`} strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];}(window, document);
window.__metaPixelInited=window.__metaPixelInited||{};
if(!window.__metaPixelInited[${id}]){window.__metaPixelInited[${id}]=true;
fbq('init',${id});fbq('track','PageView');}`}
      </Script>
      <Script
        id={`meta-pixel-lib-${pixelId}`}
        strategy="afterInteractive"
        src="https://connect.facebook.net/en_US/fbevents.js"
        onLoad={() => setLoaded(true)}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
