import { can } from "@/modules/core/rbac";
import { listerModulesAvecEtat } from "@/modules/core/services/parametrage";
import type { EntreeNav } from "@/components/layout/sidebar";

/**
 * Construit la navigation effective d'un utilisateur (ADR-007).
 *
 * Trois filtres se cumulent :
 *   1. le module existe au registre,
 *   2. il est **actif** dans le paramétrage,
 *   3. l'utilisateur a le droit de le **lire** (RBAC).
 *
 * Une entrée n'est jamais affichée « pour information » : un lien qui mène à
 * une page absente ou refusée fait douter l'utilisateur de son propre compte,
 * là où ne rien montrer ne pose aucune question.
 */
export async function construireNavigation(
  roles: string[] = []
): Promise<EntreeNav[]> {
  const modules = await listerModulesAvecEtat();

  const entrees: EntreeNav[] = [
    {
      code: "accueil",
      libelle: "Tableau de bord",
      href: "/",
      icone: "LayoutDashboard",
      section: "general",
    },
  ];

  for (const m of modules) {
    if (!m.actif) continue;
    if (!can(roles, m.code, "lire")) continue;
    entrees.push({
      code: m.code,
      libelle: m.libelle,
      href: m.href,
      icone: m.icone,
      section: m.section,
      sprint: m.sprint,
    });
  }

  return entrees;
}
