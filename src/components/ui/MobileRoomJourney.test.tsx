import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n';
import MobileRoomJourney, { JourneyRoom } from './MobileRoomJourney';

afterEach(() => vi.unstubAllGlobals());

const rooms: JourneyRoom[] = [
  { id: 'red', name: 'RED', accent: '#d11323', capacity: 'Até 6 elementos', vibe: 'Ensaia connosco', longDescription: 'Descrição completa RED', gear: ['Bateria', 'PA'], priceLabel: 'desde 10€' },
  { id: 'live', name: 'LIVE', accent: '#540099', capacity: '', vibe: 'Eventos', longDescription: '', gear: [], priceLabel: 'Sob consulta' },
];

function render(locale = 'pt-PT') {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => locale },
  });
  return renderToStaticMarkup(<I18nProvider><MobileRoomJourney rooms={rooms} onChoose={() => {}} /></I18nProvider>);
}

describe('mobile room journey', () => {
  it('renders one cover per room and inline details instead of modal triggers', () => {
    const html = render();
    expect(html.match(/class="room-journey-cover"/g)).toHaveLength(2);
    expect(html).toContain('Descrição completa RED');
    expect(html).toContain('Bateria');
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('Ver mais');
  });

  it('links covers to details, next room and the actual studio section', () => {
    const html = render();
    expect(html).toContain('aria-controls="room-story-red"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-hidden="true" class="room-journey-details"');
    expect(html.indexOf('room-journey-cover-actions')).toBeLessThan(html.indexOf('room-card card'));
    expect(html).toContain('href="#room-cover-live"');
    expect(html).toContain('href="#explore-studio"');
    expect(html).toContain('id="room-story-red" tabindex="-1"');
    expect(html).toContain('aria-labelledby="room-story-red-equipment"');
  });

  it('preserves booking buttons and gracefully handles rooms without extra content', () => {
    const html = render();
    expect(html.match(/class="room-journey-book room-details-choose"/g)).toHaveLength(2);
    expect(html).toContain('Sob consulta');
    expect(html).toContain('class="room-journey-description">Eventos</p>');
  });

  it('translates the navigation and calls to action into English', () => {
    const html = render('en');
    expect(html).toContain('Scroll to explore');
    expect(html).toContain('Next room');
    expect(html).toContain('Explore the studio');
    expect(html).toContain('Choose this room');
  });

  it('handles an empty room list', () => {
    render();
    expect(renderToStaticMarkup(<I18nProvider><MobileRoomJourney rooms={[]} onChoose={() => {}} /></I18nProvider>)).not.toContain('room-journey-cover');
  });

  it('keeps one room title per card without repeating it in the details', () => {
    const html = render();
    expect(html.match(/<h2 /g)).toHaveLength(rooms.length);
    expect(html).not.toContain('room-details-title');
    expect(html).toContain('<h3 id="room-story-red-equipment">');
  });

  it('preserves the original card classes and content order without redesigned covers', () => {
    const html = render();
    expect(html.match(/class="room-card card room-journey-original"/g)).toHaveLength(2);
    expect(html).toContain('class="room-card-header"');
    expect(html.indexOf('room-card-header')).toBeLessThan(html.indexOf('room-card-description'));
    expect(html).not.toContain('room-journey-counter');
    expect(html).not.toContain('room-journey-quick-book');
  });
});