"use client";

// TEMPORARY test-only route to reach the SoulCreation wizard without going
// through wallet auth. Not linked from anywhere. Delete after use.

import { SoulCreation } from "@/app/main/welcome/SoulCreation";

export default function TmpSoulTest() {
  return <SoulCreation onExit={() => {}} />;
}
