import { exigerModuleActif } from "@/lib/autorisation";

/**
 * Garde d'activation du module « Trésorerie » (ADR-007).
 * Si le module est désactivé depuis /admin/parametrage, toutes ses routes
 * répondent 404 — y compris en accès direct par URL.
 */
export default async function LayoutTresorerie({
  children,
}: {
  children: React.ReactNode;
}) {
  await exigerModuleActif("tresorerie");
  return <>{children}</>;
}
