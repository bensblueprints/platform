/**
 * Real-chat visibility (spec §6.1): attendees see their own messages,
 * moderator broadcasts, and moderator private replies addressed to them —
 * never another attendee's message. Moderators see everything.
 */

export interface MessageVisibility {
  /** Author (attendee message) or addressee (moderator private reply). Null for broadcasts. */
  registrantId: string | null;
  authorType: "attendee" | "moderator";
  broadcast: boolean;
}

export type Viewer = { kind: "attendee"; registrantId: string } | { kind: "moderator" };

export function canSeeMessage(msg: MessageVisibility, viewer: Viewer): boolean {
  if (viewer.kind === "moderator") return true;
  if (msg.broadcast && msg.authorType === "moderator") return true;
  return msg.registrantId === viewer.registrantId;
}
