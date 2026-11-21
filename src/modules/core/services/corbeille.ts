/**
 * Corbeille — logique pure.
 *
 * Un élément supprimé n'est jamais perdu tout de suite : il reste
 * consultable, filtrable et restaurable pendant 30 jours, puis purgé
 * définitivement. Le mécanisme est générique (n'importe quel module,
 * n'importe quel type d'élément) ; chaque module ne voit que sa propre
 * corbeille, au même titre que le reste du RBAC.
 */

export const DUREE_RETENTION_JOURS = 30;

/** Date de purge définitive, calculée une fois à la suppression. */
export function calculerDatePurge(
  supprimeLe: Date,
  dureeJours: number = DUREE_RETENTION_JOURS
): Date {
  return new Date(supprimeLe.getTime() + dureeJours * 86_400_000);
}

export function estExpire(purgeLe: Date, maintenant: Date = new Date()): boolean {
  return purgeLe.getTime() <= maintenant.getTime();
}

/** Jours restants avant purge définitive — jamais négatif. */
export function joursAvantPurge(purgeLe: Date, maintenant: Date = new Date()): number {
  return Math.max(0, Math.ceil((purgeLe.getTime() - maintenant.getTime()) / 86_400_000));
}
