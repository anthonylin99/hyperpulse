import { redirect } from "next/navigation";
import FactorsPage from "@/components/factors/FactorsPage";
import { isFactorsEnabled } from "@/lib/appConfig";

export default function FactorsRoutePage() {
  if (!isFactorsEnabled()) {
    redirect("/");
  }
  return <FactorsPage />;
}
