import { createContext, useContext } from "react";

export const ToastContext = createContext(() => {});

/** toast("Saved") or toast({ title, body, tone, action: { label, onClick } }) */
export function useToast() {
  return useContext(ToastContext);
}
