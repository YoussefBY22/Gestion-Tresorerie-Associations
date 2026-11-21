"use client";

import Link from "next/link";
import { Marque } from "@/components/ui/marque";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  Handshake,
  FolderKanban,
  Wallet,
  ShieldCheck,
  ClipboardCheck,
  Users,
  FileText,
  Target,
  ArrowLeftRight,
  Megaphone,
  PartyPopper,
  Globe,
  Palette,
  Settings,
  ScrollText,
  UserCheck,
  GraduationCap,
  ClipboardList,
  UserRound,
  Contact,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LIBELLES_SECTION, type SectionNav } from "@/modules/core/modules-registry";

/** Résolution nom → composant : le registre ne transporte que des chaînes. */
const ICONES: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutDashboard,
  FolderOpen,
  CalendarDays,
  Handshake,
  FolderKanban,
  Wallet,
  ShieldCheck,
  ClipboardCheck,
  Users,
  FileText,
  Target,
  ArrowLeftRight,
  Megaphone,
  PartyPopper,
  Globe,
  Palette,
  Settings,
  ScrollText,
  UserCheck,
  GraduationCap,
  ClipboardList,
  UserRound,
  Contact,
};

/** Entrée de navigation sérialisable (traversée serveur → client). */
export type EntreeNav = {
  code: string;
  libelle: string;
  href?: string;
  icone: string;
  section: SectionNav;
  sprint?: string;
};

function Icone({ nom, size = 18 }: { nom: string; size?: number }) {
  const C = ICONES[nom] ?? CircleDot;
  return <C size={size} />;
}

const ORDRE_SECTIONS: SectionNav[] = [
  "general",
  "administration",
  "metier",
  "developpement",
];

export function Sidebar({
  entrees,
  nomStructure = "Trésorerie",
  slogan = "IT IS OUR PROFESSION",
}: {
  entrees: EntreeNav[];
  nomStructure?: string;
  slogan?: string;
}) {
  const pathname = usePathname();

  const sections = ORDRE_SECTIONS.map((section) => ({
    section,
    titre: LIBELLES_SECTION[section],
    items: entrees.filter((e) => e.section === section),
  })).filter((s) => s.items.length > 0);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-5">
        <Marque taille={36} couleur="currentColor" titre="" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold text-white" title={nomStructure}>
            {nomStructure}
          </p>
          <p className="truncate text-xs text-sidebar-muted">{slogan}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {sections.map(({ titre, items }) => (
          <div key={titre}>
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
              {titre}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                if (!item.href) {
                  return (
                    <li key={item.code}>
                      <span
                        title={`Disponible en ${item.sprint ?? "version ultérieure"}`}
                        className="flex cursor-not-allowed items-center gap-3 rounded-md px-2 py-2 text-sm opacity-45"
                      >
                        <Icone nom={item.icone} />
                        <span className="flex-1">{item.libelle}</span>
                        {item.sprint ? (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">
                            {item.sprint}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                }
                const actif =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(`${item.href}/`)) ||
                  (item.href.startsWith("/admin") && pathname.startsWith("/admin"));
                return (
                  <li key={item.code}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
                        actif
                          ? "bg-sidebar-active text-white"
                          : "hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icone nom={item.icone} />
                      <span>{item.libelle}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
