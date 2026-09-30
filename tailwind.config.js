/* Colour values live in src/index.css as theme variables. Text tokens meet
   WCAG AA on every surface in both themes; `field` meets 3:1 non-text. */

const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const surfaces = {
  canvas: v("canvas"), // app background
  surface: {
    DEFAULT: v("surface"), // cards, sidebars, sheets
    2: v("surface-2"), // inputs, hovered rows, popovers
    3: v("surface-3"), // pressed / selected
    raised: v("surface-raised"), // the chosen segment, lifted off surface-2
  },
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ...surfaces,
        line: {
          DEFAULT: v("line"), // dividers, decorative, never the only cue
          strong: v("line-strong"),
        },
        field: v("field"), // input borders
        fg: {
          DEFAULT: v("fg"),
          muted: v("fg-muted"), // secondary text
          subtle: v("fg-subtle"), // metadata, timestamps
        },
        accent: {
          DEFAULT: "#7c3aed", // violet-600, white on it is 5.7:1, both themes
          hover: "#6d28d9", // violet-700; hover goes darker, never lighter
          text: v("accent-text"), // accent-coloured text and icons
          soft: "var(--accent-soft)", // selected backgrounds
          ring: v("accent-ring"), // focus outline
        },
        danger: { DEFAULT: "#dc2626", text: v("danger-text") },
        success: { text: v("success-text") },
        warning: { text: v("warning-text") },
        like: v("like"), // a liked heart
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
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
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
