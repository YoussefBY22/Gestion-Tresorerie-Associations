import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { construireNavigation } from "@/modules/core/services/navigation";
import { getParametre } from "@/modules/core/services/parametrage";

/**
 * Layout protégé : vérification de session côté serveur (le proxy.ts ne fait
 * qu'une redirection de confort sur présence de cookie).
 *
 * La navigation est construite ici : elle dépend du paramétrage (modules
 * actifs) et des rôles — donc du serveur, pas d'une liste figée côté client.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [entrees, nomStructure, slogan] = await Promise.all([
    construireNavigation(session.user.roles),
    getParametre<string>("general.nomStructure"),
    getParametre<string>("general.sloganStructure"),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar entrees={entrees} nomStructure={nomStructure} slogan={slogan} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
