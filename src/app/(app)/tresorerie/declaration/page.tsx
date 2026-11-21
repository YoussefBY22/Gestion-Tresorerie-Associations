import { redirect } from "next/navigation";
import Link from "next/link";
import type { Types } from "mongoose";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { can } from "@/modules/core/rbac";
import { connectDb } from "@/lib/db";
import { exigerModuleActif } from "@/lib/autorisation";
import { MandatModel } from "@/modules/core/models";
import {
  DeclarationMensuelleModel,
  FactureFournisseurModel,
  MODES_REGLEMENT,
} from "@/modules/tresorerie/models";
import {
  TAUX_TVA_DEFAUT,
  TIMBRE_FISCAL_DT,
  TYPES_PRESTATAIRE,
  libelleMois,
  moisPrecedent,
  type Declaration,
} from "@/modules/tresorerie/services/fiscal";
import {
  ajouterAgios,
  calculerDeclarationDuMois,
  cloturerDeclaration,
  enregistrerFactureFournisseur,
  marquerDeclarationDeposee,
  rouvrirDeclaration,
  supprimerFactureFournisseur,
} from "@/modules/tresorerie/actions/fiscal";
import {
  blocageDeLaCloture,
  calendrierDeclarations,
  moisEnRetard,
  moisSuivant,
} from "@/modules/tresorerie/services/calendrier-declarations";
import { moisDuMandat } from "@/modules/tresorerie/services/budget-previsionnel";
import { moisCourant } from "@/modules/core/services/mandat";
import { FriseDeclarations } from "@/modules/tresorerie/components/frise-declarations";
import { Liquidation } from "@/modules/tresorerie/components/liquidation";
import { NavTresorerie } from "@/modules/tresorerie/components/nav-tresorerie";
import { CertificatRasFacture } from "@/modules/tresorerie/components/certificat-ras-facture";
import { certificatsDesFactures } from "@/modules/tresorerie/actions/certificats-ras";
import { verifierCertificat } from "@/modules/tresorerie/services/certificat-ras";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlerteDb } from "@/components/ui/alerte-db";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const CHAMP = "h-9 w-full rounded-md border border-border bg-card px-3 text-sm";

function dt(montant: number): string {
  return `${montant.toFixed(3).replace(".", ",")} DT`;
}

export default async function DeclarationPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.roles, "tresorerie", "lire")) redirect("/");
  await exigerModuleActif("tresorerie");
  const peutEcrire = can(session.user.roles, "tresorerie", "ecrire");
  const peutValider = can(session.user.roles, "tresorerie", "valider");

  const { mois: moisDemande } = await searchParams;
  const mois =
    moisDemande && /^\d{4}-\d{2}$/.test(moisDemande)
      ? moisDemande
      : moisCourant();

  let erreurDb: string | undefined;
  let declaration: Declaration | null = null;
  let statut = "BROUILLON";
  let documentId: string | null = null;
  let preuveRef: string | undefined;
  let agios: { id: string; libelle?: string; montantHT: number }[] = [];
  let factures: {
    id: string;
    reference: string;
    fournisseur: string;
    montantHT: number;
    montantTTC: number;
    typePrestataire?: string | null;
    date: string;
    certificat: { id: string; reference: string } | null;
  }[] = [];
  let annee = "";
  let calendrier: ReturnType<typeof calendrierDeclarations> = [];
  let blocage: { bloque: boolean; raison: string | null } = {
    bloque: false,
    raison: null,
  };

  try {
    await connectDb();
    const mandat: { _id: Types.ObjectId; annee: string } | null =
      await MandatModel.findOne({ statut: "ACTIF" }).select("_id annee").lean();
    annee = mandat?.annee ?? "";

    if (mandat) {
      const [calcul, enBase, recues, toutes, bornes] = await Promise.all([
        calculerDeclarationDuMois(mandat._id, mois),
        DeclarationMensuelleModel.findOne({ mandat: mandat._id, mois }).lean(),
        FactureFournisseurModel.find({ mandat: mandat._id, mois })
          .sort({ date: 1 })
          .lean(),
        // Les statuts de tous les mois : c'est ce qui permet de dire où on
        // en est sans ouvrir les déclarations une par une.
        DeclarationMensuelleModel.find({ mandat: mandat._id })
          .select("mois statut")
          .lean(),
        MandatModel.findById(mandat._id).select("debut fin").lean(),
      ]);

      const statuts = toutes.map((d) => ({ mois: d.mois, statut: d.statut }));
      if (bornes?.debut && bornes.fin) {
        calendrier = calendrierDeclarations(
          moisDuMandat(new Date(bornes.debut), new Date(bornes.fin)),
          statuts,
          moisCourant()
        );
      }
      blocage = blocageDeLaCloture(moisPrecedent(mois), statuts);

      // En brouillon, on affiche le calcul temps réel ; une fois close, la
      // photo figée — c'est elle qui a été déclarée.
      declaration =
        enBase && enBase.statut !== "BROUILLON"
          ? (enBase.resultat as Declaration)
          : calcul.declaration;
      statut = enBase?.statut ?? "BROUILLON";
      documentId = enBase?.document ? String(enBase.document) : null;
      preuveRef = enBase?.preuveRef ?? undefined;
      agios = (enBase?.agios ?? []).map((a) => ({
        id: String(a._id),
        libelle: a.libelle ?? undefined,
        montantHT: a.montantHT,
      }));
      // Les certificats de retenue déjà établis, pour ne pas reproposer le
      // geste sur une facture qui en a un.
      const certificats = await certificatsDesFactures(
        recues.map((f) => String(f._id))
      );
      factures = recues.map((f) => ({
        id: String(f._id),
        reference: f.reference,
        fournisseur: f.fournisseur,
        montantHT: f.montantHT,
        montantTTC: f.montantTTC,
        typePrestataire: f.typePrestataire,
        date: new Date(f.date).toISOString().slice(0, 10),
        certificat: certificats[String(f._id)] ?? null,
      }));
    }
  } catch (err) {
    erreurDb = err instanceof Error ? err.message : String(err);
  }

  const close = statut !== "BROUILLON";

  return (
    <div>
      <PageHeader
        title="Déclaration fiscale mensuelle"
        description={`TVA, timbres et retenue à la source. Sur le drive, c'était un classeur « OTMT » par mois, avec ses formules recopiées à la main.${
          annee ? ` Mandat ${annee}.` : ""
        }`}
        actions={
          <div className="flex items-center gap-1">
            <Link
              href={`/tresorerie/declaration?mois=${moisPrecedent(mois)}`}
              aria-label={`Aller à ${libelleMois(moisPrecedent(mois))}`}
              title={libelleMois(moisPrecedent(mois))}
              className="rounded-md border border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              ←
            </Link>
            <Link
              href={`/tresorerie/declaration?mois=${moisSuivant(mois)}`}
              aria-label={`Aller à ${libelleMois(moisSuivant(mois))}`}
              title={libelleMois(moisSuivant(mois))}
              className="rounded-md border border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              →
            </Link>
            {mois !== moisCourant() ? (
              <Link
                href="/tresorerie/declaration"
                className="ml-1 rounded-md border border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Mois en cours
              </Link>
            ) : null}
          </div>
        }
      />
      <NavTresorerie actif="/tresorerie/declaration" />

      {erreurDb ? (
        <AlerteDb erreur={erreurDb} />
      ) : !declaration ? (
        <EmptyState
          title="Aucun mandat actif"
          description="Activez un mandat pour préparer les déclarations."
        />
      ) : (
        <>
          <div className="mb-4">
            <FriseDeclarations calendrier={calendrier} moisActif={mois} />
          </div>

          {/*
            Le retard est l'information qui coûte le plus cher à ignorer : une
            déclaration non déposée se paie en pénalités, et rien ne la
            rappelait à l'écran.
          */}
          {moisEnRetard(calendrier).length > 0 ? (
            <div
              role="status"
              className="mb-6 flex flex-wrap items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-danger"
                aria-hidden
              />
              <p>
                <strong className="text-danger">
                  {moisEnRetard(calendrier).length} mois échu(s) non clôturé(s)
                </strong>{" "}
                — {moisEnRetard(calendrier).map((m) => m.libelle).join(", ")}.
                Un mois sans activité se déclare quand même, en déclaration
                néant. Chaque mois se liquide dans l&apos;ordre : son crédit de
                TVA se reporte sur le suivant.
              </p>
            </div>
          ) : null}

          {/*
            Quatre cartes d'indicateurs occupaient ici un bandeau entier pour
            répéter, en moins clair, ce que la liquidation dit juste en
            dessous. Seul le montant dû mérite d'être lisible avant d'avoir
            lu quoi que ce soit : il monte dans la ligne du mois.
          */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{libelleMois(mois)}</h2>
            <Badge variant={close ? "success" : "muted"}>
              {statut === "DEPOSEE"
                ? "Déposée"
                : statut === "CLOTUREE"
                  ? "Clôturée"
                  : "Brouillon"}
            </Badge>
            {documentId ? (
              <a
                href={`/api/documents/${documentId}/fichier`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Document PDF
              </a>
            ) : null}
            <span className="ml-auto flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">À verser</span>
              <strong className="text-2xl font-semibold tabular-nums text-primary">
                {dt(declaration.montantAPayer)}
              </strong>
            </span>
          </div>


          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Liquidation</CardTitle>
                </CardHeader>
                <CardContent>
                  <Liquidation declaration={declaration} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Factures reçues ({factures.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {factures.length === 0 ? (
                    <EmptyState
                      title="Aucune facture fournisseur"
                      description="Enregistrez les factures reçues du mois pour calculer la TVA déductible et la retenue à la source."
                    />
                  ) : (
                    factures.map((f) => (
                      <div
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {f.fournisseur}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {f.reference} · HT {dt(f.montantHT)} · TTC{" "}
                            {dt(f.montantTTC)}
                            {f.typePrestataire
                              ? ` · ${
                                  TYPES_PRESTATAIRE.find(
                                    (t) => t.code === f.typePrestataire
                                  )?.libelle ?? f.typePrestataire
                                }`
                              : ""}
                          </p>
                        </div>
                        {peutEcrire && !close ? (
                          <form action={supprimerFactureFournisseur}>
                            <input type="hidden" name="id" value={f.id} />
                            <Button size="sm" variant="ghost" type="submit">
                              Retirer
                            </Button>
                          </form>
                        ) : null}
                        {/*
                          La retenue était calculée et déclarée, mais le
                          prestataire n'en recevait aucune preuve : sans
                          certificat il la paie une seconde fois.
                        */}
                        {verifierCertificat({
                          montantTTC: f.montantTTC,
                          typePrestataire: f.typePrestataire,
                        }).possible ? (
                          <CertificatRasFacture
                            facture={f}
                            peutEcrire={peutEcrire}
                          />
                        ) : null}
                      </div>
                    ))
                  )}
              {peutEcrire && !close ? (
                <details className="rounded-md border border-border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Enregistrer une facture reçue
                  </summary>
                  <div className="pt-3">
                    <form
                      action={enregistrerFactureFournisseur}
                      className="space-y-3 md:max-w-2xl"
                    >
                      <input type="hidden" name="mois" value={mois} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm sm:col-span-2">
                          Fournisseur
                          <Input name="fournisseur" required className="mt-1" />
                        </label>
                        <label className="block text-sm">
                          Référence
                          <Input name="reference" required className="mt-1" />
                        </label>
                        <label className="block text-sm">
                          Date
                          <Input
                            name="date"
                            type="date"
                            required
                            defaultValue={`${mois}-01`}
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1 text-sm">
                          Montant HT
                          <Input
                            name="montantHT"
                            type="number"
                            step="0.001"
                            required
                            className="mt-1"
                          />
                        </label>
                        <label className="w-24 text-sm">
                          TVA %
                          <Input
                            name="tauxTVA"
                            type="number"
                            step="0.1"
                            defaultValue={TAUX_TVA_DEFAUT}
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1 text-sm">
                          Timbre
                          <Input
                            name="timbreFiscal"
                            type="number"
                            step="0.001"
                            defaultValue={TIMBRE_FISCAL_DT}
                            className="mt-1"
                          />
                        </label>
                        <label className="flex-1 text-sm">
                          Autres taxes
                          <Input
                            name="autresTaxes"
                            type="number"
                            step="0.001"
                            defaultValue={0}
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <label className="block text-sm">
                        Type de prestataire (retenue à la source)
                        <select
                          name="typePrestataire"
                          className={`mt-1 ${CHAMP}`}
                          defaultValue=""
                        >
                          <option value="">— aucun —</option>
                          {TYPES_PRESTATAIRE.map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.libelle} ({Math.round(t.taux * 1000) / 10} %)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        Règlement
                        <select name="modeReglement" className={`mt-1 ${CHAMP}`}>
                          {MODES_REGLEMENT.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="tvaDeductible"
                          value="non"
                          className="accent-primary"
                        />
                        TVA non déductible
                      </label>
                      <Button type="submit" className="w-full">
                        Enregistrer
                      </Button>
                    </form>
                  </div>
                </details>
              ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Agios bancaires ({agios.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {agios.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun agio saisi pour ce mois.
                    </p>
                  ) : (
                    agios.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <span>{a.libelle ?? "Agios"}</span>
                        <span className="font-medium">{dt(a.montantHT)}</span>
                      </div>
                    ))
                  )}
                  {peutEcrire && !close ? (
                    <form
                      action={ajouterAgios}
                      className="flex flex-wrap items-end gap-2 pt-2"
                    >
                      <input type="hidden" name="mois" value={mois} />
                      <Input
                        name="libelle"
                        placeholder="Libellé"
                        className="h-9 flex-1"
                      />
                      <Input
                        name="montantHT"
                        type="number"
                        step="0.001"
                        required
                        placeholder="HT"
                        className="h-9 w-28"
                      />
                      <Button size="sm" type="submit">
                        Ajouter
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              {peutValider ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Cycle</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!close ? (
                      <form action={cloturerDeclaration}>
                        <input type="hidden" name="mois" value={mois} />
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={blocage.bloque}
                        >
                          Clôturer et générer le document
                        </Button>
                        {/*
                          Le bouton ne promet que ce qu'il peut tenir : il
                          annonçait qu'il fallait clôturer le mois précédent
                          même quand celui-ci n'existait pas et ne bloquait
                          rien, ce qui décourageait une action qui aurait
                          abouti.
                        */}
                        {blocage.bloque ? (
                          <p className="mt-2 text-xs text-danger">
                            Clôturez d&apos;abord{" "}
                            {libelleMois(moisPrecedent(mois))} :{" "}
                            {blocage.raison}.
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Les totaux seront figés et le crédit éventuel se
                            reportera sur {libelleMois(moisSuivant(mois))}.
                          </p>
                        )}
                      </form>
                    ) : (
                      <>
                        {statut === "CLOTUREE" ? (
                          <>
                            <form
                              action={marquerDeclarationDeposee}
                              className="space-y-2"
                            >
                              <input type="hidden" name="mois" value={mois} />
                              <Input
                                name="preuveRef"
                                required
                                minLength={2}
                                placeholder="Référence du dépôt"
                              />
                              <Button type="submit" className="w-full">
                                Enregistrer le dépôt
                              </Button>
                            </form>
                            <form action={rouvrirDeclaration}>
                              <input type="hidden" name="mois" value={mois} />
                              <Button
                                type="submit"
                                variant="outline"
                                className="w-full"
                              >
                                Rouvrir pour correction
                              </Button>
                            </form>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Déposée{preuveRef ? ` — réf. ${preuveRef}` : ""}. Une
                            correction passe désormais par une déclaration
                            rectificative.
                          </p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardContent className="p-5 text-xs text-muted-foreground">
                  Les taux de retenue et le seuil de {" "}
                  {TYPES_PRESTATAIRE[2].seuil} DT proviennent de la
                  configuration de l&apos;outil de la JE. Ils relèvent de la loi
                  de finances : vérifiez-les chaque année.{" "}
                  <Link href="/tresorerie/fiscalite" className="text-primary hover:underline">
                    Échéancier fiscal
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
