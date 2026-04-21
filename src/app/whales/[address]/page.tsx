import Nav from "@/components/Nav";
import WhaleProfilePage from "@/components/whales/WhaleProfilePage";

export const dynamic = "force-dynamic";

export default async function WhaleAddressPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ alert?: string }>;
}) {
  const { address } = await params;
  const { alert } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />
      <WhaleProfilePage address={address} initialAlertId={alert ?? null} />
    </div>
  );
}
