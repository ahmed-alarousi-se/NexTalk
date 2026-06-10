import { useContext } from "react";

import { CallContext } from "@/lib/calls-context";

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCalls must be used within <CallProvider>");
  return ctx;
}
