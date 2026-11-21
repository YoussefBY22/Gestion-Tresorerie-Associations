import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  degrees,
  rgb,
  type RGB,
} from "pdf-lib";
import type { BlocDocument, StructureDocument } from "./structure";
import {
  CHARTE_DEFAUT,
  completerCharte,
  hexVersRvb,
  type ChartePdf,
} from "./charte";
import { embarquerPolices, type Polices } from "./polices";

/**
 * Moteur de rendu PDF — le seul endroit de l'application qui applique une charte
 * graphique. Les ~110 gabarits ne décrivent que du contenu
 * (`StructureDocument`) ; l'identité visuelle arrive d'à côté, en paramètre.
 *
 * Elle était en dur jusqu'ici. Elle est maintenant une donnée que le
 * Trésorier compose dans l'application (`services/charte.ts`), avec la charte livrée
 * pour repli : sans rien enregistrer, les documents sortent comme avant.
 *
 * Choix : pdf-lib plutôt qu'un moteur React→PDF. Nos documents sont
 * répétitifs et normés (en-tête, champs, tableau, totaux, signatures) ; un
 * petit moteur déclaratif donne une cohérence stricte entre tous les modèles
 * et reste testable sans navigateur ni bundler.
 *
 * Note charset : les documents sortent en **Montserrat embarquée** (voir
 * `services/polices.ts`), qui couvre le latin étendu. L'arabe des modèles du
 * drive (contrat, proposition commerciale) demandera une police de plus —
 * Montserrat n'en a pas les glyphes.
 */

/* ------------------------------------------------------------------ */
/* Charte                                                              */
/* ------------------------------------------------------------------ */

const A4 = { largeur: 595.28, hauteur: 841.89 };
/** Paysage : mêmes dimensions, inversées — pour les tableaux à beaucoup de colonnes. */
const A4_PAYSAGE = { largeur: A4.hauteur, hauteur: A4.largeur };
const MARGE = { gauche: 48, droite: 48, haut: 44, bas: 56 };
const LARGEUR_UTILE = A4.largeur - MARGE.gauche - MARGE.droite;
const LARGEUR_UTILE_PAYSAGE = A4_PAYSAGE.largeur - MARGE.gauche - MARGE.droite;

function dimensionsPage(orientation?: "portrait" | "paysage") {
  return orientation === "paysage"
    ? { largeur: A4_PAYSAGE.largeur, hauteur: A4_PAYSAGE.hauteur, largeurUtile: LARGEUR_UTILE_PAYSAGE }
    : { largeur: A4.largeur, hauteur: A4.hauteur, largeurUtile: LARGEUR_UTILE };
}

/** Gris de structure : traits, zébrures. Ils ne dépendent pas de la charte
 *  — les faire varier rendrait certains tableaux illisibles. */
const GRIS_CLAIR: RGB = rgb(0.87, 0.87, 0.87);
const ZEBRE: RGB = rgb(0.968, 0.968, 0.968);

type Couleurs = {
  primaire: RGB;
  texte: RGB;
  secondaire: RGB;
  surPrimaire: RGB;
  /** Variante atténuée du texte de bandeau, pour le slogan et la date. */
  surPrimaireAttenue: RGB;
};

function couleursDe(charte: ChartePdf): Couleurs {
  const rvb = (hex: string) => {
    const { r, g, b } = hexVersRvb(hex);
    return rgb(r, g, b);
  };
  const sur = hexVersRvb(charte.couleurSurPrimaire);
  return {
    primaire: rvb(charte.couleurPrimaire),
    texte: rvb(charte.couleurTexte),
    secondaire: rvb(charte.couleurSecondaire),
    surPrimaire: rgb(sur.r, sur.g, sur.b),
    // 25 % de l'aplat mélangé au texte : lisible sans capter l'œil.
    surPrimaireAttenue: (() => {
      const fond = hexVersRvb(charte.couleurPrimaire);
      const melange = (a: number, b: number) => a * 0.75 + b * 0.25;
      return rgb(
        melange(sur.r, fond.r),
        melange(sur.g, fond.g),
        melange(sur.b, fond.b)
      );
    })(),
  };
}

const CORPS = 9.5;
const INTERLIGNE = 13;



/* ------------------------------------------------------------------ */
/* Contexte de rendu                                                   */
/* ------------------------------------------------------------------ */

type Contexte = {
  pdf: PDFDocument;
  polices: Polices;
  structure: StructureDocument;
  charte: ChartePdf;
  couleurs: Couleurs;
  /** Logo déjà embarqué dans le PDF, prêt à être dessiné. */
  logo: { image: PDFImage; largeur: number; hauteur: number } | null;
  page: PDFPage;
  pages: PDFPage[];
  /** Ordonnée courante du curseur, en points depuis le bas de page. */
  y: number;
  /** Dimensions de page effectives (portrait par défaut, paysage sur demande). */
  largeurPage: number;
  hauteurPage: number;
  largeurUtile: number;
};

/** Rend une structure de document en PDF. */
export async function rendrePdf(
  structure: StructureDocument,
  charteDemandee: Partial<ChartePdf> = CHARTE_DEFAUT
): Promise<Uint8Array> {
  const charte = completerCharte(charteDemandee);
  const pdf = await PDFDocument.create();
  const titre = charte.titre?.trim() || structure.titre;
  pdf.setTitle(`${titre} — ${structure.reference}`);
  pdf.setProducer("Trésorerie");
  pdf.setCreator("Trésorerie");

  // Montserrat, embarquée depuis le dépôt (voir services/polices.ts).
  const polices = await embarquerPolices(pdf);

  // Le logo est embarqué une fois pour tout le document. Un fichier illisible
  // ne doit pas empêcher d'émettre la pièce : on s'en passe et on continue.
  let logo: Contexte["logo"] = null;
  if (charte.logo) {
    try {
      const image =
        charte.logo.type === "png"
          ? await pdf.embedPng(charte.logo.octets)
          : await pdf.embedJpg(charte.logo.octets);
      const hauteur = Math.min(charte.hauteurBandeau - 14, 30);
      const largeur = (image.width / image.height) * hauteur;
      logo = { image, largeur, hauteur };
    } catch {
      logo = null;
    }
  }

  const dims = dimensionsPage(structure.orientation);
  const premiere = pdf.addPage([dims.largeur, dims.hauteur]);
  const ctx: Contexte = {
    pdf,
    polices,
    structure,
    charte,
    couleurs: couleursDe(charte),
    logo,
    page: premiere,
    pages: [premiere],
    y: 0,
    largeurPage: dims.largeur,
    hauteurPage: dims.hauteur,
    largeurUtile: dims.largeurUtile,
  };
  ctx.y = dessinerEntete(ctx, true);

  for (const bloc of structure.blocs) dessinerBloc(ctx, bloc);

  finaliser(ctx);
  return pdf.save();
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/**
 * Découpe un texte pour qu'aucune ligne ne dépasse `largeur`.
 *
 * L'assainissement a lieu ici, et pas seulement au moment de dessiner :
 * `widthOfTextAtSize` échoue elle aussi sur un caractère hors WinAnsi.
 */
export function replier(
  brut: string,
  police: PDFFont,
  taille: number,
  largeur: number
): string[] {
  const lignes: string[] = [];
  for (const paragraphe of assainir(brut).split("\n")) {
    let courante = "";
    for (const mot of paragraphe.split(/\s+/)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (courante && police.widthOfTextAtSize(essai, taille) > largeur) {
        lignes.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    lignes.push(courante);
  }
  return lignes;
}

/** Tronque un texte avec une ellipse pour tenir dans une cellule. */
export function tronquer(
  brut: string,
  police: PDFFont,
  taille: number,
  largeur: number
): string {
  const texte = assainir(brut);
  if (police.widthOfTextAtSize(texte, taille) <= largeur) return texte;
  let coupe = texte;
  while (
    coupe.length > 1 &&
    police.widthOfTextAtSize(`${coupe}…`, taille) > largeur
  ) {
    coupe = coupe.slice(0, -1);
  }
  return `${coupe}…`;
}

/**
 * Les polices standard sont encodées en WinAnsi : un caractère hors table
 * (emoji, arabe, tiret cadratin selon la source) fait échouer `drawText`.
 * On nettoie en amont plutôt que de laisser exploser la génération.
 */
function assainir(texte: string): string {
  return texte
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // Le saut de ligne est conservé : c'est un séparateur de paragraphe
    // voulu, interprété par replier(). Le reste hors WinAnsi saute.
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7E¡-ÿŒœ€]/g, "");
}

function texte(
  ctx: Contexte,
  contenu: string,
  options: {
    x: number;
    y: number;
    taille?: number;
    police?: PDFFont;
    couleur?: RGB;
    /** Ancrage horizontal ; `droite` aligne la fin du texte sur `x`. */
    ancre?: "gauche" | "droite" | "centre";
  }
): void {
  const taille = options.taille ?? CORPS;
  const police = options.police ?? ctx.polices.normale;
  const propre = assainir(contenu);
  let x = options.x;
  if (options.ancre === "droite") {
    x -= police.widthOfTextAtSize(propre, taille);
  } else if (options.ancre === "centre") {
    x -= police.widthOfTextAtSize(propre, taille) / 2;
  }
  ctx.page.drawText(propre, {
    x,
    y: options.y,
    size: taille,
    font: police,
    color: options.couleur ?? ctx.couleurs.texte,
  });
}

/** Réserve `hauteur` points ; ouvre une page si le bloc ne tient plus. */
function reserver(ctx: Contexte, hauteur: number): void {
  if (ctx.y - hauteur >= MARGE.bas) return;
  const page = ctx.pdf.addPage([ctx.largeurPage, ctx.hauteurPage]);
  ctx.page = page;
  ctx.pages.push(page);
  ctx.y = dessinerEntete(ctx, false);
}

/* ------------------------------------------------------------------ */
/* En-tête / pied de page                                              */
/* ------------------------------------------------------------------ */

/** Dessine le bandeau et le bloc titre ; renvoie l'ordonnée de départ du corps. */
function dessinerEntete(ctx: Contexte, premiere: boolean): number {
  const { structure, charte } = ctx;
  const hBandeau = charte.hauteurBandeau;
  const yBandeau = ctx.hauteurPage - hBandeau;
  // Les deux lignes du bandeau se placent par rapport à son milieu : c'est ce
  // qui permet d'en changer la hauteur sans que tout se décolle.
  const milieu = yBandeau + hBandeau / 2;
  const ligneHaute = milieu + 2;
  const ligneBasse = milieu - 11;

  ctx.page.drawRectangle({
    x: 0,
    y: yBandeau,
    width: ctx.largeurPage,
    height: hBandeau,
    color: ctx.couleurs.primaire,
  });

  // Le logo passe devant le nom, qui se décale d'autant.
  let xTexte = MARGE.gauche;
  if (ctx.logo) {
    ctx.page.drawImage(ctx.logo.image, {
      x: MARGE.gauche,
      y: milieu - ctx.logo.hauteur / 2,
      width: ctx.logo.largeur,
      height: ctx.logo.hauteur,
    });
    xTexte = MARGE.gauche + ctx.logo.largeur + 12;
  }

  const avecSlogan = charte.afficherSlogan && Boolean(charte.slogan);
  texte(ctx, charte.nomEmetteur, {
    x: xTexte,
    y: avecSlogan ? ligneHaute : milieu - 4,
    taille: 13,
    police: ctx.polices.grasse,
    couleur: ctx.couleurs.surPrimaire,
  });
  if (avecSlogan) {
    texte(ctx, charte.slogan as string, {
      x: xTexte,
      y: ligneBasse,
      taille: 7.5,
      couleur: ctx.couleurs.surPrimaireAttenue,
    });
  }
  texte(ctx, structure.reference, {
    x: ctx.largeurPage - MARGE.droite,
    y: ligneHaute,
    taille: 10,
    police: ctx.polices.grasse,
    couleur: ctx.couleurs.surPrimaire,
    ancre: "droite",
  });
  texte(ctx, structure.date, {
    x: ctx.largeurPage - MARGE.droite,
    y: ligneBasse,
    taille: 8,
    couleur: ctx.couleurs.surPrimaireAttenue,
    ancre: "droite",
  });

  if (!premiere) return yBandeau - 28;

  // Bloc titre, uniquement sur la première page.
  let y = yBandeau - 40;
  texte(ctx, (charte.titre?.trim() || structure.titre).toUpperCase(), {
    x: MARGE.gauche,
    y,
    taille: 17,
    police: ctx.polices.grasse,
    couleur: ctx.couleurs.primaire,
  });
  y -= 15;
  if (structure.sousTitre) {
    texte(ctx, structure.sousTitre, {
      x: MARGE.gauche,
      y,
      taille: 10,
      couleur: ctx.couleurs.secondaire,
    });
    y -= 14;
  }
  ctx.page.drawLine({
    start: { x: MARGE.gauche, y: y - 4 },
    end: { x: ctx.largeurPage - MARGE.droite, y: y - 4 },
    thickness: 1.5,
    color: ctx.couleurs.primaire,
  });
  return y - 26;
}

/** Pieds de page numérotés + filigrane, une fois le nombre de pages connu. */
function finaliser(ctx: Contexte): void {
  const total = ctx.pages.length;
  ctx.pages.forEach((page, index) => {
    const courante = ctx.page;
    ctx.page = page;

    page.drawLine({
      start: { x: MARGE.gauche, y: MARGE.bas - 16 },
      end: { x: ctx.largeurPage - MARGE.droite, y: MARGE.bas - 16 },
      thickness: 0.5,
      color: GRIS_CLAIR,
    });
    // Barre colorée en écho au bandeau haut, si la charte la demande.
    if (ctx.charte.bandeauPied) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: ctx.largeurPage,
        height: 10,
        color: ctx.couleurs.primaire,
      });
    }

    const mentions = [
      ctx.structure.reference,
      ...(ctx.charte.mentions ?? []),
      ctx.structure.mentionPied,
    ].filter(Boolean) as string[];
    texte(ctx, mentions.join("  ·  "), {
      x: MARGE.gauche,
      y: MARGE.bas - 28,
      taille: 7,
      couleur: ctx.couleurs.secondaire,
    });
    texte(ctx, `Page ${index + 1}/${total}`, {
      x: ctx.largeurPage - MARGE.droite,
      y: MARGE.bas - 28,
      taille: 7,
      couleur: ctx.couleurs.secondaire,
      ancre: "droite",
    });
    if (ctx.charte.afficherMentionErp) {
      texte(ctx, "Document produit par l'application Trésorerie", {
        x: ctx.largeurPage / 2,
        y: MARGE.bas - 40,
        taille: 6.5,
        couleur: GRIS_CLAIR,
        ancre: "centre",
      });
    }

    if (ctx.structure.filigrane) {
      page.drawText(assainir(ctx.structure.filigrane.toUpperCase()), {
        x: 110,
        y: 260,
        size: 62,
        font: ctx.polices.grasse,
        color: ctx.couleurs.primaire,
        opacity: 0.08,
        rotate: degrees(38),
      });
    }
    ctx.page = courante;
  });
}

/* ------------------------------------------------------------------ */
/* Blocs                                                               */
/* ------------------------------------------------------------------ */

function dessinerBloc(ctx: Contexte, bloc: BlocDocument): void {
  switch (bloc.type) {
    case "espace":
      reserver(ctx, bloc.hauteur);
      ctx.y -= bloc.hauteur;
      return;

    case "section": {
      reserver(ctx, 30);
      ctx.y -= 6;
      texte(ctx, bloc.titre.toUpperCase(), {
        x: MARGE.gauche,
        y: ctx.y,
        taille: 9.5,
        police: ctx.polices.grasse,
        couleur: ctx.couleurs.primaire,
      });
      ctx.y -= 6;
      ctx.page.drawLine({
        start: { x: MARGE.gauche, y: ctx.y },
        end: { x: ctx.largeurPage - MARGE.droite, y: ctx.y },
        thickness: 0.5,
        color: GRIS_CLAIR,
      });
      ctx.y -= 14;
      return;
    }

    case "paragraphe": {
      const police = bloc.italique ? ctx.polices.italique : ctx.polices.normale;
      for (const ligne of replier(bloc.texte, police, CORPS, ctx.largeurUtile)) {
        reserver(ctx, INTERLIGNE);
        texte(ctx, ligne, { x: MARGE.gauche, y: ctx.y, police });
        ctx.y -= INTERLIGNE;
      }
      ctx.y -= 4;
      return;
    }

    case "champs": {
      const colonnes = bloc.colonnes ?? 2;
      const largeurCol = ctx.largeurUtile / colonnes;
      const largeurValeur = largeurCol - 12;
      for (let i = 0; i < bloc.items.length; i += colonnes) {
        const rangee = bloc.items.slice(i, i + colonnes);
        // La hauteur d'une rangée est celle de son champ le plus haut.
        const hauteurs = rangee.map(
          (item) =>
            replier(item.valeur, ctx.polices.grasse, CORPS, largeurValeur)
              .length * INTERLIGNE
        );
        const hauteur = 11 + Math.max(...hauteurs);
        reserver(ctx, hauteur + 6);
        rangee.forEach((item, col) => {
          const x = MARGE.gauche + col * largeurCol;
          texte(ctx, item.label.toUpperCase(), {
            x,
            y: ctx.y,
            taille: 7,
            couleur: ctx.couleurs.secondaire,
          });
          let yValeur = ctx.y - 12;
          for (const ligne of replier(
            item.valeur,
            ctx.polices.grasse,
            CORPS,
            largeurValeur
          )) {
            texte(ctx, ligne, {
              x,
              y: yValeur,
              police: ctx.polices.grasse,
            });
            yValeur -= INTERLIGNE;
          }
        });
        ctx.y -= hauteur + 6;
      }
      return;
    }

    case "tableau": {
      const total = bloc.colonnes.reduce((s, c) => s + c.largeur, 0) || 1;
      const largeurs = bloc.colonnes.map(
        (c) => (c.largeur / total) * ctx.largeurUtile
      );
      const hLigne = 18;

      const entete = () => {
        reserver(ctx, hLigne * 2);
        ctx.page.drawRectangle({
          x: MARGE.gauche,
          y: ctx.y - 5,
          width: ctx.largeurUtile,
          height: hLigne,
          color: ctx.couleurs.primaire,
        });
        let x = MARGE.gauche;
        bloc.colonnes.forEach((colonne, i) => {
          const contenu = tronquer(
            colonne.libelle,
            ctx.polices.grasse,
            8,
            largeurs[i] - 12
          );
          texte(ctx, contenu, {
            x: positionCellule(x, largeurs[i], colonne.alignement),
            y: ctx.y,
            taille: 8,
            police: ctx.polices.grasse,
            couleur: ctx.couleurs.surPrimaire,
            ancre: ancre(colonne.alignement),
          });
          x += largeurs[i];
        });
        ctx.y -= hLigne + 5;
      };

      entete();
      bloc.lignes.forEach((ligne, index) => {
        const avant = ctx.y;
        reserver(ctx, hLigne);
        // Saut de page au milieu du tableau : on redessine l'en-tête.
        if (ctx.y > avant) entete();
        if (index % 2 === 1) {
          ctx.page.drawRectangle({
            x: MARGE.gauche,
            y: ctx.y - 5,
            width: ctx.largeurUtile,
            height: hLigne,
            color: ZEBRE,
          });
        }
        let x = MARGE.gauche;
        bloc.colonnes.forEach((colonne, i) => {
          const brut = ligne[i] ?? "";
          const contenu = tronquer(
            brut,
            ctx.polices.normale,
            CORPS,
            largeurs[i] - 12
          );
          texte(ctx, contenu, {
            x: positionCellule(x, largeurs[i], colonne.alignement),
            y: ctx.y,
            ancre: ancre(colonne.alignement),
          });
          x += largeurs[i];
        });
        ctx.y -= hLigne;
      });
      ctx.y -= 8;
      return;
    }

    case "total": {
      const largeurBloc = 240;
      const xDroite = ctx.largeurPage - MARGE.droite - 10;
      for (const item of bloc.items) {
        reserver(ctx, 20);
        const police = item.fort ? ctx.polices.grasse : ctx.polices.normale;
        if (item.fort) {
          ctx.page.drawRectangle({
            x: ctx.largeurPage - MARGE.droite - largeurBloc,
            y: ctx.y - 5,
            width: largeurBloc,
            height: 19,
            color: rgb(0.976, 0.949, 0.957),
          });
        }
        texte(ctx, item.label, {
          x: ctx.largeurPage - MARGE.droite - largeurBloc + 10,
          y: ctx.y,
          police,
          couleur: item.fort ? ctx.couleurs.primaire : ctx.couleurs.secondaire,
        });
        texte(ctx, item.valeur, {
          x: xDroite,
          y: ctx.y,
          police: ctx.polices.grasse,
          couleur: item.fort ? ctx.couleurs.primaire : ctx.couleurs.texte,
          ancre: "droite",
        });
        ctx.y -= item.fort ? 24 : 18;
      }
      ctx.y -= 4;
      return;
    }

    case "encadre": {
      const lignes = replier(
        bloc.texte,
        ctx.polices.normale,
        CORPS,
        ctx.largeurUtile - 28
      );
      const hauteur = lignes.length * INTERLIGNE + (bloc.titre ? 18 : 0) + 18;
      reserver(ctx, hauteur + 8);
      ctx.page.drawRectangle({
        x: MARGE.gauche,
        y: ctx.y - hauteur + 12,
        width: ctx.largeurUtile,
        height: hauteur,
        color: rgb(0.976, 0.949, 0.957),
        borderColor: ctx.couleurs.primaire,
        borderWidth: 0.5,
      });
      let y = ctx.y - 2;
      if (bloc.titre) {
        texte(ctx, bloc.titre, {
          x: MARGE.gauche + 14,
          y,
          taille: 9,
          police: ctx.polices.grasse,
          couleur: ctx.couleurs.primaire,
        });
        y -= 16;
      }
      for (const ligne of lignes) {
        texte(ctx, ligne, { x: MARGE.gauche + 14, y });
        y -= INTERLIGNE;
      }
      ctx.y -= hauteur + 8;
      return;
    }

    case "signatures": {
      // La réserve doit valoir EXACTEMENT ce que le bloc consomme (58 jusqu'au
      // trait + 26 sous le trait) : sur-réserver provoquait des sauts de page
      // parasites, la signature partant seule sur une feuille vierge.
      reserver(ctx, 84);
      const largeur = ctx.largeurUtile / Math.max(bloc.cases.length, 1);
      const yTrait = ctx.y - 58;
      bloc.cases.forEach((cas, i) => {
        const x = MARGE.gauche + i * largeur;
        texte(ctx, cas.role, {
          x,
          y: ctx.y,
          taille: 8,
          police: ctx.polices.grasse,
          couleur: ctx.couleurs.secondaire,
        });
        if (cas.nom) {
          texte(ctx, cas.nom, { x, y: ctx.y - 13, taille: 8.5 });
        }
        ctx.page.drawLine({
          start: { x, y: yTrait },
          end: { x: x + largeur - 24, y: yTrait },
          thickness: 0.5,
          color: GRIS_CLAIR,
        });
        texte(ctx, "Signature et cachet", {
          x,
          y: yTrait - 11,
          taille: 6.5,
          couleur: ctx.couleurs.secondaire,
        });
      });
      ctx.y = yTrait - 26;
      return;
    }
  }
}

function ancre(alignement?: "gauche" | "droite" | "centre") {
  return alignement === "droite"
    ? ("droite" as const)
    : alignement === "centre"
      ? ("centre" as const)
      : ("gauche" as const);
}

function positionCellule(
  x: number,
  largeur: number,
  alignement?: "gauche" | "droite" | "centre"
): number {
  if (alignement === "droite") return x + largeur - 6;
  if (alignement === "centre") return x + largeur / 2;
  return x + 6;
}
