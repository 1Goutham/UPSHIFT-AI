import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-label="Loading project">
      <Spinner className="text-2xl" />
    </div>
  );
}
