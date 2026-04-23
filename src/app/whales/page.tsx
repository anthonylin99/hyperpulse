import WhalesPage from "@/components/whales/WhalesPage";
import { redirect } from "next/navigation";
import { isWhalesEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export default function WhalesRoutePage() {
  if (!isWhalesEnabled()) {
    redirect("/");
  }
  return <WhalesPage />;
}
