import { Suspense } from "react";
import AdminLive from "./AdminLive";

export const dynamic = "force-dynamic";

export default function AdminLivePage() {
  return (
    <Suspense fallback={null}>
      <AdminLive />
    </Suspense>
  );
}
