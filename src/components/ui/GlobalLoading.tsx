type GlobalLoadingProps = {
  visible: boolean;
};

/**
 * Ecrã de loading global do FeedBook.
 * Usa o logótipo personalizado /loadingdb.png como elemento central.
 * Animação via CSS (anel), sem modificar o ficheiro original.
 */
export default function GlobalLoading({ visible }: GlobalLoadingProps) {
  if (!visible) return null;

  return (
    <div className="global-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="global-loading-content">
        <div className="global-loading-logo-wrap">
          <img
            className="global-loading-logo"
            src="/loadingdb.png"
            alt="Feedback - Ensaios"
            width={160}
            height={160}
            decoding="async"
          />
          <span className="global-loading-ring" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
