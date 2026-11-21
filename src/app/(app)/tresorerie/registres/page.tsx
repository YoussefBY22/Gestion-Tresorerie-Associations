import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Archive,
  Banknote,
  Building2,
  Gift,
  Landmark,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { exigerModuleActif } from "@/lib/autorisation";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

const REGISTRES = [
  {
    href: "/tresorerie/registres/clients",
    titre: "Registre des clients",
    description:
      "Contrats, avenants et livrables par client — le cahier des charges et l'enquête de satisfaction restent réservés aux modules Projets et RH.",
    icone: Users,
  },
  {
    href: "/tresorerie/registres/creances",
    titre: "Registre des créances",
    description:
      "Factures émises et non encore encaissées, déduites directement des projets — rien à ressaisir.",
    icone: Landmark,
  },
  {
    href: "/tresorerie/registres/cotisations",
    titre: "Registre des cotisations",
    description: "Cotisations du mandat, membre par membre, à jour ou en attente.",
    icone: Banknote,
  },
  {
    href: "/tresorerie/registres/dons",
    titre: "Registre des dons",
    description:
      "Aides, dons, donations et legs — en numéraire ou en nature, d'origine publique ou privée, nationale ou étrangère.",
    icone: Gift,
  },
  {
    href: "/tresorerie/registres/fournisseurs",
    titre: "Registre des fournisseurs",
    description:
      "Matricule fiscal vérifié avant tout engagement, nature de la prestation, évaluation.",
    icone: Building2,
  },
  {
    href: "/tresorerie/registres/cheques-dettes",
    titre: "Registre des chèques et dettes",
    description: "Chèques émis ou reçus en circulation, dettes et pénalités en cours.",
    icone: Archive,
  },
];

export default async function RegistresFinanciersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Registres financiers"
        description="Six registres exigés par la Norme JE. Ouvrez celui qu'il vous faut."
      />
      <NavTresorerie actif="/tresorerie/registres" />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {REGISTRES.map((r) => {
          const Icone = r.icone;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="group relative block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              {/* Façade du tiroir : la poignée se déplace au survol, comme
                  si le tiroir s'entrouvrait. */}
              <div className="relative border-b border-border bg-gradient-to-b from-muted/60 to-card px-5 pb-6 pt-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary transition-transform duration-300 group-hover:scale-110">
                    <Icone size={22} />
                  </span>
                  <h2 className="font-semibold leading-tight">{r.titre}</h2>
                </div>
                {/* Poignée du tiroir */}
                <span className="absolute inset-x-0 bottom-0 mx-auto h-1.5 w-16 translate-y-0 rounded-t-full bg-border transition-all duration-300 group-hover:w-24 group-hover:bg-primary" />
              </div>

              {/* Corps du tiroir : glisse visuellement vers le bas / s'ouvre
                  au survol pour révéler la description. */}
              <div className="translate-y-0 bg-card px-5 py-4 transition-transform duration-300 ease-out group-hover:translate-y-0.5">
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
