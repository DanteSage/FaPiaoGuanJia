import React from "react";

export function Icon({
  d,
  size = 16
}: {
  d: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const icons = {
  back: "M19 12H5m7-7l-7 7 7 7",
  prev: "M15 18l-6-6 6-6",
  next: "M9 6l6 6-6 6",
  fit: "M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6",
  width: "M4 6h16M4 18h16M7 9h10M7 15h10",
  zoomIn: "M11 11V7m0 4H7m4 0h4m6 10l-4-4",
  zoomOut: "M7 11h8m6 10l-4-4",
  rotateL: "M3 12a9 9 0 1 0 3-6.7M3 12V7m0 5h5",
  rotateR: "M21 12a9 9 0 1 1-3-6.7M21 12V7m0 5h-5",
  reset: "M21 12a9 9 0 1 1-3-6.7M3 12a9 9 0 1 0 3 6.7",
  open: "M14 3h7v7M10 14L21 3M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z",
  more: "M12 6h.01M12 12h.01M12 18h.01",
  copy: "M8 8h12v12H8zM4 4h12v12H4z",
  compare: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3",
  trash: "M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14"
};
