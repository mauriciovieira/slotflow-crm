import type { Config } from "tailwindcss";
import slotflowPreset from "./src/design/tailwind.preset";

export default {
  presets: [slotflowPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
} satisfies Config;
