import { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Drama,
  Guitar,
  Mic,
  PartyPopper,
  Radio,
  Snowflake,
  Toilet,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../i18n';

// Icones alinhados com a ordem dos blocos nos ficheiros de locale.
// A ordem das tradutoras define a ordem visual dos cartoes.
const INFRASTRUCTURE_ICONS: LucideIcon[] = [Guitar, Drama, Coffee];
const AMENITY_ICONS: LucideIcon[] = [Snowflake, Wifi, Toilet, Clock];
const ACTIVITY_ICONS: LucideIcon[] = [CalendarCheck, Mic, Radio, PartyPopper];

/**
 * Secao "Quem somos" (Issue #44).
 * Conteudo 100% traduzido a partir de `translations.about`, para funcionar
 * em pt-PT e en sem duplicar texto no componente.
 */
export default function AboutSection({ onReadingChange }: { onReadingChange: (visible: boolean) => void }) {
  const { translations } = useI18n();
  const { about } = translations;
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const mobile = window.matchMedia('(max-width: 720px)');
    const desktop = window.matchMedia('(min-width: 981px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let entryFocusArmed = window.scrollY <= 2;
    let previousScrollY = window.scrollY;
    let frame = 0;
    const updateReading = () => {
      frame = 0;
      const top = section.getBoundingClientRect().top;
      onReadingChange(mobile.matches && top <= window.innerHeight * 0.75);
      const entryTop = top + window.scrollY;
      const progress = Math.max(0, Math.min(1, window.scrollY / Math.max(1, entryTop - 32)));
      section.style.setProperty('--about-progress', String(progress));
      document.documentElement.style.setProperty('--explore-progress', String(progress));
      const header = section.querySelector<HTMLElement>('.about-header');
      if (header) {
        section.style.setProperty('--about-entry-bottom', `${entryTop + header.offsetHeight}px`);
        document.documentElement.style.setProperty('--about-header-height', `${header.offsetHeight}px`);
      }
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateReading);
    };
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const movingDown = scrollY > previousScrollY;
      previousScrollY = scrollY;

      // Só acompanha a primeira intenção de descer a partir da entrada.
      // Subir para as salas ou continuar a ler nunca força outra transição.
      if (scrollY <= 2) entryFocusArmed = true;
      if (desktop.matches && entryFocusArmed && movingDown && scrollY >= 8) {
        entryFocusArmed = false;
        const target = section.getBoundingClientRect().top + scrollY - 32;
        if (target > scrollY) {
          window.scrollTo({
            top: target,
            behavior: reducedMotion.matches ? 'instant' : 'smooth',
          });
        }
      }
      scheduleUpdate();
    };

    updateReading();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', scheduleUpdate);
      document.documentElement.style.removeProperty('--explore-progress');
      document.documentElement.style.removeProperty('--about-header-height');
    };
  }, [onReadingChange]);

  return (
    <section id="explore-studio" ref={sectionRef} className="about-section" aria-labelledby="about-title">
      <header className="about-header">
        <p className="eyebrow">{about.eyebrow}</p>
        <h2 id="about-title">{about.title}</h2>
        <p className="about-lede">{about.lede}</p>
        <a className="about-scroll-cue" href="#about-details" aria-label={about.expand}>
          <ChevronDown size={18} aria-hidden="true" />
        </a>
      </header>

      <button
        type="button"
        className="about-toggle"
        aria-expanded={expanded}
        aria-controls="about-details"
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{expanded ? about.collapse : about.expand}</span>
        {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>

        <div id="about-details" className={`about-details ${expanded ? 'about-details-expanded' : ''}`}>
          <div className="about-columns">
            <div className="about-block">
              <h3 className="about-block-title">{about.infrastructureTitle}</h3>
              <ul className="about-infrastructure-list">
                {about.infrastructure.map((item, index) => {
                  const Icon = INFRASTRUCTURE_ICONS[index] ?? Guitar;

                  return (
                    <li className="about-infra-item" key={item.title}>
                      <span className="about-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <div className="about-item-body">
                        <h4>{item.title}</h4>
                        <p>{item.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="about-block">
              <h3 className="about-block-title">{about.amenitiesTitle}</h3>
              <ul className="about-amenities-list">
                {about.amenities.map((item, index) => {
                  const Icon = AMENITY_ICONS[index] ?? Clock;

                  return (
                    <li className="about-amenity" key={item.label}>
                      <span className="about-icon about-icon-compact" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <div className="about-item-body">
                        <strong>{item.label}</strong>
                        <span>{item.value}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div id="explore-activities" className="about-block">
            <h3 className="about-block-title">{about.activitiesTitle}</h3>
            <div className="about-activities-grid">
              {about.activities.map((item, index) => {
                const Icon = ACTIVITY_ICONS[index] ?? PartyPopper;

                return (
                  <article className="about-activity" key={item.title}>
                    <span className="about-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <div className="about-item-body">
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
    </section>
  );
}
