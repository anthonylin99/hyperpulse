import WhaleProfilePage from "@/components/whales/WhaleProfilePage";
import { redirect } from "next/navigation";
import { isWhalesEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export default async function WhaleAddressPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ alert?: string }>;
}) {
  if (!isWhalesEnabled()) {
    redirect("/");
  }
  const { address } = await params;
  const { alert } = await searchParams;

  return <WhaleProfilePage address={address} initialAlertId={alert ?? null} />;
}
