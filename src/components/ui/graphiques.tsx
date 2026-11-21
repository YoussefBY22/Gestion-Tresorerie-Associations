/**
 * Graphiques SVG légers rendus côté serveur (aucune librairie externe) :
 * courbe d'évolution (sparkline), donut de répartition, barre d'avancement
 * comparée au temps écoulé. Utilisés par les dashboards Qualité et OKR.
 */

/** Courbe d'évolution mensuelle avec ligne d'objectif. */
export function Sparkline({
  points,
  objectif,
  largeur = 220,
  hauteur = 48,
}: {
  points: number[];
  objectif?: number;
  largeur?: number;
  hauteur?: number;
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-muted/40 text-xs text-muted-foreground"
        style={{ width: largeur, height: hauteur }}
      >
        Aucune donnée
      </div>
    );
  }
  const valeurs = objectif !== undefined ? [...points, objectif] : points;
  const min = Math.min(...valeurs, 0);
  const max = Math.max(...valeurs);
  const plage = max - min || 1;
  const marge = 4;
  const x = (i: number) =>
    points.length === 1
      ? largeur / 2
      : marge + (i / (points.length - 1)) * (largeur - 2 * marge);
  const y = (v: number) =>
    hauteur - marge - ((v - min) / plage) * (hauteur - 2 * marge);
  const chemin = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg
      width={largeur}
      height={hauteur}
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label="Évolution mensuelle"
    >
      {objectif !== undefined ? (
        <line
          x1={marge}
          x2={largeur - marge}
          y1={y(objectif)}
          y2={y(objectif)}
          stroke="var(--success)"
          strokeDasharray="4 3"
          strokeWidth={1}
        />
      ) : null}
      <polyline
        points={chemin}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill="var(--primary)" />
      ))}
    </svg>
  );
}

/** Donut de répartition (statuts d'actions, etc.). */
export function Donut({
  segments,
  taille = 120,
}: {
  segments: { valeur: number; couleur: string; label: string }[];
  taille?: number;
}) {
  const total = segments.reduce((s, x) => s + x.valeur, 0);
  const rayon = taille / 2 - 10;
  const circonference = 2 * Math.PI * rayon;
  let decalage = 0;

  return (
    <div className="flex items-center gap-4">
      <svg
        width={taille}
        height={taille}
        viewBox={`0 0 ${taille} ${taille}`}
        role="img"
        aria-label="Répartition"
      >
        <circle
          cx={taille / 2}
          cy={taille / 2}
          r={rayon}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={14}
        />
        {total > 0
          ? segments.map((s, i) => {
              const longueur = (s.valeur / total) * circonference;
              const cercle = (
                <circle
                  key={i}
                  cx={taille / 2}
                  cy={taille / 2}
                  r={rayon}
                  fill="none"
                  stroke={s.couleur}
                  strokeWidth={14}
                  strokeDasharray={`${longueur} ${circonference - longueur}`}
                  strokeDashoffset={-decalage}
                  transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
                />
              );
              decalage += longueur;
              return cercle;
            })
          : null}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-lg font-bold"
        >
          {total}
        </text>
      </svg>
      <div className="space-y-1 text-xs">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.couleur }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium">{s.valeur}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Barres horizontales classées — répartitions (par source, par secteur,
 * par département…). Lisible même avec des libellés longs.
 */
export function BarresHorizontales({
  donnees,
  suffixe = "",
  couleur = "var(--primary)",
  max: maxImpose,
}: {
  donnees: { label: string; valeur: number }[];
  suffixe?: string;
  couleur?: string;
  max?: number;
}) {
  if (donnees.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;
  }
  const max = maxImpose ?? Math.max(...donnees.map((d) => d.valeur), 1);
  return (
    <ul className="space-y-2">
      {donnees.map((d) => (
        <li key={d.label}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground" title={d.label}>
              {d.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {d.valeur.toLocaleString("fr-FR")}
              {suffixe}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${max === 0 ? 0 : (d.valeur / max) * 100}%`, backgroundColor: couleur }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Entonnoir commercial : chaque palier est un bandeau dont la largeur est
 * proportionnelle au premier palier, avec le taux de passage affiché.
 */
export function Entonnoir({
  etapes,
}: {
  etapes: { label: string; valeur: number }[];
}) {
  if (etapes.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;
  }
  const base = Math.max(etapes[0].valeur, 1);
  return (
    <ul className="space-y-1.5">
      {etapes.map((e, i) => {
        const largeur = Math.max((e.valeur / base) * 100, e.valeur > 0 ? 8 : 3);
        const precedent = i > 0 ? etapes[i - 1].valeur : null;
        const passage = precedent && precedent > 0 ? Math.round((e.valeur / precedent) * 100) : null;
        return (
          <li key={e.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-xs text-muted-foreground" title={e.label}>
              {e.label}
            </span>
            <div className="flex-1">
              <div
                className="flex h-7 items-center justify-end rounded-md px-2 text-xs font-semibold text-white"
                style={{
                  width: `${largeur}%`,
                  backgroundColor: "var(--primary)",
                  opacity: 1 - i * 0.11,
                }}
              >
                {e.valeur}
              </div>
            </div>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {passage !== null ? `${passage} %` : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Histogramme vertical (séries mensuelles : CA, flux, publications…). */
export function BarresVerticales({
  donnees,
  hauteur = 140,
  suffixe = "",
}: {
  donnees: { label: string; valeur: number }[];
  hauteur?: number;
  suffixe?: string;
}) {
  if (donnees.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune donnée.</p>;
  }
  const max = Math.max(...donnees.map((d) => d.valeur), 1);
  return (
    <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height: hauteur + 28 }}>
      {donnees.map((d) => (
        <div key={d.label} className="flex min-w-7 flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {d.valeur > 0 ? d.valeur.toLocaleString("fr-FR") + suffixe : ""}
          </span>
          <div
            className="w-full rounded-t bg-primary"
            style={{ height: Math.max((d.valeur / max) * hauteur, d.valeur > 0 ? 3 : 1) }}
            title={`${d.label} : ${d.valeur}${suffixe}`}
          />
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Barre d'avancement avec repère du temps écoulé du mandat : on voit
 * immédiatement si l'avancement est en retard sur le calendrier.
 */
export function BarreVsTemps({
  avancement,
  tempsEcoule,
}: {
  avancement: number; // [0 ; 1]
  tempsEcoule: number; // [0 ; 1]
}) {
  const pctAvancement = Math.round(avancement * 100);
  const pctTemps = Math.round(tempsEcoule * 100);
  const enRetard = avancement < tempsEcoule - 0.1;
  return (
    <div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${enRetard ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${pctAvancement}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-danger"
          style={{ left: `${pctTemps}%` }}
          title={`Temps écoulé : ${pctTemps} %`}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{pctAvancement} % réalisé</span>
        <span>temps écoulé : {pctTemps} %</span>
      </div>
    </div>
  );
}
