import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { can, type ActionCode, type ModuleCode } from "@/modules/core/rbac";
import { estModuleActif } from "@/modules/core/services/parametrage";

/**
 * Garde d'autorisation pour Server Actions et route handlers (story 01.3).
 * Toute mutation DOIT passer par ici : session vérifiée + permission RBAC.
 */
export async function exigerPermission(
  module: ModuleCode,
  action: ActionCode
): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, module, action)) {
    throw new Error(
      `Accès refusé : permission « ${module}:${action} » requise.`
    );
  }
  return session;
}

/** Variante non bloquante pour l'affichage conditionnel côté serveur. */
export async function aPermission(
  module: ModuleCode,
  action: ActionCode
): Promise<boolean> {
  const session = await auth();
  return can(session?.user?.roles, module, action);
}

/**
 * Garde d'activation (ADR-007). Un module désactivé depuis
 * `/admin/parametrage` n'est pas seulement masqué dans la navigation : il
 * devient inatteignable, même par URL directe. À appeler en tête de page
 * (ou de layout) de chaque module désactivable.
 */
export async function exigerModuleActif(module: ModuleCode): Promise<void> {
  if (!(await estModuleActif(module))) notFound();
}

/**
 * Garde combinée : session + permission RBAC + module actif.
 * C'est l'entrée recommandée pour les Server Actions des modules métier.
 */
export async function exigerModuleEtPermission(
  module: ModuleCode,
  action: ActionCode
): Promise<Session> {
  const session = await exigerPermission(module, action);
  if (!(await estModuleActif(module))) {
    throw new Error(
      `Module « ${module} » désactivé dans le paramétrage de l'application.`
    );
  }
  return session;
}
