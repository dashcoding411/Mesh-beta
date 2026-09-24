import { createContext, useContext } from "react";

/* What every page might need from the app frame: who you are, who you
   follow, and the two global actions, open the Home sidebar, open Create. */
export const ShellContext = createContext(null);

export function useShell() {
  return useContext(ShellContext);
}
