import { ImageResponse } from "next/og";

// Apple touch icon (home screen). Same "ar" mark, sized 180x180 with a bit more
// padding so the rounded square reads well on iOS.
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#00bcff",
          fontSize: 108,
          fontWeight: 700,
          letterSpacing: "-6px",
          fontFamily: "sans-serif",
        }}
      >
        ar
      </div>
    ),
    { ...size },
  );
}
