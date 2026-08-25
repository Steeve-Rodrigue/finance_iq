import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type IconInputProps = React.ComponentProps<typeof Input> & {
  icon: LucideIcon;
};

export const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  ({ icon: Icon, className, ...props }, ref) => {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          className={cn("h-10 pl-8 text-sm", className)}
          {...props}
        />
      </div>
    );
  },
);
IconInput.displayName = "IconInput";
