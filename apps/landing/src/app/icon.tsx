import { ImageResponse } from "next/og";

// Favicon: "ar" in the brand's signature cyan on a near-black square. This is
// the site's DNA (black canvas, cyan accent) and the cyan glyph stays legible
// on both light and dark browser tab bars. Replaces the default Vercel triangle.
export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 14,
          color: "#00bcff",
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: "-2px",
          fontFamily: "sans-serif",
        }}
      >
        ar
      </div>
    ),
    { ...size },
  );
}
