"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Aperçu PDF qui suit la frappe, sans clignoter.
 *
 * Deux difficultés, deux réponses.
 *
 * **Le clignotement.** Changer la source d'une iframe la vide avant de la
 * remplir : on voit un rectangle blanc à chaque frappe, ce qui est pire que
 * pas d'aperçu du tout. D'où deux iframes superposées : la nouvelle version se
 * charge dans celle qu'on ne voit pas, et l'échange ne se fait qu'une fois
 * qu'elle est prête. À l'écran, le document se remplace d'un coup, déjà rendu.
 *
 * **La lenteur.** L'aperçu passait par l'enregistrement en base et le
 * réaffichage de la page. Il demande maintenant son PDF directement, en
 * envoyant les valeurs en cours de saisie : plus d'écriture, plus de
 * re-rendu, juste le temps de fabriquer le document. L'enregistrement, lui,
 * part de son côté et à son rythme.
 */

export type ValeursApercu = {
  modele: string;
  nomEmetteur: string;
  slogan: string;
  titre: string;
  mentions: string[];
  couleurPrimaire: string;
  couleurTexte: string;
  couleurSecondaire: string;
  /** Absente quand la couleur doit se déduire du fond. */
  couleurSurPrimaire?: string;
  hauteurBandeau: number;
  afficherSlogan: boolean;
  bandeauPied: boolean;
  afficherMentionErp: boolean;
};

/**
 * Pause après la dernière frappe. Courte : le document doit sembler suivre la
 * main. Non nulle quand même — sans elle, un glissement du curseur de hauteur
 * lancerait une trentaine de rendus pour un seul geste.
 */
const PAUSE_MS = 180;

export function ApercuCharte({
  charteId,
  valeurs,
  titreModele,
  version = 0,
}: {
  charteId: string;
  valeurs: ValeursApercu;
  titreModele: string;
  /**
   * Change quand le logo est déposé ou retiré.
   *
   * Le logo ne figure pas dans `valeurs` — il vit en base, pas dans le
   * formulaire — si bien que le déposer ne modifiait pas la demande et
   * laissait l'aperçu sur sa version précédente, sans logo. L'appelant
   * incrémente ce marqueur, et le rendu se refait.
   */
  version?: number;
}) {
  // Deux tampons : celui qu'on voit, et celui qui charge la version suivante.
  const [sources, setSources] = useState<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });
  const [visible, setVisible] = useState<"a" | "b">("a");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const enCharge = useRef<"a" | "b" | null>(null);
  /*
   * Le tampon visible est lu par l'effet mais ne doit pas le déclencher : en
   * dépendance, l'échange relancerait un rendu, qui provoquerait un échange,
   * indéfiniment. Il vit donc dans une référence.
   */
  const visibleRef = useRef<"a" | "b">("a");
  // Les URL d'objet retiennent le PDF en mémoire tant qu'on ne les libère pas.
  const aLiberer = useRef<string[]>([]);

  // Les valeurs sérialisées font la dépendance : deux frappes qui aboutissent
  // au même document ne refabriquent rien.
  const demande = JSON.stringify(valeurs);

  useEffect(() => {
    const abandon = new AbortController();
    const minuterie = setTimeout(async () => {
      setEnCours(true);
      try {
        const reponse = await fetch(
          `/api/tresorerie/modeles/${charteId}/apercu`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: demande,
            signal: abandon.signal,
          }
        );
        if (!reponse.ok) throw new Error(`Aperçu indisponible (${reponse.status})`);

        const url = URL.createObjectURL(await reponse.blob());
        // La nouvelle version se charge dans le tampon caché ; l'échange se
        // fera à son `onLoad`, quand il y aura vraiment quelque chose à voir.
        const cible = visibleRef.current === "a" ? "b" : "a";
        enCharge.current = cible;
        setSources((s) => {
          if (s[cible]) aLiberer.current.push(s[cible] as string);
          return { ...s, [cible]: url };
        });
        setErreur(null);
      } catch (err) {
        if (abandon.signal.aborted) return;
        setErreur(err instanceof Error ? err.message : "Aperçu indisponible.");
        setEnCours(false);
      }
    }, PAUSE_MS);

    return () => {
      clearTimeout(minuterie);
      abandon.abort();
    };
  }, [charteId, demande, version]);

  // Libération à la sortie : sans cela, chaque frappe laisserait un PDF en
  // mémoire pour toute la durée de la page.
  useEffect(() => {
    const sortie = () => {
      for (const url of aLiberer.current) URL.revokeObjectURL(url);
      aLiberer.current = [];
    };
    return sortie;
  }, []);

  function auChargement(tampon: "a" | "b") {
    if (enCharge.current !== tampon) return;
    enCharge.current = null;
    visibleRef.current = tampon;
    setVisible(tampon);
    setEnCours(false);
    // Le tampon qui vient de sortir de l'écran n'est plus regardé : on peut
    // rendre sa mémoire au navigateur.
    const anciennes = aLiberer.current;
    aLiberer.current = [];
    for (const url of anciennes) URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-1">
      <div className="relative h-[560px] w-full overflow-hidden rounded-md border border-border bg-muted">
        {(["a", "b"] as const).map((tampon) =>
          sources[tampon] ? (
            <iframe
              key={tampon}
              src={sources[tampon] as string}
              title={`Aperçu du modèle ${titreModele}`}
              onLoad={() => auChargement(tampon)}
              className={`absolute inset-0 h-full w-full transition-opacity duration-150 ${
                visible === tampon
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            />
          ) : null
        )}
        {/* Le tampon visible peut être vide alors que l'autre charge déjà :
            c'est le cas du tout premier rendu, et l'attente doit se voir. */}
        {!sources[visible] ? (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Fabrication de l&apos;aperçu…
          </p>
        ) : null}
        {erreur ? (
          <p
            role="alert"
            className="absolute inset-x-0 bottom-0 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {erreur}
          </p>
        ) : null}
      </div>
      <p aria-live="polite" className="h-4 text-xs text-muted-foreground">
        {enCours ? "Mise à jour de l'aperçu…" : ""}
      </p>
    </div>
  );
}
