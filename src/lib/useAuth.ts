import { useEffect, useState } from "react";
import { getCurrentUser, onAuthChange } from "./api";

/** undefined = 확인 중, true/false = 로그인 여부 */
export function useLoggedIn() {
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    getCurrentUser().then((u) => setLoggedIn(!!u));
    return onAuthChange(setLoggedIn);
  }, []);
  return loggedIn;
}
