import AcceptInviteClient from "./AcceptInviteClient";

export default async function InvitarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInviteClient token={token} />;
}
