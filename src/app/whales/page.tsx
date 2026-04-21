import Nav from "@/components/Nav";
import WhalesPage from "@/components/whales/WhalesPage";

export const dynamic = "force-dynamic";

export default function WhalesRoutePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />
      <WhalesPage />
    </div>
  );
}
