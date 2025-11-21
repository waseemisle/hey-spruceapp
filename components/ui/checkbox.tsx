import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, id, ...props }, ref) => {
    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          ref={ref}
          id={id}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className="sr-only"
          {...props}
        />
        <label
          htmlFor={id}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors cursor-pointer",
            checked
              ? "bg-primary border-primary"
              : "border-gray-300 bg-white hover:border-gray-400",
            className
          )}
        >
          {checked && <Check className="h-3 w-3 text-white" />}
        </label>
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

