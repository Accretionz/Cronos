import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Pass the Supabase settings from .env.local to the app. VITE_ is Vite's usual prefix;
  // NEXT_PUBLIC_ is what Supabase's "Connect" screen suggests. Both are public values.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
});
