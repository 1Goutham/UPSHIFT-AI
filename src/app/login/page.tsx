import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };

export default async function Page() {
  const user = await currentUser();
  if (user && !user.isGuest) redirect("/app");
  return <AuthForm mode="login" />;
}
