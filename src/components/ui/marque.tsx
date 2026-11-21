/**
 * Marque de l'application — un portefeuille, dessiné.
 *
 * En SVG inline plutôt qu'en image : il suit la couleur du contexte (bandeau
 * sombre, carte claire), reste net à toute taille, et ne charge rien. Une
 * image aurait figé une identité qui n'appartient à aucune des structures
 * qui utiliseront cette application.
 *
 * `couleur` accepte n'importe quelle valeur CSS, y compris un token de la
 * charte (`var(--primary)`) ou `currentColor` pour suivre le texte.
 */
export function Marque({
  taille = 48,
  couleur = "var(--primary)",
  titre = "Trésorerie",
}: {
  taille?: number;
  couleur?: string;
  titre?: string;
}) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 48 48"
      role="img"
      aria-label={titre}
    >
      <rect
        x="4"
        y="11"
        width="40"
        height="30"
        rx="6"
        fill={couleur}
        fillOpacity={0.12}
      />
      <path
        d="M8 17a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z"
        fill="none"
        stroke={couleur}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 23h12a4 4 0 0 0 8 0h12"
        fill="none"
        stroke={couleur}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="23" r="2.2" fill={couleur} />
    </svg>
  );
}
