import type { Session } from "next-auth";
import { connectDb } from "@/lib/db";
import { JournalActiviteModel } from "@/modules/core/models";

/**
 * Écrit une entrée dans le journal d'activité (story 01.7).
 * Ne fait jamais échouer l'action métier : une erreur de journalisation est
 * loggée mais n'interrompt pas l'utilisateur.
 */
export async function journaliser(
  session: Session | null,
  entree: {
    action: string;
    entite: string;
    entiteId?: string;
    details?: string;
  }
): Promise<void> {
  try {
    await connectDb();
    await JournalActiviteModel.create({
      utilisateurId: session?.user?.id || undefined,
      email: session?.user?.email ?? "système",
      ...entree,
    });
  } catch (err) {
    console.error("[journal] Échec de journalisation :", err, entree);
  }
}
