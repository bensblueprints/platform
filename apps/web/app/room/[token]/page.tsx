import { notFound, redirect } from "next/navigation";
import {  getSharedDb, getRoomPayload  } from "@platform/core";
import RoomClient from "../../../components/RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await getRoomPayload(getSharedDb(), token);
  if (!payload) notFound();
  if (payload.over) redirect(payload.redirectUrl ?? "/");
  return <RoomClient payload={payload} token={token} />;
}
