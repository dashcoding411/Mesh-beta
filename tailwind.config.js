/* Mesh design tokens.

   Every colour here was measured, not eyeballed, the ratios are in the
   comments. Text tokens clear WCAG AA (4.5:1) on every surface they can land
   on; `field` clears the 3:1 non-text minimum so inputs are identifiable by
   their edge, not just their placeholder. If you add a token, measure it. */

const surfaces = {
  canvas: "#09090b", // app background
  surface: {
    DEFAULT: "#111114", // cards, sidebars, sheets
    2: "#18181c", // inputs, hovered rows, popovers
    3: "#222228", // pressed / selected
  },
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ...surfaces,
        line: {
          DEFAULT: "#26262b", // dividers, decorative, never the only cue
          strong: "#3f3f46",
        },
        field: "#6b6b76", // input borders, 3.0–3.8:1 on every surface
        fg: {
          DEFAULT: "#f4f4f5", // 14.4–18.1:1
          muted: "#a1a1aa", // 6.2–7.8:1, secondary text
          subtle: "#8e8e98", // 4.9–6.1:1, metadata, timestamps
        },
        accent: {
          DEFAULT: "#7c3aed", // violet-600, white on it is 5.7:1
          hover: "#6d28d9", // violet-700, 7.1:1; hover goes darker, never lighter
          text: "#a78bfa", // violet-400, 5.8–7.3:1 as text
          soft: "rgb(139 92 246 / 0.14)", // selected backgrounds
          ring: "#c4b5fd", // violet-300, focus outline, 8.6–10.8:1
        },
        brand: {
          from: "#7c3aed",
          to: "#c026d3", // fuchsia-600, white on it is 4.7:1
        },
        danger: { DEFAULT: "#dc2626", text: "#f87171" }, // 4.8:1 / 5.7–7.2:1
        success: { text: "#34d399" },
        warning: { text: "#fbbf24" },
      },

      fontFamily: {
        sans: ['"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Plus Jakarta Sans Variable"', '"Inter Variable"', "ui-sans-serif", "sans-serif"],
      },

      /* One deliberate scale. 12px is the floor: nothing smaller ships. */
      fontSize: {
        display: ["2rem", { lineHeight: "2.375rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        "title-1": ["1.5rem", { lineHeight: "1.875rem", letterSpacing: "-0.015em", fontWeight: "700" }],
        "title-2": ["1.25rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em", fontWeight: "650" }],
        "title-3": ["1.0625rem", { lineHeight: "1.375rem", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.375rem" }], // 15/22
        input: ["1rem", { lineHeight: "1.5rem" }], // 16px so iOS never zooms on focus
        callout: ["0.875rem", { lineHeight: "1.25rem" }], // 14/20
        caption: ["0.8125rem", { lineHeight: "1.125rem" }], // 13/18
        label: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.01em" }], // 12/16, the floor
      },

      borderRadius: {
        control: "12px", // buttons, inputs
        card: "16px",
        sheet: "24px",
      },

      boxShadow: {
        raised: "0 1px 2px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(255 255 255 / 0.03)",
        overlay: "0 16px 48px -12px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(255 255 255 / 0.05)",
        glow: "0 8px 24px -8px rgb(124 58 237 / 0.55)",
      },

      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      transitionDuration: {
        micro: "120ms",
        standard: "200ms",
        emphasis: "320ms",
      },

      zIndex: {
        nav: "30",
        overlay: "40",
        sheet: "50",
        toast: "60",
      },

      spacing: {
        nav: "64px", // mobile tab bar height, before the safe-area inset
      },
    },
  },
  plugins: [],
};
