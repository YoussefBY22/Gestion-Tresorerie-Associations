/**
 * Décor de l'écran de connexion.
 *
 * Purement ornemental, donc `aria-hidden` : un lecteur d'écran n'a rien à
 * annoncer d'une courbe. Tout est en SVG inline et en tokens de la charte,
 * ce qui le fait suivre le thème clair ou sombre sans une ligne de plus, et
 * sans charger d'image.
 *
 * Le motif dit ce que fait l'application : une courbe de trésorerie qui
 * monte, des jalons dessus, quelques pièces qui dérivent. Les animations
 * sont déclarées dans `globals.css` et se coupent d'elles-mêmes si le
 * système demande moins de mouvement.
 */
export function DecorConnexion() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Halos : deux taches de couleur très diluées, qui respirent. */}
      <div
        className="anim-halo absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--primary) 0%, transparent 70%)",
          opacity: 0.18,
        }}
      />
      <div
        className="anim-halo absolute -bottom-32 -right-20 h-[32rem] w-[32rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--accent-teal) 0%, transparent 70%)",
          opacity: 0.14,
          animationDelay: "2.5s",
        }}
      />

      {/* Trame très discrète, pour que le fond ne soit pas un aplat mort. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <pattern
            id="trame"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M36 0H0v36"
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.45"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#trame)" />
      </svg>

      {/* Courbe de trésorerie qui se dessine à l'ouverture. */}
      <svg
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1200 260"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          className="anim-trace"
          style={{ ["--longueur" as string]: "1800" }}
          d="M0 220 C 140 210, 220 150, 330 160 S 520 120, 620 96 S 820 86, 930 54 S 1100 44, 1200 18"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          className="anim-fondu"
          d="M0 220 C 140 210, 220 150, 330 160 S 520 120, 620 96 S 820 86, 930 54 S 1100 44, 1200 18 L 1200 260 L 0 260 Z"
          fill="var(--primary)"
          fillOpacity={0.07}
          style={{ animationDelay: "1.6s" }}
        />
        {/* Jalons sur la courbe — ils apparaissent après le tracé. */}
        {[
          [330, 160],
          [620, 96],
          [930, 54],
        ].map(([x, y], i) => (
          <circle
            key={x}
            className="anim-fondu"
            cx={x}
            cy={y}
            r="4.5"
            fill="var(--primary)"
            fillOpacity={0.7}
            style={{ animationDelay: `${1.8 + i * 0.25}s` }}
          />
        ))}
      </svg>

      {/* Pièces qui dérivent. */}
      {[
        { left: "12%", top: "22%", taille: 26, delai: "0s" },
        { left: "78%", top: "16%", taille: 18, delai: "1.4s" },
        { left: "86%", top: "62%", taille: 22, delai: "3.1s" },
        { left: "7%", top: "68%", taille: 16, delai: "2.2s" },
      ].map((p) => (
        <svg
          key={p.left + p.top}
          className="anim-derive absolute"
          style={{
            left: p.left,
            top: p.top,
            width: p.taille,
            height: p.taille,
            animationDelay: p.delai,
            opacity: 0.3,
          }}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.6"
          />
          <path
            d="M9 9.5h6M9 14.5h6M12 7v10"
            stroke="var(--primary)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </div>
  );
}
