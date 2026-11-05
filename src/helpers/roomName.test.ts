import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import RoomName from '../components/ui/RoomName';
import { getRoomBaseName } from './roomName';

describe('room names', () => {
  it.each(['RED', 'SALA RED', 'Sala RED', 'Room RED', 'RED Room', '  Sala RED  '])(
    'apresenta apenas o nome base de %s', (value) => {
      expect(getRoomBaseName(value)).toBe('RED');
      expect(renderToStaticMarkup(createElement(RoomName, { name: value, accent: '#dc2626' })))
        .toBe('<span style="color:#dc2626">RED</span>');
    },
  );

  it('preserva nomes compostos e a capitalização definida na administração', () => {
    expect(getRoomBaseName('Blue Studio')).toBe('Blue Studio');
    expect(getRoomBaseName('Salamandra')).toBe('Salamandra');
    expect(getRoomBaseName('Roommate')).toBe('Roommate');
  });

  it('não acrescenta palavras quando o nome já foi normalizado', () => {
    expect(getRoomBaseName(getRoomBaseName('SALA RED'))).toBe('RED');
    expect(getRoomBaseName(getRoomBaseName('RED Room'))).toBe('RED');
  });

  it('não inventa um nome para um campo vazio', () => {
    expect(getRoomBaseName('   ')).toBe('');
    expect(getRoomBaseName('')).toBe('');
  });
});
