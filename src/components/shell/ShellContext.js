import { createContext, useContext } from "react";

export const ShellContext = createContext(null);

export function useShell() {
  return useContext(ShellContext);
}
