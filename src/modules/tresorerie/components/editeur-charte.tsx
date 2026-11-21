"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ImageUp, Loader2, Palette, Star, Trash2 } from "lucide-react";
import {
  deposerLogoCharte,
  modifierCharte,
  retirerLogoCharte,
  supprimerCharte,
} from "@/modules/tresorerie/actions/chartes";
import {
  ApercuCharte,
  type ValeursApercu,
} from "@/modules/tresorerie/components/apercu-charte";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Édition d'un modèle de document, avec son aperçu à côté.
 *
 * L'aperçu est un vrai PDF, produit par les vrais gabarits : ce que le
 * Trésorier valide ici est exactement ce que ses pièces auront.
 *
 * Il n'y a pas de bouton « Enregistrer » : toute modification part d'elle-même
 * après une pause de frappe — même convention que la grille du budget
 * prévisionnel.
 *
 * L'aperçu, lui, **n'attend pas l'enregistrement** : il demande son PDF
 * directement avec les valeurs en cours de saisie (voir `apercu-charte.tsx`).
 * Le faire passer par la base et le réaffichage de la page le rendait lent et
 * le faisait clignoter, pour rien — un aperçu n'a rien à écrire.
 *
 * Tous les champs sont **contrôlés**, et l'enregistrement n'emprunte pas
 * `<form action>` : React réinitialise un formulaire quand son action se
 * termine, ce qui, sur une sauvegarde à la frappe, effacerait les caractères
 * tapés pendant l'aller-retour serveur.
 *
 * Ce qui ne se règle pas ici, et ne le doit pas : la **référence** et sa
 * numérotation, qui sont la piste d'audit, et le contenu de la pièce, qui dit
 * ce qu'elle atteste.
 */

export type CharteVue = {
  id: string;
  nom: string;
  nomEmetteur: string;
  slogan: string;
  titre: string;
  mentions: string;
  couleurPrimaire: string;
  couleurTexte: string;
  couleurSecondaire: string;
  couleurSurPrimaire: string;
  hauteurBandeau: number;
  afficherSlogan: boolean;
  bandeauPied: boolean;
  afficherMentionErp: boolean;
  parDefaut: boolean;
  modeles: string[];
  logoNom: string;
};

export type PaquetModeles = {
  categorie: string;
  libelle: string;
  modeles: { code: string; libelle: string; disponible: boolean }[];
};

/** État de saisie : la vue, plus le mode automatique du texte de bandeau. */
type Valeurs = Omit<CharteVue, "id" | "logoNom"> & { surPrimaireAuto: boolean };

/**
 * Pause avant d'enregistrer. Plus longue que celle de l'aperçu : personne ne
 * la voit, et elle évite d'écrire en base à chaque caractère. L'aperçu, lui,
 * suit la frappe de son côté.
 */
const PAUSE_ENREGISTREMENT_MS = 900;

function valeursDe(charte: CharteVue): Valeurs {
  return {
    nom: charte.nom,
    nomEmetteur: charte.nomEmetteur,
    slogan: charte.slogan,
    titre: charte.titre,
    mentions: charte.mentions,
    couleurPrimaire: charte.couleurPrimaire,
    couleurTexte: charte.couleurTexte,
    couleurSecondaire: charte.couleurSecondaire,
    couleurSurPrimaire: charte.couleurSurPrimaire || "#ffffff",
    surPrimaireAuto: charte.couleurSurPrimaire.trim() === "",
    hauteurBandeau: charte.hauteurBandeau,
    afficherSlogan: charte.afficherSlogan,
    bandeauPied: charte.bandeauPied,
    afficherMentionErp: charte.afficherMentionErp,
    parDefaut: charte.parDefaut,
    modeles: charte.modeles,
  };
}

function versFormData(charteId: string, v: Valeurs): FormData {
  const fd = new FormData();
  fd.set("charteId", charteId);
  fd.set("nom", v.nom);
  fd.set("nomEmetteur", v.nomEmetteur);
  fd.set("slogan", v.slogan);
  fd.set("titre", v.titre);
  fd.set("mentions", v.mentions);
  fd.set("couleurPrimaire", v.couleurPrimaire);
  fd.set("couleurTexte", v.couleurTexte);
  fd.set("couleurSecondaire", v.couleurSecondaire);
  // Omise en mode automatique : le rendu déduit alors la couleur de la
  // luminance de l'aplat, plutôt que de figer un blanc illisible sur clair.
  if (!v.surPrimaireAuto) fd.set("couleurSurPrimaire", v.couleurSurPrimaire);
  fd.set("hauteurBandeau", String(v.hauteurBandeau));
  if (v.afficherSlogan) fd.set("afficherSlogan", "on");
  if (v.bandeauPied) fd.set("bandeauPied", "on");
  if (v.afficherMentionErp) fd.set("afficherMentionErp", "on");
  if (v.parDefaut) fd.set("parDefaut", "on");
  for (const code of v.modeles) fd.append("modeles", code);
  return fd;
}

export function EditeurCharte({
  charte,
  paquets,
  peutEcrire,
}: {
  charte: CharteVue;
  paquets: PaquetModeles[];
  peutEcrire: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [apercu, setApercu] = useState("RECU_COTISATION");
  // Change à chaque enregistrement pour forcer le navigateur à refabriquer
  // l'aperçu plutôt que de resservir le PDF précédent.
  const [version, setVersion] = useState(0);
  const [valeurs, setValeurs] = useState<Valeurs>(() => valeursDe(charte));
  const [enCours, demarrer] = useTransition();
  const [enregistre, setEnregistre] = useState(false);

  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  function maj(partiel: Partial<Valeurs>) {
    const suivant = { ...valeurs, ...partiel };
    setValeurs(suivant);
    setEnregistre(false);

    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      // Le nom et la raison sociale nourrissent le bandeau : vidés en cours de
      // frappe, ils feraient échouer la validation serveur à chaque caractère.
      // On attend qu'ils soient de nouveau renseignés.
      if (suivant.nom.trim().length < 2) return;
      if (suivant.nomEmetteur.trim().length < 2) return;
      demarrer(async () => {
        await modifierCharte(versFormData(charte.id, suivant));
        setVersion((n) => n + 1);
        setEnregistre(true);
      });
    }, PAUSE_ENREGISTREMENT_MS);
  }

  useEffect(() => {
    return () => {
      if (minuterie.current) clearTimeout(minuterie.current);
    };
  }, []);

  // Le voyant « enregistré » s'efface tout seul : c'est une confirmation, pas
  // un état durable.
  useEffect(() => {
    if (!enregistre) return;
    const t = setTimeout(() => setEnregistre(false), 2000);
    return () => clearTimeout(t);
  }, [enregistre]);

  // Le lien « ouvrir à part » sert la charte enregistrée : c'est bien ce
  // qu'on veut y voir, l'état retenu, pas un brouillon en cours de frappe.
  const lienApercu = `/api/tresorerie/modeles/${charte.id}/apercu?modele=${apercu}&v=${version}`;

  const valeursApercu: ValeursApercu = {
    modele: apercu,
    nomEmetteur: valeurs.nomEmetteur,
    slogan: valeurs.slogan,
    titre: valeurs.titre,
    mentions: valeurs.mentions
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    couleurPrimaire: valeurs.couleurPrimaire,
    couleurTexte: valeurs.couleurTexte,
    couleurSecondaire: valeurs.couleurSecondaire,
    ...(valeurs.surPrimaireAuto
      ? {}
      : { couleurSurPrimaire: valeurs.couleurSurPrimaire }),
    hauteurBandeau: valeurs.hauteurBandeau,
    afficherSlogan: valeurs.afficherSlogan,
    bandeauPied: valeurs.bandeauPied,
    afficherMentionErp: valeurs.afficherMentionErp,
  };

  function basculerModele(code: string, actif: boolean) {
    maj({
      modeles: actif
        ? [...valeurs.modeles, code]
        : valeurs.modeles.filter((m) => m !== code),
    });
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span
          aria-hidden
          className="h-6 w-6 shrink-0 rounded border border-border"
          style={{ backgroundColor: valeurs.couleurPrimaire }}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {valeurs.nom || charte.nom}
            {valeurs.parDefaut ? (
              <Badge variant="default" className="gap-1">
                <Star size={11} aria-hidden /> Par défaut
              </Badge>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {valeurs.modeles.length
              ? `${valeurs.modeles.length} famille(s) habillée(s)`
              : valeurs.parDefaut
                ? "S'applique à tout ce qu'aucun autre modèle ne revendique"
                : "Aucune famille — ce modèle ne sert à rien tant qu'il n'en habille pas"}
            {charte.logoNom ? ` · logo ${charte.logoNom}` : " · sans logo"}
          </p>
        </div>
        <Button size="sm" onClick={() => setOuvert(!ouvert)}>
          <Palette className="h-4 w-4" /> {ouvert ? "Fermer" : "Personnaliser"}
        </Button>
        {peutEcrire ? (
          <form
            action={supprimerCharte}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  `Supprimer le modèle « ${charte.nom} » ?\n\nIl part à la corbeille et reste restaurable 30 jours. Les documents déjà émis ne changent pas ; les suivants reprendront le modèle par défaut, ou la charte livrée avec l'application.`
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="charteId" value={charte.id} />
            <button
              type="submit"
              title="Supprimer ce modèle"
              aria-label={`Supprimer le modèle ${charte.nom}`}
              className="rounded p-1.5 text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </form>
        ) : null}
      </div>

      {ouvert ? (
        <div className="grid gap-4 border-t border-border p-3 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <Section titre="Identité">
              <Champ label="Nom du modèle">
                <Input
                  value={valeurs.nom}
                  onChange={(e) => maj({ nom: e.target.value })}
                  className="h-9"
                  aria-label="Nom du modèle"
                />
              </Champ>
              <Champ label="Raison sociale (bandeau)">
                <Input
                  value={valeurs.nomEmetteur}
                  onChange={(e) => maj({ nomEmetteur: e.target.value })}
                  className="h-9"
                  aria-label="Raison sociale"
                />
              </Champ>
              <Champ label="Slogan">
                <Input
                  value={valeurs.slogan}
                  onChange={(e) => maj({ slogan: e.target.value })}
                  className="h-9"
                  aria-label="Slogan"
                />
              </Champ>
              <Champ label="Intitulé imposé (vide = celui du document)">
                <Input
                  value={valeurs.titre}
                  onChange={(e) => maj({ titre: e.target.value })}
                  placeholder="ex. Reçu officiel"
                  className="h-9"
                  aria-label="Intitulé imposé"
                />
              </Champ>
              <Champ label="Mentions de pied (une par ligne)">
                <textarea
                  value={valeurs.mentions}
                  onChange={(e) => maj({ mentions: e.target.value })}
                  rows={3}
                  placeholder={"Adresse\nMatricule fiscal\nContact"}
                  aria-label="Mentions de pied"
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </Champ>
            </Section>

            <Section titre="Couleurs">
              <div className="grid gap-3 sm:grid-cols-2">
                <Couleur
                  label="Principale (bandeau, titres)"
                  valeur={valeurs.couleurPrimaire}
                  onChange={(couleurPrimaire) => maj({ couleurPrimaire })}
                />
                <CouleurBandeau
                  valeur={valeurs.couleurSurPrimaire}
                  auto={valeurs.surPrimaireAuto}
                  onChange={(couleurSurPrimaire) => maj({ couleurSurPrimaire })}
                  onAuto={(surPrimaireAuto) => maj({ surPrimaireAuto })}
                />
                <Couleur
                  label="Texte du corps"
                  valeur={valeurs.couleurTexte}
                  onChange={(couleurTexte) => maj({ couleurTexte })}
                />
                <Couleur
                  label="Texte secondaire"
                  valeur={valeurs.couleurSecondaire}
                  onChange={(couleurSecondaire) => maj({ couleurSecondaire })}
                />
              </div>
            </Section>

            <Section titre="Bandeaux">
              <Champ
                label={`Hauteur du bandeau haut (${valeurs.hauteurBandeau} pt)`}
              >
                <input
                  type="range"
                  min={28}
                  max={90}
                  step={2}
                  value={valeurs.hauteurBandeau}
                  onChange={(e) =>
                    maj({ hauteurBandeau: Number(e.target.value) })
                  }
                  aria-label="Hauteur du bandeau haut"
                  className="w-full accent-primary"
                />
              </Champ>
              <Case
                label="Afficher le slogan sous la raison sociale"
                actif={valeurs.afficherSlogan}
                onChange={(afficherSlogan) => maj({ afficherSlogan })}
              />
              <Case
                label="Barre colorée en bas de page"
                actif={valeurs.bandeauPied}
                onChange={(bandeauPied) => maj({ bandeauPied })}
              />
              <Case
                label="Mention « Document produit par l'application Trésorerie »"
                actif={valeurs.afficherMentionErp}
                onChange={(afficherMentionErp) => maj({ afficherMentionErp })}
              />
            </Section>

            <Section titre="Documents habillés">
              <p className="text-xs text-muted-foreground">
                Ce modèle s&apos;applique aux familles cochées. Les pièces déjà
                émises ne changent pas : leur PDF est figé depuis leur émission.
              </p>
              {paquets.map((paquet) => (
                <fieldset key={paquet.categorie} className="mt-2">
                  <legend className="text-xs font-medium uppercase text-muted-foreground">
                    {paquet.libelle}
                  </legend>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    {paquet.modeles.map((m) => (
                      <label
                        key={m.code}
                        className="flex items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={valeurs.modeles.includes(m.code)}
                          onChange={(e) =>
                            basculerModele(m.code, e.target.checked)
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          {m.libelle}
                          {!m.disponible ? (
                            <span
                              className="ml-1 text-xs text-muted-foreground"
                              title="Le gabarit reste à écrire ; le modèle s'appliquera dès qu'il existera."
                            >
                              (à venir)
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="mt-3">
                <Case
                  label="Modèle par défaut (habille tout le reste)"
                  actif={valeurs.parDefaut}
                  onChange={(parDefaut) => maj({ parDefaut })}
                />
              </div>
            </Section>

            <p
              aria-live="polite"
              className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground"
            >
              {enCours ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Enregistrement…
                </>
              ) : enregistre ? (
                <>
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  Enregistré.
                </>
              ) : (
                "Vos modifications s'enregistrent seules."
              )}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={apercu}
                onChange={(e) => setApercu(e.target.value)}
                aria-label="Document à prévisualiser"
                className="h-9 flex-1 rounded-md border border-border bg-card px-2 text-sm"
              >
                {paquets.flatMap((p) =>
                  p.modeles.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.libelle}
                    </option>
                  ))
                )}
              </select>
              <a
                href={lienApercu}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Ouvrir à part
              </a>
            </div>
            <ApercuCharte
              charteId={charte.id}
              valeurs={valeursApercu}
              titreModele={charte.nom}
              version={version}
            />
            <p className="text-xs text-muted-foreground">
              Document d&apos;exemple, fabriqué par les vrais gabarits. La
              référence y est factice et le filigrane « Aperçu » l&apos;empêche
              de passer pour une pièce émise.
            </p>

            <form
              action={async (donnees) => {
                await deposerLogoCharte(donnees);
                setVersion((v) => v + 1);
              }}
              className="flex flex-wrap items-center gap-2 border-t border-border pt-2"
            >
              <input type="hidden" name="charteId" value={charte.id} />
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg"
                required
                className="flex-1 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                aria-label="Logo du bandeau"
              />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
              >
                <ImageUp className="h-4 w-4" /> Déposer
              </Button>
            </form>
            {charte.logoNom ? (
              <form
                action={async (donnees) => {
                  await retirerLogoCharte(donnees);
                  setVersion((v) => v + 1);
                }}
              >
                <input type="hidden" name="charteId" value={charte.id} />
                <button
                  type="submit"
                  className="text-xs text-danger hover:underline"
                >
                  Retirer le logo « {charte.logoNom} »
                </button>
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                PNG ou JPEG, 1 Mo au maximum. Il se pose à gauche du bandeau et
                le nom se décale.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold uppercase text-muted-foreground">
        {titre}
      </legend>
      {children}
    </fieldset>
  );
}

function Champ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Couleur({
  label,
  valeur,
  onChange,
}: {
  label: string;
  valeur: string;
  onChange: (valeur: string) => void;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border border-border bg-card"
          aria-label={label}
        />
        <span className="font-mono text-xs">{valeur}</span>
      </span>
    </label>
  );
}

/**
 * Couleur du texte du bandeau, avec son mode automatique.
 *
 * Un sélecteur de couleur renvoie toujours une valeur : sans ce mode, le
 * premier enregistrement figerait une couleur et l'ajustement au fond ne se
 * ferait plus jamais — un bandeau clair garderait du texte blanc illisible.
 */
function CouleurBandeau({
  valeur,
  auto,
  onChange,
  onAuto,
}: {
  valeur: string;
  auto: boolean;
  onChange: (valeur: string) => void;
  onAuto: (auto: boolean) => void;
}) {
  return (
    <div className="block text-xs text-muted-foreground">
      Texte du bandeau
      <span className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={valeur}
          disabled={auto}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border border-border bg-card disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Couleur du texte du bandeau"
        />
        <span className="font-mono text-xs">{auto ? "auto" : valeur}</span>
      </span>
      <label className="mt-1 flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => onAuto(e.target.checked)}
          className="accent-primary"
        />
        S&apos;ajuster au fond (clair sur foncé, sombre sur clair)
      </label>
    </div>
  );
}

function Case({
  label,
  actif,
  onChange,
}: {
  label: string;
  actif: boolean;
  onChange: (actif: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={actif}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
      {label}
    </label>
  );
}
