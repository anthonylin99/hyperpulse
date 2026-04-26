import { redirect } from "next/navigation";
import FactorsPage from "@/components/factors/FactorsPage";
import { isFactorsEnabled } from "@/lib/appConfig";

export const dynamic = "force-dynamic";

export default function FactorsRoutePage() {
  if (!isFactorsEnabled()) {
    redirect("/markets");
  }
  return <FactorsPage />;
}
