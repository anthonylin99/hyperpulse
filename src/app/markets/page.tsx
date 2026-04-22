import MarketsRoutePage from "@/components/routes/MarketsRoutePage";

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { asset } = await searchParams;
  return <MarketsRoutePage initialAsset={asset ?? null} />;
}
