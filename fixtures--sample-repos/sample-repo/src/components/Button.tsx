import { type ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
}

export function Button({ children }: ButtonProps) {
  return <button>{children}</button>;
}
