"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_THEME, estTheme } from "@/modules/core/services/theme";
import { getParametreBooleen } from "@/modules/core/services/parametrage";

/**
 * Enregistre la préférence de thème dans un cookie (préférence personnelle,
 * pas une donnée métier : pas de journalisation ni d'écriture en base).
 * Respecte le verrouillage administrateur.
 */
export async function definirTheme(valeur: string) {
  if (!estTheme(valeur)) throw new Error(`Thème inconnu : ${valeur}.`);

  if (await getParametreBooleen("apparence.themeVerrouille")) {
    throw new Error(
      "Le thème est verrouillé par l'administration de l'application."
    );
  }

  (await cookies()).set(COOKIE_THEME, valeur, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
