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

  return <WhaleProfilePage address={address} initialAlertId={alert ?? null} />;
}
