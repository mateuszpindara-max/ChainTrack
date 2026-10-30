import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="flex items-center gap-2 rounded-md border border-rose-300/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
