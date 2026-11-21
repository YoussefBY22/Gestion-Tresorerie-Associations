import Link from "next/link";

export function NavDocuments({ actif }: { actif: string }) {
  const onglets = [
    { href: "/documents", label: "Bibliothèque" },
    { href: "/documents/catalogue", label: "Catalogue des modèles" },
  ];
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-border">
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
