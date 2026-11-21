import { Mail, MessageCircle } from "lucide-react";
import { lienEmail, lienWhatsApp, appliquerModele } from "@/lib/liens-contact";

/**
 * Raccourcis de prise de contact (WhatsApp / e-mail) — reco EX-AC-07 &
 * EX-AC-21 : rendre la relance commerciale immédiate depuis la fiche.
 *
 * Composant serveur : il ne fait que produire des `<a>`. Les liens
 * s'ouvrent dans l'application du membre ; aucune donnée ne quitte l'application par
 * un appel réseau. Chaque bouton disparaît si la donnée requise manque
 * (pas de téléphone → pas de bouton WhatsApp).
 */
export function BoutonsContact({
  telephone,
  email,
  contact,
  organisation,
  structure,
  expediteur,
  modeleMessage,
  whatsappActif = true,
  emailActif = true,
  objetEmail = "Prise de contact",
  taille = "sm",
}: {
  telephone?: string | null;
  email?: string | null;
  contact?: string;
  organisation?: string;
  structure?: string;
  expediteur?: string;
  modeleMessage: string;
  whatsappActif?: boolean;
  emailActif?: boolean;
  objetEmail?: string;
  taille?: "sm" | "xs";
}) {
  const message = appliquerModele(modeleMessage, {
    contact,
    organisation,
    structure,
    expediteur,
  });

  const wa = whatsappActif ? lienWhatsApp(telephone, message) : null;
  const mail = emailActif ? lienEmail(email, objetEmail, message) : null;

  if (!wa && !mail) return null;

  const classes =
    taille === "xs"
      ? "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px]"
      : "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs";

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={`${classes} text-success transition-colors hover:bg-muted`}
          title={`Contacter ${contact ?? "ce contact"} sur WhatsApp (message pré-rempli)`}
        >
          <MessageCircle size={13} />
          WhatsApp
        </a>
      ) : null}
      {mail ? (
        <a
          href={mail}
          className={`${classes} text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
          title={`Écrire à ${contact ?? "ce contact"} (objet et corps pré-remplis)`}
        >
          <Mail size={13} />
          E-mail
        </a>
      ) : null}
    </div>
  );
}
