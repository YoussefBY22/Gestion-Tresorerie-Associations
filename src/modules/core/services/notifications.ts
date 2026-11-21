import { connectDb } from "@/lib/db";
import { NotificationModel, UtilisateurModel } from "@/modules/core/models";
import { envoyerEmail, gabaritEmail } from "@/modules/core/services/email";
import { identiteVisuelle } from "@/modules/core/services/identite-visuelle";

type Destinataires = {
  utilisateurIds?: string[];
  roles?: string[]; // tous les utilisateurs actifs ayant l'un de ces rôles
};

type ContenuNotification = {
  titre: string;
  message?: string;
  lien?: string;
  type?: "info" | "echeance" | "validation" | "alerte";
  critique?: boolean; // → e-mail en plus de l'in-app
  cle?: string; // idempotence (suffixée par destinataire)
};

/**
 * Émet une notification in-app (+ e-mail si critique) — stories 03.1/03.2.
 * Idempotent quand `cle` est fournie : la clé unique (cle:destinataire)
 * empêche tout doublon (rappels cron rejoués sans risque).
 */
export async function notifier(
  destinataires: Destinataires,
  contenu: ContenuNotification
): Promise<number> {
  await connectDb();

  const ids = new Set<string>(destinataires.utilisateurIds ?? []);
  if (destinataires.roles?.length) {
    const parRole = await UtilisateurModel.find({
      actif: true,
      roles: { $in: destinataires.roles as string[] },
    }).select("_id");
    for (const u of parRole) ids.add(u._id.toString());
  }

  let crees = 0;
  for (const id of ids) {
    try {
      await NotificationModel.create({
        destinataire: id,
        titre: contenu.titre,
        message: contenu.message,
        lien: contenu.lien,
        type: contenu.type ?? "info",
        critique: contenu.critique ?? false,
        cle: contenu.cle ? `${contenu.cle}:${id}` : undefined,
      });
      crees++;

      if (contenu.critique) {
        const utilisateur = await UtilisateurModel.findById(id).select("email");
        if (utilisateur?.email) {
          const { structure, couleur } = await identiteVisuelle();
          await envoyerEmail({
            a: utilisateur.email,
            sujet: `[${structure}] ${contenu.titre}`,
            html: gabaritEmail(
              contenu.titre,
              contenu.message ?? "",
              contenu.lien
                ? `${process.env.AUTH_URL ?? "http://localhost:3000"}${contenu.lien}`
                : undefined,
              structure,
              couleur
            ),
          });
        }
      }
    } catch (err: unknown) {
      // 11000 = clé d'idempotence déjà vue → rappel déjà émis, on ignore.
      if ((err as { code?: number })?.code !== 11000) {
        console.error("[notifications] Échec d'émission :", err);
      }
    }
  }
  return crees;
}
