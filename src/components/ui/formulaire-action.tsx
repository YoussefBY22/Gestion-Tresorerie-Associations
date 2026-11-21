"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * Formulaire dont l'action répond par un message.
 *
 * Les actions d'écriture de l'application ne lèvent pas d'exception quand
 * elles refusent : elles renvoient `{ ok, message }`. Un refus est une
 * information pour la personne qui saisit (« cet exercice existe déjà »,
 * « vous ne pouvez pas retirer votre propre rôle »), pas une panne — il doit
 * donc s'**afficher** à côté du champ, et non finir dans une page d'erreur
 * ni, pire, disparaître en silence.
 *
 * Le message reste visible jusqu'à la soumission suivante : on peut relire ce
 * qui vient de se passer, ce qu'un bandeau éphémère ne permet pas.
 */

export type ResultatAction = { ok: boolean; message: string };

export function FormulaireAction({
  action,
  className,
  confirmation,
  children,
}: {
  action: (formData: FormData) => Promise<ResultatAction>;
  className?: string;
  /** Question posée avant d'agir, pour les gestes qu'on ne veut pas faire d'un clic distrait. */
  confirmation?: string;
  children: React.ReactNode;
}) {
  const [resultat, executer, enCours] = useActionState(
    async (_precedent: ResultatAction | null, formData: FormData) =>
      action(formData),
    null
  );

  return (
    <form
      action={executer}
      className={className}
      onSubmit={(e) => {
        if (confirmation && !window.confirm(confirmation)) e.preventDefault();
      }}
    >
      <fieldset disabled={enCours} className="contents">
        {children}
      </fieldset>
      {resultat ? (
        <p
          role="status"
          className={`mt-2 flex items-start gap-2 text-xs ${
            resultat.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {resultat.ok ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          <span>{resultat.message}</span>
        </p>
      ) : null}
    </form>
  );
}
