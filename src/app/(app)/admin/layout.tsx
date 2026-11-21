import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";

/** Zone /admin : réservée à la permission administration:lire (Super Admin). */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "administration", "lire")) redirect("/");

  const onglets = [
    { href: "/admin/utilisateurs", label: "Utilisateurs" },
    { href: "/admin/mandats", label: "Mandats" },
    { href: "/admin/organigramme", label: "Organigramme" },
    { href: "/admin/roles", label: "Rôles & permissions" },
    { href: "/admin/parametrage", label: "Paramétrage" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {onglets.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className="rounded-t-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {o.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
