import { useEffect, useState } from "react";

export function useAuth() {
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    setStatus("ready");
  }, []);

  return { status };
}
