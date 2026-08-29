import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  children: ReactNode;
}

/** Pill-shaped button in the two Serene Scholar variants: solid teal
 * (primary) or transparent with a 2px teal border (secondary). Both get
 * the "spring" hover (slight scale-up + soft teal glow) via .spring-btn. */
export default function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  const base =
    "spring-btn inline-flex items-center justify-center gap-2 rounded-full font-label-md text-label-md px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none";
  const variants: Record<"primary" | "secondary", string> = {
    primary: "bg-primary text-on-primary",
    secondary: "bg-transparent text-primary border-2 border-primary hover:bg-primary/5",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
