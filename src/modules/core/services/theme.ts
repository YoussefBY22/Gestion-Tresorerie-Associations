import { cookies } from "next/headers";
import { getParametre, getParametreBooleen } from "@/modules/core/services/parametrage";

export const THEMES = ["clair", "sombre", "systeme"] as const;
export type Theme = (typeof THEMES)[number];

export const COOKIE_THEME = "erp-theme";

export function estTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

/**
 * Thème effectif d'une requête.
 *
 * Priorité : verrouillage administrateur > choix personnel (cookie) >
 * défaut paramétré > système. Résolu côté serveur pour poser l'attribut
 * `data-theme` dès le HTML — donc aucun flash de thème au chargement.
 */
export async function resoudreTheme(): Promise<{
  theme: Theme;
  verrouille: boolean;
}> {
  const verrouille = await getParametreBooleen("apparence.themeVerrouille");
  const defautBrut = await getParametre<string>("apparence.themeDefaut");
  const defaut: Theme = estTheme(defautBrut) ? defautBrut : "systeme";

  if (verrouille) return { theme: defaut, verrouille: true };

  const choix = (await cookies()).get(COOKIE_THEME)?.value;
  return { theme: estTheme(choix) ? choix : defaut, verrouille: false };
}
