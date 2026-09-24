import { createContext, useContext } from "react";

export const ToastContext = createContext(() => {});

/** toast("Saved") or toast({ title, body, tone: "success" | "error" | "info", action: { label, onClick } }) */
export function useToast() {
  return useContext(ToastContext);
}
