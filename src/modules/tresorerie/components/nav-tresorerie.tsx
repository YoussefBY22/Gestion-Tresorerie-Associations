import Link from "next/link";

/**
 * Onglets de la trésorerie — la tenue quotidienne des comptes.
 *
 * Le budget, les statistiques et les registres n'y figurent pas : ce sont des
 * espaces de travail à part entière, qu'on ouvre depuis le tableau de bord et
 * dans lesquels on reste. Les mêler aux onglets du quotidien allongeait la
 * barre au point qu'on ne voyait plus ce qui sert tous les jours.
 */
export function NavTresorerie({ actif }: { actif: string }) {
  const onglets = [
    { href: "/tresorerie", label: "Dashboard financier" },
    { href: "/tresorerie/flux", label: "Journal des flux" },
    { href: "/tresorerie/caisse", label: "Caisse & banque" },
    { href: "/tresorerie/factures", label: "Factures" },
    { href: "/tresorerie/bons-commande", label: "Bons de commande" },
    { href: "/tresorerie/recus", label: "Reçus" },
    { href: "/tresorerie/declaration", label: "Déclaration mensuelle" },
    { href: "/tresorerie/fiscalite", label: "Échéancier fiscal" },
    { href: "/tresorerie/inventaire", label: "Inventaire physique" },
    { href: "/tresorerie/documentation", label: "Documentation" },
  ];

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1 border-b border-border">
      {onglets.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            o.href === actif
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
