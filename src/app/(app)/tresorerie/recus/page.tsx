import { redirect } from "next/navigation";
import type { Types } from "mongoose";
import { Plus, ReceiptText } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel, MembreModel } from "@/modules/core/models";
import { CotisationModel } from "@/modules/base/models";
import {
  BudgetPrevisionnelModel,
  FluxTresorerieModel,
  MODES_PAIEMENT as MODES_FLUX,
  TypeRecuModel,
} from "@/modules/tresorerie/models";
import { DocumentModel, SequenceModel } from "@/modules/documents/models";
import { genererRecuCotisation } from "@/modules/documents/actions/documents";
import { creerTypeRecu } from "@/modules/tresorerie/actions/recus";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CarteEncaissement,
  type EncaissementVue,
} from "@/modules/tresorerie/components/carte-encaissement";
import { CarteCotisation } from "@/modules/tresorerie/components/carte-cotisation";
import {
  CarteRecu,
  type RecuVue,
} from "@/modules/tresorerie/components/carte-recu";
import { FamillesRecus } from "@/modules/tresorerie/components/familles-recus";
import { comptePourMode } from "@/modules/tresorerie/services/caisse";
import {
  CATALOGUE_RECUS,
  composerFamilles,
  type FamilleRecu,
} from "@/modules/tresorerie/services/familles-recus";
import { StatCard } from "@/components/ui/stat-card";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/** Modes de paiement lisibles portés sur le reçu d'une cotisation RH. */
const MODES_RECU = ["Espèces", "Virement", "Chèque", "Paiement mobile"];

/**
 * Un encaissement qui attend son reçu, quelle que soit sa provenance.
 *
 * Deux colonnes faisaient le même travail sans le savoir : « Cotisations à
 * émettre » lisait le registre des cotisations, « Sans reçu » lisait le
 * journal des flux. Or une cotisation encaissée au journal produit son reçu
 * sur la **cotisation**, pas sur le flux : le flux restait donc indéfiniment
 * dans « sans reçu » pendant que la même somme s'affichait comme émise en
 * face. Une seule liste, et la couverture se juge sur les deux chemins à la
 * fois.
 *
 * Reste le cas des cotisations marquées payées depuis la RH, sans passage par
 * le journal : elles n'ont pas de flux, et gardent leur propre carte dans
 * cette même liste — sans quoi leur reçu ne serait émissible nulle part.
 */
type ItemAEmettre =
  | { genre: "FLUX"; tri: number; flux: EncaissementVue }
  | {
      genre: "COTISATION";
      tri: number;
      cotisation: {
        cotisationId: string;
        nom: string;
        email: string;
        montant: number;
        datePaiement: string;
        dateISO: string;
        precedentAnnule: boolean;
      };
    };



export default async function RecusPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEmettre =
    can(session.user.roles, "tresorerie", "ecrire") &&
    can(session.user.roles, "documents", "lire");

  let erreurDb: string | undefined;
  let aEmettre: ItemAEmettre[] = [];
  let recus: RecuVue[] = [];
  let familles: FamilleRecu[] = [];
  let categories: string[] = [];
  let nbEncaissements = 0;
  let nbCotisations = 0;
  let totalCotisations = 0;
  let annee = "";

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId; annee: string } | null =
      await MandatModel.findOne({ statut: "ACTIF" }).select("_id annee").lean();
    annee = mandat?.annee ?? "";

    if (mandat) {
      const [flux, cotisations, documents, typesRecus, sequences, budget] =
        await Promise.all([
          FluxTresorerieModel.find({ mandat: mandat._id, type: "ENCAISSEMENT" })
            .sort({ date: -1 })
            .limit(200)
            .lean(),
          CotisationModel.find({ mandat: mandat._id })
            .sort({ datePaiement: -1 })
            .lean(),
          DocumentModel.find({ mandat: mandat._id, categorie: "RECU" })
            .select(
              "_id reference modele titre objetType objetId statut envoyeLe envoyeA motifAnnulation"
            )
            .lean(),
          TypeRecuModel.find().sort({ libelle: 1 }).lean(),
          SequenceModel.find().select("cle valeur").lean(),
          BudgetPrevisionnelModel.findOne({ mandat: mandat._id })
            .select("lignes.libelle")
            .lean(),
        ]);

      nbEncaissements = flux.length;
      categories = budget?.lignes.map((l) => l.libelle) ?? [];

      // Identités des cotisants, en une requête plutôt qu'une par ligne. Le
      // registre des adhérents porte lui-même le nom : un cotisant n'a pas
      // besoin d'un compte dans l'application pour figurer sur un reçu.
      const membres = await MembreModel.find({
        _id: { $in: cotisations.map((c) => c.membre) },
      })
        .select("_id nom email")
        .lean();
      const identiteParMembre = new Map(
        membres.map((m) => [String(m._id), m])
      );

      // Une pièce annulée ne couvre plus rien — mais elle explique pourquoi
      // l'encaissement revient dans la liste, ce qui vaut d'être dit.
      const emis = documents.filter((d) => d.statut !== "ANNULE");
      const annules = documents.filter((d) => d.statut === "ANNULE");
      const docParFlux = new Map(
        emis
          .filter((d) => d.objetType === "FluxTresorerie" && d.objetId)
          .map((d) => [String(d.objetId), d])
      );
      const docParCotisation = new Map(
        emis
          .filter((d) => d.objetType === "Cotisation" && d.objetId)
          .map((d) => [String(d.objetId), d])
      );
      const annulePourCotisation = new Set(
        annules
          .filter((d) => d.objetType === "Cotisation" && d.objetId)
          .map((d) => String(d.objetId))
      );

      const cotisationsPayees = cotisations.filter((c) => c.payee);
      nbCotisations = cotisationsPayees.length;
      totalCotisations = cotisationsPayees.reduce(
        (s, c) => s + (c.montant ?? 0),
        0
      );

      // Un flux est couvert par son propre reçu, ou par celui de la cotisation
      // qu'il a encaissée : les deux chemins comptent, sinon l'opération
      // réapparaît comme si rien n'avait été émis.
      const fluxCouvertsParCotisation = new Set(
        cotisations
          .filter((c) => c.flux && docParCotisation.has(String(c._id)))
          .map((c) => String(c.flux))
      );
      const fluxIds = new Set(flux.map((f) => String(f._id)));

      const fluxAEmettre: ItemAEmettre[] = flux
        .filter(
          (f) =>
            !docParFlux.has(String(f._id)) &&
            !fluxCouvertsParCotisation.has(String(f._id))
        )
        .map((f) => ({
          genre: "FLUX" as const,
          tri: new Date(f.date ?? 0).getTime(),
          flux: {
            fluxId: String(f._id),
            tiers: f.tiers,
            categorie: f.categorie,
            montant: f.montant,
            date: f.date ? new Date(f.date).toLocaleDateString("fr-FR") : "—",
            dateISO: new Date(f.date ?? Date.now()).toISOString().slice(0, 10),
            modePaiement: f.modePaiement ?? "ESPECES",
            compte: f.compte ?? comptePourMode(f.modePaiement),
            aJustificatif: Boolean(f.justificatifRef?.trim()),
          },
        }));

      // Cotisations payées sans reçu **et sans opération au journal** : celles
      // qui ont un flux sont déjà représentées par lui, les compter deux fois
      // ferait deux cartes pour un seul encaissement.
      const cotisationsAEmettre: ItemAEmettre[] = cotisationsPayees
        .filter(
          (c) =>
            !docParCotisation.has(String(c._id)) &&
            !(c.flux && fluxIds.has(String(c.flux)))
        )
        .map((c) => {
          const identite = identiteParMembre.get(String(c.membre));
          return {
            genre: "COTISATION" as const,
            tri: new Date(c.datePaiement ?? 0).getTime(),
            cotisation: {
              cotisationId: String(c._id),
              nom: identite?.nom ?? "Membre",
              email: identite?.email ?? "",
              montant: c.montant ?? 0,
              datePaiement: c.datePaiement
                ? new Date(c.datePaiement).toLocaleDateString("fr-FR")
                : "—",
              dateISO: new Date(c.datePaiement ?? Date.now())
                .toISOString()
                .slice(0, 10),
              precedentAnnule: annulePourCotisation.has(String(c._id)),
            },
          };
        });

      aEmettre = [...fluxAEmettre, ...cotisationsAEmettre].sort(
        (a, b) => b.tri - a.tri
      );

      // Les reçus émis, des deux provenances, dans une seule liste.
      const fluxParId = new Map(flux.map((f) => [String(f._id), f]));
      const cotisationParId = new Map(
        cotisations.map((c) => [String(c._id), c])
      );
      recus = documents
        .map((d) => {
          const cotisation =
            d.objetType === "Cotisation"
              ? cotisationParId.get(String(d.objetId))
              : undefined;
          const operation =
            d.objetType === "FluxTresorerie"
              ? fluxParId.get(String(d.objetId))
              : undefined;
          const identite = cotisation
            ? identiteParMembre.get(String(cotisation.membre))
            : undefined;
          const montant = cotisation?.montant ?? operation?.montant ?? 0;
          const date = cotisation?.datePaiement ?? operation?.date;
          return {
            documentId: String(d._id),
            reference: d.reference,
            intitule:
              identite?.nom ??
              operation?.tiers ??
              d.titre.split(" — ").slice(1).join(" — ") ??
              d.titre,
            detail: `${montant.toFixed(3).replace(".", ",")} DT${
              date ? ` · ${new Date(date).toLocaleDateString("fr-FR")}` : ""
            }`,
            montant,
            envoye: Boolean(d.envoyeLe),
            envoyeLe: d.envoyeLe
              ? new Date(d.envoyeLe).toLocaleDateString("fr-FR")
              : "",
            envoyeA: d.envoyeA ?? "",
            annule: d.statut === "ANNULE",
            motifAnnulation: d.motifAnnulation ?? "",
            cotisationId: cotisation ? String(cotisation._id) : undefined,
          };
        })
        .sort((a, b) => b.reference.localeCompare(a.reference, "fr"));

      familles = composerFamilles({
        catalogue: CATALOGUE_RECUS,
        personnalisations: typesRecus.map((t) => ({
          id: String(t._id),
          libelle: t.libelle,
          code: t.code,
          actif: t.actif ?? true,
          modele: t.modele ?? null,
        })),
        compteurs: sequences.map((s) => ({ cle: s.cle, valeur: s.valeur })),
      });
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  // Trois lectures d'une même liste : ce qui attend d'être remis, ce qui
  // est parti, et ce qui a été annulé et n'encombre plus la vue de travail.
  const brouillons = recus.filter((r) => !r.envoye && !r.annule);
  const remis = recus.filter((r) => r.envoye && !r.annule);
  const recusAnnules = recus.filter((r) => r.annule);

  // La liste composée ne contient déjà que les familles vivantes : les
  // supprimées sont dans la corbeille, pas dans un menu déroulant.
  const choixFamilles = familles.map((f) => ({
    valeur: f.valeur,
    libelle: f.libelle,
  }));

  return (
    <div>
      <PageHeader
        title="Reçus"
        description={`Cotisations, dons, ventes, jobs et intégrations : chaque encaissement donne droit à un reçu numéroté. Sur le drive, cela voulait dire dupliquer un PowerPoint et renuméroter à la main — environ 250 fois par mandat.${
          annee ? ` Mandat ${annee}.` : ""
        }`}
      />
      <NavTresorerie actif="/tresorerie/recus" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Cotisations encaissées"
              value={nbCotisations}
              hint={`${totalCotisations.toFixed(3).replace(".", ",")} DT`}
              icon={<ReceiptText className="h-5 w-5" />}
            />
            <StatCard
              label="Reçus remis"
              value={remis.length}
              hint={
                brouillons.length
                  ? `${brouillons.length} en attente de remise`
                  : "Tout est parti"
              }
            />
            <StatCard
              label="Reçus à émettre"
              value={aEmettre.length}
              hint={aEmettre.length ? "Action requise" : "Rien à faire"}
              className={aEmettre.length ? "border-warning" : ""}
            />
            <StatCard
              label="Encaissements au journal"
              value={nbEncaissements}
              hint="Cotisations, dons, ventes, jobs, intégrations"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  Encaissements nécessitant un reçu ({aEmettre.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {aEmettre.length === 0 ? (
                  <EmptyState
                    icon={<ReceiptText className="h-6 w-6" />}
                    title="Tous les reçus sont émis"
                    description="Chaque somme encaissée a sa pièce numérotée."
                  />
                ) : (
                  aEmettre.map((item) =>
                    item.genre === "FLUX" ? (
                      <CarteEncaissement
                        key={item.flux.fluxId}
                        encaissement={item.flux}
                        categories={categories}
                        modesPaiement={MODES_FLUX}
                        familles={choixFamilles}
                        peutEcrire={peutEmettre}
                      />
                    ) : (
                      <CarteCotisation
                        key={item.cotisation.cotisationId}
                        cotisation={item.cotisation}
                        peutEcrire={peutEmettre}
                      >
                        {peutEmettre ? (
                          <form
                            action={genererRecuCotisation}
                            className="mt-3 flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="cotisationId"
                              value={item.cotisation.cotisationId}
                            />
                            <select
                              name="modePaiement"
                              defaultValue="Espèces"
                              className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm"
                              aria-label={`Mode de paiement de ${item.cotisation.nom}`}
                            >
                              {MODES_RECU.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" size="sm">
                              Générer le reçu
                            </Button>
                          </form>
                        ) : null}
                      </CarteCotisation>
                    )
                  )
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  Reçus établis ({brouillons.length + remis.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {brouillons.length + remis.length === 0 ? (
                  <EmptyState
                    title="Aucun reçu établi"
                    description="Les reçus générés apparaîtront ici et dans la bibliothèque documentaire."
                  />
                ) : null}

                {/*
                  Les brouillons d'abord : ce sont eux qui appellent un geste.
                  Tant qu'ils n'ont pas été remis, ils se corrigent sans que
                  leur numéro soit perdu.
                */}
                {brouillons.length > 0 ? (
                  <section className="space-y-2">
                    <h3 className="text-xs font-medium uppercase text-muted-foreground">
                      Pas encore remis ({brouillons.length})
                    </h3>
                    {brouillons.map((r) => (
                      <CarteRecu
                        key={r.documentId}
                        recu={r}
                        peutEcrire={peutEmettre}
                      />
                    ))}
                  </section>
                ) : null}

                {remis.length > 0 ? (
                  <section className="space-y-2">
                    <h3 className="text-xs font-medium uppercase text-muted-foreground">
                      Remis ({remis.length})
                    </h3>
                    {remis.map((r) => (
                      <CarteRecu
                        key={r.documentId}
                        recu={r}
                        peutEcrire={peutEmettre}
                      />
                    ))}
                  </section>
                ) : null}

                {/*
                  Les annulés ne sont pas du travail en cours, mais ils
                  expliquent les trous de la série : on les replie sans les
                  cacher.
                */}
                {recusAnnules.length > 0 ? (
                  <details className="rounded-lg border border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium uppercase text-muted-foreground">
                      Annulés ({recusAnnules.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {recusAnnules.map((r) => (
                        <CarteRecu
                          key={r.documentId}
                          recu={r}
                          peutEcrire={peutEmettre}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Familles de reçus ({familles.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  Ce que la JE encaisse, et la série de numéros de chaque
                  famille. L&apos;intitulé se renomme librement ; le code entre
                  dans la référence et se verrouille dès le premier reçu émis.
                  Supprimer une famille la retire des choix — elle part à la
                  corbeille — sans toucher aux reçus déjà établis.
                </p>
                <FamillesRecus familles={familles} peutEcrire={peutEmettre} />
              </CardContent>
            </Card>

            {peutEmettre ? (
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Déclarer une famille</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={creerTypeRecu} className="space-y-3">
                    <Input
                      name="libelle"
                      required
                      placeholder="Intitulé (ex. Tombola)"
                    />
                    <Input
                      name="code"
                      required
                      pattern="[A-Za-z]{2,10}"
                      placeholder="Code de référence (ex. TOMBOLA)"
                    />
                    <Button type="submit" size="sm" className="w-full">
                      <Plus className="h-4 w-4" /> Déclarer la famille
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Les familles du catalogue couvrent l&apos;essentiel ;
                      déclarez-en une quand un encaissement récurrent
                      n&apos;y entre pas — un JeBex, une tombola. Le code devient
                      un morceau de la référence et ouvre sa propre série :{" "}
                      <span className="font-mono">RC001-TOMBOLA-2627</span>.
                    </p>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
